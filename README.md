# Registro Officina

Gestionale da telefono per officine meccaniche, elettrauti e gommisti: accettazione del veicolo, stato dei lavori con avvisi WhatsApp, conto per il cliente in PDF, fatture mensili per le ditte. Targhe italiane e di San Marino.

Funziona come **web app installabile** (PWA, anche offline) e come **app Android e iOS** dallo stesso codice, tramite Capacitor.

---

## Cosa fa

- **Accettazione** in pochi tocchi, per cliente privato o azienda. La targa si scrive su una targa disegnata (italiana o RSM). Se il veicolo è già passato in officina compare "Già visto" e un tocco ricopia proprietario, telefono e dati ditta.
- **Archivio** con ricerca unica per targa, telaio, cliente, ditta, partita IVA, telefono, operaio o numero scheda. Filtri con conteggio: in officina, pronte, da incassare (con totale), da fatturare, chiuse.
- **Stato lavorazione** su un binario a sei tappe (accettato → consegnato) con cronologia. A ogni cambio di stato l'app propone di avvisare il cliente.
- **WhatsApp**: messaggi già scritti per ogni stato, modificabili, aperti in `wa.me`. Rispetta il consenso del cliente.
- **Lavori e conto**: voci con importo, voci frequenti con un tocco, acconto, totale, garanzia, metodo di pagamento, incasso. Conto A4 in PDF con logo, dati dell'officina e numero scheda progressivo.
- **Condivisione nativa del PDF**: dove il telefono lo supporta, *Condividi PDF* apre il foglio di sistema e il documento arriva in WhatsApp già allegato.
- **Aziende**: ragione sociale, P.IVA o COE, codice fiscale, SDI/PEC, aliquota IVA (22, 17, 10, 4, esente), importi IVA inclusa o esclusa.
- **Fatture ditte**: i lavori di una ditta si raccolgono nel mese; si prepara un unico conto con IVA divisa per aliquota, si segnano fattura emessa e incasso per tutti i lavori insieme.
- **Foto all'arrivo** (graffi, cruscotto, chilometri) salvate sulla scheda, compresse sul dispositivo.
- **Officina**: nome, indirizzo, P.IVA, telefono, logo, colore, operai, valori predefiniti, tema chiaro/scuro/automatico.
- **Backup** JSON (schede, impostazioni e foto) con importazione "unisci" o "sostituisci", promemoria settimanale, protezione dell'archivio dalla pulizia automatica del browser.
- **Annulla** su eliminazione scheda, rimozione voce e incasso.
- **Tablet e desktop**: archivio e dettaglio affiancati, barra laterale.

> I documenti generati sono riepiloghi, non fatture. La fattura fiscale va emessa con un gestionale o con il portale di fatturazione elettronica. Le aliquote IVA proposte vanno verificate con un commercialista.

---

## Perché questo stack

| Scelta | Motivo |
|---|---|
| **React 19 + TypeScript** | Il codice tipizzato rende sicuri i calcoli di importi e IVA; ecosistema più ampio per UI di qualità. |
| **Vite** | Build veloce, PWA tramite `vite-plugin-pwa`, output statico per qualunque hosting. |
| **Capacitor 8** | Lo stesso build web diventa app Android/iOS vera (store, icona, splash), con plugin nativi per condivisione file, vibrazione, barra di stato, tasto indietro Android. Nessuna riscrittura, a differenza di React Native o Flutter. |
| **Tailwind CSS 4** | Token di design in CSS (`src/styles/index.css`), tema scuro e colore dell'officina applicati a runtime. |
| **Dexie (IndexedDB)** | Archivio locale robusto e veloce, query reattive, spazio ben superiore a `localStorage`, foto come Blob. Un solo modulo da sostituire per aggiungere un backend. |
| **Motion, vaul, sonner, lucide** | Transizioni con fisica a molla, fogli dal basso trascinabili in stile iOS, notifiche con "Annulla", icone coerenti. |
| **jsPDF** | PDF A4 generati sul dispositivo, anche offline. |

Il router usa l'hash (`#/job/…`): funziona su ogni hosting statico senza regole di rewrite, dentro Capacitor e come file singolo.

---

## Avvio

Serve Node 20.19 o più recente (vedi `.nvmrc`).

```bash
npm install
npm run dev          # http://localhost:5173
```

Comandi utili:

```bash
npm test             # test unitari (calcoli, IVA, mensile, WhatsApp, migrazione, backup)
npm run lint
npm run typecheck
npm run build        # build di produzione in dist/ con service worker
npm run preview      # serve dist/ su http://localhost:4173
npm run check        # lint + typecheck + test + build (come la CI)
```

La prima volta che si apre l'app su un dispositivo dove era installata la **bozza precedente**, l'archivio (`localStorage`, chiave `registro-officina-v1`) viene importato da solo: importi convertiti in centesimi, numero progressivo assegnato in ordine di data. Il vecchio archivio resta intatto come copia di sicurezza.

---

## Pubblicazione web

Qualunque hosting statico in **HTTPS** (obbligatorio per installare l'app su iPhone e per il service worker).

- **Netlify** o **Cloudflare Pages**: comando di build `npm run build`, cartella `dist`. Il file `public/_headers` imposta Content-Security-Policy, cache immutabile per gli asset e nessuna cache per `index.html` e `sw.js`.
- **GitHub Pages**: pubblica la cartella `dist` (es. con l'action `actions/deploy-pages`). Il percorso base è relativo, quindi funziona anche in una sottocartella.

Quando esce una nuova versione, l'app mostra "Nuova versione disponibile" con il pulsante *Aggiorna*.

**Installare su iPhone**: Safari → Condividi → Aggiungi alla schermata Home. **Android**: Chrome propone "Installa app".

---

## App Android e iOS

I progetti nativi sono già generati in `android/` e `ios/`.

```bash
npm run cap:android  # build web + sync + apre Android Studio
npm run cap:ios      # build web + sync + apre Xcode (serve un Mac)
```

Da Android Studio o Xcode si avvia sull'emulatore o sul telefono e si firma per gli store.

Prima della pubblicazione:

1. **Identificativo app**: in `capacitor.config.ts` cambia `appId` (ora `sm.registroofficina.app`) con il dominio del proprietario, poi `npx cap sync`.
2. **Icone e splash**: metti un'icona 1024×1024 in `assets/icon.png` e lancia `npx @capacitor/assets generate`.
3. **Permessi** già dichiarati: fotocamera (foto all'arrivo) su Android; fotocamera e libreria foto su iOS, con testi in italiano in `Info.plist`.

Dentro l'app nativa: il PDF si condivide con il foglio di sistema (Capacitor Share + Filesystem), la vibrazione usa il motore aptico del telefono, il tasto indietro di Android torna alla schermata precedente.

---

## Struttura

```
src/
  domain/        logica pura e testata: tipi, calcoli IVA e saldo, filtri, mensile, messaggi WhatsApp, formati
  data/          IndexedDB (Dexie), repository, migrazione dalla bozza, backup, dati di esempio
  pdf/           generazione PDF del conto e del conto mensile
  platform/      ponte web/nativo (condivisione, salvataggio, vibrazione), immagini, colore dell'officina
  ui/            componenti: targa, controlli, binario stati, fogli dal basso
  app/           shell, navigazione, layout, router, aggiornamenti
  features/      schermate: list, form, job, doc, month, settings
  styles/        token di design e tema
android/, ios/   progetti nativi Capacitor
public/          icone, intestazioni HTTP
```

### Modello dei dati

Tutti gli importi sono **interi in centesimi** (niente errori di arrotondamento sui float).

```ts
Job {
  id, number,                      // number: progressivo scheda (0001, 0002…)
  createdAt, updatedAt, status, history: [{ s, t }],
  plate, plateCountry: 'I' | 'RSM', vin, make, model, km, dueDate,
  client: 'privato' | 'azienda', company: { name, vat, cf, addr, sdi },
  owner, phone, wa,                // wa: consenso ai messaggi
  services, tyres, request, notes, workers, photoIds,
  items: [{ id, desc, amount }], deposit,
  vatRate, vatIncl, billing: 'mensile' | 'singola',
  invoiced, invoicedAt, invoiceNo,
  paid, paidAt, paidAmount, payMethod,
  warrantyMonths, warrantyNote, closedAt, deliveredAt
}
```

Tabelle IndexedDB: `jobs`, `settings` (riga `main`), `photos` (Blob JPEG).

---

## Aggiungere un backend (sincronizzazione tra dispositivi)

L'app è *local-first*: tutta la persistenza passa da `src/data/repo.ts` e `src/data/db.ts`, le schermate leggono con query reattive. Per condividere l'archivio tra più telefoni dell'officina:

1. Aggiungi un servizio (consigliato **Supabase**: Postgres, autenticazione, storage per le foto, regole RLS per officina).
2. Mantieni Dexie come cache locale e sincronizza le tabelle (`updatedAt` è già su ogni scheda per risolvere i conflitti "vince il più recente"), oppure usa **Dexie Cloud**, che si innesta sullo stesso database.
3. Aggiungi login e regole di accesso: l'archivio contiene dati personali dei clienti (GDPR).

---

## Sicurezza e privacy

- I dati restano sul dispositivo; nessuna chiamata a server esterni. Fonts e librerie sono inclusi nel build (niente CDN).
- CSP restrittiva in `public/_headers`. Se modifichi lo script inline in `index.html` (applica il tema prima del primo disegno), ricalcola l'hash:
  ```bash
  python3 -c "import re,hashlib,base64;s=open('dist/index.html').read();print(base64.b64encode(hashlib.sha256(re.findall(r'<script>(.*?)</script>',s,re.S)[0].encode()).digest()).decode())"
  ```
- Il consenso WhatsApp del cliente è registrato sulla scheda e rispettato.
- L'archivio locale può essere cancellato se l'utente svuota i dati del sito: per questo l'app chiede la persistenza al browser e ricorda di fare un backup ogni settimana.

## Limiti noti

- Senza backend non c'è sincronizzazione tra dispositivi.
- WhatsApp usa i link `wa.me`: l'invio lo conferma l'utente. Per messaggi automatici serve WhatsApp Business API.
- Nessuna emissione di fattura elettronica (SDI): i documenti sono riepiloghi.

## Licenza

Da definire dal proprietario del repository.
