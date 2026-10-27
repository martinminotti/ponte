import { Link } from 'react-router';
import { Building2 } from 'lucide-react';
import type { Job } from '@/domain/types';
import { eur, jobNumber, relDay } from '@/domain/format';
import { custName, daSaldare, isAz, isDue, toInvoice, totale, veic } from '@/domain/logic';
import { Plate } from '@/ui/Plate';
import { StatusPill, StatusTicks } from '@/ui/status';

export function JobCard({ j, active, dense }: { j: Job; active?: boolean; dense?: boolean }) {
  const due = isDue(j);
  const tot = totale(j);
  const name = custName(j);
  const amt = dense ? 'text-[1.125rem]' : 'text-[1.3125rem]';
  return (
    <Link
      to={`/job/${j.id}`}
      aria-current={active ? 'page' : undefined}
      data-job={j.id}
      className={`press card group block outline-none focus-visible:ring-2 focus-visible:ring-accent ${
        dense ? 'scroll-my-28 p-3.5 hover:ring-1 hover:ring-line-strong' : 'p-4 hover:shadow-[var(--shadow-2)]'
      } ${active ? '!ring-2 !ring-accent' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <Plate plate={j.plate} country={j.plateCountry} size={dense ? 'sm' : 'md'} />
        <StatusPill s={j.status} size="sm" />
      </div>

      <div className={`${dense ? 'mt-2.5' : 'mt-3.5'} flex items-end justify-between gap-3`}>
        <div className="min-w-0">
          <p className={`w-semi truncate leading-tight font-semibold text-ink ${dense ? 'text-[1rem]' : 'text-[1.125rem]'}`}>{veic(j)}</p>
          <p className={`mt-0.5 flex items-center gap-1.5 truncate text-ink-2 ${dense ? 'text-[0.875rem]' : 'text-[0.9375rem]'}`}>
            {isAz(j) && <Building2 size={15} className="shrink-0 text-ink-3" aria-label="Azienda" />}
            <span className="truncate">{name || 'Cliente non indicato'}</span>
          </p>
        </div>
        <div className="shrink-0 text-right">
          {due ? (
            <>
              <p className="text-[0.7812rem] font-medium text-danger">da incassare</p>
              <p className={`w-cond tnum ${amt} leading-none font-bold text-danger`}>{eur(daSaldare(j))}</p>
            </>
          ) : j.paid ? (
            <>
              <p className="text-[0.7812rem] font-medium text-ok">pagato</p>
              <p className={`w-cond tnum ${amt} leading-none font-bold text-ink`}>{eur(tot)}</p>
            </>
          ) : tot > 0 ? (
            <>
              <p className="text-[0.7812rem] font-medium text-ink-3">{toInvoice(j) ? 'da fatturare' : 'totale'}</p>
              <p className={`w-cond tnum ${amt} leading-none font-bold text-ink`}>{eur(tot)}</p>
            </>
          ) : null}
        </div>
      </div>

      <div className={`${dense ? 'mt-2.5' : 'mt-3.5'} flex items-center gap-3`}>
        <div className="flex-1">
          <StatusTicks s={j.status} />
        </div>
        <p className="tnum shrink-0 text-[0.8125rem] text-ink-3">
          N. {jobNumber(j.number)} <span aria-hidden="true">·</span> {relDay(j.createdAt)}
        </p>
      </div>
    </Link>
  );
}
