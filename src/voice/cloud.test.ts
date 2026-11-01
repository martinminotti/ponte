import { afterEach, describe, expect, it } from 'vitest';
import { aiReady, endpoint, setCloudAi, voiceSettings } from './config';

afterEach(() => setCloudAi(null));

describe('assistente incluso con l’officina nel cloud', () => {
  it('senza cloud valgono le impostazioni del dispositivo', () => {
    const v = voiceSettings({ voice: { ...voiceSettings(undefined), provider: 'openai', apiKey: 'sk-x' } });
    expect(v.connection).toBe('key');
    expect(aiReady(v)).toBe(true);
  });
  it('con il cloud: server di Ponte, token della sessione, nessuna chiave sul telefono', () => {
    setCloudAi({ url: 'https://abc.supabase.co', key: 'pk', token: 'jwt', workshop: 'w-1' });
    const v = voiceSettings({ voice: { ...voiceSettings(undefined), provider: 'openai', apiKey: 'sk-segreta' } });
    expect(v).toMatchObject({ provider: 'anthropic', connection: 'ponte', apiKey: '' });
    expect(aiReady(v)).toBe(true);
    expect(endpoint(v)).toEqual({ base: 'https://abc.supabase.co/functions/v1/ai/anthropic', headers: { Authorization: 'Bearer jwt', apikey: 'pk', 'x-ponte-workshop': 'w-1' } });
  });
  it('senza sessione (offline all’avvio) si usa l’interprete di base', () => {
    setCloudAi({ url: 'https://abc.supabase.co', key: 'pk', token: '', workshop: 'w-1' });
    expect(aiReady(voiceSettings(undefined))).toBe(false);
  });
});
