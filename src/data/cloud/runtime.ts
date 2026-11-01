/**
 * Tutto ciò che serve solo con l'officina nel cloud (client Supabase, motore di sincronizzazione, validazione):
 * si carica a parte, solo quando serve. Chi usa Ponte tutto sul dispositivo non lo scarica nemmeno.
 */
export { supabase } from './client';
export { SupabaseTransport } from './transport';
export { SyncEngine } from '../sync/engine';
export * as account from './account';
