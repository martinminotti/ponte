import { useEffect, useMemo, useState } from 'react';
import { useSettings } from '@/app/hooks';
import { voiceSettings } from '@/voice/config';
import { canListen } from '@/voice/support';

/** si può dettare su questo dispositivo, con le impostazioni attuali (leggero: non carica l'assistente) */
export function useCanListen(): boolean {
  const s = useSettings();
  const v = useMemo(() => voiceSettings(s), [s]);
  const [ok, setOk] = useState(false);
  useEffect(() => {
    let alive = true;
    canListen(v).then((x) => alive && setOk(x));
    return () => {
      alive = false;
    };
  }, [v]);
  return ok;
}
