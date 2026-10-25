import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { createHashRouter, RouterProvider } from 'react-router';
import { migrateLegacy } from '@/data/backup';
import { requestPersistence } from '@/data/repo';
import { db } from '@/data/db';
import { Shell } from './Shell';
import { PanePlaceholder, Workspace } from './layout';
import { JobPage } from '@/features/job/JobPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { UpdatePrompt } from './UpdatePrompt';

// le schermate meno frequenti si caricano quando servono
const FormPage = lazy(() => import('@/features/form/FormPage').then((m) => ({ default: m.FormPage })));
const DocPage = lazy(() => import('@/features/doc/DocPage').then((m) => ({ default: m.DocPage })));
const MonthPage = lazy(() => import('@/features/month/MonthPage').then((m) => ({ default: m.MonthPage })));
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })));
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
          <p className="w-wide text-[20px] font-semibold text-ink">Qualcosa si è inceppato</p>
          <p className="mt-2 text-[15px] text-ink-2">I dati sono al sicuro nell'archivio del dispositivo. Ricarica l'app per continuare.</p>
          <button type="button" onClick={() => location.reload()} className="press mt-6 h-12 rounded-[14px] bg-accent px-5 font-semibold text-on-accent">
            Ricarica
          </button>
          <p className="mt-4 text-[12.5px] text-ink-3">{this.state.err.message}</p>
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
          <p className="w-wide text-[20px] font-semibold text-ink">Non riesco ad aprire l'archivio</p>
          <p className="mt-2 text-[15px] text-ink-2">Il browser blocca l'archivio locale (navigazione privata o spazio pieno). Apri l'app in una finestra normale e riprova.</p>
        </div>
      </div>
    );
  if (boot === 'loading') return null;
  return (
    <Boundary>
      <RouterProvider router={router} />
      <UpdatePrompt />
    </Boundary>
  );
}
