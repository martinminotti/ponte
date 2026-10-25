# Registro Officina

Web app per officine meccaniche, elettrauti e gommisti. Si usa da telefono, si installa sulla schermata Home e non ha bisogno di un server: i dati restano nel browser del dispositivo.

## Cosa fa

- **Accettazione veicolo** in pochi tocchi, per cliente **privato** o **azienda**.
- **Archivio** con ricerca unica per targa, telaio, proprietario, ditta, partita IVA, telefono, operaio. Targhe italiane e di San Marino (RSM).
- **Stato lavorazione** (accettato, in diagnosi, attesa ricambi, in lavorazione, pronto, consegnato) con cronologia.
- **Messaggi WhatsApp** già scritti per ogni stato, modificabili. Si apre la chat con `wa.me` e il testo compilato; l'invio lo conferma l'utente in WhatsApp.
- **Conto per il cliente**: lavori, totale, acconto, da saldare, garanzia, metodo di pagamento (contanti, POS, bonifico, assegno). Avviso "auto e conto pronti". Salvataggio in **PDF** A4.
- **Aziende**: dati per la fattura (ragione sociale, P.IVA o COE, codice fiscale, indirizzo, SDI o PEC), aliquota IVA con importi IVA inclusa o esclusa, numero fattura, filtro "Da fatturare".
- **Fattura mensile per ditta**: i lavori di una ditta si raccolgono durante il mese e a fine mese si prepara un solo documento con tutte le voci, con IVA divisa per aliquota. Si segnano fatture emesse e incasso per tutti i lavori insieme.
- **Operai** che hanno eseguito il lavoro, **logo** e **colore** dell'officina, tema chiaro e scuro automatico.

> I documenti generati sono riepiloghi, non fatture. La fattura fiscale va emessa con un gestionale o con il portale di fatturazione elettronica. Le aliquote IVA proposte (22, 17, 10, 4, esente) vanno verificate con un commercialista.

## Avvio in locale

Non c'è nessuna build e nessuna dipendenza da installare. Servono solo file statici serviti via HTTP:

```bash
git clone <url-del-repo> registro-officina
cd registro-officina
python3 -m http.server 8080
# apri http://localhost:8080
```

Aprendo `index.html` con doppio clic funziona quasi tutto, ma il service worker e l'installazione come app richiedono `http://localhost` oppure HTTPS.

## Pubblicazione

Qualunque hosting statico va bene, purché serva la cartella in **HTTPS** (obbligatorio per installare l'app su iPhone):

- **GitHub Pages**: Settings, Pages, branch `main`, cartella `/ (root)`. Per un repo privato serve un piano a pagamento.
- **Netlify** o **Cloudflare Pages**: collega il repo, nessun comando di build, cartella di pubblicazione `/`.

## Installare l'app su iPhone

1. Apri l'indirizzo pubblicato con **Safari**.
2. Tocca **Condividi**, poi **Aggiungi alla schermata Home**.
3. Si apre a schermo intero, con la sua icona.

Su Android, Chrome propone "Installa app".

## Dati e limiti da conoscere

- **Archivio nel browser** (`localStorage`, chiave `registro-officina-v1`). Non c'è sincronizzazione tra dispositivi, e cancellare i dati del sito o disinstallare l'app cancella l'archivio. Per l'uso reale conviene aggiungere un backend (vedi sotto) o almeno un export/import JSON.
- **PDF** generati con [jsPDF 2.5.1](https://github.com/parallax/jsPDF) caricato da cdnjs, quindi serve la rete la prima volta. Per usarlo offline scarica `jspdf.umd.min.js`, mettilo nel repo e cambia il `<script src>` in `index.html`.
- **Font** da Google Fonts, con ripiego su font di sistema se non raggiungibili.
- **WhatsApp** usa i link `wa.me`: nessuna API, nessun invio automatico. Per messaggi automatici serve WhatsApp Business API.
- I numeri senza prefisso ricevono quello predefinito (impostazioni, 39 per l'Italia, 378 per San Marino). Un numero scritto con `+` davanti non viene toccato.

## Struttura

```
index.html              app completa (HTML, CSS e JS in un unico file)
manifest.webmanifest    metadati per l'installazione
sw.js                   service worker: rete prima, cache come ripiego
icons/                  icone dell'app (192, 512, maskable, apple-touch)
```

Il JavaScript è senza framework, in un'unica funzione autoinvocante. Le parti principali, cercabili per nome in `index.html`:

| Area | Funzioni |
|---|---|
| Archivio | `persist`, `removeJob`, `persistSettings`, `loadLocal`, `saveLocal` |
| Importi | `calc`, `totale`, `daSaldare`, `monthTotals` |
| Messaggi | `buildMsg`, `riepilogo`, `monthMsg`, `waNumber` |
| Documenti | `paperHTML`, `buildPdf`, `monthPaperHTML`, `buildMonthPdf` |
| Viste | `renderList`, `renderForm`, `renderDetail`, `renderDoc`, `renderMonth`, `renderSettings` |

### Modello dei dati

Ogni scheda è un oggetto con questi campi principali:

```js
{
  id, createdAt, updatedAt, status,           // status: accettato | diagnosi | ricambi | lavorazione | pronto | consegnato
  history: [{ s, t }],
  plate, plateCountry,                         // plateCountry: 'I' | 'RSM'
  vin, make, model, km, dueDate,
  client,                                      // 'privato' | 'azienda'
  company: { name, vat, cf, addr, sdi },       // solo per le aziende
  owner, phone, wa,                            // wa: consenso ai messaggi WhatsApp
  services: [], tyres, request, notes, workers: [],
  items: [{ desc, amount }], deposit,
  vatRate, vatIncl, billing,                   // billing: 'mensile' | 'singola'
  invoiced, invoicedAt, invoiceNo,
  paid, paidAt, paidAmount, payMethod,
  warrantyMonths, warrantyNote,
  closedAt, deliveredAt
}
```

Le impostazioni (nome officina, logo come data URL, colore, operai, prefisso, garanzia e IVA predefinite) stanno in un oggetto `settings` a parte.

## Aggiungere un backend

Tutta la persistenza passa da tre funzioni (`persist`, `removeJob`, `persistSettings`) e da una sottoscrizione in `init()` che riempie l'array `jobs`. Sostituendole con Supabase, Firebase o una API propria si ottiene l'archivio condiviso tra dispositivi, senza toccare il resto. Dopo il cambio vanno aggiunti login e regole di accesso, perché l'archivio contiene dati personali dei clienti.

## Origine del progetto

Nasce come pagina pubblicata su Claude (dove l'archivio usa il database della pagina). Questa versione è la stessa app resa autonoma: archivio locale, salvataggio PDF con download del browser, installazione come app.

## Licenza

Da definire dal proprietario del repository.
