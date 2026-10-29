/**
 * Server ponte per l'assistente vocale di Ponte (Cloudflare Worker).
 * Tiene le chiavi dei servizi AI al posto dei telefoni: l'app manda le richieste qui con il codice dell'officina,
 * il server aggiunge la chiave e le inoltra al fornitore. Nessun dato viene salvato.
 *
 * Percorsi:  /openai/*  → https://api.openai.com/*
 *            /anthropic/* → https://api.anthropic.com/*
 *            /gemini/*    → https://generativelanguage.googleapis.com/*
 *            /compatible/* → COMPATIBLE_BASE_URL/*
 *
 * Segreti (wrangler secret put …): PONTE_TOKEN, e almeno una chiave fra OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, COMPATIBLE_API_KEY.
 * Variabili: ALLOWED_ORIGINS (separate da virgola), COMPATIBLE_BASE_URL.
 */
const UPSTREAM = {
  openai: { base: 'https://api.openai.com', auth: (env) => ({ Authorization: `Bearer ${env.OPENAI_API_KEY}` }), key: 'OPENAI_API_KEY' },
  anthropic: { base: 'https://api.anthropic.com', auth: (env) => ({ 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' }), key: 'ANTHROPIC_API_KEY' },
  gemini: { base: 'https://generativelanguage.googleapis.com', auth: (env) => ({ 'x-goog-api-key': env.GEMINI_API_KEY }), key: 'GEMINI_API_KEY' },
  compatible: { base: null, auth: (env) => ({ Authorization: `Bearer ${env.COMPATIBLE_API_KEY}` }), key: 'COMPATIBLE_API_KEY' },
};

// solo i percorsi che l'app usa: il server non diventa un accesso libero all'API
const ALLOWED_PATHS = [/^\/v1\/chat\/completions$/, /^\/v1\/audio\/transcriptions$/, /^\/chat\/completions$/, /^\/audio\/transcriptions$/, /^\/v1\/messages$/, /^\/v1beta\/models\/[\w.\-]+:generateContent$/];

function cors(origin, env) {
  const allowed = (env.ALLOWED_ORIGINS || 'capacitor://localhost,https://localhost,http://localhost:5173')
    .split(',')
    .map((s) => s.trim());
  const ok = allowed.includes('*') || allowed.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : allowed[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, x-ponte-token',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

const json = (status, body, headers) => new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const h = cors(origin, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    if (req.method !== 'POST') return json(405, { error: { message: 'Solo POST' } }, h);
    if (!env.PONTE_TOKEN || req.headers.get('x-ponte-token') !== env.PONTE_TOKEN) return json(401, { error: { message: 'Codice dell’officina non valido' } }, h);

    const url = new URL(req.url);
    const [, provider, ...rest] = url.pathname.split('/');
    const up = UPSTREAM[provider];
    const path = '/' + rest.join('/');
    if (!up) return json(404, { error: { message: 'Fornitore sconosciuto' } }, h);
    if (!env[up.key]) return json(401, { error: { message: `Sul server manca ${up.key}` } }, h);
    if (!ALLOWED_PATHS.some((re) => re.test(path))) return json(404, { error: { message: 'Percorso non consentito' } }, h);
    const base = up.base || (env.COMPATIBLE_BASE_URL || '').replace(/\/+$/, '');
    if (!base) return json(500, { error: { message: 'Manca COMPATIBLE_BASE_URL' } }, h);

    const headers = new Headers();
    const ct = req.headers.get('content-type');
    if (ct) headers.set('content-type', ct);
    for (const [k, v] of Object.entries(up.auth(env))) headers.set(k, v);
    const res = await fetch(base + path, { method: 'POST', headers, body: req.body });
    const out = new Headers(h);
    out.set('content-type', res.headers.get('content-type') || 'application/json');
    return new Response(res.body, { status: res.status, headers: out });
  },
};
