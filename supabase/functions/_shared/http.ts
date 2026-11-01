// Utilità comuni alle funzioni di Ponte (Deno, Supabase Edge Functions).
import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2';

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-ponte-workshop, x-ponte-client, anthropic-version',
  'Access-Control-Max-Age': '86400',
};

export const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', ...extra } });

export const fail = (status: number, message: string) => json(status, { error: { message } });

/** client con i poteri del server (service_role): solo dentro le funzioni, mai nell'app */
export function admin(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** la persona che chiama, dal token della sua sessione; null se il token non vale */
export async function caller(req: Request, sb: SupabaseClient): Promise<User | null> {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await sb.auth.getUser(token);
  return error ? null : data.user;
}
