/**
 * Assistente vocale: la chiave del modello resta qui, sul server. L'app chiama
 *   POST /functions/v1/ai/anthropic/v1/messages   (stesso formato dell'API di Anthropic)
 * con il token della sessione e l'officina (x-ponte-workshop). Il server controlla che la persona sia membro
 * dell'officina, conta l'uso (tetto giornaliero per officina), impone modello e lunghezza della risposta,
 * inoltra ad Anthropic e restituisce la risposta così com'è. Nessun contenuto viene salvato.
 *
 * Segreti (supabase secrets set …): ANTHROPIC_API_KEY. Facoltativi: AI_MODEL (predefinito claude-haiku-5-5),
 * AI_MODELS (altri modelli ammessi, separati da virgola), AI_DAILY_LIMIT (predefinito 400 richieste per officina al giorno).
 */
import { admin, caller, cors, fail } from '../_shared/http.ts';

const MAX_BODY = 96_000;
const MAX_TOKENS = 1024;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return fail(405, 'Solo POST');
  const path = new URL(req.url).pathname.replace(/^.*\/ai/, '');
  if (path !== '/anthropic/v1/messages') return fail(404, 'Percorso non consentito');

  const sb = admin();
  const user = await caller(req, sb);
  if (!user) return fail(401, 'Accesso scaduto');
  const workshop = req.headers.get('x-ponte-workshop') || '';
  if (!/^[0-9a-f-]{36}$/i.test(workshop)) return fail(400, 'Officina mancante');

  const raw = await req.text();
  if (raw.length > MAX_BODY) return fail(413, 'Richiesta troppo grande');
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return fail(400, 'Richiesta non valida');
  }

  const limit = Number(Deno.env.get('AI_DAILY_LIMIT') || 400);
  const { data: ok, error } = await sb.rpc('ai_take', { p_workshop: workshop, p_user: user.id, p_limit: limit });
  if (error) return fail(/not_member/.test(error.message) ? 403 : 500, /not_member/.test(error.message) ? 'Non fai parte di questa officina' : 'Errore del server');
  if (!ok) return fail(429, 'Limite giornaliero dell’assistente raggiunto: riprova domani o continua senza AI');
  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) return fail(503, 'Assistente AI non configurato sul server');

  // il modello e la lunghezza li decide il server
  const def = Deno.env.get('AI_MODEL') || 'claude-haiku-5-5';
  const allowed = new Set([
    def,
    ...(Deno.env.get('AI_MODELS') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  ]);
  body.model = allowed.has(String(body.model)) ? body.model : def;
  body.max_tokens = Math.min(Number(body.max_tokens) || 512, MAX_TOKENS);
  delete body.stream;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (res.ok) {
    try {
      const u = JSON.parse(text).usage || {};
      await sb.rpc('ai_tokens', { p_workshop: workshop, p_in: u.input_tokens || 0, p_out: u.output_tokens || 0 });
    } catch {
      /* il conto dei token non deve far fallire la risposta */
    }
  }
  return new Response(text, { status: res.status, headers: { ...cors, 'Content-Type': res.headers.get('content-type') || 'application/json' } });
});
