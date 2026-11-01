# Mettere in linea il cloud di Ponte

Una volta sola, una ventina di minuti. Nessuna chiave va incollata in chat o nel codice: i segreti stanno solo in GitHub e in Supabase.

## 1. Progetto Supabase

1. [supabase.com](https://supabase.com) → **New project**.
   - Nome: `ponte`
   - Regione: **Central EU (Frankfurt)**
   - Password del database: generala e conservala (serve al punto 3).
2. Dal progetto prendi tre valori **pubblici**:
   - *Project Settings → General*: **Project ID** (es. `abcdefghijklmnop`)
   - *Project Settings → API*: **Project URL** (es. `https://abcdefghijklmnop.supabase.co`) e la chiave **publishable** (o *anon*).

## 2. Variabili del repository (valori pubblici)

GitHub → repository `ponte` → *Settings → Secrets and variables → Actions* → scheda **Variables** → *New repository variable*:

| Nome | Valore |
|---|---|
| `SUPABASE_PROJECT_REF` | il Project ID |
| `SUPABASE_URL` | il Project URL |
| `SUPABASE_KEY` | la chiave publishable/anon |

## 3. Segreti del repository

Stessa pagina, scheda **Secrets** → *New repository secret*:

| Nome | Dove si prende |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | supabase.com → avatar → *Account preferences → Access Tokens* → *Generate new token* |
| `SUPABASE_DB_PASSWORD` | la password del database del punto 1 |

## 4. Chiave dell'assistente vocale (sul server)

Supabase → *Edge Functions → Secrets* → *Add new secret*:

- `ANTHROPIC_API_KEY` = la chiave della Console Anthropic

Facoltativi: `AI_DAILY_LIMIT` (richieste al giorno per officina, predefinito 400), `AI_MODEL` (predefinito `claude-haiku-5-5`).

## 5. Email con il codice di accesso

Il servizio email incluso in Supabase manda poche email l'ora e **solo agli indirizzi del tuo team**: per le officine serve un SMTP. Il più rapido senza dominio proprio:

- **Brevo** (300 email/giorno gratis): crea l'account, verifica l'indirizzo mittente (*Senders*), poi *SMTP & API* → genera una chiave SMTP.
- Con un dominio tuo va bene anche **Resend** (server in UE, 3000 email/mese gratis).

Supabase → *Authentication → Emails → SMTP Settings* → abilita e compila host, porta 587, utente, password, mittente `Ponte <indirizzo verificato>`. Il testo dell'email (in italiano, con il codice di 6 cifre) lo imposta la pubblicazione automatica del punto 6.

## 6. Pubblicazione

Unisci il branch `architettura-cloud` in `main` (o lancia *Actions → Backend (Supabase) → Run workflow* con *Pubblica* spuntato). Il workflow:

1. prova tutto su un Supabase locale (database, regole d'accesso, sincronizzazione, funzioni, app nel browser);
2. applica le migrazioni al progetto (`supabase db push`);
3. pubblica le funzioni `ai` e `account`;
4. imposta l'accesso con codice email (testi, durata, indirizzi dell'app).

Da quel momento le build web (GitHub Pages) e iOS (TestFlight) nascono con il cloud attivo.

## Dopo

- **Prima officina**: apri Ponte → *Entra nella tua officina* → email → codice → *Crea la tua officina*. Se sul telefono c'erano già schede, le porti nel cloud con i loro numeri.
- **Dipendenti**: *Impostazioni → Squadra → Invita un dipendente* → mandi il codice (vale 7 giorni, una volta sola).
- **Privacy**: i dati delle officine (clienti, targhe, telefoni, foto) stanno a Francoforte presso Supabase, che fa da sub-responsabile. Firma il DPA di Supabase (*Organization → Legal*) e aggiorna l'informativa dell'app; le frasi dettate passano da Anthropic solo per essere interpretate.
- **Costi**: piano gratuito per il test (500 MB di database, 1 GB di foto, progetto in pausa dopo una settimana senza uso); per le officine vere il piano Pro (25 $/mese) evita la pausa e fa i backup giornalieri.
- **Uso dell'AI**: Supabase → *Table editor → ai_usage* (richieste e token per officina e giorno).
