# Accettazione a voce

L'impiegato al banco tocca **+ → A voce** (o il microfono nel modulo) e parla come farebbe con un collega:

> «Golf grigia, targa GK 482 TR. È di Marco Bianchi, telefono 335 812 4471. Fa rumore ai freni e c'è un graffio sul paraurti, la vuole venerdì.»

La scheda si compone mentre parla. L'assistente conferma la targa lettera per lettera, chiede quello che manca («Di chi è il veicolo?») e alla fine registra con «registra». Si può correggere a voce («no, il telefono è…»), annullare («annulla»), mettere in pausa («un attimo») o toccare una riga per correggerla a mano nel modulo.

## Collegare il modello (5 minuti)

1. **Impostazioni → Assistente vocale** (profilo titolare).
2. **Chi capisce le frasi**: scegli OpenAI, Anthropic (Claude), Google Gemini oppure *Altro compatibile con OpenAI* (Groq, Mistral, OpenRouter, server locale).
3. Incolla la **chiave API**. Il modello è facoltativo: vuoto vuol dire quello consigliato.
4. Tocca **Prova l'assistente**. Detta una frase di prova e controlla che la targa torni: se qualcosa non va, l'errore dice cosa (chiave non valida, credito finito, modello inesistente, rete).

Senza chiave l'assistente funziona lo stesso in **modalità base**: regole sul telefono che capiscono targa, telefono, chilometri, consegna, misura gomme, marca e modello, nomi introdotti da «proprietario / di / signor», e lavori e note con le parole chiave più comuni. Non costa niente e non richiede rete.

| Fornitore | Modello consigliato | Trascrizione nel cloud | Note |
| --- | --- | --- | --- |
| OpenAI | `gpt-5.4-mini` | `gpt-4o-mini-transcribe` | chiamata a funzione forzata, ragionamento basso |
| Anthropic | `claude-haiku-5-5` | no (si usa quella del dispositivo) | intestazione per l'uso diretto dal browser |
| Gemini | `gemini-3.6-flash` | sì, stesso modello | schema senza chiavi non supportate |
| Compatibile | a scelta | `whisper-large-v3-turbo` se il servizio la offre | indirizzo dell'API obbligatorio |

Il modello si cambia in qualunque momento dalle Impostazioni, senza toccare il codice. Per scegliere: serve un modello **veloce** (la persona aspetta la risposta) e affidabile con le **chiamate a funzione**. Non serve un modello grande.

### Chiave sul dispositivo o server ponte

- **Chiave su questo dispositivo**: la più semplice. La chiave resta nel database locale dell'app, non va nei backup e non si vede dopo averla incollata. Va bene con uno o due telefoni dell'officina.
- **Server ponte** (consigliato con più dispositivi, o se i dipendenti usano telefoni propri): la chiave sta su un piccolo server e i telefoni conoscono solo il suo indirizzo e un codice dell'officina. Il server è in `server/ai-proxy` (Cloudflare Worker, piano gratuito):

```bash
cd server/ai-proxy
npx wrangler login
npx wrangler secret put PONTE_TOKEN        # un codice lungo a piacere
npx wrangler secret put OPENAI_API_KEY     # o ANTHROPIC_API_KEY, GEMINI_API_KEY, COMPATIBLE_API_KEY
npx wrangler deploy
```

Poi in Impostazioni: *Collegamento → Server ponte*, indirizzo del worker e lo stesso codice. Il server inoltra solo i percorsi che l'app usa e non salva niente.

## Come funziona

```
microfono ─► trascrizione ─► frase ─► comandi brevi?  ─sì─► registra / annulla / pausa / sì / no
             (Apple, browser                │no
              o cloud)                      ▼
                              modello AI (o regole di base)
                                            │  aggiorna_scheda { plate, owner, phone, … }
                                            ▼
                       fields.ts: normalizza e controlla ogni valore
                                            │
                                            ▼
                     bozza del modulo ◄── archivio locale (veicolo già visto, ditta, cliente)
                                            │
                                            ▼
                      dialog.ts: conferma + prossima domanda ─► voce (Apple / browser)
```

- **Il modello non scrive mai direttamente nella scheda.** Restituisce solo i campi detti, tramite una funzione con schema fisso (`src/voice/prompt.ts`). Ogni valore passa da `src/voice/fields.ts`: la targa deve avere il formato italiano o sammarinese, il telaio 17 caratteri senza I/O/Q, il telefono da 6 a 15 cifre, la partita IVA la cifra di controllo, la consegna non può essere nel passato. Un valore che non torna diventa una domanda, mai un errore.
- **Le risposte le compone l'app** (`src/voice/dialog.ts`) a partire da quello che è davvero cambiato. La voce non dice mai «fatto» se la scheda non è cambiata, qualunque modello ci sia dietro.
- **L'archivio non va al modello.** Veicoli già visti, ditte e clienti si cercano sul telefono (`src/voice/known.ts`). Al modello arrivano solo la frase, la scheda in compilazione e le ultime battute.
- **Voce e modulo condividono la stessa bozza.** Si passa dall'uno all'altro in qualsiasi momento senza perdere niente. La bozza è anche copiata sul dispositivo: se l'app si chiude, al rientro si riprende.

### Ascolto

| Dove | Come | Audio in rete |
| --- | --- | --- |
| iPhone (app) | plugin `VoiceInput` (`ios/App/App/VoiceInputPlugin.swift`): Speech di Apple con vocabolario dell'officina, AVSpeechSynthesizer per la voce | no, quando l'iPhone supporta il riconoscimento sul dispositivo |
| Chrome, Edge, Safari | Web Speech API | dipende dal browser |
| Android (app), Firefox, o scelto in Impostazioni | registrazione a frasi (rilevamento del silenzio) e trascrizione dal fornitore | sì |

## Casi limite gestiti

- **Permessi**: microfono o riconoscimento negati → spiegazione chiara e pulsante *Apri Impostazioni*. Il permesso si chiede solo al primo tocco sul microfono.
- **Niente rete**: si continua con le regole di base e un avviso discreto. Dopo un minuto si riprova l'AI.
- **Chiave non valida, credito finito, modello inesistente**: avviso una volta sola («il titolare può controllare in Impostazioni»), poi regole di base per il resto della sessione.
- **Servizio lento** (oltre 12 s): si ripiega sulla frase con le regole di base. Errori di rete e del server si riprovano una volta.
- **Risposte malformate**: JSON dentro il testo, tipi sbagliati, campi sconosciuti, valori «null» → si tiene solo quello che è valido.
- **Frasi mentre l'AI pensa**: vanno in coda e partono insieme in una sola richiesta. Le modifiche si applicano sempre alla bozza attuale, anche se nel frattempo si è scritto a mano.
- **L'assistente che ascolta se stesso**: il microfono si chiude mentre parla, e una frase che ripete la sua ultima risposta viene ignorata.
- **Chiacchiere col cliente** («si accomodi», «arrivo subito»): nessun dato scritto. «Non ho capito» si dice una volta sola, poi solo a schermo.
- **Riempitivi e rumori** («ehm», «allora»): ignorati.
- **Targhe dettate in tutti i modi**: lettere singole, alfabeto telefonico («G come Genova»), cifre a parole e a gruppi («quattrocentottantadue»), doppia vu, i lunga, ics, ipsilon. San Marino. Le targhe vecchie o insolite si fanno confermare.
- **Numeri a parole**: telefono a cifre o a gruppi, «più tre nove», «doppio zero», chilometri («centoventimila»), misure gomme («duecentocinque cinquantacinque erre sedici»).
- **Date relative**: oggi, stasera, domani, dopodomani, venerdì (se oggi è venerdì, quello dopo), fra tre giorni, settimana prossima, il 5 novembre, il 5, 5/11.
- **Risposte secche**: «Mario Rossi» dopo «Di chi è il veicolo?», le cifre dopo «Me la ripeti?» vanno al campo chiesto.
- **Correzioni**: «no, il telefono è…» sostituisce. «Annulla» torna indietro di una modifica (fino a 30). I lavori si aggiungono senza doppioni, oppure si sostituiscono se la persona corregge.
- **Veicolo già visto**: «La conosco: Golf di Marco Bianchi. Uso i suoi dati?». Con «sì» si usano, con «no» o con un'altra frase non si ripropone. Una domanda alla volta: se c'è un dato da ripetere, la proposta resta solo come riquadro.
- **Ditta in archivio**: partita IVA, indirizzo e SDI si completano da soli. **Cliente noto** per nome: si propone il suo numero.
- **«Registra» con dati mancanti**: dice cosa manca e lo chiede. Con tutto a posto registra e torna a Schede.
- **Silenzio lungo** (90 s): pausa automatica. **Chiamata in arrivo o app in secondo piano**: pausa e ripresa con un tocco.
- **Impossibile parlare** (rumore, microfono rotto): pulsante *Scrivi* per mandare le frasi a mano. *Usa il modulo* è sempre lì.
- **Uscita per sbaglio**: la bozza si riprende, entro 12 ore.
- **Accessibilità**: riduzione del movimento (niente animazioni che girano), Dimensioni testo, VoiceOver (risposte annunciate, pulsanti con etichetta), tema scuro.

## Privacy

Con un fornitore AI collegato, le frasi dettate e i campi della scheda in compilazione (targa, nome, telefono, lavori) vengono inviati al fornitore per essere interpretati. Le foto e l'archivio no. È un trattamento di dati personali dei clienti per conto dell'officina: va citato nell'informativa e conviene scegliere un fornitore con accordo sul trattamento dei dati (DPA) e conservazione dei dati disattivata per l'API. In modalità base, e con il riconoscimento sul dispositivo dell'iPhone, nulla esce dal telefono.

## Codice

| File | Cosa fa |
| --- | --- |
| `src/voice/spoken.ts` | italiano parlato → valori (numeri, lettere, targhe, telefono, date, gomme, marche, nomi, P.IVA) |
| `src/voice/fields.ts` | patch → bozza, con normalizzazione, controlli e domande |
| `src/voice/local.ts` | interprete di base senza AI |
| `src/voice/commands.ts` | comandi brevi e riempitivi |
| `src/voice/dialog.ts` | prossima domanda, risposte |
| `src/voice/prompt.ts` | istruzioni, schema della funzione, messaggi |
| `src/voice/providers.ts` | OpenAI, Anthropic, Gemini, compatibili, proxy; errori classificati; trascrizione nel cloud; prova |
| `src/voice/listen.ts` | ascolto e voce: nativo, browser, cloud, simulato |
| `src/voice/session.ts` | il motore della conversazione |
| `src/features/voice/*` | schermata, sfera, scheda viva, impostazioni |

I test (`src/voice/*.test.ts`) coprono le frasi reali, i fornitori con risposte finte e la sessione con microfono e voce finti. Nel browser si può provare senza microfono: `window.__PONTE_VOICE_SIM__ = true` prima di aprire l'app, poi `ponteVoice.say("targa GK 482 TR")`.
