import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useSettings } from '@/app/hooks';
import type { VoiceSettings } from '@/domain/types';
import { voiceSettings } from '@/voice/config';
import { voiceSupport } from '@/voice/listen';
import { VoiceSession, type VoiceHost, type VoiceState } from '@/voice/session';
import { isNative } from '@/platform/native';

export { useCanListen } from './useCanListen';

export function useVoiceSettings(): VoiceSettings {
  const s = useSettings();
  return useMemo(() => voiceSettings(s), [s]);
}

const IDLE: VoiceState | null = null;

/**
 * Crea la sessione quando la schermata a voce si apre e la chiude quando si chiude.
 * L'host deve restare lo stesso oggetto: legge la bozza da un riferimento sempre aggiornato.
 */
export function useVoiceSession(open: boolean, host: VoiceHost, extraWords: string[], entered = true): { session: VoiceSession | null; state: VoiceState | null } {
  const v = useVoiceSettings();
  const [session, setSession] = useState<VoiceSession | null>(null);
  const words = extraWords.join('|');

  useEffect(() => {
    if (!open) return;
    let alive = true;
    let s: VoiceSession | null = null;
    voiceSupport(v).then((sup) => {
      if (!alive) return;
      s = new VoiceSession({ host, settings: v, transcriber: sup.transcriber, speaker: sup.speaker, extraWords: words ? words.split('|') : [] });
      setSession(s);
    });
    // fuori dall'app si va in pausa; se è stato solo un attimo (un avviso, un tremolio della vista) si riprende da soli
    let hiddenAt = 0;
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        s?.background();
      } else if (s && s.state.phase === 'paused' && s.state.pausedBy === 'background' && Date.now() - hiddenAt < 3000) void s.start();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVis);
      s?.dispose();
      setSession(null);
    };
    // la sessione vive finché la schermata è aperta: le impostazioni cambiano solo da Impostazioni
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // nell'app si parte da soli (chi ha scelto "a voce" vuole parlare), ma solo a schermata arrivata:
  // microfono, sessione audio e aptica non devono rubare fotogrammi alla salita; nel browser serve il tocco
  useEffect(() => {
    if (open && entered && session && isNative() && session.state.phase === 'idle' && !session.state.started) void session.start();
  }, [open, entered, session]);

  const state = useSyncExternalStore(
    (cb) => (session ? session.subscribe(cb) : () => {}),
    () => (session ? session.state : IDLE),
  );
  return { session, state };
}
