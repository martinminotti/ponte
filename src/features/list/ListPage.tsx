import { useMemo, useState } from 'react';
import { useMatch, useNavigate } from 'react-router';
import { Plus, Search, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import { useJobs, useWide } from '@/app/hooks';
import { BrandMark } from '@/app/Shell';
import { FILTRI, type FilterKey } from '@/domain/constants';
import { eur } from '@/domain/format';
import { daSaldare, inFilter, matchJob } from '@/domain/logic';
import { seedDemo } from '@/data/demo';
import { deleteDemo } from '@/data/repo';
import { Button, Chip, EmptyState } from '@/ui/controls';
import { Plate } from '@/ui/Plate';
import { JobCard } from './JobCard';

const FK = 'ro:filter';
const readFilter = (): FilterKey => {
  try {
    return (sessionStorage.getItem(FK) as FilterKey) || 'tutti';
  } catch {
    return 'tutti';
  }
};

let lastQuery = '';

export function ListPage() {
  const jobs = useJobs();
  const wide = useWide();
  const nav = useNavigate();
  const match = useMatch('/job/:id/*');
  const activeId = match?.params.id;
  const [filter, setFilterState] = useState<FilterKey>(readFilter);
  const [q, setQState] = useState(lastQuery);
  const setQ = (v: string) => {
    lastQuery = v;
    setQState(v);
  };
  const setFilter = (f: FilterKey) => {
    setFilterState(f);
    try {
      sessionStorage.setItem(FK, f);
    } catch {
      /* non disponibile */
    }
  };

  const counts = useMemo(() => {
    const c = {} as Record<FilterKey, number>;
    for (const f of FILTRI) c[f.k] = (jobs || []).filter((j) => inFilter(j, f.k)).length;
    return c;
  }, [jobs]);

  const list = useMemo(() => (jobs || []).filter((j) => inFilter(j, filter) && matchJob(j, q)), [jobs, filter, q]);
  const dueTotal = useMemo(() => list.reduce((t, j) => t + daSaldare(j), 0), [list]);
  const demoN = (jobs || []).filter((j) => j.demo).length;
  const qq = q.trim();
  const looksPlate = /^[a-z0-9 ]{4,10}$/i.test(qq) && /\d/.test(qq);

  const loadDemo = async () => {
    const n = await seedDemo();
    toast.success(`${n} schede di esempio caricate`);
  };
  const removeDemo = async () => {
    const n = await deleteDemo();
    toast(`${n} schede di esempio eliminate`);
  };
  const newJob = () => window.dispatchEvent(new Event('ro:new-job'));

  return (
    <div className={`mx-auto w-full ${wide ? 'max-w-none' : 'max-w-[680px]'} pb-safe-bar lg:pb-10`}>
      {!wide && (
        <header className="safe-top px-4 pt-4">
          <BrandMark />
        </header>
      )}

      <div className="sticky top-[env(safe-area-inset-top,0px)] z-30 bg-[color-mix(in_srgb,var(--bg)_86%,transparent)] px-4 pt-3 pb-2 backdrop-blur-xl backdrop-saturate-150 lg:top-0 lg:pt-5">
        {wide && <h1 className="w-wide mb-3 text-[26px] font-semibold tracking-[-0.01em] text-ink">Schede</h1>}
        <label className="relative block">
          <span className="sr-only">Cerca</span>
          <Search size={20} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-3" />
          <input
            type="search"
            inputMode="search"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            placeholder="Targa, telaio, cliente, ditta, telefono"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="ctl h-[52px] !rounded-[16px] !bg-surface pr-11 pl-12 shadow-[var(--shadow-1)] [&::-webkit-search-cancel-button]:hidden"
          />
          {q && (
            <button type="button" onClick={() => setQ('')} aria-label="Cancella ricerca" className="press absolute top-1/2 right-2 grid size-9 -translate-y-1/2 place-items-center rounded-full text-ink-3 hover:bg-surface-2">
              <X size={18} />
            </button>
          )}
        </label>
        <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Filtra le schede">
          {FILTRI.map((f) => (
            <Chip key={f.k} on={filter === f.k} count={jobs ? counts[f.k] : undefined} onClick={() => setFilter(f.k)}>
              {f.l}
            </Chip>
          ))}
        </div>
      </div>

      <div className="px-4">
        {demoN > 0 && (
          <div className="mt-2 flex items-center justify-between gap-3 rounded-[16px] bg-warn-soft px-4 py-3 text-[14.5px] font-medium text-warn">
            <span>Stai guardando {demoN} schede di esempio.</span>
            <button type="button" onClick={removeDemo} className="press shrink-0 rounded-[10px] px-2.5 py-1.5 font-semibold underline underline-offset-2">
              Elimina esempi
            </button>
          </div>
        )}

        {filter === 'saldo' && list.length > 0 && (
          <p className="mt-3 flex items-baseline justify-between rounded-[16px] bg-danger-soft px-4 py-3 text-danger">
            <span className="text-[15px] font-medium">Totale da incassare</span>
            <span className="w-cond tnum text-[24px] font-bold">{eur(dueTotal)}</span>
          </p>
        )}

        {jobs === undefined ? (
          <div className="mt-3 flex flex-col gap-3" aria-busy="true" aria-label="Apro l'archivio">
            {[0, 1, 2].map((i) => (
              <div key={i} className="card h-[150px] animate-pulse opacity-60" />
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <EmptyState
            art={<Plate plate="" size="xl" />}
            title="Nessun veicolo in archivio"
            action={
              <>
                <Button variant="primary" size="lg" icon={<Plus size={20} strokeWidth={2.6} />} onClick={newJob}>
                  Registra la prima accettazione
                </Button>
                <Button variant="ghost" icon={<Sparkles size={18} />} onClick={loadDemo}>
                  Prova con dati di esempio
                </Button>
              </>
            }
          >
            Ogni veicolo che entra in officina diventa una scheda: la ritrovi per targa, telaio o cliente.
          </EmptyState>
        ) : list.length === 0 ? (
          <EmptyState
            title={qq ? `Nessun risultato per “${qq}”` : 'Nessuna scheda qui'}
            action={
              qq ? (
                <Button variant="outline" icon={<Plus size={18} strokeWidth={2.4} />} onClick={() => nav(`/nuova?cl=privato${looksPlate ? `&plate=${encodeURIComponent(qq.toUpperCase())}` : ''}`)}>
                  {looksPlate ? `Accetta ${qq.toUpperCase()}` : 'Nuova accettazione'}
                </Button>
              ) : (
                <Button variant="outline" onClick={() => setFilter('tutti')}>
                  Mostra tutte le schede
                </Button>
              )
            }
          >
            {qq ? 'Controlla la targa o cerca per nome, telefono o partita IVA.' : 'Cambia filtro per vedere le altre schede.'}
          </EmptyState>
        ) : (
          <ul className="mt-2 flex flex-col gap-3">
            {list.map((j) => (
              <li key={j.id}>
                <JobCard j={j} active={wide && j.id === activeId} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
