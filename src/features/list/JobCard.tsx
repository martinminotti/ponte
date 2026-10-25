import { Link } from 'react-router';
import { Building2 } from 'lucide-react';
import type { Job } from '@/domain/types';
import { eur, jobNumber, relDay } from '@/domain/format';
import { custName, daSaldare, isAz, isDue, toInvoice, totale, veic } from '@/domain/logic';
import { Plate } from '@/ui/Plate';
import { StatusPill, StatusTicks } from '@/ui/status';

export function JobCard({ j, active }: { j: Job; active?: boolean }) {
  const due = isDue(j);
  const tot = totale(j);
  const name = custName(j);
  return (
    <Link
      to={`/job/${j.id}`}
      aria-current={active ? 'page' : undefined}
      className={`press card group block p-4 outline-none hover:shadow-[var(--shadow-2)] focus-visible:ring-2 focus-visible:ring-accent ${active ? 'ring-2 ring-accent' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <Plate plate={j.plate} country={j.plateCountry} size="md" />
        <StatusPill s={j.status} size="sm" />
      </div>

      <div className="mt-3.5 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="w-semi truncate text-[18px] leading-tight font-semibold text-ink">{veic(j)}</p>
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-[15px] text-ink-2">
            {isAz(j) && <Building2 size={15} className="shrink-0 text-ink-3" aria-label="Azienda" />}
            <span className="truncate">{name || 'Cliente non indicato'}</span>
          </p>
        </div>
        <div className="shrink-0 text-right">
          {due ? (
            <>
              <p className="text-[12.5px] font-medium text-danger">da incassare</p>
              <p className="w-cond tnum text-[21px] leading-none font-bold text-danger">{eur(daSaldare(j))}</p>
            </>
          ) : j.paid ? (
            <>
              <p className="text-[12.5px] font-medium text-ok">pagato</p>
              <p className="w-cond tnum text-[21px] leading-none font-bold text-ink">{eur(tot)}</p>
            </>
          ) : tot > 0 ? (
            <>
              <p className="text-[12.5px] font-medium text-ink-3">{toInvoice(j) ? 'da fatturare' : 'totale'}</p>
              <p className="w-cond tnum text-[21px] leading-none font-bold text-ink">{eur(tot)}</p>
            </>
          ) : null}
        </div>
      </div>

      <div className="mt-3.5 flex items-center gap-3">
        <div className="flex-1">
          <StatusTicks s={j.status} />
        </div>
        <p className="tnum shrink-0 text-[13px] text-ink-3">
          N. {jobNumber(j.number)} <span aria-hidden="true">·</span> {relDay(j.createdAt)}
        </p>
      </div>
    </Link>
  );
}
