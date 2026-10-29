/**
 * Istruzioni per il modello, uguali per tutti i fornitori.
 * Il modello fa una cosa sola: legge la frase dettata e chiama la funzione aggiorna_scheda con i campi detti.
 * Non scrive le risposte per la persona (le compone l'app) e non vede l'archivio dei clienti:
 * gli arrivano solo la frase, la scheda che si sta compilando e le ultime battute.
 */
import { SERVIZI } from '@/domain/constants';
import { FIELD_LABEL, type Draft, type FieldKey } from '@/domain/draft';
import { fmtPlate } from '@/domain/format';
import { MARCHE } from '@/domain/draft';
import { isoDay } from './spoken';

export const TOOL_NAME = 'aggiorna_scheda';

const CLEARABLE: FieldKey[] = ['plate', 'vin', 'make', 'model', 'km', 'dueDate', 'owner', 'phone', 'cname', 'cvat', 'ccf', 'caddr', 'csdi', 'services', 'tyres', 'request', 'notes'];

const str = (description: string) => ({ type: 'string', description });

/** schema JSON dei parametri (sottoinsieme compatibile con OpenAI, Anthropic e Gemini: niente oneOf, niente null) */
export const TOOL_SCHEMA = {
  type: 'object',
  properties: {
    intent: {
      type: 'string',
      enum: ['none', 'save', 'undo', 'pause', 'yes', 'no', 'help'],
      description:
        "Comando della persona. save = vuole registrare/salvare l'accettazione; undo = annullare l'ultima modifica; pause = fermarsi; yes/no = risposta a una domanda sì/no; help = chiede come si usa; none = sta dettando dati o parlando d'altro.",
    },
    client: { type: 'string', enum: ['privato', 'azienda'], description: 'azienda se il veicolo è di una ditta, società, impresa (Srl, SpA, Snc…) da fatturare.' },
    plateCountry: { type: 'string', enum: ['I', 'RSM'], description: 'RSM solo se dice che la targa è di San Marino.' },
    plate: str('Targa: solo lettere e cifre maiuscole, senza spazi (es. GK482TR). Converti lettere dettate e alfabeto fonetico (G come Genova = G, kappa = K, doppia vu = W).'),
    vin: str('Numero di telaio (17 caratteri, senza I, O, Q).'),
    make: str('Marca del veicolo (es. Volkswagen). Deducila dal modello se è ovvia (Golf → Volkswagen, Panda → Fiat).'),
    model: str('Modello ed eventuale versione (es. Golf 2.0 TDI). Senza il colore.'),
    km: str('Chilometri, solo cifre (es. 120000).'),
    dueDate: str('Consegna prevista nel formato yyyy-mm-dd, calcolata dalla data di oggi (domani, venerdì, fra tre giorni…).'),
    owner: str('Privato: nome e cognome del proprietario. Azienda: chi porta il veicolo. Senza titoli (signor, dottor).'),
    phone: str('Telefono, solo cifre con + iniziale se internazionale (es. 3358124471).'),
    wa: { type: 'boolean', description: 'false solo se dice che il cliente non vuole messaggi WhatsApp; true se dice esplicitamente di sì.' },
    companyName: str('Ragione sociale della ditta, con la forma giuridica (es. Edil Rossi Srl).'),
    companyVat: str('Partita IVA (11 cifre) o COE di San Marino, solo cifre.'),
    companyCf: str('Codice fiscale della ditta.'),
    companyAddr: str('Indirizzo, CAP e città della ditta.'),
    companySdi: str('Codice SDI (7 caratteri) o indirizzo PEC.'),
    servicesAdd: { type: 'array', items: { type: 'string', enum: [...SERVIZI] }, description: 'Tipi di lavoro da aggiungere, dedotti da cosa c’è da fare.' },
    servicesRemove: { type: 'array', items: { type: 'string', enum: [...SERVIZI] }, description: 'Tipi di lavoro da togliere, se la persona lo dice.' },
    tyres: str('Misura pneumatici nel formato 205/55 R16, con indici se detti (91V).'),
    request: str('Lavori richiesti dal cliente o problema da risolvere, in una frase breve e pulita in italiano (es. "Rumore ai freni anteriori, tagliando").'),
    requestMode: { type: 'string', enum: ['append', 'replace'], description: 'replace solo se la persona corregge i lavori già scritti ("no, solo il tagliando").' },
    notes: str('Note all’arrivo: stato del veicolo quando entra (graffi, ammaccature, spie accese, carburante, oggetti a bordo).'),
    notesMode: { type: 'string', enum: ['append', 'replace'], description: 'replace solo se la persona corregge le note già scritte.' },
    clear: { type: 'array', items: { type: 'string', enum: CLEARABLE }, description: 'Campi da svuotare, se la persona chiede di togliere un dato.' },
    question: str('Solo se la frase è davvero ambigua: una domanda breve in italiano per chiarire (es. "La consegna è per questo venerdì o per il prossimo?"). Altrimenti lascia vuoto.'),
  },
  required: ['intent'],
} as const;

export const TOOL_DESCRIPTION =
  'Scrive nella scheda di accettazione i dati che la persona ha appena detto. Includi solo i campi detti in questa frase o corretti; non ripetere quelli già presenti e invariati.';

export function systemPrompt(now = new Date()): string {
  const today = now.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return `Sei l'assistente di accettazione di un'officina (meccanico, elettrauto, gommista, carrozzeria) in Italia o a San Marino.
Chi ti parla è al banco con il cliente e detta a voce i dati del veicolo che entra. Il testo che ricevi viene da un riconoscimento vocale: può avere errori di trascrizione, numeri scritti a parole, lettere dettate una per una, frasi spezzate.

Il tuo unico compito: capire quali dati della scheda la persona ha appena detto e chiamare la funzione ${TOOL_NAME}. Rispondi sempre e solo con la chiamata alla funzione.

Oggi è ${today} (${isoDay(now)}).

Regole:
1. Scrivi solo quello che la persona ha detto in questa frase. Non inventare e non dedurre dati che non ha detto (nessun telefono, nome o targa immaginati). Fa eccezione la marca, che puoi dedurre da un modello inconfondibile.
2. Se corregge un dato ("no, scusa, il telefono è…", "la targa è sbagliata, è…") scrivi il nuovo valore: sostituisce il vecchio.
3. Una risposta secca va riferita all'ultima domanda dell'assistente: se ha chiesto il telefono e senti solo cifre, è il telefono; se ha chiesto il nome e senti "Mario Rossi", è il proprietario.
4. Targa italiana: due lettere, tre cifre, due lettere (AB123CD). Le lettere I, O, Q, U non ci sono. Converti alfabeto fonetico e lettere dette a voce ("gi kappa" = GK, "ti erre" = TR, "doppia vu" = W, "i lunga" = J, "ics" = X, "ipsilon" = Y). Se la persona dice "San Marino", la targa è una lettera e fino a quattro cifre.
5. Numeri: "trecentotrentacinque" = 335, "centoventimila" = 120000. Il telefono si scrive come sequenza di cifre nell'ordine detto.
6. Lavori richiesti = cosa chiede il cliente o qual è il problema (rumori, guasti, tagliando, gomme da cambiare). Note all'arrivo = come entra il veicolo (graffi, ammaccature, spie accese, livello carburante, oggetti lasciati). Riscrivili in italiano pulito e breve, senza "ehm", ripetizioni o parole di servizio.
7. Tipi di lavoro (servicesAdd): ${SERVIZI.join(', ')}. Freni, olio, tagliando, frizione, distribuzione → Meccanica. Batteria, spie, centralina, luci, clima → Elettrauto. Gomme, foratura, equilibratura, convergenza → Gomme. Graffi da riparare, ammaccature, verniciatura → Carrozzeria.
8. Se il veicolo è di una ditta o società (Srl, SpA, Snc, Sas, impresa, cooperativa) è un cliente azienda: la ragione sociale va in companyName; la persona che lo porta, se detta, in owner.
9. Comandi: "registra", "salva", "ho finito" → intent save. "Annulla", "torna indietro" → intent undo. "Aspetta", "pausa" → intent pause. "Sì", "esatto", "va bene" dopo una domanda sì/no → yes; "no" → no. Se sta solo dettando dati, intent none.
10. Se la persona parla con il cliente o d'altro ("si accomodi", "arrivo subito", "che tempo fa") e non detta dati, chiama la funzione con intent none e nient'altro.
11. Usa question solo se è impossibile capire senza chiedere. Non chiedere dati mancanti: a quello pensa l'app.

Marche note: ${MARCHE.join(', ')}.`;
}

/** la scheda come la vede il modello: solo i campi compilati, più l'elenco di quelli mancanti */
export function draftForModel(d: Draft): Record<string, unknown> {
  const out: Record<string, unknown> = { client: d.client };
  if (d.plate) out.plate = fmtPlate(d.plate, d.plateCountry);
  if (d.plateCountry === 'RSM') out.plateCountry = 'RSM';
  if (d.vin) out.vin = d.vin;
  if (d.make) out.make = d.make;
  if (d.model) out.model = d.model;
  if (d.km) out.km = d.km;
  if (d.dueDate) out.dueDate = d.dueDate;
  if (d.owner) out.owner = d.owner;
  if (d.phone) out.phone = d.phone;
  if (!d.wa) out.wa = false;
  if (d.client === 'azienda') {
    if (d.company.name) out.companyName = d.company.name;
    if (d.company.vat) out.companyVat = d.company.vat;
    if (d.company.cf) out.companyCf = d.company.cf;
    if (d.company.addr) out.companyAddr = d.company.addr;
    if (d.company.sdi) out.companySdi = d.company.sdi;
  }
  if (d.services.length) out.services = d.services;
  if (d.tyres) out.tyres = d.tyres;
  if (d.request) out.request = d.request;
  if (d.notes) out.notes = d.notes;
  return out;
}

export interface Turn {
  user: string;
  /** campi scritti dopo quella frase (riassunto per il modello) */
  wrote: string;
  assistant: string;
}

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

/** messaggi per il modello: le ultime battute come testo, poi la frase nuova con la scheda aggiornata */
export function buildMessages(text: string, d: Draft, history: Turn[], lastAsk: { field: FieldKey | null; say: string } | null): ChatMessage[] {
  const msgs: ChatMessage[] = [];
  for (const h of history.slice(-4)) {
    msgs.push({ role: 'user', content: `FRASE DETTATA: «${h.user}»` });
    msgs.push({ role: 'assistant', content: `${h.wrote ? `Scritto nella scheda: ${h.wrote}. ` : 'Nessun dato scritto. '}Assistente: «${h.assistant}»` });
  }
  const parts = [`SCHEDA ATTUALE: ${JSON.stringify(draftForModel(d))}`];
  if (lastAsk?.say) parts.push(`ULTIMA DOMANDA DELL'ASSISTENTE: «${lastAsk.say}»${lastAsk.field ? ` (campo: ${FIELD_LABEL[lastAsk.field]})` : ''}`);
  parts.push(`FRASE DETTATA: «${text}»`);
  msgs.push({ role: 'user', content: parts.join('\n') });
  return msgs;
}

/** prompt per trascrivere con un modello generico (Gemini): vocabolario dell'officina come contesto */
export const TRANSCRIBE_PROMPT =
  "Trascrivi esattamente in italiano quello che si sente, senza commenti. È un'accettazione in officina: targhe dettate lettera per lettera, numeri di telefono, marche e modelli di auto, lavori da fare.";

/** parole che aiutano il riconoscimento vocale (Apple contextualStrings, prompt di Whisper) */
export function vocabulary(extra: string[] = []): string[] {
  return [
    ...MARCHE,
    'Golf',
    'Panda',
    'Punto',
    'Ypsilon',
    'Clio',
    'Yaris',
    'Qashqai',
    'tagliando',
    'pastiglie',
    'distribuzione',
    'frizione',
    'convergenza',
    'equilibratura',
    'elettrauto',
    'carrozzeria',
    'partita IVA',
    'San Marino',
    'targa',
    'telaio',
    'chilometri',
    'registra',
    'annulla',
    ...extra,
  ].slice(0, 100);
}
