import { useState } from 'react';
import { Download, MessageCircle, Printer, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { canShareFiles, haptic, isNative, openExternal, saveFile, shareFile } from '@/platform/native';
import { Button } from '@/ui/controls';

/**
 * Azioni del documento. Dove il telefono lo permette, "Condividi PDF" apre il foglio di sistema
 * e si sceglie WhatsApp: il PDF arriva già allegato.
 */
export function DocActions({ build, name, waHref, waNote }: { build: () => Promise<Blob>; name: string; waHref: string | null; waNote?: string }) {
  const [busy, setBusy] = useState<'share' | 'save' | null>(null);
  const share = canShareFiles();

  const run = async (kind: 'share' | 'save') => {
    setBusy(kind);
    try {
      const blob = await build();
      if (kind === 'share') {
        const r = await shareFile(name, blob);
        if (r === 'unsupported') {
          await saveFile(name, blob);
          toast.success('PDF salvato');
        } else if (r === 'shared') haptic('success');
      } else {
        await saveFile(name, blob);
        haptic('success');
        toast.success(isNative() ? 'PDF pronto' : 'PDF salvato nei download', { description: 'Puoi stamparlo o allegarlo in WhatsApp.' });
      }
    } catch {
      toast.error('Non riesco a creare il PDF. Riprova.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      {share ? (
        <Button variant="primary" size="lg" block icon={<Share2 size={20} />} disabled={!!busy} onClick={() => run('share')}>
          {busy === 'share' ? 'Preparo il PDF…' : 'Condividi PDF'}
        </Button>
      ) : null}
      <div className="flex gap-2.5">
        <Button variant={share ? 'outline' : 'primary'} size="lg" block icon={<Download size={20} />} disabled={!!busy} onClick={() => run('save')}>
          {busy === 'save' ? 'Preparo il PDF…' : 'Salva PDF'}
        </Button>
        {!isNative() && (
          <Button variant="outline" size="lg" icon={<Printer size={20} />} onClick={() => window.print()} aria-label="Stampa">
            <span className="hidden sm:inline">Stampa</span>
          </Button>
        )}
      </div>
      <Button variant="wa" size="lg" block icon={<MessageCircle size={20} strokeWidth={2.2} />} disabled={!waHref} onClick={() => waHref && openExternal(waHref)}>
        Messaggio su WhatsApp
      </Button>
      <p className="text-[13.5px] leading-snug text-ink-3">
        {waNote ||
          (share
            ? 'Con Condividi PDF scegli WhatsApp e il documento arriva già allegato. Il messaggio contiene l’avviso e il riepilogo dei lavori.'
            : 'Salva il PDF e allegalo in WhatsApp con la graffetta. Il messaggio contiene l’avviso e il riepilogo dei lavori.')}
      </p>
    </div>
  );
}
