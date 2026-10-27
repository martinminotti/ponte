# Sviluppo

Guida tecnica per chi lavora sul codice di Ponte. Per la panoramica del prodotto vedi il [README](../README.md); per pubblicare una versione vedi [rilascio.md](rilascio.md).

## Requisiti

- Node 22 (vedi `.nvmrc`; minimo 20.19)
- Per rigenerare il marchio: Python 3 con `fonttools` e `brotli`
- Per le app native in locale: Android Studio, oppure Xcode su Mac (per iOS basta anche la CI, vedi rilascio)

## Comandi

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # test unitari (Vitest)
npm run lint         # ESLint
npm run typecheck    # TypeScript senza emettere file
npm run build        # build di produzione in dist/ con service worker
npm run preview      # serve dist/ su http://localhost:4173
npm run check        # lint + typecheck + test + build, come la CI
```

Al primo avvio l'app propone schede di esempio; si eliminano da *Schede* → *Elimina esempi*.

## Stack

| Scelta | Perché |
|---|---|
| **React 19 + TypeScript** | Calcoli di importi e IVA tipizzati, ecosistema ampio per UI curate. |
| **Vite 8 + vite-plugin-pwa** | Build veloce, service worker con aggiornamento su richiesta, output statico. |
| **Capacitor 8** | Lo stesso build web diventa app Android e iOS vera, con plugin nativi (condivisione file, aptica, barra di stato, tasto indietro). Nessuna riscrittura. |
| **Tailwind CSS 4** | Token di design in CSS (`src/styles/index.css`), varianti `dark:`, `glass:` e `noglass:`. |
| **Dexie (IndexedDB)** | Archivio locale con query reattive (`liveQuery`), foto come Blob, nessun limite di `localStorage`. |
| **Motion, vaul, sonner, lucide** | Animazioni a molla, fogli dal basso trascinabili, notifiche con *Annulla*, icone coerenti. |
| **jsPDF** | Conti A4 generati sul dispositivo, anche offline. |

Il router usa l'hash (`#/job/…`): funziona su qualunque hosting statico senza rewrite e dentro Capacitor.

## Struttura

```
src/
  domain/      logica pura e testata: tipi, IVA e saldo, filtri, mensile, cruscotto, WhatsApp, formati
  data/        IndexedDB (Dexie), repository, migrazione dalla bozza, backup, dati di esempio
  pdf/         conto singolo e conto mensile
  platform/    web/nativo: condivisione, salvataggio, aptica, immagini, colore officina
  ui/          componenti: targa, controlli, ricerca, stati, fogli, marchio
  app/         shell, navigazione, layout, hook, aggiornamenti
  features/    schermate: dashboard (Oggi), list, form, job, doc, month, settings
  styles/      token di design, tema, vetro liquido
brand/         sorgenti del marchio, guida di stile, generatori
android/ ios/  progetti nativi Capacitor
public/        icone PWA, intestazioni HTTP
```

## Modello dei dati

Tutti gli importi sono **interi in centesimi**. Il numero scheda è progressivo e assegnato in transazione (`createJob` in `src/data/repo.ts`).

```ts
Job {
  id, number, createdAt, updatedAt, status, history: [{ s, t }],
  plate, plateCountry: 'I' | 'RSM', vin, make, model, km, dueDate,
  client: 'privato' | 'azienda', company: { name, vat, cf, addr, sdi },
  owner, phone, wa,                 // wa: consenso ai messaggi
  services, tyres, request, notes, workers, photoIds,
  items: [{ id, desc, amount }], deposit,
  vatRate, vatIncl, billing: 'mensile' | 'singola',
  invoiced, invoicedAt, invoiceNo,
  paid, paidAt, paidAmount, payMethod,
  warrantyMonths, warrantyNote, closedAt, deliveredAt
}
```

Tabelle IndexedDB: `jobs`, `settings` (riga `main`), `photos` (Blob JPEG).

**Migrazione dalla bozza**: se sul dispositivo esiste l'archivio della prima versione (`localStorage`, chiave `registro-officina-v1`) viene importato al primo avvio, importi convertiti in centesimi e numeri assegnati per data. L'originale resta come copia di sicurezza.

**Backup**: JSON v2 con schede, impostazioni e foto; importazione *unisci* o *sostituisci*.

## Vetro liquido

Su iPhone e iPad (`isAppleMobile`) l'attributo `data-glass` su `<html>` attiva la barra a capsula flottante, la ricerca e le barre d'azione in vetro. L'utente può forzarlo da *Impostazioni* → *Aspetto*; con *Riduci trasparenza* attivo nel sistema torna alle superfici piene. Le classi sono in `@layer components` di `src/styles/index.css`, quindi le utility Tailwind le possono sovrascrivere.

> Le intestazioni usano `pt-[calc(env(safe-area-inset-top,0px)+16px)]` e non `safe-top pt-4`: due utility di padding si annullerebbero a vicenda.

## Marchio

Sorgenti e regole in [`brand/STYLEGUIDE.md`](../brand/STYLEGUIDE.md). Dopo una modifica:

```bash
pip install fonttools brotli
npm run brand:svg     # SVG in brand/ e tracciati in src/ui/brandPaths.ts
npm run brand:icons   # PNG per la PWA in public/icons e icone/splash native
```

La cartella `assets/` è generata e non va nel repository.

L'interfaccia usa sempre l'arancio Ponte; il colore scelto dall'officina colora solo i documenti (conto e PDF).

## Sicurezza

- Nessuna chiamata a server esterni: font e librerie sono nel build.
- CSP restrittiva in `public/_headers`. Lo script inline in `index.html` (tema prima del primo disegno) è autorizzato tramite hash: se lo modifichi, ricalcolalo dopo `npm run build`:

  ```bash
  python3 -c "import re,hashlib,base64;s=open('dist/index.html').read();print(base64.b64encode(hashlib.sha256(re.findall(r'<script>(.*?)</script>',s,re.S)[0].encode()).digest()).decode())"
  ```

## Aggiungere un backend

L'app è *local-first*: tutta la persistenza passa da `src/data/repo.ts` e `src/data/db.ts`. Per condividere l'archivio tra più dispositivi:

1. **Supabase** (Postgres, autenticazione, storage foto, RLS per officina) con Dexie come cache locale, oppure **Dexie Cloud** sullo stesso database.
2. `updatedAt` è già su ogni scheda per risolvere i conflitti "vince il più recente".
3. Login e regole di accesso: l'archivio contiene dati personali dei clienti (GDPR).
