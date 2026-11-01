/**
 * Eliminazione dell'account (obbligatoria per le app con registrazione sull'App Store).
 *   DELETE /functions/v1/account   con il token della sessione
 * Chiude le officine di cui la persona è l'unico titolare (schede, foto nello storage, membri, inviti),
 * la toglie dalle altre e cancella l'utente. Le officine con altri titolari restano a loro.
 */
import { admin, caller, cors, fail, json } from '../_shared/http.ts';

async function removeFolder(sb: ReturnType<typeof admin>, prefix: string): Promise<number> {
  let removed = 0;
  // le cartelle sono <officina>/<scheda>/<foto>.jpg: due livelli
  for (;;) {
    const { data: jobs } = await sb.storage.from('photos').list(prefix, { limit: 1000 });
    if (!jobs?.length) break;
    for (const j of jobs) {
      for (;;) {
        const { data: files } = await sb.storage.from('photos').list(`${prefix}/${j.name}`, { limit: 1000 });
        if (!files?.length) break;
        const paths = files.map((f) => `${prefix}/${j.name}/${f.name}`);
        const { error } = await sb.storage.from('photos').remove(paths);
        if (error) throw error;
        removed += paths.length;
        if (files.length < 1000) break;
      }
    }
    if (jobs.length < 1000) break;
  }
  return removed;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'DELETE') return fail(405, 'Solo DELETE');
  const sb = admin();
  const user = await caller(req, sb);
  if (!user) return fail(401, 'Accesso scaduto');

  const { data: owned, error } = await sb.rpc('account_workshops', { p_user: user.id });
  if (error) return fail(500, 'Errore del server');
  let photos = 0;
  const closed: string[] = [];
  for (const w of (owned || []) as { workshop_id: string; sole_owner: boolean }[]) {
    if (!w.sole_owner) continue;
    photos += await removeFolder(sb, w.workshop_id);
    const { error: e } = await sb.from('workshops').delete().eq('id', w.workshop_id);
    if (e) return fail(500, 'Non riesco a chiudere l’officina');
    closed.push(w.workshop_id);
  }
  const { error: e2 } = await sb.auth.admin.deleteUser(user.id);
  if (e2) return fail(500, 'Non riesco a eliminare l’account');
  return json(200, { closed: closed.length, photos });
});
