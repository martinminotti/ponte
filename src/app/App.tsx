import { Component, useEffect, useState, type ReactNode } from 'react';
import { createHashRouter, RouterProvider } from 'react-router';
import { MotionConfig } from 'motion/react';
import { migrateLegacy } from '@/data/backup';
import { getSettings, requestPersistence } from '@/data/repo';
import { useLiveQuery } from 'dexie-react-hooks';
import { Welcome } from '@/features/welcome/Welcome';
import { db } from '@/data/db';
import { Shell } from './Shell';
import { preload, screenRoutes } from './routes';
import { UpdatePrompt } from './UpdatePrompt';
import { installNavTransitions } from '@/platform/navigation';

// Hash router: funziona su qualunque hosting statico, dentro Capacitor e come file singolo.
const router = createHashRouter([{ element: <Shell />, children: screenRoutes }]);

// transizioni come su iOS per tutte le navigazioni dell'app (link, pulsanti, indietro)
installNavTransitions(router as unknown as Parameters<typeof installNavTransitions>[0]);

class Boundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) {
    return { err };
  }
  componentDidCatch(err: Error) {
    console.error('[Ponte]', err);
  }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="grid min-h-dvh place-items-center p-8 text-center">
        <div className="max-w-[40ch]">
          <p className="w-wide text-[1.25rem] font-semibold text-ink">Qualcosa si è inceppato</p>
          <p className="mt-2 text-[0.9375rem] text-ink-2">I dati sono al sicuro nell'archivio del dispositivo. Ricarica l'app per continuare.</p>
          <button type="button" onClick={() => location.reload()} className="press mt-6 h-12 rounded-[14px] bg-accent px-5 font-semibold text-on-accent">
            Ricarica
          </button>
          <p className="mt-4 text-[0.7812rem] text-ink-3">{this.state.err.message}</p>
        </div>
      </div>
    );
  }
}

type Boot = 'loading' | 'ready' | 'error';

export function App() {
  const [boot, setBoot] = useState<Boot>('loading');
  // benvenuto a ogni apertura dell'app (non al ritorno da sfondo): chi la sta usando, titolare o dipendente
  const [entered, setEntered] = useState(false);
  const st = useLiveQuery(getSettings, []);
  useEffect(() => {
    const again = () => setEntered(false);
    window.addEventListener('ro:profile', again);
    return () => window.removeEventListener('ro:profile', again);
  }, []);
  useEffect(() => {
    (async () => {
      try {
        await db.open();
        await migrateLegacy();
        requestPersistence();
        setBoot('ready');
        setTimeout(preload, 300);
      } catch (e) {
        console.error(e);
        setBoot('error');
      }
    })();
  }, []);

  if (boot === 'error')
    return (
      <div className="grid min-h-dvh place-items-center p-8 text-center">
        <div className="max-w-[40ch]">
          <p className="w-wide text-[1.25rem] font-semibold text-ink">Non riesco ad aprire l'archivio</p>
          <p className="mt-2 text-[0.9375rem] text-ink-2">Il browser blocca l'archivio locale (navigazione privata o spazio pieno). Apri l'app in una finestra normale e riprova.</p>
        </div>
      </div>
    );
  if (boot === 'loading' || !st) return null;
  if (!entered || !st.role)
    return (
      <Welcome
        s={st}
        onDone={(role) => {
          // dopo la scelta si parte dalla propria sezione: Oggi per il titolare, Schede per il dipendente
          window.location.hash = role === 'staff' ? '#/schede' : '#/';
          setEntered(true);
        }}
      />
    );
  return (
    <Boundary>
      {/* "Riduci movimento" del sistema vale anche per le animazioni a molla, non solo per il CSS */}
      <MotionConfig reducedMotion="user">
        <RouterProvider router={router} />
        <UpdatePrompt />
      </MotionConfig>
    </Boundary>
  );
}
