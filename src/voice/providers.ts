/**
 * Collegamento ai modelli: OpenAI, Anthropic, Gemini e qualunque servizio compatibile con OpenAI,
 * con la chiave sul dispositivo o attraverso un proxy. Solo fetch, nessuna libreria.
 * Ogni errore diventa un AiError con un tipo preciso, così l'app sa se riprovare, ripiegare sulle regole
 * locali o avvisare il titolare che la chiave non va.
 */
import type { VoiceSettings } from '@/domain/types';
import type { Draft, FieldKey } from '@/domain/draft';
import { endpoint, modelOf, sttModelOf } from './config';
import type { VoicePatch } from './fields';
import { TOOL_DESCRIPTION, TOOL_NAME, TOOL_SCHEMA, TRANSCRIBE_PROMPT, buildMessages, systemPrompt, vocabulary, type ChatMessage, type Turn } from './prompt';

export type AiErrorKind = 'offline' | 'network' | 'timeout' | 'auth' | 'quota' | 'model' | 'request' | 'server' | 'bad_response' | 'cancelled';

export class AiError extends Error {
  constructor(
    public kind: AiErrorKind,
    message: string,
    public status?: number,
    public detail?: string,
  ) {
    super(message);
    this.name = 'AiError';
  }
  /** vale la pena riprovare subito una volta */
  get retryable() {
    return this.kind === 'server' || this.kind === 'network';
  }
}

/** messaggio per chi usa l'app (il dettaglio tecnico resta per la prova in Impostazioni) */
export function aiErrorText(e: AiError): string {
  switch (e.kind) {
    case 'offline':
      return 'Il telefono è senza connessione.';
    case 'network':
      return 'Non riesco a raggiungere il servizio AI.';
    case 'timeout':
      return 'Il servizio AI ci mette troppo a rispondere.';
    case 'auth':
      return 'La chiave del servizio AI non è valida o è scaduta.';
    case 'quota':
      return 'Il credito o il limite del servizio AI è esaurito.';
    case 'model':
      return 'Il modello scelto non esiste o non è disponibile per questa chiave.';
    case 'request':
      return 'Il servizio AI ha rifiutato la richiesta.';
    case 'server':
      return 'Il servizio AI ha un problema in questo momento.';
    case 'bad_response':
      return 'Il servizio AI ha risposto in un modo che non capisco.';
    default:
      return 'Richiesta annullata.';
  }
}

/** avviso brevissimo per la schermata a voce (si legge mentre si parla) */
export function aiErrorShort(e: AiError): string {
  const t: Record<AiErrorKind, string> = {
    offline: 'Senza connessione',
    network: 'Servizio AI irraggiungibile',
    timeout: 'Servizio AI lento',
    auth: 'Chiave AI non valida',
    quota: 'Credito AI esaurito',
    model: 'Modello AI non disponibile',
    request: 'Richiesta AI rifiutata',
    server: 'Servizio AI in difficoltà',
    bad_response: 'Risposta AI non valida',
    cancelled: 'Richiesta annullata',
  };
  return t[e.kind];
}

/* ------------------------------------------------------------------ rete */

type Fetch = typeof fetch;
let fetcher: Fetch = (...a) => fetch(...a);
/** per i test */
export function setFetch(f: Fetch) {
  fetcher = f;
}

async function request(url: string, init: RequestInit, timeoutMs: number, outer?: AbortSignal): Promise<unknown> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new AiError('offline', 'offline');
  const ctl = new AbortController();
  const onAbort = () => ctl.abort(outer?.reason);
  outer?.addEventListener('abort', onAbort);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctl.abort();
  }, timeoutMs);
  let res: Response;
  try {
    res = await fetcher(url, { ...init, signal: ctl.signal });
  } catch (e) {
    if (timedOut) throw new AiError('timeout', 'timeout');
    if (outer?.aborted) throw new AiError('cancelled', 'cancelled');
    throw new AiError('network', (e as Error)?.message || 'network');
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener('abort', onAbort);
  }
  const text = await res.text().catch(() => '');
  if (!res.ok) throw classify(res.status, text);
  try {
    return JSON.parse(text);
  } catch {
    throw new AiError('bad_response', 'json', res.status, text.slice(0, 300));
  }
}

function classify(status: number, body: string): AiError {
  let msg = body.slice(0, 400);
  try {
    const j = JSON.parse(body);
    msg = j?.error?.message || j?.message || (typeof j?.error === 'string' ? j.error : '') || msg;
  } catch {
    /* testo semplice */
  }
  const m = String(msg).toLowerCase();
  if (status === 401 || status === 403) return new AiError('auth', 'auth', status, msg);
  if (status === 429 || /quota|insufficient|credit|billing|rate limit/.test(m)) return new AiError('quota', 'quota', status, msg);
  if (status === 404 || (status === 400 && /model/.test(m) && /not|exist|unknown|invalid|support/.test(m))) return new AiError('model', 'model', status, msg);
  if (status >= 500) return new AiError('server', 'server', status, msg);
  return new AiError('request', 'request', status, msg);
}

/* ------------------------------------------------------------------ risposta → patch */

const STRING_KEYS = [
  'plate',
  'vin',
  'make',
  'model',
  'km',
  'dueDate',
  'owner',
  'phone',
  'companyName',
  'companyVat',
  'companyCf',
  'companyAddr',
  'companySdi',
  'tyres',
  'request',
  'notes',
  'question',
] as const;
const INTENTS = ['none', 'save', 'undo', 'pause', 'yes', 'no', 'help'];
const SERVICE_SET = new Set(['Meccanica', 'Elettrauto', 'Gomme', 'Carrozzeria', 'Altro']);
const CLEAR_SET = new Set(['plate', 'vin', 'make', 'model', 'km', 'dueDate', 'owner', 'phone', 'cname', 'cvat', 'ccf', 'caddr', 'csdi', 'services', 'tyres', 'request', 'notes']);

/** Tiene solo i campi noti e del tipo giusto: un modello che sbaglia formato non può rompere la scheda. */
export function sanitizePatch(raw: unknown): VoicePatch {
  let o = raw;
  if (typeof o === 'string') {
    try {
      o = JSON.parse(o);
    } catch {
      return {};
    }
  }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return {};
  const r = o as Record<string, unknown>;
  const p: VoicePatch = {};
  if (typeof r.intent === 'string' && INTENTS.includes(r.intent)) p.intent = r.intent as VoicePatch['intent'];
  if (r.client === 'privato' || r.client === 'azienda') p.client = r.client;
  if (r.plateCountry === 'I' || r.plateCountry === 'RSM') p.plateCountry = r.plateCountry;
  for (const k of STRING_KEYS) {
    const v = r[k];
    if (typeof v === 'number' && Number.isFinite(v)) (p as Record<string, unknown>)[k] = String(v);
    else if (typeof v === 'string' && v.trim() && !/^(null|undefined|n\/a|-)$/i.test(v.trim())) (p as Record<string, unknown>)[k] = v.trim().slice(0, 400);
  }
  if (typeof r.wa === 'boolean') p.wa = r.wa;
  if (r.requestMode === 'append' || r.requestMode === 'replace') p.requestMode = r.requestMode;
  if (r.notesMode === 'append' || r.notesMode === 'replace') p.notesMode = r.notesMode;
  const arr = (v: unknown, ok: Set<string>) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && ok.has(x)) : undefined);
  const sa = arr(r.servicesAdd, SERVICE_SET);
  if (sa?.length) p.servicesAdd = sa;
  const sr = arr(r.servicesRemove, SERVICE_SET);
  if (sr?.length) p.servicesRemove = sr;
  const cl = arr(r.clear, CLEAR_SET);
  if (cl?.length) p.clear = cl as FieldKey[];
  return p;
}

/** primo oggetto JSON in un testo (per i modelli che rispondono a parole invece di chiamare la funzione) */
export function jsonIn(text: string): unknown {
  const s = text.indexOf('{');
  if (s < 0) return null;
  let depth = 0;
  let inStr = false;
  for (let i = s; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (c === '\\') i++;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) {
      try {
        return JSON.parse(text.slice(s, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

/* ------------------------------------------------------------------ fornitori */

/** schema senza le chiavi che Gemini non accetta */
function geminiSchema(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(geminiSchema);
  if (x && typeof x === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(x)) if (k !== 'additionalProperties') out[k] = geminiSchema(v);
    return out;
  }
  return x;
}

interface Call {
  system: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
  timeoutMs: number;
}

async function callOpenAI(v: VoiceSettings, c: Call): Promise<unknown> {
  const ep = endpoint(v);
  const model = modelOf(v);
  const body: Record<string, unknown> = {
    model,
    messages: [{ role: 'system', content: c.system }, ...c.messages],
    tools: [{ type: 'function', function: { name: TOOL_NAME, description: TOOL_DESCRIPTION, parameters: TOOL_SCHEMA } }],
    tool_choice: { type: 'function', function: { name: TOOL_NAME } },
  };
  if (v.provider === 'openai') {
    body.max_completion_tokens = 1200;
    // i modelli che ragionano: poco ragionamento, risposta svelta
    if (/^(gpt-5|gpt-6|o\d)/.test(model)) body.reasoning_effort = 'low';
  } else {
    body.max_tokens = 800;
    body.temperature = 0;
  }
  const j = (await request(`${ep.base}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...ep.headers }, body: JSON.stringify(body) }, c.timeoutMs, c.signal)) as {
    choices?: { message?: { tool_calls?: { function?: { arguments?: string } }[]; content?: string } }[];
  };
  const msg = j?.choices?.[0]?.message;
  const args = msg?.tool_calls?.[0]?.function?.arguments;
  if (args) return args;
  if (msg?.content) return jsonIn(msg.content);
  throw new AiError('bad_response', 'empty');
}

async function callAnthropic(v: VoiceSettings, c: Call): Promise<unknown> {
  const ep = endpoint(v);
  // Anthropic vuole messaggi alternati che iniziano dall'utente
  const msgs: ChatMessage[] = [];
  for (const m of c.messages) {
    const last = msgs[msgs.length - 1];
    if (last && last.role === m.role) last.content += '\n' + m.content;
    else msgs.push({ ...m });
  }
  const body = {
    model: modelOf(v),
    max_tokens: 800,
    system: c.system,
    messages: msgs,
    tools: [{ name: TOOL_NAME, description: TOOL_DESCRIPTION, input_schema: TOOL_SCHEMA }],
    tool_choice: { type: 'tool', name: TOOL_NAME },
  };
  const j = (await request(`${ep.base}/v1/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...ep.headers }, body: JSON.stringify(body) }, c.timeoutMs, c.signal)) as {
    content?: { type: string; input?: unknown; text?: string }[];
  };
  const tool = j?.content?.find((x) => x.type === 'tool_use');
  if (tool?.input) return tool.input;
  const txt = j?.content?.find((x) => x.type === 'text')?.text;
  if (txt) return jsonIn(txt);
  throw new AiError('bad_response', 'empty');
}

async function callGemini(v: VoiceSettings, c: Call): Promise<unknown> {
  const ep = endpoint(v);
  const body = {
    systemInstruction: { parts: [{ text: c.system }] },
    contents: c.messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    tools: [{ functionDeclarations: [{ name: TOOL_NAME, description: TOOL_DESCRIPTION, parameters: geminiSchema(TOOL_SCHEMA) }] }],
    toolConfig: { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: [TOOL_NAME] } },
    generationConfig: { maxOutputTokens: 1200 },
  };
  const url = `${ep.base}/v1beta/models/${encodeURIComponent(modelOf(v))}:generateContent`;
  const j = (await request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...ep.headers }, body: JSON.stringify(body) }, c.timeoutMs, c.signal)) as {
    candidates?: { content?: { parts?: { functionCall?: { args?: unknown }; text?: string }[] } }[];
    promptFeedback?: { blockReason?: string };
  };
  if (j?.promptFeedback?.blockReason) throw new AiError('request', 'blocked', 400, j.promptFeedback.blockReason);
  const parts = j?.candidates?.[0]?.content?.parts || [];
  const fc = parts.find((p) => p.functionCall)?.functionCall;
  if (fc) return fc.args || {};
  const txt = parts.find((p) => p.text)?.text;
  if (txt) return jsonIn(txt);
  throw new AiError('bad_response', 'empty');
}

export interface InterpretInput {
  text: string;
  draft: Draft;
  history: Turn[];
  lastAsk: { field: FieldKey | null; say: string } | null;
  now?: Date;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/** Interpreta una frase con il modello. Una volta sola riprova gli errori di rete o del server. */
export async function interpretWithAi(v: VoiceSettings, input: InterpretInput): Promise<VoicePatch> {
  const call: Call = {
    system: systemPrompt(input.now),
    messages: buildMessages(input.text, input.draft, input.history, input.lastAsk),
    signal: input.signal,
    timeoutMs: input.timeoutMs ?? 12_000,
  };
  const run = () => (v.provider === 'anthropic' ? callAnthropic(v, call) : v.provider === 'gemini' ? callGemini(v, call) : callOpenAI(v, call));
  let raw: unknown;
  try {
    raw = await run();
  } catch (e) {
    if (e instanceof AiError && e.retryable && !input.signal?.aborted) {
      await new Promise((r) => setTimeout(r, 500));
      raw = await run();
    } else throw e;
  }
  if (raw === null || raw === undefined) throw new AiError('bad_response', 'no json');
  return sanitizePatch(raw);
}

/* ------------------------------------------------------------------ trascrizione nel cloud */

async function blobToBase64(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Trascrive un pezzo di audio con il fornitore scelto (OpenAI e compatibili: /audio/transcriptions; Gemini: generateContent). */
export async function transcribeCloud(v: VoiceSettings, audio: Blob, signal?: AbortSignal): Promise<string> {
  const ep = endpoint(v);
  const model = sttModelOf(v);
  if (!model) throw new AiError('request', 'no stt');
  if (v.provider === 'gemini') {
    const body = {
      contents: [{ role: 'user', parts: [{ text: TRANSCRIBE_PROMPT }, { inlineData: { mimeType: (audio.type || 'audio/webm').split(';')[0], data: await blobToBase64(audio) } }] }],
      generationConfig: { maxOutputTokens: 600 },
    };
    const j = (await request(
      `${ep.base}/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', ...ep.headers }, body: JSON.stringify(body) },
      20_000,
      signal,
    )) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    return (j?.candidates?.[0]?.content?.parts || [])
      .map((p) => p.text || '')
      .join(' ')
      .trim();
  }
  if (v.provider === 'anthropic') throw new AiError('request', 'Anthropic non trascrive l’audio');
  const ext = /mp4|m4a|aac/.test(audio.type) ? 'm4a' : /ogg/.test(audio.type) ? 'ogg' : /wav/.test(audio.type) ? 'wav' : 'webm';
  const fd = new FormData();
  fd.append('file', audio, `voce.${ext}`);
  fd.append('model', model);
  fd.append('language', 'it');
  fd.append('response_format', 'json');
  fd.append('prompt', vocabulary().slice(0, 40).join(', '));
  const j = (await request(`${ep.base}/audio/transcriptions`, { method: 'POST', headers: ep.headers, body: fd }, 20_000, signal)) as { text?: string };
  return String(j?.text || '').trim();
}

/* ------------------------------------------------------------------ prova del collegamento */

export type TestResult = { ok: true; ms: number; patch: VoicePatch } | { ok: false; error: AiError };

/** Prova completa dalle Impostazioni: una frase vera, la risposta deve contenere la targa. */
export async function testConnection(v: VoiceSettings): Promise<TestResult> {
  const t0 = performance.now();
  try {
    const { emptyDraft } = await import('@/domain/draft');
    const patch = await interpretWithAi(v, {
      text: 'Golf targa gi kappa quattro otto due ti erre, è di Mario Rossi',
      draft: emptyDraft(),
      history: [],
      lastAsk: null,
      timeoutMs: 20_000,
    });
    const plateOk = (patch.plate || '').toUpperCase().replace(/[^A-Z0-9]/g, '') === 'GK482TR';
    if (!plateOk) return { ok: false, error: new AiError('bad_response', 'test', undefined, `Risposta ricevuta ma la targa letta è «${patch.plate || 'vuota'}»`) };
    return { ok: true, ms: Math.round(performance.now() - t0), patch };
  } catch (e) {
    return { ok: false, error: e instanceof AiError ? e : new AiError('network', String(e)) };
  }
}
