import { useParams } from 'react-router';
import { Page, TopBar } from '@/app/layout';
import { useJob, useSettings } from '@/app/hooks';
import { jobNumber } from '@/domain/format';
import { waLink } from '@/domain/logic';
import { buildMsg } from '@/domain/messages';
import { buildJobPdf, jobPdfName } from '@/pdf/pdf';
import { Note } from '@/ui/controls';
import { DocActions } from './DocActions';
import { JobPaper } from './Paper';

export function DocPage() {
  const { id } = useParams();
  const j = useJob(id);
  const s = useSettings();
  if (!j) return null;
  const kind = j.status === 'consegnato' ? 'consegnato' : 'pronto';
  const wa = j.wa !== false ? waLink(j.phone, buildMsg(j, kind, s), s.prefix) : null;
  return (
    <Page className="pb-10">
      <TopBar back={`/job/${j.id}`} backLabel="Scheda" title={`Conto N. ${jobNumber(j.number)}`} />
      <div className="mx-auto flex max-w-[760px] flex-col gap-4 px-4">
        {!j.items.length && <Note tone="warn">Il conto è vuoto: aggiungi i lavori eseguiti nella scheda.</Note>}
        <JobPaper j={j} s={s} />
        <div className="card p-4 sm:p-5">
          <DocActions build={() => buildJobPdf(j, s)} name={jobPdfName(j)} waHref={wa} />
        </div>
      </div>
    </Page>
  );
}
