# Ponte — style guide

Versione navigabile con anteprime dei componenti: design system "Ponte" (artifact). Token in `brand/tokens.json`, sorgenti del marchio in questa cartella (`generate.py` ricrea gli SVG, `rasterize.mjs` le icone).

Ponte è il registro dell'officina: accettazione del veicolo, stato dei lavori, avvisi WhatsApp, conto e fatture mensili per le ditte. Si usa con una mano sola, in piedi accanto al ponte sollevatore, spesso con le dita sporche. Ogni regola qui sotto discende da questo.

## Il nome e il marchio

- **Ponte** è il ponte sollevatore, il cuore di ogni officina: il punto dove l'auto sale e il lavoro comincia. Si scrive sempre con la P maiuscola nel testo ("Apri Ponte"), sempre minuscolo nel logotipo `ponte`.
- **Il marchio** è una "p" minuscola la cui pancia è uno pneumatico con mozzo. Usa i file di `assets/Logos` così come sono, mai ricostruiti o ridisegnati.
- **L'icona** (`ponte-icon.svg`) è il marchio `brand-asphalt` su tessera `brand-orange`. È l'icona dell'app su iOS, Android e PWA. Non metterla mai su fondo arancio: perde il bordo.
- **Il logo completo** (`ponte-logo.svg`) affianca la tessera al logotipo. Su fondi scuri usa `ponte-logo-white.svg`.
- **Spazio di rispetto**: intorno al logo lascia almeno metà dell'altezza della tessera. Dimensione minima dell'icona 16px, del logo completo 96px di larghezza.
- **Non fare**: non cambiare i colori del marchio, non inclinarlo, non aggiungere ombre o contorni, non comporre "ponte" con un altro font, non mettere il logo dell'officina dentro la tessera.

## Due identità sullo stesso schermo

L'app è di Ponte, il conto è dell'officina.

- L'interfaccia usa solo l'arancio Ponte (`accent`). Il colore scelto dall'officina in Impostazioni colora soltanto i documenti (conto, conto mensile, PDF).
- Il logo e il nome dell'officina compaiono a destra nell'intestazione, in un badge rotondo, e in testa a ogni documento. Il marchio Ponte sta a sinistra. Non si mescolano mai nella stessa forma.

## Voce e testi

Ponte parla come un buon accettatore: chiaro, cordiale, senza fronzoli. Dà del tu all'utente in officina e del tu al cliente nei messaggi WhatsApp ("Ti aggiorniamo noi sullo stato dei lavori").

- **Verbi d'azione, maiuscola solo all'inizio**: "Registra accettazione", "Segna: Pronto", "Incassa 205,50 €", "Apri il conto", "Condividi PDF". Mai "Invia" o "OK" generici.
- **Un'azione, un nome**: il pulsante "Elimina scheda" genera la notifica "Scheda N. 0007 eliminata" con "Annulla".
- **Parole dell'officina**, non del software: scheda, accettazione, targa, telaio, tagliando, ricambi, conto, incasso, ditta. Mai "record", "entry", "workflow".
- **Errori che dicono cosa fare**: "Inserisci la targa o il telaio.", "Manca il numero del cliente. Aggiungilo da Modifica dati, oppure copia il testo." Niente scuse, niente "Ops".
- **Stati vuoti come invito**: "Nessun veicolo in archivio. Ogni veicolo che entra in officina diventa una scheda: la ritrovi per targa, telaio o cliente." con il pulsante "Registra la prima accettazione".
- **Niente emoji, niente punti esclamativi** nell'interfaccia. Nei messaggi WhatsApp precompilati il tono resta caldo ma sobrio.
- **Numeri all'italiana**: `1.468,35 €`, date `25/10/2026`, numero scheda a quattro cifre `N. 0007`, chilometri `128.400`.

## Colore

- Il fondo è cemento (`bg`), le schede sono `surface`, i campi `surface-2`. In tema scuro diventa asfalto di notte, stessa struttura.
- **L'arancio è raro e significa "fai questo"**: un solo pulsante `accent` per schermata (l'azione principale, nella barra in basso), più la tab attiva e la selezione. Testo sopra l'arancio sempre `on-accent`, mai bianco (il bianco sull'arancio non arriva a 3:1).
- Testo arancio solo con `accent-ink` ("Modifica dati", link, "Ripristina il testo").
- WhatsApp ha il suo verde (`wa` con `on-wa`) e compare solo dove si scrive al cliente.
- I segnali hanno un significato fisso: `danger` = da incassare o errore, `ok` = incassato o fatturato, `warn` = attenzione (backup, esempi, consenso). Sempre con una parola accanto, mai solo colore.
- Gli stati della scheda hanno ciascuno un colore (`st-accettato` … `st-consegnato`), usato per pallino, binario e tacche; nella pill il testo è il colore di stato mescolato al 72% con `ink`, sul suo fondo al 12%.

## Tipografia

Un solo carattere, **Archivo**, usato sulle sue larghezze. La larghezza è la personalità di Ponte.

- **Espansa (112%)** per i titoli: `screen-title`, `vehicle`, `sheet-title`, e il logotipo.
- **Semi-condensata (87%)** per i titoli di sezione (`section`) e i nomi dei veicoli in elenco.
- **Normale (100%)** per tutto il testo: `body`, `body-sm`, `label`, `caption`.
- **Condensata (75%), grassetto, cifre tabellari** per importi e targhe: `figure-xl`, `figure`, `plate`. I numeri si allineano sempre in colonna.
- Campi di testo mai sotto 16px. Testo corrente entro 65 caratteri per riga.
- Niente maiuscolo per le etichette dell'interfaccia; il maiuscolo spaziato è riservato alle etichette dei documenti stampati (CLIENTE, VEICOLO).

## Forme e superfici

- Raggi per ruolo: `radius-card` per le schede, `radius-ctl` per campi e pulsanti, `radius-pill` per chip e pill, `radius-sheet` per i fogli dal basso.
- Ombre leggere: `shadow-1` a riposo, `shadow-2` per ciò che galleggia (notifiche, documento A4). `shadow-accent` solo sotto i pulsanti arancio.
- Bersagli di tocco minimo 44px; le azioni principali in basso sono alte 56px.
- Margine laterale 16px (`space-4`) su telefono; da 1024px l'archivio e la scheda si affiancano con una barra laterale.

## La targa

La targa è l'elemento che si riconosce a colpo d'occhio: ogni scheda comincia da lì.

- Disegnala sempre col componente Plate, con proporzioni e colori reali (`plate-band`, `plate-stars`, `plate-ground`, `plate-ink`): banda UE a sinistra con stelle e "I", banda blu a destra.
- Targa di San Marino: fondo bianco, caratteri `plate-rsm`, stemma con le tre torri e "RSM" a sinistra, nessuna banda.
- La targa resta uguale nei due temi: è un oggetto fisico.
- Targhe italiane formattate `AA 000 AA`; quelle RSM come scritte.

## Stati della scheda

Sei tappe, sempre in quest'ordine: Accettato, In diagnosi, Attesa ricambi, In lavorazione, Pronto, Consegnato. Si spostano toccando il binario o il pulsante "Segna: …" in basso. A ogni cambio Ponte propone di avvisare il cliente.

## Iconografia

- Icone **Lucide**, tratto 2px (2.2–2.6 per i "+" nei pulsanti principali), 18–22px. Nessun'altra famiglia, nessuna emoji.
- Icone ricorrenti: `CarFront` schede, `ReceiptText` fatture ditte, `Settings2` officina, `Plus` nuova, `MessageCircle` WhatsApp, `Phone` chiama, `FileText` conto, `Share2` condividi PDF, `Camera` foto, `Building2` azienda.
- Le icone accompagnano una parola; da sole solo se il loro significato è universale (chiudi, chiama) e con etichetta accessibile.

## Movimento e tatto

- Le molle (`stiffness` 420–520, `damping` 34–40) muovono solo ciò che l'utente ha toccato: il pallino del binario degli stati, l'indicatore dei controlli segmentati, i fogli dal basso.
- Le schermate entrano con una sola dissolvenza di 220ms e 8px. Nessuna animazione decorativa.
- Ogni tocco ha una risposta: pulsanti che si comprimono al 97%, vibrazione leggera sui tocchi, media sui cambi di stato, "successo" su incasso e salvataggio.
- `prefers-reduced-motion` spegne ogni transizione.

## Documenti

- Il conto è un foglio A4 bianco anche in tema scuro, con una fascia in alto nel colore dell'officina.
- Intestazione: logo e dati dell'officina a sinistra, tipo di documento e numero scheda a destra.
- Ogni documento dice in chiaro cosa non è: "Riepilogo lavori, non valido ai fini fiscali." o "Riepilogo per la fatturazione, non è una fattura."

## Accessibilità

- Testo ≥4.5:1 sul suo fondo in entrambi i temi; ogni coppia è indicata nella nota del token.
- Contorno di focus `accent-ink` da 2.5px con 2px di distanza, su ogni elemento interattivo (≥3:1 su ogni fondo; l'arancio pieno non basta sul cemento).
- Gli stati non si leggono mai solo dal colore: pill con parola, binario con etichette, importi con "da incassare" o "pagato".
