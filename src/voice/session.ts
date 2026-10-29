/**
 * Il motore della conversazione: ascolta, interpreta, scrive nella bozza, risponde.
 * Non sa niente di React: riceve la bozza da un "host" (il modulo) e gli restituisce le modifiche.
 *
 * Garanzie:
 *  - una frase alla volta: quelle che arrivano mentre si pensa vanno in coda e si uniscono;
 *  - le modifiche si applicano sempre alla bozza attuale (anche se nel frattempo si è scritto a mano);
 *  - ogni modifica a voce si può annullare;
 *  - se il modello non risponde, la chiave non va o manca la rete, si continua con le regole locali;
 *  - mentre l'assistente parla il microfono è chiuso, e la sua voce non viene scambiata per una frase;
 *  - senza voce per un po' l'ascolto va in pausa da solo.
 */
import type { Draft, FieldKey } from '@/domain/draft';
import { validate } from '@/domain/draft';
import type { Job, VoiceSettings } from '@/domain/types';
import { veic } from '@/domain/logic';
import { aiReady } from './config';
import { HELP, NOT_UNDERSTOOD, compose, greeting, missingForSave, nextAsk, type Asked, type Reply, type Said } from './dialog';
import { detectCommand, isFiller } from './commands';
import { applyPatch, type Change, type Intent, type VoicePatch } from './fields';
import { knownCompany, knownPerson, knownVehicle, knownVehicleQuestion, withKnownCompany, withKnownVehicle } from './known';
import { isEmptyPatch, localInterpret } from './local';
import { AiError, aiErrorShort, interpretWithAi, type InterpretInput } from './providers';
import { vocabulary, type Turn } from './prompt';
import { SttError, type Speaker, type Transcriber } from './listen';
import { similarity, spellPhone } from './spoken';

export type Phase = 'idle' | 'starting' | 'listening' | 'thinking' | 'speaking' | 'paused' | 'error' | 'saving';

export interface VoiceProblem {
  title: string;
  text: string;
  /** si risolve da Impostazioni del telefono */
  settings: boolean;
  /** si può riprovare */
  retry: boolean;
}

export interface Line {
  id: number;
  who: 'user' | 'assistant';
  text: string;
}

type Pending = { kind: 'vehicle'; job: Job } | { kind: 'person'; name: string; phone: string; wa: boolean } | { kind: 'confirm'; field: FieldKey };

export interface VoiceState {
  phase: Phase;
  /** quello che la persona sta dicendo adesso */
  partial: string;
  /** livello del microfono, 0..1 */
  level: number;
  reply: Reply;
  lines: Line[];
  /** campi appena scritti (per evidenziarli) */
  recent: FieldKey[];
  recentAt: number;
  /** chi interpreta in questo momento */
  mode: 'ai' | 'base';
  /** avviso discreto (rete, chiave, ripiego sulle regole locali) */
  notice: string | null;
  problem: VoiceProblem | null;
  canUndo: boolean;
  speak: boolean;
  /** c'è una voce per rispondere su questo dispositivo */
  canSpeak: boolean;
  /** veicolo già visto proposto, in attesa di sì/no */
  known: Job | null;
  /** la sessione è partita almeno una volta */
  started: boolean;
  /** perché è in pausa: lo si dice in due parole sotto la sfera */
  pausedBy: PauseReason | null;
}

export type PauseReason = 'tap' | 'voice' | 'idle' | 'background' | 'call';

export interface VoiceHost {
  getDraft(): Draft;
  setDraft(d: Draft): void;
  /** salva la scheda; false se mancano dati obbligatori */
  save(): Promise<boolean>;
  close(): void;
  jobs(): Job[];
  editing: boolean;
  /** ditta e cliente già usati dal modulo (cliente che torna): niente proposte */
  prefilled?: boolean;
}

export interface VoiceDeps {
  host: VoiceHost;
  settings: VoiceSettings;
  transcriber: Transcriber | null;
  speaker: Speaker | null;
  /** solo per i test */
  interpret?: (input: InterpretInput) => Promise<VoicePatch>;
  now?: () => Date;
  silenceMs?: number;
  idlePauseMs?: number;
  /** nomi da riconoscere meglio (operai, ditte frequenti) */
  extraWords?: string[];
}

const MAX_UNDO = 30;

export class VoiceSession {
  private s: VoiceState;
  private subs = new Set<() => void>();
  private queue: string[] = [];
  private busy = false;
  private undoStack: Draft[] = [];
  private history: Turn[] = [];
  private asked: Asked = {};
  private pending: Pending | null = null;
  private declined = new Set<string>();
  private aiOffUntil = 0;
  private aiDead = false;
  private abort: AbortController | null = null;
  private lastSpoken = '';
  private lastSpokenAt = 0;
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
  private misses = 0;
  private lineId = 0;
  private disposed = false;
  private listening = false;
  private wantListen = false;
  private speaking = false;
  private greeted = false;

  constructor(private d: VoiceDeps) {
    const draft = d.host.getDraft();
    this.s = {
      phase: 'idle',
      partial: '',
      level: 0,
      reply: d.transcriber ? greeting(draft) : { show: 'Puoi scrivere qui sotto.', say: '', expect: null },
      lines: [],
      recent: [],
      recentAt: 0,
      mode: aiReady(d.settings) ? 'ai' : 'base',
      notice: null,
      problem: d.transcriber ? null : { title: 'Ascolto non disponibile', text: 'Su questo dispositivo non posso ascoltare. Puoi scrivere le frasi qui sotto.', settings: false, retry: false },
      canUndo: false,
      speak: d.settings.speak && !!d.speaker,
      canSpeak: !!d.speaker,
      known: null,
      started: false,
      pausedBy: null,
    };
    if (d.host.prefilled) this.declined.add('prefilled');
  }

  /* ---------------------------------------------------------------- stato */

  get state() {
    return this.s;
  }
  subscribe = (f: () => void) => {
    this.subs.add(f);
    return () => this.subs.delete(f);
  };
  private set(p: Partial<VoiceState>) {
    if (this.disposed) return;
    this.s = { ...this.s, ...p };
    this.subs.forEach((f) => f());
  }
  private now() {
    return this.d.now?.() ?? new Date();
  }
  private line(who: Line['who'], text: string) {
    if (!text) return;
    this.set({ lines: [...this.s.lines.slice(-19), { id: ++this.lineId, who, text }] });
  }

  /* ---------------------------------------------------------------- ascolto */

  /** tocco sulla sfera: parte, si ferma, interrompe la voce */
  toggle() {
    const ph = this.s.phase;
    if (ph === 'speaking') return this.interruptSpeech();
    if (ph === 'listening' || ph === 'thinking') return this.pause('tap');
    return this.start();
  }

  async start() {
    const t = this.d.transcriber;
    if (!t || this.disposed) return;
    if (this.s.phase === 'starting' || this.listening) return;
    this.set({ phase: 'starting', problem: null, started: true, pausedBy: null });
    try {
      await t.prepare();
    } catch (e) {
      return this.fail(e);
    }
    if (this.disposed) return;
    this.wantListen = true;
    if (!this.greeted) {
      this.greeted = true;
      const g = greeting(this.d.host.getDraft(), this.asked);
      this.setReply(g);
      await this.say(g.say);
      if (this.disposed || !this.wantListen) return;
    }
    await this.listen();
  }

  private async listen() {
    const t = this.d.transcriber;
    if (!t || this.disposed || this.listening || !this.wantListen) return;
    this.listening = true;
    try {
      await t.start(
        {
          partial: (x) => {
            this.bumpIdle();
            this.set({ partial: x });
          },
          final: (x) => {
            this.bumpIdle();
            this.set({ partial: '' });
            this.enqueue(x);
          },
          level: (v) => this.set({ level: v }),
          error: (e) => this.fail(e),
        },
        { vocabulary: vocabulary(this.d.extraWords), silenceMs: this.d.silenceMs ?? 1300 },
      );
    } catch (e) {
      this.listening = false;
      return this.fail(e);
    }
    if (this.disposed) return void t.stop();
    this.set({ phase: this.busy ? 'thinking' : 'listening', problem: null });
    this.bumpIdle();
  }

  private async unlisten() {
    if (!this.listening) return;
    this.listening = false;
    clearTimeout(this.idleTimer);
    await this.d.transcriber?.stop().catch(() => {});
    this.set({ level: 0, partial: '' });
  }

  async pause(by: PauseReason = 'tap') {
    this.wantListen = false;
    this.d.speaker?.cancel();
    await this.unlisten();
    this.set({ phase: 'paused', pausedBy: by });
  }

  private bumpIdle() {
    clearTimeout(this.idleTimer);
    const ms = this.d.idlePauseMs ?? 90_000;
    this.idleTimer = setTimeout(() => {
      if (this.listening && !this.busy) {
        this.pause('idle');
      }
    }, ms);
  }

  private fail(e: unknown) {
    const err = e instanceof SttError ? e : new SttError('unavailable', (e as Error)?.message || 'Ascolto non disponibile.');
    this.listening = false;
    this.wantListen = false;
    void this.d.transcriber?.stop().catch(() => {});
    if (err.kind === 'interrupted') {
      this.set({ phase: 'paused', pausedBy: 'call' });
      return;
    }
    if (err.kind === 'network' && this.d.transcriber?.kind === 'cloud') {
      // un pezzo non trascritto: si avvisa e si continua ad ascoltare
      this.set({ notice: err.message });
      this.wantListen = true;
      void this.listen();
      return;
    }
    const titles: Record<string, string> = {
      permission: 'Serve il permesso del microfono',
      network: 'Serve la connessione',
      audio: 'Microfono occupato',
      unavailable: 'Ascolto non disponibile',
    };
    this.set({
      phase: 'error',
      level: 0,
      partial: '',
      problem: { title: titles[err.kind] || 'Ascolto non disponibile', text: err.message, settings: err.settings, retry: err.kind !== 'permission' || !err.settings },
    });
  }

  /* ---------------------------------------------------------------- voce */

  setSpeak(on: boolean) {
    if (!on) this.d.speaker?.cancel();
    this.set({ speak: on && !!this.d.speaker });
  }

  private interruptSpeech() {
    this.d.speaker?.cancel();
  }

  /** dice una frase: il microfono si chiude prima e si riapre dopo */
  private async say(text: string) {
    if (!text || !this.s.speak || !this.d.speaker || this.disposed) return;
    const wasListening = this.listening;
    this.speaking = true;
    this.set({ phase: 'speaking' });
    await this.unlisten();
    this.lastSpoken = text;
    try {
      await this.d.speaker.speak(text);
    } finally {
      this.lastSpokenAt = Date.now();
      this.speaking = false;
    }
    if (this.disposed) return;
    if (this.wantListen && (wasListening || this.s.phase === 'speaking')) await this.listen();
    else if (this.s.phase === 'speaking') this.set({ phase: this.wantListen ? 'listening' : 'paused' });
  }

  /* ---------------------------------------------------------------- frasi */

  /** frase scritta a mano (quando non si può parlare) */
  submitText(text: string) {
    this.set({ started: true });
    this.enqueue(text);
  }

  private enqueue(text: string) {
    const t = text.trim();
    if (!t || this.disposed) return;
    this.queue.push(t);
    void this.drain();
  }

  private async drain() {
    if (this.busy) return;
    this.busy = true;
    try {
      while (this.queue.length && !this.disposed) {
        // le frasi arrivate mentre si pensava vanno insieme: una richiesta sola, un contesto solo
        const text = this.queue.splice(0).join('. ');
        await this.handle(text);
      }
    } finally {
      this.busy = false;
      if (!this.disposed && (this.s.phase === 'thinking' || this.s.phase === 'listening')) this.set({ phase: this.listening ? 'listening' : this.wantListen ? 'listening' : 'paused' });
    }
  }

  private async handle(text: string) {
    if (isFiller(text)) return;
    // la propria voce rientrata nel microfono
    if (this.lastSpoken && Date.now() - this.lastSpokenAt < 5000 && similarity(text, this.lastSpoken) > 0.7) return;
    this.line('user', text);

    const yesNoOpen = !!this.pending || !!this.s.reply.yesNo;
    const cmd = detectCommand(text, { awaitingYesNo: yesNoOpen });
    if (cmd) return this.intent(cmd);

    // una frase nuova che non risponde alla domanda sì/no la chiude
    const wasPending = this.pending;
    if (wasPending?.kind === 'vehicle') {
      this.declined.add(wasPending.job.id);
      this.set({ known: null });
    }
    this.pending = null;

    this.set({ phase: 'thinking' });
    const draft = this.d.host.getDraft();
    const patch = await this.interpret(text, draft);
    if (this.disposed) return;

    const applied = applyPatch(this.d.host.getDraft(), patch, this.now());
    let changes = applied.changes;
    let next = applied.draft;
    if (changes.length) this.commit(next);

    // dati in archivio: ditta e cliente si completano da soli, il veicolo si propone
    let extra: Said | undefined;
    const ch = (f: FieldKey) => changes.some((c) => c.field === f);
    if (ch('cname') && next.client === 'azienda') {
      const c = knownCompany(next.company.name, this.d.host.jobs());
      if (c) {
        const k = withKnownCompany(next, c);
        if (k.changes.length) {
          next = k.draft;
          this.d.host.setDraft(next);
          changes = mergeChanges(changes, k.changes);
          extra = undefined;
        }
      }
    }
    if ((ch('plate') || ch('vin')) && !this.d.host.editing) {
      const j = knownVehicle(next, this.d.host.jobs());
      if (j && !this.declined.has(j.id) && !this.declined.has('prefilled') && (j.owner !== next.owner || j.make !== next.make || j.phone !== next.phone)) {
        this.set({ known: j });
        // una domanda alla volta: se c'è un dato da ripetere, la proposta resta solo come riquadro con i pulsanti
        if (!applied.issues.length) {
          this.pending = { kind: 'vehicle', job: j };
          extra = { say: knownVehicleQuestion(j), show: 'Uso i suoi dati?' };
        }
      }
    }
    if (!extra && ch('owner') && next.client === 'privato' && !next.phone && !this.d.host.editing) {
      const c = knownPerson(next.owner, this.d.host.jobs());
      if (c && !this.declined.has('p:' + c.key)) {
        this.pending = { kind: 'person', name: c.name, phone: c.phone, wa: c.wa };
        this.declined.add('p:' + c.key);
        extra = { say: `${c.name} è già cliente, con il numero ${spellPhone(c.phone)}. Uso questo numero?`, show: 'Uso il suo numero?' };
      }
    }
    const issue = applied.issues[0];
    if (!extra && issue?.code === 'plate_unusual') this.pending = { kind: 'confirm', field: 'plate' };

    if (patch.intent && patch.intent !== 'none') {
      this.flash(changes);
      return this.intent(patch.intent, changes);
    }

    const empty = !changes.length && !applied.issues.length && !patch.question && !extra;
    if (empty) {
      this.misses++;
      // la prima volta lo dice, poi lo scrive soltanto: non si insiste a voce
      const r: Reply = {
        show: isEmptyPatch(patch) ? NOT_UNDERSTOOD.show : 'Niente di nuovo.',
        say: this.misses === 1 && isEmptyPatch(patch) ? NOT_UNDERSTOOD.say : '',
        expect: this.s.reply.expect,
      };
      this.setReply(r);
      this.turn(text, changes, r);
      return this.say(r.say);
    }
    this.misses = 0;
    this.flash(changes);
    const ask = nextAsk(next, this.asked);
    const r = compose(changes, applied.issues, ask, extra ?? (patch.question ? { say: patch.question, show: patch.question } : undefined));
    if (extra) r.yesNo = true;
    this.setReply(r);
    this.turn(text, changes, r);
    // se la persona sta già parlando di nuovo, la risposta si legge e basta
    if (this.queue.length || this.s.partial) return;
    await this.say(r.say);
  }

  private async interpret(text: string, draft: Draft): Promise<VoicePatch> {
    const v = this.d.settings;
    const local = () => localInterpret(text, draft, { expect: this.s.reply.expect, now: this.now() });
    if (!aiReady(v) || this.aiDead || Date.now() < this.aiOffUntil) {
      this.set({ mode: 'base' });
      return local();
    }
    this.abort = new AbortController();
    const fn = this.d.interpret ?? ((i: InterpretInput) => interpretWithAi(v, i));
    try {
      const p = await fn({ text, draft, history: this.history, lastAsk: { field: this.s.reply.expect, say: this.s.reply.show }, now: this.now(), signal: this.abort.signal });
      this.set({ mode: 'ai', notice: this.s.notice && this.s.mode === 'base' ? null : this.s.notice });
      // il modello non ha scritto niente ma le regole locali trovano dati certi: si usano quelle
      if (isEmptyPatch(p) && (!p.intent || p.intent === 'none')) {
        const l = local();
        if (l.plate || l.phone) return l;
      }
      return p;
    } catch (e) {
      const err = e instanceof AiError ? e : new AiError('network', String(e));
      if (err.kind === 'cancelled') return {};
      if (err.kind === 'auth' || err.kind === 'model' || err.kind === 'quota') {
        this.aiDead = true;
        this.set({ mode: 'base', notice: `${aiErrorShort(err)} · modalità base` });
      } else {
        // rete o servizio lenti: per un minuto si va avanti senza AI, poi si riprova
        this.aiOffUntil = Date.now() + 60_000;
        this.set({ mode: 'base', notice: `${aiErrorShort(err)} · modalità base` });
      }
      return local();
    } finally {
      this.abort = null;
    }
  }

  private commit(next: Draft) {
    this.undoStack.push(this.d.host.getDraft());
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
    this.d.host.setDraft(next);
    this.set({ canUndo: true });
  }

  private flash(changes: Change[]) {
    if (changes.length) this.set({ recent: changes.map((c) => c.field), recentAt: Date.now() });
  }

  private setReply(r: Reply) {
    if (r.expect && r.expect === nextAsk(this.d.host.getDraft(), this.asked)?.field) this.asked[r.expect] = (this.asked[r.expect] || 0) + 1;
    this.set({ reply: r });
    this.line('assistant', r.show);
  }

  private turn(user: string, changes: Change[], r: Reply) {
    this.history.push({ user, wrote: changes.map((c) => `${c.field}=${c.show}`).join(', '), assistant: r.say || r.show });
    if (this.history.length > 8) this.history.shift();
  }

  /* ---------------------------------------------------------------- comandi */

  private async intent(i: Intent, changes: Change[] = []) {
    const host = this.d.host;
    if (i === 'yes') {
      const p = this.pending;
      this.pending = null;
      this.set({ known: null });
      if (p?.kind === 'vehicle') return this.useKnown(p.job);
      if (p?.kind === 'person') {
        const d = host.getDraft();
        const next = { ...d, phone: d.phone || p.phone, wa: p.wa };
        this.commit(next);
        this.flash([{ field: 'phone', show: next.phone, say: '' }]);
        return this.reply('Fatto.');
      }
      return this.reply('Bene.');
    }
    if (i === 'no') {
      const p = this.pending;
      this.pending = null;
      this.set({ known: null });
      if (p?.kind === 'vehicle') {
        this.declined.add(p.job.id);
        return this.reply('Va bene, scheda nuova.');
      }
      if (p?.kind === 'confirm' || this.s.reply.expect === 'plate') {
        const d = host.getDraft();
        this.commit({ ...d, plate: '' });
        const r: Reply = { show: 'Ripeti la targa', say: 'Va bene. Me la ripeti lettera per lettera?', expect: 'plate' };
        this.setReply(r);
        return this.say(r.say);
      }
      return this.reply('Va bene.');
    }
    if (i === 'undo') {
      const prev = this.undoStack.pop();
      if (!prev) return this.reply('Non c’è niente da annullare.', 'Non c’è niente da annullare.');
      host.setDraft(prev);
      this.set({ canUndo: this.undoStack.length > 0, recent: [], known: null });
      this.pending = null;
      return this.reply('Ho annullato l’ultima modifica.');
    }
    if (i === 'pause') {
      return this.pause('voice');
    }
    if (i === 'help') {
      const r: Reply = { show: HELP.show, say: HELP.say, expect: this.s.reply.expect };
      this.setReply(r);
      return this.say(r.say);
    }
    if (i === 'close') return host.close();
    if (i === 'save') return this.save(changes);
  }

  /** "sì" al veicolo conosciuto */
  useKnown(job?: Job) {
    const j = job ?? this.s.known;
    if (!j) return;
    this.pending = null;
    this.set({ known: null });
    const d = this.d.host.getDraft();
    const k = withKnownVehicle(d, j);
    this.declined.add(j.id);
    if (k.changes.length) {
      this.commit(k.draft);
      this.flash(k.changes);
    }
    const who = j.client === 'azienda' ? j.company?.name : j.owner;
    return this.reply(`Fatto: ${veic(j)}${who ? ` di ${who}` : ''}.`);
  }

  /** "no" al veicolo conosciuto, dal pulsante */
  dismissKnown() {
    if (this.pending?.kind === 'vehicle') this.declined.add(this.pending.job.id);
    this.pending = null;
    this.set({ known: null });
  }

  /** conferma breve + prossima domanda */
  private reply(prefix: string, sayOverride?: string) {
    const d = this.d.host.getDraft();
    const ask = nextAsk(d, this.asked);
    const r = compose([], [], ask);
    const out: Reply = { show: r.show, say: sayOverride ?? [prefix, r.say].filter(Boolean).join(' '), expect: r.expect };
    if (!ask && !r.say) out.say = prefix;
    this.setReply(out);
    return this.say(out.say);
  }

  /** «registra» detto o toccato */
  async save(changes: Change[] = []) {
    const host = this.d.host;
    const d = host.getDraft();
    const missing = validate(d);
    if (Object.keys(missing).length && !host.editing) {
      const what = missingForSave(d);
      const ask = nextAsk(d, {});
      const r: Reply = {
        show: `Manca ${what}`,
        say: [changes.length ? 'Fatto.' : '', `Per registrare mi manca ${what}.`, ask?.say].filter(Boolean).join(' '),
        expect: ask?.field ?? null,
      };
      this.setReply(r);
      return this.say(r.say);
    }
    this.wantListen = false;
    this.d.speaker?.cancel();
    await this.unlisten();
    this.set({ phase: 'saving' });
    const ok = await host.save().catch(() => false);
    if (!ok && !this.disposed) {
      this.setReply({ show: 'Non registrata: controlla il modulo.', say: '', expect: null });
      this.set({ phase: 'paused' });
    }
  }

  undo() {
    return this.intent('undo');
  }

  /** Chiude tutto: microfono, voce, richieste in corso, timer. */
  dispose() {
    if (this.disposed) return;
    this.wantListen = false;
    this.abort?.abort();
    this.d.speaker?.cancel();
    clearTimeout(this.idleTimer);
    void this.d.transcriber?.stop().catch(() => {});
    this.listening = false;
    this.disposed = true;
    this.subs.clear();
  }

  /** l'app va in secondo piano o si apre un'altra schermata */
  background() {
    if (this.listening || this.speaking) void this.pause('background');
  }
}

/** i dati della ditta presi dall'archivio si annunciano una volta sola */
function mergeChanges(a: Change[], b: Change[]): Change[] {
  const out = [...a];
  let announced = false;
  for (const c of b) {
    const i = out.findIndex((x) => x.field === c.field);
    if (i >= 0) continue;
    out.push({ ...c, say: announced ? '' : 'dati della ditta presi dall’archivio' });
    announced = true;
  }
  return out;
}
