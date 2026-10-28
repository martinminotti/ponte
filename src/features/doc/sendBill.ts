import { toast } from 'sonner';
import { waLink } from '@/domain/logic';
import { paidMsg } from '@/domain/messages';
import type { Job, Settings } from '@/domain/types';
import { buildJobPdf, jobPdfName } from '@/pdf/pdf';
import { copyText, haptic, openExternal, saveFile, shareFile } from '@/platform/native';

/**
 * Manda al cliente il conto in PDF con un messaggio di cortesia.
 * Telefono: foglio di condivisione con il PDF e il testo, si sceglie WhatsApp (il file arriva allegato).
 * Il testo resta anche negli appunti, da incollare se l'app di destinazione non lo prende.
 * Dove non si possono condividere file: si salva il PDF e si apre la chat WhatsApp con il messaggio.
 */
export async function sendBill(job: Job, s: Settings): Promise<void> {
  const msg = paidMsg(job, s);
  try {
    const blob = await buildJobPdf(job, s);
    const name = jobPdfName(job);
    await copyText(msg);
    const r = await shareFile(name, blob, msg);
    if (r === 'shared') {
      haptic('success');
      toast.success('Conto inviato', { description: 'Il messaggio è anche negli appunti, se serve incollarlo.' });
      return;
    }
    if (r === 'cancelled') return;
    await saveFile(name, blob);
    const link = job.wa !== false ? waLink(job.phone, msg, s.prefix) : null;
    if (link) {
      openExternal(link);
      toast.success('PDF salvato', { description: 'In WhatsApp allegalo con la graffetta: il messaggio è già scritto.' });
    } else toast.success('PDF salvato e messaggio copiato');
  } catch {
    toast.error('Non riesco a preparare il conto. Riprova.');
  }
}
