import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { AlarmClock, ArrowUpRight, CheckCircle2, ChevronRight, Plus, ReceiptText, Sparkles, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { useJobs, useWide } from '@/app/hooks';
import { BrandMark } from '@/app/Shell';
import { Page } from '@/app/layout';
import { statoLabel } from '@/domain/constants';
import { dashboard, greeting, type Delivery, type WeekBar } from '@/domain/dashboard';
import { eur, fmtPlate, relDay } from '@/domain/format';
import { custName, veic } from '@/domain/logic';
import type { Job } from '@/domain/types';
import { seedDemo } from '@/data/demo';
import { Button, EmptyState } from '@/ui/controls';
import { Plate } from '@/ui/Plate';
import { SearchField } from '@/ui/SearchField';
import { StatusPill, stColor } from '@/ui/status';

const monthName = (ts: number) => new Date(ts).toLocaleDateString('it-IT', { month: 'long' });
const todayLabel = (ts: number) => {
  const t = new Date(ts).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
  return t.charAt(0).toUpperCase() + t.slice(1);
};
/** Importo compatto per i riquadri: euro interi ("1.240 €"); i centesimi restano nelle schede. */
const eurWhole = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, minimumFractionDigits: 0, useGrouping: 'always' } as Intl.NumberFormatOptions);
const eurShort = (c: number) => eurWhole.format(Math.round(c / 100));

/** La pagina "Oggi": l'officina a colpo d'occhio, con un tocco verso ogni elenco. */
export function DashboardPage() {
  const jobs = useJobs();
  const wide = useWide();
  const nav = useNavigate();
  const now = Date.now();
  const d = useMemo(() => dashboard(jobs || [], now), [jobs, now]);

  if (jobs === undefined) return null;

  const header = (
    <>
      {!wide && (
        <header className="px-4 pt-[calc(env(safe-area-inset-top,0px)+16px)]">
          <BrandMark />
        </header>
      )}
      <div className="px-4 pt-5 lg:pt-8">
        <p className="text-[14px] font-medium text-ink-3">{todayLabel(now)}</p>
        <h1 className="w-wide mt-0.5 text-[34px] leading-[1.05] font-semibold tracking-[-0.02em] text-ink">
          {greeting(now)}
        </h1>
      </div>
    </>
  );

  if (jobs.length === 0) {
    return (
      <Page className="pb-safe-bar lg:pb-10">
        <div className="mx-auto max-w-[880px]">
          {header}
          <EmptyState
            art={<Plate plate="" size="xl" />}
            title="Nessun veicolo in archivio"
            action={
              <>
                <Button variant="primary" size="lg" icon={<Plus size={20} strokeWidth={2.6} />} onClick={() => window.dispatchEvent(new Event('ro:new-job'))}>
                  Registra la prima accettazione
                </Button>
                <Button variant="ghost" icon={<Sparkles size={18} />} onClick={async () => toast.success(`${await seedDemo()} schede di esempio caricate`)}>
                  Prova con dati di esempio
                </Button>
              </>
            }
          >
            Ogni veicolo che entra in officina diventa una scheda. Qui ritrovi la giornata: chi è sul ponte, cosa è pronto, cosa incassare.
          </EmptyState>
        </div>
      </Page>
    );
  }

  const delta = d.month.prev > 0 ? Math.round(((d.month.amount - d.month.prev) / d.month.prev) * 100) : null;
  const prevMonth = new Date(now);
  prevMonth.setDate(1);
  prevMonth.setMonth(prevMonth.getMonth() - 1);

  return (
    <Page className="pb-safe-bar lg:pb-10">
      <div className="mx-auto max-w-[880px]">
        {header}

        <div className="sticky top-[env(safe-area-inset-top,0px)] z-30 px-4 pt-3 pb-2 lg:hidden">
          <SearchField value="" onChange={() => {}} readOnlyTap onFocus={() => nav('/schede?cerca=1')} placeholder="Cerca targa, cliente, ditta" />
        </div>

        <div className="mt-2 grid grid-cols-1 gap-3 px-4 md:grid-cols-2">
          <ShopFloor d={d} onOpen={() => nav('/schede?f=officina')} />

          <div className="grid min-w-0 grid-cols-2 gap-3">
            <Tile
              to="/schede?f=pronti"
              icon={<CheckCircle2 size={18} strokeWidth={2.3} />}
              tint="var(--st-pronto)"
              label="Pronte da ritirare"
              value={String(d.ready.length)}
              foot={d.ready.length ? d.ready.slice(0, 2).map((j) => fmtPlate(j.plate, j.plateCountry) || veic(j)).join(', ') + (d.ready.length > 2 ? '…' : '') : 'Nessuna in attesa'}
            />
            <Tile
              to="/schede?f=saldo"
              icon={<Wallet size={18} strokeWidth={2.3} />}
              tint="var(--danger)"
              label="Da incassare"
              value={eurShort(d.due.amount)}
              foot={d.due.n ? `${d.due.n} ${d.due.n === 1 ? 'scheda' : 'schede'}` : 'Tutto incassato'}
            />
            <Tile
              to="/mensile"
              icon={<ReceiptText size={18} strokeWidth={2.3} />}
              tint="var(--st-lavorazione)"
              label="Da fatturare"
              value={eurShort(d.invoice.amount)}
              foot={d.invoice.companies ? `${d.invoice.companies} ${d.invoice.companies === 1 ? 'ditta' : 'ditte'}, ${d.invoice.n} lavori` : 'Nessuna fattura in sospeso'}
            />
            <Tile
              icon={delta != null && delta < 0 ? <TrendingDown size={18} strokeWidth={2.3} /> : <TrendingUp size={18} strokeWidth={2.3} />}
              tint="var(--accent-ink)"
              label={`Incassato a ${monthName(now)}`}
              value={eurShort(d.month.amount)}
              foot={delta == null ? `${d.month.n} ${d.month.n === 1 ? 'pagamento' : 'pagamenti'}` : `${delta >= 0 ? '+' : '−'}${Math.abs(delta)}% su ${monthName(prevMonth.getTime())}`}
            />
          </div>

          <Deliveries list={d.deliveries} />
          <WeeklyChart weeks={d.weeks} />

          <section className="card p-4 sm:p-5 md:col-span-2">
            <header className="mb-1 flex items-center justify-between">
              <h2 className="w-semi text-[17px] font-semibold text-ink">Ultime accettazioni</h2>
              <Link to="/schede" className="press flex items-center gap-0.5 text-[14.5px] font-semibold text-accent-ink">
                Tutte le schede ({jobs.length}) <ChevronRight size={17} />
              </Link>
            </header>
            <ul className="flex flex-col">
              {d.recent.map((j, i) => (
                <li key={j.id} className={i ? 'border-t border-line' : ''}>
                  <JobRow j={j} meta={relDay(j.createdAt)} />
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </Page>
  );
}

/* ---------------- pezzi ---------------- */

function ShopFloor({ d, onOpen }: { d: ReturnType<typeof dashboard>; onOpen: () => void }) {
  const max = Math.max(1, ...d.byStatus.map((x) => x.n));
  return (
    <button type="button" onClick={onOpen} className="press card group flex flex-col p-5 text-left hover:shadow-[var(--shadow-2)]">
      <span className="flex items-center justify-between">
        <span className="text-[15px] font-semibold text-ink-2">In officina ora</span>
        <ArrowUpRight size={18} className="text-ink-3 transition-colors group-hover:text-ink" />
      </span>
      <span className="mt-1 flex items-baseline gap-2.5">
        <span className="w-cond tnum text-[64px] leading-[0.95] font-bold tracking-[-0.01em] text-ink">{d.inShop}</span>
        <span className="text-[16px] text-ink-2">{d.inShop === 1 ? 'veicolo' : 'veicoli'}</span>
      </span>
      <span className="mt-4 flex flex-col gap-2.5" aria-label="Veicoli per stato">
        {d.byStatus.map(({ s, n }) => (
          <span key={s} className="grid grid-cols-[112px_minmax(0,1fr)_28px] items-center gap-3">
            <span className="flex items-center gap-2 text-[14px] font-medium text-ink-2">
              <span className="size-2 shrink-0 rounded-full" style={{ background: stColor(s) }} />
              {statoLabel(s)}
            </span>
            <span className="h-2 overflow-hidden rounded-full bg-surface-3">
              <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${(n / max) * 100}%`, background: stColor(s), minWidth: n ? 8 : 0 }} />
            </span>
            <span className="tnum text-right text-[15px] font-semibold text-ink">{n}</span>
          </span>
        ))}
      </span>
    </button>
  );
}

function Tile({ to, icon, tint, label, value, foot }: { to?: string; icon: ReactNode; tint: string; label: string; value: string; foot: string }) {
  const body = (
    <>
      <span className="grid size-8 place-items-center rounded-[10px]" style={{ color: tint, background: `color-mix(in srgb, ${tint} 13%, transparent)` }}>
        {icon}
      </span>
      <span className="mt-3 text-[13.5px] leading-tight font-medium text-ink-2">{label}</span>
      <span className="w-cond tnum mt-1 truncate text-[30px] leading-none font-bold text-ink">{value}</span>
      <span className="mt-1.5 line-clamp-1 text-[13px] text-ink-3">{foot}</span>
    </>
  );
  const cls = 'card flex min-w-0 flex-col p-4 text-left';
  return to ? (
    <Link to={to} className={`press ${cls} hover:shadow-[var(--shadow-2)]`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function JobRow({ j, meta }: { j: Job; meta: ReactNode }) {
  return (
    <Link to={`/job/${j.id}`} className="press -mx-2 flex items-center gap-3 rounded-[14px] px-2 py-3 hover:bg-surface-2">
      <Plate plate={j.plate} country={j.plateCountry} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="w-semi block truncate text-[15.5px] font-semibold text-ink">{veic(j)}</span>
        <span className="block truncate text-[13.5px] text-ink-3">{custName(j) || 'Cliente non indicato'}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <StatusPill s={j.status} size="sm" short />
        <span className="text-[12.5px] whitespace-nowrap text-ink-3">{meta}</span>
      </span>
    </Link>
  );
}

function Deliveries({ list }: { list: Delivery[] }) {
  const when = (days: number) => (days < 0 ? `In ritardo ${-days} g` : days === 0 ? 'Oggi' : 'Domani');
  return (
    <section className="card p-4 sm:p-5">
      <header className="mb-1 flex items-center gap-2">
        <AlarmClock size={18} className="text-ink-3" />
        <h2 className="w-semi text-[17px] font-semibold text-ink">Consegne promesse</h2>
      </header>
      {list.length === 0 ? (
        <p className="py-3 text-[15px] text-ink-2">Nessuna consegna prevista per oggi o domani.</p>
      ) : (
        <ul className="flex flex-col">
          {list.slice(0, 5).map(({ job, days }, i) => (
            <li key={job.id} className={i ? 'border-t border-line' : ''}>
              <JobRow j={job} meta={<span className={days < 0 ? 'font-semibold text-danger' : days === 0 ? 'font-semibold text-ink' : ''}>{when(days)}</span>} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Colonne degli incassi settimanali: una sola serie, valore sull'ultima settimana e su quella toccata. */
function WeeklyChart({ weeks }: { weeks: WeekBar[] }) {
  const [sel, setSel] = useState<number | null>(null);
  const W = 320;
  const H = 150;
  const top = 26;
  const base = H - 22;
  const max = Math.max(1, ...weeks.map((w) => w.amount));
  const band = W / weeks.length;
  const bw = Math.min(24, band * 0.56);
  const shown = sel ?? weeks.length - 1;
  const total = weeks.reduce((t, w) => t + w.amount, 0);
  const lab = (ts: number) => new Date(ts).toLocaleDateString('it-IT', { day: 'numeric', month: 'numeric' });
  return (
    <section className="card p-4 sm:p-5">
      <header className="flex items-baseline justify-between gap-3">
        <h2 className="w-semi text-[17px] font-semibold text-ink">Incassi settimanali</h2>
        <span className="tnum text-[13.5px] text-ink-3">8 settimane · {eurShort(total)}</span>
      </header>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 block w-full" role="img" aria-label="Incassi delle ultime 8 settimane">
        <line x1="0" x2={W} y1={base + 0.5} y2={base + 0.5} stroke="var(--line)" strokeWidth="1" />
        {weeks.map((w, i) => {
          const h = w.amount ? Math.max(4, ((base - top) * w.amount) / max) : 0;
          const x = i * band + (band - bw) / 2;
          const y = base - h;
          const on = i === shown;
          return (
            <g key={w.start} onClick={() => setSel(i === sel ? null : i)} onMouseEnter={() => setSel(i)} className="cursor-pointer">
              <rect x={i * band} y={0} width={band} height={H} fill="transparent" />
              {h > 0 && (
                <path
                  d={`M${x} ${base}V${y + 4}a4 4 0 0 1 4 -4h${bw - 8}a4 4 0 0 1 4 4V${base}Z`}
                  fill="var(--accent)"
                  opacity={on ? 1 : 0.38}
                  style={{ transition: 'opacity .2s' }}
                />
              )}
              {on && (
                <text x={i * band + band / 2} y={Math.max(14, y - 8)} textAnchor="middle" className="tnum" fontSize="12.5" fontWeight="700" fill="var(--ink)">
                  {w.amount ? eurShort(w.amount) : '0 €'}
                </text>
              )}
              <text x={i * band + band / 2} y={H - 5} textAnchor="middle" fontSize="11" fill={on ? 'var(--ink)' : 'var(--ink-3)'} fontWeight={on ? 600 : 400}>
                {lab(w.start)}
              </text>
            </g>
          );
        })}
      </svg>
      <table className="sr-only">
        <caption>Incassi per settimana</caption>
        <tbody>
          {weeks.map((w) => (
            <tr key={w.start}>
              <th>Settimana dal {lab(w.start)}</th>
              <td>{eur(w.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
