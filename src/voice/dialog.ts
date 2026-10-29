/**
 * Cosa dice l'assistente. Le risposte si compongono qui, sul telefono, a partire da quello che è
 * davvero cambiato nella bozza: così la voce non promette mai qualcosa che la scheda non contiene,
 * qualunque modello ci sia dietro.
 */
import { validate, type Draft, type FieldKey } from '@/domain/draft';
import type { Change, Issue } from './fields';

export interface Ask {
  field: FieldKey;
  say: string;
  /** obbligatorio per registrare */
  required: boolean;
}

/** quante volte si è già chiesto un campo: i facoltativi si chiedono una volta sola, gli obbligatori al massimo due */
export type Asked = Partial<Record<FieldKey, number>>;

const QUESTIONS: Record<string, string> = {
  plate: 'Qual è la targa?',
  cname: 'Come si chiama la ditta?',
  cvat: 'Mi dici la partita IVA della ditta?',
  owner: 'Di chi è il veicolo? Nome e cognome.',
  phone: 'Il numero di telefono del cliente?',
  request: 'Cosa c’è da fare?',
  make: 'Che veicolo è? Marca e modello.',
  dueDate: 'Per quando lo vuole?',
};

/** La prossima cosa da chiedere, in ordine di importanza. null = ha tutto quello che serve. */
export function nextAsk(d: Draft, asked: Asked = {}): Ask | null {
  const missing = validate(d);
  const times = (f: FieldKey) => asked[f] || 0;
  const order: [FieldKey, boolean, boolean][] = [
    // campo, mancante, obbligatorio
    ['plate', !!missing.plate, true],
    ['cname', !!missing.cname, true],
    ['owner', !!missing.owner, true],
    ['cvat', !!missing.cvat, true],
    ['request', !d.request.trim() && !d.services.length, false],
    ['phone', !d.phone.trim(), false],
    ['make', !d.make && !d.model, false],
  ];
  for (const [f, miss, req] of order) {
    if (!miss) continue;
    if (times(f) >= (req ? 2 : 1)) continue;
    return { field: f, say: QUESTIONS[f], required: req };
  }
  return null;
}

/** cosa manca per registrare, detto in italiano ("la targa e il nome del proprietario") */
export function missingForSave(d: Draft): string {
  const m = validate(d);
  const parts: string[] = [];
  if (m.plate) parts.push('la targa');
  if (m.cname) parts.push('il nome della ditta');
  if (m.cvat) parts.push('la partita IVA');
  if (m.owner) parts.push('il nome del proprietario');
  return parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`;
}

export interface Reply {
  /** testo grande sullo schermo: la domanda o la conferma */
  show: string;
  /** quello che dice la voce (conferme brevi + domanda) */
  say: string;
  /** il campo a cui si riferisce la domanda (per interpretare la risposta secca) */
  expect: FieldKey | null;
  /** la domanda chiede un sì o un no */
  yesNo?: boolean;
}

const sentenceCase = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** "targa G, K, 4…, Volkswagen Golf, Marco Bianchi." — al massimo tre conferme, le più importanti */
export function confirmations(changes: Change[]): string {
  const rank: FieldKey[] = [
    'plate',
    'phone',
    'cvat',
    'owner',
    'cname',
    'make',
    'model',
    'dueDate',
    'km',
    'tyres',
    'wa',
    'client',
    'plateCountry',
    'services',
    'vin',
    'request',
    'notes',
    'ccf',
    'caddr',
    'csdi',
  ];
  const said = changes.filter((c) => c.say).sort((a, b) => rank.indexOf(a.field) - rank.indexOf(b.field));
  if (!said.length) return '';
  const top = said.slice(0, 3).map((c) => c.say);
  const rest = said.length - top.length;
  return sentenceCase(top.join(', ')) + (rest > 0 ? `, e ${rest === 1 ? 'un’altra cosa' : `altre ${rest} cose`}` : '') + '.';
}

export function compose(changes: Change[], issues: Issue[], ask: Ask | null, extra?: string): Reply {
  const conf = confirmations(changes);
  // un dato da confermare o da ripetere viene prima della domanda successiva
  const issue = issues[0];
  if (issue) {
    const yesNo = /giust[ao]\?$/i.test(issue.say);
    return { show: issue.say, say: [conf, issue.say].filter(Boolean).join(' '), expect: issue.field, yesNo };
  }
  if (extra) return { show: extra, say: [conf, extra].filter(Boolean).join(' '), expect: null, yesNo: /\?$/.test(extra) };
  if (ask) return { show: ask.say, say: [conf, ask.say].filter(Boolean).join(' '), expect: ask.field };
  const done = 'Ho tutto quello che serve. Aggiungi pure altro, oppure dì «registra».';
  return { show: conf ? done : 'Ti ascolto.', say: conf ? `${conf} ${done}` : '', expect: null };
}

export function greeting(d: Draft, asked: Asked = {}): Reply {
  const ask = nextAsk(d, asked);
  const blank = !d.plate && !d.vin && !d.owner && !d.company.name;
  if (blank) {
    const show = 'Dimmi targa, cliente e cosa c’è da fare.';
    return { show, say: 'Ciao. Dimmi pure: targa, cliente e cosa c’è da fare.', expect: 'plate' };
  }
  const who = d.client === 'azienda' ? d.company.name : d.owner;
  const intro = who ? `Ho già i dati di ${who}.` : 'Ho già qualche dato.';
  if (!ask) return { show: 'Aggiungi pure altro, oppure dì «registra».', say: `${intro} Aggiungi pure altro, oppure dì «registra».`, expect: null };
  return { show: ask.say, say: `${intro} ${ask.say}`, expect: ask.field };
}

export const HELP = 'Parla come al banco: targa, nome del cliente, telefono e cosa c’è da fare. Se sbaglio dimmi «no, la targa è…» oppure «annulla». Quando hai finito dì «registra».';

export const NOT_UNDERSTOOD = 'Scusa, non ho capito. Puoi ripetere con calma?';
