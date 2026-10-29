import { getSettings, saveSettings } from '@/data/repo';
import type { VoiceSettings } from '@/domain/types';
import { voiceSettings } from '@/voice/config';

/** le modifiche si mettono in fila e partono dal valore salvato: due campi cambiati di seguito non si sovrascrivono */
let chain: Promise<void> = Promise.resolve();
export function saveVoice(p: Partial<VoiceSettings>) {
  chain = chain.then(async () => {
    const cur = await getSettings();
    await saveSettings({ voice: { ...voiceSettings(cur), ...p } });
  });
  return chain;
}
