import { useRef, useState, type ReactNode } from 'react';
import { Camera, X } from 'lucide-react';
import { toast } from 'sonner';
import { uid } from '@/domain/format';
import { compressPhoto } from '@/platform/images';

export function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="card flex min-w-0 flex-col gap-4 p-4 sm:p-5">
      <legend className="sr-only">{title}</legend>
      <h3 aria-hidden="true" className="w-semi -mb-0.5 text-[1.0625rem] font-semibold text-ink">
        {title}
      </h3>
      {children}
    </fieldset>
  );
}

/* ---------------- foto all'arrivo (prima che la scheda esista) ---------------- */

export type Shot = { id: string; blob: Blob; w: number; h: number; url: string };

export function PendingPhotos({ list, onChange }: { list: Shot[]; onChange: (l: Shot[]) => void }) {
  const inp = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const add: Shot[] = [];
      for (const f of Array.from(files)) {
        const { blob, w, h } = await compressPhoto(f);
        add.push({ id: uid('s'), blob, w, h, url: URL.createObjectURL(blob) });
      }
      onChange([...list, ...add]);
    } catch {
      toast.error('Non riesco a usare questa immagine. Prova con una foto JPG o PNG.');
    } finally {
      setBusy(false);
      if (inp.current) inp.current.value = '';
    }
  };
  return (
    <Group title="Foto all'arrivo">
      <p className="-mt-1 text-[0.9062rem] text-ink-2">Graffi, ammaccature, cruscotto e chilometri, davanti al cliente: restano sulla scheda in caso di contestazioni.</p>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
        {list.map((p) => (
          <div key={p.id} className="relative aspect-square overflow-hidden rounded-[14px] bg-surface-2">
            <img src={p.url} alt="" className="size-full object-cover" />
            <button
              type="button"
              aria-label="Togli la foto"
              onClick={() => {
                URL.revokeObjectURL(p.url);
                onChange(list.filter((x) => x.id !== p.id));
              }}
              className="press hit absolute top-1 right-1 grid size-7 place-items-center rounded-full bg-black/55 text-white backdrop-blur"
            >
              <X size={15} strokeWidth={2.6} />
            </button>
          </div>
        ))}
        <button
          type="button"
          disabled={busy}
          onClick={() => inp.current?.click()}
          className="press flex aspect-square flex-col items-center justify-center gap-1 rounded-[14px] border-[1.5px] border-dashed border-line-strong text-ink-2 hover:border-accent hover:text-accent-ink disabled:opacity-50"
        >
          <Camera size={22} />
          <span className="text-[0.7812rem] font-medium">{busy ? 'Preparo…' : 'Scatta'}</span>
        </button>
      </div>
      <input ref={inp} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => onFiles(e.target.files)} />
    </Group>
  );
}
