/**
 * Impostazioni dell'assistente vocale e dati dei fornitori.
 * Per collegare un modello basta scegliere il fornitore e incollare la chiave in Impostazioni → Assistente vocale.
 */
import type { Settings, VoiceProvider, VoiceSettings } from '@/domain/types';

export const DEFAULT_VOICE: VoiceSettings = {
  enabled: true,
  provider: 'base',
  connection: 'key',
  apiKey: '',
  model: '',
  baseUrl: '',
  proxyUrl: '',
  proxyToken: '',
  stt: 'device',
  sttModel: '',
  replies: false,
};

export function voiceSettings(s: Pick<Settings, 'voice'> | undefined): VoiceSettings {
  return { ...DEFAULT_VOICE, ...(s?.voice || {}) };
}

export interface ProviderInfo {
  id: VoiceProvider;
  label: string;
  /** modello consigliato: veloce, economico, bravo con le chiamate a funzione */
  model: string;
  /** altri modelli che vanno bene, da suggerire */
  models: string[];
  /** trascrizione nel cloud disponibile */
  sttModel: string;
  keyHint: string;
  keyUrl: string;
  /** host dell'API (per il proxy e per la rete) */
  base: string;
}

export const PROVIDERS: Record<Exclude<VoiceProvider, 'base'>, ProviderInfo> = {
  openai: {
    id: 'openai',
    label: 'OpenAI',
    model: 'gpt-5.4-mini',
    models: ['gpt-5.4-mini', 'gpt-5.4-nano', 'gpt-6-luna'],
    sttModel: 'gpt-4o-mini-transcribe',
    keyHint: 'sk-…',
    keyUrl: 'https://platform.openai.com/api-keys',
    base: 'https://api.openai.com/v1',
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    model: 'claude-haiku-5-5',
    models: ['claude-haiku-5-5', 'claude-sonnet-5-5'],
    sttModel: '',
    keyHint: 'sk-ant-…',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    base: 'https://api.anthropic.com',
  },
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    model: 'gemini-3.6-flash',
    models: ['gemini-3.6-flash'],
    sttModel: 'gemini-3.6-flash',
    keyHint: 'AIza…',
    keyUrl: 'https://aistudio.google.com/apikey',
    base: 'https://generativelanguage.googleapis.com',
  },
  compatible: {
    id: 'compatible',
    label: 'Compatibile con OpenAI',
    model: '',
    models: [],
    sttModel: 'whisper-large-v3-turbo',
    keyHint: 'chiave del servizio',
    keyUrl: '',
    base: '',
  },
};

export const usesAi = (v: VoiceSettings) => v.provider !== 'base';

export const modelOf = (v: VoiceSettings) => (v.provider === 'base' ? '' : v.model.trim() || PROVIDERS[v.provider].model);
export const sttModelOf = (v: VoiceSettings) => (v.provider === 'base' ? '' : v.sttModel.trim() || PROVIDERS[v.provider].sttModel);

/** il fornitore scelto ha quello che serve per funzionare (chiave o proxy, modello, indirizzo) */
export function aiReady(v: VoiceSettings): boolean {
  if (!usesAi(v)) return false;
  if (!modelOf(v)) return false;
  if (v.connection === 'proxy') return /^https:\/\/|^http:\/\/localhost/.test(v.proxyUrl.trim());
  if (!v.apiKey.trim()) return false;
  if (v.provider === 'compatible') return /^https?:\/\//.test(v.baseUrl.trim());
  return true;
}

/** la trascrizione nel cloud è possibile con questo fornitore */
export const cloudSttPossible = (v: VoiceSettings) => usesAi(v) && !!sttModelOf(v);

export interface Endpoint {
  /** radice dell'API, senza barra finale */
  base: string;
  headers: Record<string, string>;
}

/** Dove mandare le richieste e con quali intestazioni, con la chiave sul dispositivo o attraverso il proxy. */
export function endpoint(v: VoiceSettings): Endpoint {
  const p = v.provider as Exclude<VoiceProvider, 'base'>;
  if (v.connection === 'proxy') {
    const root = v.proxyUrl.trim().replace(/\/+$/, '');
    const path = p === 'openai' ? '/openai/v1' : p === 'anthropic' ? '/anthropic' : p === 'gemini' ? '/gemini' : '/compatible';
    return { base: root + path, headers: v.proxyToken ? { 'x-ponte-token': v.proxyToken.trim() } : {} };
  }
  const key = v.apiKey.trim();
  if (p === 'anthropic') return { base: PROVIDERS.anthropic.base, headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' } };
  if (p === 'gemini') return { base: PROVIDERS.gemini.base, headers: { 'x-goog-api-key': key } };
  const base = p === 'compatible' ? v.baseUrl.trim().replace(/\/+$/, '') : PROVIDERS.openai.base;
  return { base, headers: { Authorization: `Bearer ${key}` } };
}

/** per il backup: la chiave e il token non escono mai dal dispositivo */
export function withoutSecrets(v: VoiceSettings | undefined): VoiceSettings | undefined {
  if (!v) return v;
  return { ...v, apiKey: '', proxyToken: '' };
}
