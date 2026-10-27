import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { createHashRouter, RouterProvider } from 'react-router';
import { MotionConfig } from 'motion/react';
import { migrateLegacy } from '@/data/backup';
import { requestPersistence } from '@/data/repo';
import { db } from '@/data/db';
import { Shell } from './Shell';
import { PanePlaceholder, Workspace } from './layout';
import { JobPage } from '@/features/job/JobPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { UpdatePrompt } from './UpdatePrompt';

// le schermate meno frequenti si caricano quando servono
const loadForm = () => import('@/features/form/FormPage');
const loadDoc = () => import('@/features/doc/DocPage');
const loadMonth = () => import('@/features/month/MonthPage');
const loadSettings = () => import('@/features/settings/SettingsPage');
const FormPage = lazy(() => loadForm().then((m) => ({ default: m.FormPage })));
const DocPage = lazy(() => loadDoc().then((m) => ({ default: m.DocPage })));
const MonthPage = lazy(() => loadMonth().then((m) => ({ default: m.MonthPage })));
const SettingsPage = lazy(() => loadSettings().then((m) => ({ default: m.SettingsPage })));
// precaricate appena l'app è pronta: senza, la prima apertura di Fatture o Impostazioni mostrava un fotogramma vuoto
const preload = () => [loadMonth, loadSettings, loadForm, loadDoc].forEach((f) => f().catch(() => {}));
const L = (n: ReactNode) => <Suspense fallback={null}>{n}</Suspense>;

// Hash router: funziona su qualunque hosting statico, dentro Capacitor e come file singolo.
const router = createHashRouter([
  {
    element: <Shell />,
    children: [
      {
        path: '/',
        element: <Workspace />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'schede', element: <PanePlaceholder /> },
          { path: 'job/:id', element: <JobPage /> },
          { path: 'job/:id/conto', element: L(<DocPage />) },
          { path: 'job/:id/modifica', element: L(<FormPage />) },
          { path: 'nuova', element: L(<FormPage />) },
        ],
      },
      { path: '/mensile', element: L(<MonthPage />) },
      { path: '/impostazioni', element: L(<SettingsPage />) },
      { path: '*', element: <PanePlaceholder /> },
    ],
  },
]);

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
  if (boot === 'loading') return null;
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
