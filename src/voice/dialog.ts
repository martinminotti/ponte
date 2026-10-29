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
  /** versione corta per lo schermo: mentre si parla si legge poco */
  show: string;
  /** obbligatorio per registrare */
  required: boolean;
}

/** quante volte si è già chiesto un campo: i facoltativi si chiedono una volta sola, gli obbligatori al massimo due */
export type Asked = Partial<Record<FieldKey, number>>;

/** [detto a voce, scritto sullo schermo] */
const QUESTIONS: Record<string, [string, string]> = {
  plate: ['Mi dici la targa?', 'La targa?'],
  cname: ['Come si chiama la ditta?', 'Il nome della ditta?'],
  cvat: ['Mi dai la partita IVA?', 'La partita IVA?'],
  owner: ['Di chi è la macchina?', 'Di chi è il veicolo?'],
  phone: ['Mi lasci il numero del cliente?', 'Il telefono?'],
  request: ['Cosa c’è da fare?', 'Cosa c’è da fare?'],
  make: ['Che macchina è?', 'Che veicolo è?'],
  dueDate: ['Per quando la vuole?', 'Per quando?'],
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
    return { field: f, say: QUESTIONS[f][0], show: QUESTIONS[f][1], required: req };
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

/** come risponde una persona: un cenno breve, che cambia, e si ripetono solo i numeri che contano */
const ACKS = ['Ok', 'Perfetto', 'Bene', 'Fatto'];
let ackTurn = 0;
const ack = () => ACKS[ackTurn++ % ACKS.length];

/**
 * "Perfetto, targa G K, 4 8 2, T R." — a voce si ripetono solo targa, telefono e partita IVA
 * (un numero sbagliato costa caro); nomi, lavori e il resto si vedono sulla scheda.
 */
export function confirmations(changes: Change[]): string {
  const critical = (['plate', 'phone', 'cvat'] as FieldKey[]).map((f) => changes.find((c) => c.field === f && c.say)).filter(Boolean) as Change[];
  if (critical.length) return `${ack()}, ${critical.map((c) => c.say).join(', ')}.`;
  return changes.some((c) => c.say) ? `${ack()}.` : '';
}

/** una frase con la sua versione corta per lo schermo */
export type Said = { say: string; show: string };

export const DONE: Said = { say: 'Ho tutto. Quando vuoi, dimmi registra.', show: 'Tutto pronto.' };

export function compose(changes: Change[], issues: Issue[], ask: Ask | null, extra?: Said): Reply {
  const conf = confirmations(changes);
  // un dato da confermare o da ripetere viene prima della domanda successiva
  const issue = issues[0];
  if (issue) {
    const yesNo = /giust[ao]\?$/i.test(issue.say);
    return { show: issue.show, say: [conf, issue.say].filter(Boolean).join(' '), expect: issue.field, yesNo };
  }
  if (extra) return { show: extra.show, say: [conf, extra.say].filter(Boolean).join(' '), expect: null, yesNo: /\?$/.test(extra.say) };
  if (ask) return { show: ask.show, say: [conf, ask.say].filter(Boolean).join(' '), expect: ask.field };
  return { show: conf ? DONE.show : 'Ti ascolto.', say: conf ? `${conf} ${DONE.say}` : '', expect: null };
}

export function greeting(d: Draft, asked: Asked = {}): Reply {
  const ask = nextAsk(d, asked);
  const blank = !d.plate && !d.vin && !d.owner && !d.company.name;
  if (blank) return { show: 'Dimmi targa, cliente e lavori.', say: 'Ciao! Dimmi pure.', expect: 'plate' };
  const who = d.client === 'azienda' ? d.company.name : d.owner;
  const intro = who ? `Ciao! Ho già i dati di ${who}.` : 'Ciao!';
  if (!ask) return { show: DONE.show, say: `${intro} ${DONE.say}`, expect: null };
  return { show: ask.show, say: `${intro} ${ask.say}`, expect: ask.field };
}

export const HELP: Said = {
  say: 'Parlami come a un collega: targa, cliente, telefono e cosa c’è da fare. Se sbaglio dimmi pure no, oppure annulla. Alla fine, registra.',
  show: 'Dì targa, cliente e lavori. Poi «registra».',
};

export const NOT_UNDERSTOOD: Said = { say: 'Scusa, me lo ripeti?', show: 'Non ho capito.' };
