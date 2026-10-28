import { useEffect, useMemo, useRef, useState } from 'react';
import { useMatch, useNavigate, useSearchParams } from 'react-router';
import { Plus, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { overlayOpen, searchShortcut, typing, useGlass, useJobs, useSettings, useWide } from '@/app/hooks';
import { STATI, statoIndex } from '@/domain/constants';
import { fmtPlate } from '@/domain/format';
import { veic, waLink, withStatus } from '@/domain/logic';
import type { Job } from '@/domain/types';
import { mutateJob } from '@/data/repo';
import { haptic } from '@/platform/native';
import { stColor } from '@/ui/status';
import { WhatsAppSheet } from '@/features/job/WhatsAppSheet';
import { SwipeCard, type SwipeAction } from './SwipeCard';
import { BrandMark } from '@/app/Shell';
import { FILTRI, type FilterKey } from '@/domain/constants';
import { eur } from '@/domain/format';
import { daSaldare, inFilter, matchJob } from '@/domain/logic';
import { seedDemo } from '@/data/demo';
import { deleteDemo } from '@/data/repo';
import { Button, Chip, EmptyState } from '@/ui/controls';
import { Plate } from '@/ui/Plate';
import { JobCard } from './JobCard';
import { SearchField } from '@/ui/SearchField';

const FK = 'ro:filter';
const readFilter = (): FilterKey => {
  try {
    return (sessionStorage.getItem(FK) as FilterKey) || 'attive';
  } catch {
    return 'attive';
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
  const glass = useGlass();
  const searchRef = useRef<HTMLInputElement>(null);
  const [sp, setSp] = useSearchParams();

  // filtro o ricerca arrivati da un riquadro di Oggi: /schede?f=pronti, /schede?cerca=1
  useEffect(() => {
    const f = sp.get('f') as FilterKey | null;
    if (f && FILTRI.some((x) => x.k === f)) setFilter(f);
    if (sp.get('cerca'))
      setTimeout(() => {
        searchRef.current?.focus();
        searchRef.current?.click(); // su iPhone apre la ricerca nativa
      }, 60);
    if (f || sp.get('cerca')) setSp({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);

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

  // la ricerca guarda in tutto l'archivio, anche fra le consegnate; senza ricerca vale il filtro
  const list = useMemo(() => (jobs || []).filter((j) => (q.trim() ? true : inFilter(j, filter)) && matchJob(j, q)), [jobs, filter, q]);
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

  // azioni a scorrimento sulle schede (telefono): stato successivo a destra, WhatsApp a sinistra
  const settings = useSettings();
  const [wa, setWa] = useState<Job | null>(null);
  const [waOpen, setWaOpen] = useState(false);
  const nextAction = (j: Job): SwipeAction | undefined => {
    const next = STATI[statoIndex(j.status) + 1];
    if (!next) return undefined;
    return {
      label: next.short,
      color: stColor(next.k),
      onCommit: () => {
        const prev = j;
        mutateJob(j.id, (x) => withStatus(x, next.k));
        haptic('medium');
        toast(`${fmtPlate(j.plate, j.plateCountry) || veic(j)}: ${next.l}`, { action: { label: 'Annulla', onClick: () => mutateJob(j.id, () => prev) }, duration: 6000 });
      },
    };
  };
  const waAction = (j: Job): SwipeAction | undefined =>
    j.wa !== false && waLink(j.phone, 'x', settings.prefix) ? { label: 'Avvisa', color: 'var(--wa)', onCommit: () => (setWa(j), setWaOpen(true)) } : undefined;

  // su schermi larghi ↑ ↓ (o J K) scorrono le schede nel pannello accanto
  useEffect(() => {
    if (!wide) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typing() || overlayOpen()) return;
      const dir = e.key === 'ArrowDown' || e.key === 'j' ? 1 : e.key === 'ArrowUp' || e.key === 'k' ? -1 : 0;
      if (!dir || !list.length) return;
      e.preventDefault();
      const i = list.findIndex((j) => j.id === activeId);
      const next = list[i < 0 ? (dir > 0 ? 0 : list.length - 1) : Math.min(list.length - 1, Math.max(0, i + dir))];
      nav(`/job/${next.id}`, { replace: i >= 0 });
      requestAnimationFrame(() => document.querySelector(`[data-job="${next.id}"]`)?.scrollIntoView({ block: 'nearest' }));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [wide, list, activeId, nav]);

  return (
    <div className={`mx-auto w-full ${wide ? 'max-w-none' : 'max-w-[680px]'} pb-safe-bar lg:pb-10`}>
      {!wide && (
        <header className="px-4 pt-[calc(env(safe-area-inset-top,0px)+16px)]">
          <BrandMark />
        </header>
      )}

      {!wide && <h1 className="w-wide px-4 pt-5 text-[2rem] leading-none font-semibold tracking-[-0.02em] text-ink">Schede</h1>}

      <div
        className={`sticky top-[env(safe-area-inset-top,0px)] z-30 px-4 pt-3 pb-2 lg:top-0 lg:pt-5 ${
          glass && !wide ? 'scroll-edge' : 'bg-[color-mix(in_srgb,var(--bg)_86%,transparent)] backdrop-blur-xl backdrop-saturate-150'
        }`}
      >
        {wide && <h1 className="w-wide mb-3 text-[1.625rem] font-semibold tracking-[-0.01em] text-ink">Schede</h1>}
        <SearchField
          ref={searchRef}
          id="search-jobs"
          value={q}
          onChange={setQ}
          shortcut={wide ? searchShortcut() : undefined}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              if (q) setQ('');
              else e.currentTarget.blur();
            } else if ((e.key === 'Enter' || e.key === 'ArrowDown') && list.length) {
              e.preventDefault();
              e.currentTarget.blur();
              nav(`/job/${list[0].id}`);
            }
          }}
        />
        <div className={wide ? 'mt-3 flex flex-wrap gap-1.5' : 'no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1'} role="group" aria-label="Filtra le schede">
          {FILTRI.map((f) => (
            <Chip key={f.k} on={filter === f.k} count={jobs ? counts[f.k] : undefined} onClick={() => setFilter(f.k)} className={wide ? '!h-8 !gap-1.5 !px-3 !text-[0.875rem]' : ''}>
              {f.l}
            </Chip>
          ))}
        </div>
      </div>

      <div className="px-4">
        {demoN > 0 && (
          <div className="mt-2 flex items-center justify-between gap-3 rounded-[16px] bg-warn-soft px-4 py-3 text-[0.9062rem] font-medium text-warn">
            <span>Stai guardando {demoN} schede di esempio.</span>
            <button type="button" onClick={removeDemo} className="press shrink-0 rounded-[10px] px-2.5 py-1.5 font-semibold underline underline-offset-2">
              Elimina esempi
            </button>
          </div>
        )}

        {filter === 'saldo' && list.length > 0 && (
          <p className="mt-3 flex items-baseline justify-between rounded-[16px] bg-danger-soft px-4 py-3 text-danger">
            <span className="text-[0.9375rem] font-medium">Totale da incassare</span>
            <span className="w-cond tnum text-[1.5rem] font-bold">{eur(dueTotal)}</span>
          </p>
        )}

        {jobs === undefined ? (
          <div className="mt-3 flex flex-col gap-3" aria-busy="true" aria-label="Apro l'archivio">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-[150px]" />
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
          <ul className={`mt-2 flex flex-col ${wide ? 'gap-2' : 'gap-3'}`}>
            {list.map((j) => (
              <li key={j.id}>
                {wide ? (
                  <JobCard j={j} active={j.id === activeId} dense />
                ) : (
                  <SwipeCard right={nextAction(j)} left={waAction(j)}>
                    <JobCard j={j} />
                  </SwipeCard>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {wa && <WhatsAppSheet open={waOpen} onOpenChange={setWaOpen} job={wa} kind={wa.status} settings={settings} />}
    </div>
  );
}
