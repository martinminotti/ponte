# Architettura

Come è fatta Ponte e perché. Per i comandi di tutti i giorni vedi [sviluppo.md](sviluppo.md); per mettere in linea il cloud vedi [cloud.md](cloud.md).

## In una frase

Un'app **offline-first**: ogni schermata legge e scrive sull'archivio del dispositivo (istantaneo, anche senza rete); con l'officina nel cloud una **coda di modifiche** porta i cambiamenti al server e un **motore di sincronizzazione** riporta quelli degli altri dispositivi. Il server è **Supabase** (Postgres a Francoforte), dove ogni officina vede solo le sue righe per regole del database, non per fiducia nell'app.

```
 schermate (features, ui)
      │  leggono con hook reattivi, scrivono con repo
      ▼
 repo ── scrive su ──► IndexedDB (Dexie) ◄── applica ── motore di sincronizzazione
   │                         │ outbox                         │  push / pull / foto / tempo reale
   └── registra la modifica ─┘                                ▼
                                                    Supabase: funzioni push, pull (Postgres + RLS),
                                                    storage delle foto, realtime, funzioni ai e account
```

## Livelli e confini

| Livello | Cartella | Cosa fa | Non può importare |
|---|---|---|---|
| Dominio | `src/domain` | Regole dell'officina, pure e testate: importi in centesimi, IVA, stati, numeri, campi che viaggiano (`JOB_SYNC_KEYS`, `WORKSHOP_KEYS`), unione delle modifiche | React, Dexie, Capacitor, Supabase, qualunque altro livello |
| Dati | `src/data` | Archivio locale (`db.ts`), repository (`repo.ts`), coda (`changes.ts`), sincronizzazione (`sync/`), cloud (`cloud/`), backup | Schermate |
| Piattaforma | `src/platform` | Web e nativo: aptica, file, barre native, voce, navigazione | — |
| Voce | `src/voice` | Parlato italiano, interpretazione (regole o AI), sessione dell'assistente | Schermate |
| App | `src/app` | Shell, router, hook reattivi, avvio | — |
| Schermate | `src/features`, `src/ui` | Interfaccia | `data/db`, `data/changes`, `data/sync/engine`, `data/cloud/client`, `dexie`, `@supabase/*` |

I confini sono regole di ESLint (`eslint.config.js`): un import che li attraversa non passa la CI.

## Dati sul dispositivo

IndexedDB con Dexie, versione 2:

- `jobs`, `photos`, `settings` come prima; le foto hanno `up` (0 = da caricare, 1 = sul server) e l'immagine può mancare finché non serve (si scarica al primo sguardo).
- `outbox`: le modifiche non ancora confermate dal server, in ordine. Le modifiche alla stessa riga si **uniscono** finché non partono.
- `meta`: segno di ricezione per officina, membri della squadra, officina collegata (`cloud`), preferenze del dispositivo.

Ogni scrittura di `repo.ts` e la sua registrazione in `outbox` avvengono **nella stessa transazione**: o tutte e due o nessuna. In modalità locale (senza cloud) la coda non si usa.

## Sincronizzazione

**Invio (push)** — il motore prende fino a 100 modifiche in ordine, le segna "in viaggio" e le manda a `push(officina, modifiche)`. Il server le applica una per una:

- scheda nuova: numero progressivo assegnato dal server (unico per officina, anche fra dispositivi offline); se la scheda arriva da un archivio esistente con un numero libero, lo tiene;
- scheda esistente: `doc = doc || patch`, cioè **unione campo per campo** — due persone che cambiano campi diversi non si cancellano; sullo stesso campo vince l'ultima modifica arrivata;
- campi sconosciuti scartati, tipi controllati, dimensioni limitate;
- un rifiuto (permesso, valore non valido) non blocca le altre modifiche: risponde con la versione del server e il dispositivo si riallinea.

**Ricezione (pull)** — `pull(officina, segno)` restituisce le righe cambiate dopo il segno, in ordine `(xid, id)`, a pagine. Il segno è l'id della transazione (`xid8`) e il server restituisce solo righe di transazioni **già tutte concluse** (sotto l'orizzonte `xmin` della fotografia corrente): una transazione lenta non può comparire "dietro" il segno e andare persa. È provato da un test che apre davvero una transazione in parallelo.

**Riallineamento** — le righe ricevute si scrivono nell'archivio con sopra le modifiche locali ancora in coda: chi sta scrivendo non vede tornare indietro un campo mentre la sua modifica è in viaggio.

**Quando parte** — a ogni modifica locale (con un attimo di attesa per raggrupparle), al ritorno della rete, al ritorno in primo piano, all'avviso in tempo reale del server (Supabase Realtime: l'avviso dice solo "è cambiato qualcosa", i dati si prendono con `pull`, che rispetta i permessi), e comunque ogni minuto. Senza rete: attese crescenti da 2 s a 1 min, la coda resta sul dispositivo.

**Foto** — annunciate con `push` (il server decide il percorso `<officina>/<scheda>/<foto>.jpg`), poi caricate nello storage privato; lo storage accetta solo file già annunciati. Sugli altri dispositivi arrivano i dati della foto; l'immagine si scarica la prima volta che si guarda.

## Server (Supabase)

`supabase/migrations`:

- `workshops` (impostazioni condivise in JSON), `members` (ruolo titolare/dipendente), `invites` (codici di 8 caratteri senza lettere ambigue, 7 giorni, monouso), `jobs` (documento JSON + colonne estratte), `photos`, `ai_usage`.
- **RLS ovunque**; i client hanno solo `SELECT` sulle proprie righe. Ogni scrittura passa da funzioni `SECURITY DEFINER` con `search_path` vuoto che controllano ruolo e contenuto: `create_workshop`, `create_invite`, `join_workshop`, `set_member`, `remove_member`, `leave_workshop`, `delete_workshop`, `push`, `pull`.
- Ruoli: il **titolare** gestisce squadra, inviti e impostazioni dell'officina e può cancellare schede; il **dipendente** lavora sulle schede.
- Funzioni Edge (`supabase/functions`): `ai` (assistente vocale con la chiave del modello sul server, membro dell'officina, modello e lunghezza imposti, tetto giornaliero per officina) e `account` (eliminazione dell'account e delle officine di cui si è unico titolare, foto comprese).

## Accesso

Email + codice di 6 cifre (nessuna password): `signInWithOtp` / `verifyOtp`. Sul telefono la sessione sta nelle Preferenze native (Capacitor Preferences), non nella WebView. L'officina collegata è salvata sul dispositivo: l'app si apre e si lavora anche senza rete; il controllo con il server (sessione, ruolo, appartenenza) avviene dopo, in sottofondo. Chi viene tolto dall'officina perde i dati dell'officina dal dispositivo al primo contatto con il server.

## Modalità locale

Senza configurazione cloud nella build, o se si sceglie "Usa Ponte solo su questo dispositivo", l'app funziona come prima: tutto in IndexedDB, backup a mano, titolare/dipendente scelti all'apertura. Da Impostazioni si può collegare l'officina più tardi portando nel cloud le schede esistenti (numeri compresi). Il client Supabase e il motore di sincronizzazione sono in un pacchetto separato, scaricato solo con il cloud attivo.

## Test

| Comando | Cosa prova |
|---|---|
| `npm test` | Dominio, parlato, sessione vocale, archivio, backup (Vitest, IndexedDB finto) |
| `npm run test:db` | Su Postgres vero: regole di accesso, inviti e ruoli, push/pull, numerazione, orizzonte delle transazioni, storage; **due dispositivi** (archivio + coda + motore dell'app) che si sincronizzano; con Supabase locale anche accesso via email, API, tempo reale e funzioni |
| CI "Backend (Supabase)" | Tutto quanto sopra su `supabase start` in GitHub Actions, poi pubblicazione su main |

In locale senza Docker: `npm run db:local` crea un Postgres di prova con il minimo di Supabase (`supabase/tests/stub-supabase.sql`).

## Decisioni

- **Supabase invece di un server nostro**: Postgres gestito in UE con autenticazione, storage, realtime e funzioni; il database resta Postgres standard (le migrazioni sono SQL puro), quindi un domani si può spostare.
- **Documento JSON per la scheda, unito per campo**: la scheda ha molti campi e cambia spesso forma; l'unione `||` dà la risoluzione dei conflitti più utile al banco senza versioni da gestire. Le colonne usate per cercare (`status`, `plate`) sono estratte e indicizzate.
- **Numero assegnato dal server**: unico per officina anche con più dispositivi offline; finché non arriva la scheda mostra "N. —".
- **Scritture solo da funzioni**: un client manomesso non può scavalcare i controlli.
- **Segno xid8 + orizzonte xmin** invece di un orario: nessuna dipendenza dagli orologi, nessuna modifica persa.
