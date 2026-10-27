import { useEffect, useState } from 'react';
import { Copy, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { STATI } from '@/domain/constants';
import { buildMsg } from '@/domain/messages';
import { waLink } from '@/domain/logic';
import type { Job, Settings, StatusKey } from '@/domain/types';
import { copyText, haptic, openExternal } from '@/platform/native';
import { Button, Note } from '@/ui/controls';
import { Sheet } from '@/ui/Sheet';

export function WhatsAppSheet({ open, onOpenChange, job, kind, settings }: { open: boolean; onOpenChange: (o: boolean) => void; job: Job; kind: StatusKey; settings: Settings }) {
  const [k, setK] = useState<StatusKey>(kind);
  const [text, setText] = useState('');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (open) {
      setK(kind);
      setDirty(false);
    }
  }, [open, kind]);

  useEffect(() => {
    if (!dirty) setText(buildMsg(job, k, settings));
  }, [job, k, settings, dirty]);

  const consent = job.wa !== false;
  const link = consent ? waLink(job.phone, text, settings.prefix) : null;

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Avvisa il cliente"
      description={job.phone ? `WhatsApp a ${job.owner || job.company?.name || 'cliente'}, ${job.phone}` : 'Messaggio WhatsApp già scritto, da rivedere e inviare'}
      footer={
        <div className="flex gap-2.5">
          <Button
            variant="secondary"
            size="lg"
            icon={<Copy size={18} />}
            onClick={async () => {
              const ok = await copyText(text);
              toast[ok ? 'success' : 'error'](ok ? 'Testo copiato' : 'Non riesco a copiare: seleziona il testo a mano');
            }}
          >
            Copia
          </Button>
          <Button
            variant="wa"
            size="lg"
            block
            disabled={!link}
            icon={<MessageCircle size={20} strokeWidth={2.2} />}
            onClick={() => {
              if (!link) return;
              haptic('success');
              openExternal(link);
              onOpenChange(false);
            }}
          >
            Apri WhatsApp
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {!consent && <Note tone="warn">Il cliente non ha dato il consenso ai messaggi WhatsApp. Puoi cambiarlo da Modifica dati.</Note>}
        {consent && !job.phone && <Note tone="warn">Manca il numero del cliente. Aggiungilo da Modifica dati, oppure copia il testo.</Note>}
        <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5" role="radiogroup" aria-label="Messaggio per lo stato">
          {STATI.map((s) => (
            <button
              key={s.k}
              type="button"
              role="radio"
              aria-checked={k === s.k}
              onClick={() => {
                setK(s.k);
                setDirty(false);
              }}
              className={`press h-9 shrink-0 rounded-full px-3.5 text-[14px] font-medium ${k === s.k ? 'bg-ink text-bg' : 'bg-surface-2 text-ink-2'}`}
            >
              {s.l}
            </button>
          ))}
        </div>
        <div className="relative">
          <textarea
            aria-label="Testo del messaggio"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setDirty(true);
            }}
            rows={10}
            className="ctl !min-h-[220px] !rounded-[18px] !rounded-br-[6px] !bg-[color-mix(in_srgb,var(--wa)_10%,var(--surface))] text-[15.5px] leading-relaxed"
          />
        </div>
        <p className="text-[13.5px] text-ink-3">
          {dirty ? (
            <button type="button" className="font-semibold text-accent-ink underline underline-offset-2" onClick={() => setDirty(false)}>
              Ripristina il testo originale
            </button>
          ) : (
            'Puoi modificare il testo. In WhatsApp tocca Invia per mandarlo.'
          )}
        </p>
      </div>
    </Sheet>
  );
}
