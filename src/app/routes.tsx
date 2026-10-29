import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, type RouteObject } from 'react-router';
import { useSettings } from './hooks';
import { PanePlaceholder, Workspace } from './layout';
import { JobPage } from '@/features/job/JobPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';

// le schermate meno frequenti si caricano quando servono
const loadForm = () => import('@/features/form/FormPage');
const loadDoc = () => import('@/features/doc/DocPage');
const loadMonth = () => import('@/features/month/MonthPage');
const loadSettings = () => import('@/features/settings/SettingsPage');
const loadDitta = () => import('@/features/ditta/DittaPage');
const DittaPage = lazy(() => loadDitta().then((m) => ({ default: m.DittaPage })));
const FormPage = lazy(() => loadForm().then((m) => ({ default: m.FormPage })));
const DocPage = lazy(() => loadDoc().then((m) => ({ default: m.DocPage })));
const MonthPage = lazy(() => loadMonth().then((m) => ({ default: m.MonthPage })));
const SettingsPage = lazy(() => loadSettings().then((m) => ({ default: m.SettingsPage })));
// precaricate appena l'app è pronta: senza, la prima apertura di Fatture o Impostazioni mostrava un fotogramma vuoto
export const preload = () => [loadMonth, loadSettings, loadForm, loadDoc, loadDitta].forEach((f) => f().catch(() => {}));
const L = (n: ReactNode) => <Suspense fallback={null}>{n}</Suspense>;

/** Oggi è del titolare: chi entra come dipendente va dritto alle schede. */
function Home() {
  const s = useSettings();
  return s.role === 'staff' ? <Navigate to="/schede" replace /> : <DashboardPage />;
}

/** Le schermate dell'app (dentro la Shell). Servono anche al gesto indietro, che disegna la schermata precedente. */
export const screenRoutes: RouteObject[] = [
  {
    path: '/',
    element: <Workspace />,
    children: [
      { index: true, element: <Home /> },
      { path: 'schede', element: <PanePlaceholder /> },
      { path: 'job/:id', element: <JobPage /> },
      { path: 'job/:id/conto', element: L(<DocPage />) },
      { path: 'job/:id/modifica', element: L(<FormPage />) },
      { path: 'nuova', element: L(<FormPage />) },
      { path: 'ditta/:key', element: L(<DittaPage />) },
    ],
  },
  { path: '/mensile', element: L(<MonthPage />) },
  { path: '/impostazioni', element: L(<SettingsPage />) },
  { path: '*', element: <PanePlaceholder /> },
];
