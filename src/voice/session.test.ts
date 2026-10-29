import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeJob } from '@/data/repo';
import { emptyDraft, type Draft } from '@/domain/draft';
import type { Job, VoiceSettings } from '@/domain/types';
import { DEFAULT_VOICE, endpoint, withoutSecrets } from './config';
import type { VoicePatch } from './fields';
import type { ListenHandlers, Speaker, Transcriber } from './listen';
import { AiError, interpretWithAi, sanitizePatch, setFetch, testConnection, jsonIn } from './providers';
import { VoiceSession, type VoiceHost } from './session';

const NOW = new Date(2026, 9, 29, 10, 0);
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => {
  for (let i = 0; i < 12; i++) await tick();
};

class FakeMic implements Transcriber {
  kind = 'sim' as const;
  onDevice = true;
  h: ListenHandlers | null = null;
  starts = 0;
  stops = 0;
  denied = false;
  async prepare() {
    if (this.denied) {
      const { SttError } = await import('./listen');
      throw new SttError('permission', 'no', true);
    }
  }
  async start(h: ListenHandlers) {
    this.starts++;
    this.h = h;
  }
  async stop() {
    this.stops++;
    this.h = null;
  }
  say(t: string) {
    this.h?.final(t);
  }
}

class FakeVoice implements Speaker {
  said: string[] = [];
  micOpenWhileSpeaking = false;
  constructor(private mic?: FakeMic) {}
  async speak(t: string) {
    if (this.mic?.h) this.micOpenWhileSpeaking = true;
    this.said.push(t);
  }
  cancel() {}
}

function setup(o: { settings?: Partial<VoiceSettings>; interpret?: (text: string) => Promise<VoicePatch> | VoicePatch; jobs?: Job[]; draft?: Draft; speak?: boolean } = {}) {
  let draft = o.draft ?? emptyDraft();
  const saved: Draft[] = [];
  const host: VoiceHost = {
    getDraft: () => draft,
    setDraft: (d) => (draft = d),
    save: async () => {
      saved.push(draft);
      return true;
    },
    close: vi.fn(),
    jobs: () => o.jobs ?? [],
    editing: false,
  };
  const mic = new FakeMic();
  const voice = new FakeVoice(mic);
  const settings: VoiceSettings = { ...DEFAULT_VOICE, speak: o.speak ?? true, ...(o.settings || {}) };
  const s = new VoiceSession({
    host,
    settings,
    transcriber: mic,
    speaker: voice,
    interpret: o.interpret ? async (i) => o.interpret!(i.text) : undefined,
    now: () => NOW,
  });
  return {
    s,
    mic,
    voice,
    host,
    get draft() {
      return draft;
    },
    saved,
  };
}

const AI = { provider: 'openai' as const, apiKey: 'sk-test' };

afterEach(() => vi.useRealTimers());

describe('sessione a voce', () => {
  it('saluta, ascolta e compila con le regole di base', async () => {
    const t = setup();
    await t.s.start();
    expect(t.voice.said[0]).toContain('Dimmi pure');
    expect(t.voice.micOpenWhileSpeaking).toBe(false);
    expect(t.s.state.phase).toBe('listening');
    t.mic.say('Golf targa GK 482 TR di proprietà di Marco Bianchi');
    await settle();
    expect(t.draft.plate).toBe('GK482TR');
    expect(t.draft.make).toBe('Volkswagen');
    expect(t.s.state.mode).toBe('base');
    expect(t.s.state.recent).toContain('plate');
    expect(t.voice.said.at(-1)).toContain('Targa G, K, 4, 8, 2, T, R');
  });

  it('il microfono è chiuso mentre l’assistente parla e si riapre dopo', async () => {
    const t = setup();
    await t.s.start();
    const starts = t.mic.starts;
    t.mic.say('targa AB 123 CD');
    await settle();
    expect(t.voice.micOpenWhileSpeaking).toBe(false);
    expect(t.mic.starts).toBeGreaterThan(starts);
    expect(t.s.state.phase).toBe('listening');
  });

  it('non scambia la propria voce per una frase', async () => {
    const t = setup();
    await t.s.start();
    const said = t.voice.said.length;
    t.mic.say('Ciao. Dimmi pure: targa, cliente e cosa c’è da fare.');
    await settle();
    expect(t.voice.said.length).toBe(said);
    expect(t.s.state.lines.filter((l) => l.who === 'user')).toHaveLength(0);
  });

  it('annulla l’ultima modifica a voce', async () => {
    const t = setup();
    await t.s.start();
    t.mic.say('targa GK 482 TR');
    await settle();
    t.mic.say('telefono 335 812 4471');
    await settle();
    expect(t.draft.phone).toBe('335 812 4471');
    t.mic.say('annulla');
    await settle();
    expect(t.draft.phone).toBe('');
    expect(t.draft.plate).toBe('GK482TR');
  });

  it('«registra» senza dati obbligatori: dice cosa manca e non salva', async () => {
    const t = setup();
    await t.s.start();
    t.mic.say('targa GK 482 TR');
    await settle();
    t.mic.say('registra');
    await settle();
    expect(t.saved).toHaveLength(0);
    expect(t.s.state.reply.show).toContain('il nome del proprietario');
    t.mic.say('Marco Bianchi');
    await settle();
    expect(t.draft.owner).toBe('Marco Bianchi');
    t.mic.say('registra');
    await settle();
    expect(t.saved).toHaveLength(1);
    expect(t.s.state.phase).toBe('saving');
  });

  it('usa il modello AI e riferisce la risposta secca alla domanda', async () => {
    const seen: string[] = [];
    const t = setup({
      settings: AI,
      interpret: (text) => {
        seen.push(text);
        return text.includes('Rossi') ? { intent: 'none', owner: 'Mario Rossi' } : { intent: 'none', plate: 'GK482TR' };
      },
    });
    await t.s.start();
    t.mic.say('la targa è gi kappa 482 ti erre');
    await settle();
    t.mic.say('Mario Rossi');
    await settle();
    expect(t.draft.owner).toBe('Mario Rossi');
    expect(t.s.state.mode).toBe('ai');
    expect(seen).toHaveLength(2);
  });

  it('chiave non valida: avvisa una volta e continua con le regole di base', async () => {
    let calls = 0;
    const t = setup({
      settings: AI,
      interpret: () => {
        calls++;
        throw new AiError('auth', 'auth', 401);
      },
    });
    await t.s.start();
    t.mic.say('targa GK 482 TR');
    await settle();
    expect(t.draft.plate).toBe('GK482TR');
    expect(t.s.state.mode).toBe('base');
    expect(t.s.state.notice?.toLowerCase()).toContain('chiave');
    t.mic.say('telefono 335 812 4471');
    await settle();
    expect(calls).toBe(1);
    expect(t.draft.phone).toBe('335 812 4471');
  });

  it('rete assente: ripiega e riprova più tardi', async () => {
    const t = setup({ settings: AI, interpret: () => Promise.reject(new AiError('offline', 'offline')) });
    await t.s.start();
    t.mic.say('targa GK 482 TR');
    await settle();
    expect(t.draft.plate).toBe('GK482TR');
    expect(t.s.state.notice?.toLowerCase()).toContain('senza connessione');
  });

  it('frasi arrivate mentre il modello pensa: una richiesta sola', async () => {
    const texts: string[] = [];
    let release: () => void = () => {};
    const t = setup({
      settings: AI,
      speak: false,
      interpret: (text) => {
        texts.push(text);
        if (texts.length === 1) return new Promise<VoicePatch>((r) => (release = () => r({ intent: 'none', plate: 'GK482TR' })));
        return { intent: 'none', owner: 'Marco Bianchi', phone: '3358124471' };
      },
    });
    await t.s.start();
    t.mic.say('targa GK 482 TR');
    await tick();
    expect(t.s.state.phase).toBe('thinking');
    t.mic.say('è di Marco Bianchi');
    t.mic.say('telefono 335 812 4471');
    release();
    await settle();
    expect(texts).toEqual(['targa GK 482 TR', 'è di Marco Bianchi. telefono 335 812 4471']);
    expect(t.draft.phone).toBe('335 812 4471');
  });

  it('veicolo già visto: propone i dati e li usa con «sì»', async () => {
    const old = normalizeJob({ id: 'old', number: 3, createdAt: 1, plate: 'GK482TR', make: 'Volkswagen', model: 'Golf', owner: 'Marco Bianchi', phone: '335 812 4471' });
    const t = setup({ jobs: [old] });
    await t.s.start();
    t.mic.say('targa GK 482 TR');
    await settle();
    expect(t.s.state.known?.id).toBe('old');
    expect(t.voice.said.at(-1)).toContain('La conosco: Volkswagen Golf, di Marco Bianchi. Uso i suoi dati?');
    t.mic.say('sì');
    await settle();
    expect(t.draft.owner).toBe('Marco Bianchi');
    expect(t.draft.phone).toBe('335 812 4471');
    expect(t.s.state.known).toBeNull();
  });

  it('veicolo già visto: «no» lo lascia stare e non lo ripropone', async () => {
    const old = normalizeJob({ id: 'old', number: 3, createdAt: 1, plate: 'GK482TR', owner: 'Marco Bianchi' });
    const t = setup({ jobs: [old] });
    await t.s.start();
    t.mic.say('targa GK 482 TR');
    await settle();
    t.mic.say('no');
    await settle();
    expect(t.draft.owner).toBe('');
    t.mic.say('targa GK 482 TR');
    await settle();
    expect(t.s.state.known).toBeNull();
  });

  it('ditta in archivio: partita IVA e indirizzo arrivano da soli', async () => {
    const co = { name: 'Edil Rossi Srl', vat: '01234567897', cf: '', addr: 'Via Roma 1, Rimini', sdi: 'ABC1234' };
    const t = setup({ jobs: [normalizeJob({ id: 'c', number: 1, createdAt: 1, client: 'azienda', company: co, plate: 'EZ215KB' })] });
    await t.s.start();
    t.mic.say('è della ditta Edil Rossi srl');
    await settle();
    expect(t.draft.client).toBe('azienda');
    expect(t.draft.company.vat).toBe('01234567897');
    expect(t.draft.company.addr).toBe('Via Roma 1, Rimini');
  });

  it('targa insolita: chiede conferma e con «no» la richiede', async () => {
    const t = setup();
    await t.s.start();
    t.mic.say('targa MI 1A2345');
    await settle();
    expect(t.s.state.reply.yesNo).toBe(true);
    t.mic.say('no');
    await settle();
    expect(t.draft.plate).toBe('');
    expect(t.s.state.reply.expect).toBe('plate');
  });

  it('frase incomprensibile: lo dice una volta sola a voce', async () => {
    const t = setup();
    await t.s.start();
    const n = t.voice.said.length;
    t.mic.say('si accomodi pure che arrivo');
    await settle();
    t.mic.say('che tempo fa oggi fuori');
    await settle();
    expect(t.voice.said.length).toBe(n + 1);
  });

  it('pausa a voce e ripresa', async () => {
    const t = setup();
    await t.s.start();
    t.mic.say('un attimo');
    await settle();
    expect(t.s.state.phase).toBe('paused');
    expect(t.mic.h).toBeNull();
    await t.s.start();
    expect(t.s.state.phase).toBe('listening');
  });

  it('permesso del microfono negato: errore chiaro con Impostazioni', async () => {
    const t = setup();
    t.mic.denied = true;
    await t.s.start();
    expect(t.s.state.phase).toBe('error');
    expect(t.s.state.problem?.settings).toBe(true);
  });

  it('frase scritta a mano quando non si può parlare', async () => {
    const t = setup();
    t.s.submitText('targa GK 482 TR, Marco Bianchi');
    await settle();
    expect(t.draft.plate).toBe('GK482TR');
  });

  it('si mette in pausa da solo dopo un lungo silenzio', async () => {
    vi.useFakeTimers();
    const t = setup({ speak: false });
    const s = new VoiceSession({ host: t.host, settings: DEFAULT_VOICE, transcriber: t.mic, speaker: null, idlePauseMs: 1000, now: () => NOW });
    await s.start();
    expect(s.state.phase).toBe('listening');
    await vi.advanceTimersByTimeAsync(1100);
    expect(s.state.phase).toBe('paused');
    s.dispose();
  });

  it('chiusa la schermata, niente resta acceso', async () => {
    const t = setup();
    await t.s.start();
    t.s.dispose();
    expect(t.mic.h).toBeNull();
  });
});

describe('fornitori', () => {
  const draft = emptyDraft();
  const mk = (body: unknown, status = 200) => vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }));

  it('OpenAI: chiamata a funzione, intestazioni e parametri', async () => {
    const f = mk({ choices: [{ message: { tool_calls: [{ function: { arguments: '{"intent":"none","plate":"GK482TR","owner":"Mario Rossi"}' } }] } }] });
    setFetch(f as unknown as typeof fetch);
    const p = await interpretWithAi({ ...DEFAULT_VOICE, ...AI }, { text: 'x', draft, history: [], lastAsk: null, now: NOW });
    expect(p).toEqual({ intent: 'none', plate: 'GK482TR', owner: 'Mario Rossi' });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
    const body = JSON.parse(String(init.body));
    expect(body.tool_choice.function.name).toBe('aggiorna_scheda');
    expect(body.model).toBe('gpt-5.4-mini');
    expect(body.messages[0].content).toContain('giovedì 29 ottobre 2026');
  });

  it('Anthropic: tool_use e intestazioni per il browser', async () => {
    const f = mk({ content: [{ type: 'tool_use', name: 'aggiorna_scheda', input: { intent: 'save' } }] });
    setFetch(f as unknown as typeof fetch);
    const p = await interpretWithAi({ ...DEFAULT_VOICE, provider: 'anthropic', apiKey: 'sk-ant' }, { text: 'registra', draft, history: [{ user: 'a', wrote: '', assistant: 'b' }], lastAsk: null });
    expect(p.intent).toBe('save');
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect((init.headers as Record<string, string>)['anthropic-dangerous-direct-browser-access']).toBe('true');
    const body = JSON.parse(String(init.body));
    expect(body.messages[0].role).toBe('user');
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'aggiorna_scheda' });
  });

  it('Gemini: functionCall, schema senza chiavi non ammesse', async () => {
    const f = mk({ candidates: [{ content: { parts: [{ functionCall: { name: 'aggiorna_scheda', args: { intent: 'none', km: 120000 } } }] } }] });
    setFetch(f as unknown as typeof fetch);
    const p = await interpretWithAi({ ...DEFAULT_VOICE, provider: 'gemini', apiKey: 'AIza' }, { text: 'x', draft, history: [], lastAsk: null });
    expect(p.km).toBe('120000');
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('AIza');
    expect(String(init.body)).not.toContain('additionalProperties');
  });

  it('compatibile con OpenAI e proxy', () => {
    expect(endpoint({ ...DEFAULT_VOICE, provider: 'compatible', apiKey: 'k', baseUrl: 'https://api.groq.com/openai/v1/' }).base).toBe('https://api.groq.com/openai/v1');
    const e = endpoint({ ...DEFAULT_VOICE, provider: 'anthropic', connection: 'proxy', proxyUrl: 'https://ponte-ai.example.workers.dev/', proxyToken: 't0k' });
    expect(e.base).toBe('https://ponte-ai.example.workers.dev/anthropic');
    expect(e.headers).toEqual({ 'x-ponte-token': 't0k' });
  });

  it('errori classificati', async () => {
    const cases: [number, string, string][] = [
      [401, '{"error":{"message":"Incorrect API key"}}', 'auth'],
      [429, '{"error":{"message":"You exceeded your current quota"}}', 'quota'],
      [404, '{"error":{"message":"The model does not exist"}}', 'model'],
      [400, '{"error":{"message":"model gpt-x not supported"}}', 'model'],
      [500, 'boom', 'server'],
    ];
    for (const [status, body, kind] of cases) {
      setFetch(mk(body, status) as unknown as typeof fetch);
      await expect(interpretWithAi({ ...DEFAULT_VOICE, ...AI }, { text: 'x', draft, history: [], lastAsk: null })).rejects.toMatchObject({ kind });
    }
  });

  it('rete che cade: un nuovo tentativo e poi errore di rete', async () => {
    const f = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    setFetch(f as unknown as typeof fetch);
    await expect(interpretWithAi({ ...DEFAULT_VOICE, ...AI }, { text: 'x', draft, history: [], lastAsk: null })).rejects.toMatchObject({ kind: 'network' });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('modello lento: errore di attesa', async () => {
    setFetch(((_u: string, i: RequestInit) => new Promise((_r, rej) => i.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))))) as unknown as typeof fetch);
    await expect(interpretWithAi({ ...DEFAULT_VOICE, ...AI }, { text: 'x', draft, history: [], lastAsk: null, timeoutMs: 30 })).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('risposta a parole con JSON dentro', async () => {
    setFetch(mk({ choices: [{ message: { content: 'Ecco: {"intent":"none","phone":"3358124471"} fatto' } }] }) as unknown as typeof fetch);
    const p = await interpretWithAi({ ...DEFAULT_VOICE, ...AI }, { text: 'x', draft, history: [], lastAsk: null });
    expect(p.phone).toBe('3358124471');
    expect(jsonIn('niente')).toBeNull();
  });

  it('patch ripulita: tipi sbagliati e campi sconosciuti si scartano', () => {
    expect(sanitizePatch({ intent: 'boh', plate: 12, owner: '  ', servicesAdd: ['Gomme', 'Pizza'], hack: 1, wa: 'no', clear: ['phone', 'id'] })).toEqual({
      plate: '12',
      servicesAdd: ['Gomme'],
      clear: ['phone'],
    });
    expect(sanitizePatch('non json')).toEqual({});
  });

  it('prova del collegamento dalle Impostazioni', async () => {
    setFetch(mk({ choices: [{ message: { tool_calls: [{ function: { arguments: '{"intent":"none","plate":"GK482TR"}' } }] } }] }) as unknown as typeof fetch);
    const r = await testConnection({ ...DEFAULT_VOICE, ...AI });
    expect(r.ok).toBe(true);
  });

  it('il backup non contiene la chiave', () => {
    expect(withoutSecrets({ ...DEFAULT_VOICE, apiKey: 'sk', proxyToken: 't' })).toMatchObject({ apiKey: '', proxyToken: '' });
  });
});
