/**
 * Account e officina: accesso con codice via email, officine, inviti, membri.
 * Le schermate usano queste funzioni; gli errori escono già tradotti in italiano (CloudError.message).
 */
import { supabase } from './client';
import { cloudConfig } from './config';
import { isNetworkError } from './transport';

export type Role = 'owner' | 'staff';
export interface WorkshopRef {
  id: string;
  name: string;
  role: Role;
  displayName: string;
}
export interface Invite {
  code: string;
  role: Role;
  displayName: string;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  revokedAt: string | null;
}

export class CloudError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
  }
}

const TEXT: [RegExp, string, string][] = [
  [/rate limit|too many|over_email_send_rate_limit|429/i, 'rate', 'Troppi tentativi. Aspetta qualche minuto e riprova.'],
  [/otp_expired|expired/i, 'expired', 'Il codice è scaduto. Chiedine uno nuovo.'],
  [/invalid.*(otp|token)|token.*invalid|Token has expired or is invalid/i, 'bad_code', 'Codice non corretto. Controlla le 6 cifre e riprova.'],
  [/email_address_invalid|invalid.*email|Unable to validate email/i, 'bad_email', 'Indirizzo email non valido.'],
  [/signup.*disabled|Signups not allowed/i, 'closed', 'Le iscrizioni sono chiuse: chiedi un invito al titolare.'],
  [/too_many_workshops/, 'limit', 'Hai già creato il numero massimo di officine.'],
  [/too_many_invites/, 'limit', 'Ci sono già molti inviti in attesa: revocane qualcuno.'],
  [/too_many_attempts/, 'rate', 'Troppi codici sbagliati. Riprova fra un’ora.'],
  [/owner_only/, 'forbidden', 'Solo il titolare può farlo.'],
  [/last_owner/, 'last_owner', 'Sei l’unico titolare: prima nomina un altro titolare.'],
  [/not_member/, 'not_member', 'Non fai più parte di questa officina.'],
  [/not_authenticated|JWT/i, 'auth', 'Accesso scaduto: entra di nuovo.'],
];

export function cloudError(e: unknown): CloudError {
  if (e instanceof CloudError) return e;
  if (isNetworkError(e)) return new CloudError('Nessuna connessione. Controlla la rete e riprova.', 'network');
  const m = String((e as { message?: string; code?: string })?.message ?? (e as { code?: string })?.code ?? e);
  for (const [re, code, text] of TEXT) if (re.test(m) || re.test(String((e as { code?: string })?.code ?? ''))) return new CloudError(text, code);
  return new CloudError('Qualcosa non ha funzionato. Riprova fra poco.', 'other');
}

async function call<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase().rpc(fn, args);
  if (error) throw cloudError(error);
  return data as T;
}

/* ---------------- accesso ---------------- */

const cleanEmail = (e: string) => e.trim().toLowerCase();

/** manda il codice di 6 cifre all'indirizzo (crea l'account se è la prima volta) */
export async function sendCode(email: string): Promise<void> {
  const { error } = await supabase().auth.signInWithOtp({ email: cleanEmail(email), options: { shouldCreateUser: true } });
  if (error) throw cloudError(error);
}

export async function verifyCode(email: string, code: string): Promise<{ id: string; email: string }> {
  const { data, error } = await supabase().auth.verifyOtp({ email: cleanEmail(email), token: code.replace(/\D/g, ''), type: 'email' });
  if (error || !data.user) throw cloudError(error ?? new Error('invalid otp'));
  return { id: data.user.id, email: data.user.email ?? cleanEmail(email) };
}

export async function currentUser(): Promise<{ id: string; email: string } | null> {
  const { data } = await supabase().auth.getSession();
  const u = data.session?.user;
  return u ? { id: u.id, email: u.email ?? '' } : null;
}

export function onAuthChange(cb: (user: { id: string; email: string } | null) => void): () => void {
  const { data } = supabase().auth.onAuthStateChange((_e, session) => cb(session?.user ? { id: session.user.id, email: session.user.email ?? '' } : null));
  return () => data.subscription.unsubscribe();
}

export async function signOut(): Promise<void> {
  // anche senza rete: la sessione locale si chiude comunque
  await supabase()
    .auth.signOut({ scope: 'local' })
    .catch(() => {});
}

/* ---------------- officine ---------------- */

export async function myWorkshops(): Promise<WorkshopRef[]> {
  const me = await call<{ workshops: WorkshopRef[] }>('me');
  return me.workshops;
}

export async function createWorkshop(displayName: string, settings: Record<string, unknown>): Promise<string> {
  return call<string>('create_workshop', { p_display_name: displayName, p_settings: settings });
}

/** entra con il codice d'invito; null se il codice non vale */
export async function joinWorkshop(code: string, displayName: string): Promise<string | null> {
  return call<string | null>('join_workshop', { p_code: code, p_display_name: displayName });
}

export const leaveWorkshop = (workshop: string) => call<void>('leave_workshop', { p_workshop: workshop });
export const deleteWorkshop = (workshop: string) => call<void>('delete_workshop', { p_workshop: workshop });

/* ---------------- squadra ---------------- */

export const createInvite = (workshop: string, displayName = '', role: Role = 'staff') => call<string>('create_invite', { p_workshop: workshop, p_display_name: displayName, p_role: role });
export const revokeInvite = (code: string) => call<void>('revoke_invite', { p_code: code });
export const removeMember = (workshop: string, user: string) => call<void>('remove_member', { p_workshop: workshop, p_user: user });
export const setMember = (workshop: string, user: string, patch: { role?: Role; displayName?: string }) =>
  call<void>('set_member', { p_workshop: workshop, p_user: user, p_role: patch.role ?? null, p_display_name: patch.displayName ?? null });

export async function listInvites(workshop: string): Promise<Invite[]> {
  const { data, error } = await supabase()
    .from('invites')
    .select('code, role, display_name, created_at, expires_at, used_at, revoked_at')
    .eq('workshop_id', workshop)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw cloudError(error);
  return (data || []).map((r) => ({
    code: r.code,
    role: r.role,
    displayName: r.display_name,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    usedAt: r.used_at,
    revokedAt: r.revoked_at,
  }));
}

/** codice leggibile a voce: 4 + 4 */
export const formatCode = (c: string) => `${c.slice(0, 4)}-${c.slice(4)}`;

/* ---------------- account ---------------- */

/**
 * Elimina l'account (richiesto da Apple per le app con registrazione): toglie la persona da tutte le officine
 * e chiude quelle di cui è l'unico titolare, foto comprese. Lo fa il server (funzione "account").
 */
export async function deleteAccount(): Promise<void> {
  const { data } = await supabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new CloudError('Accesso scaduto: entra di nuovo.', 'auth');
  let res: Response;
  try {
    res = await fetch(`${cloudConfig.url}/functions/v1/account`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}`, apikey: cloudConfig.key } });
  } catch (e) {
    throw cloudError(e);
  }
  if (!res.ok) throw cloudError(new Error((await res.text().catch(() => '')) || String(res.status)));
  await signOut();
}
