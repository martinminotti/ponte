import { useEffect } from 'react';
import { toast } from 'sonner';
import { isNative } from '@/platform/native';

/** Avvisa quando è pronta una nuova versione dell'app (service worker) e la applica su richiesta. */
export function UpdatePrompt() {
  useEffect(() => {
    if (isNative() || !('serviceWorker' in navigator) || import.meta.env.DEV) return;
    let cancelled = false;
    import('virtual:pwa-register')
      .then(({ registerSW }) => {
        if (cancelled) return;
        const update = registerSW({
          onNeedRefresh() {
            toast('Nuova versione disponibile', {
              description: 'Aggiorna per usare le ultime migliorie.',
              duration: Infinity,
              action: { label: 'Aggiorna', onClick: () => update(true) },
            });
          },
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
