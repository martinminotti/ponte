import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { Camera, CheckCircle2, ChevronRight, Clock, Minus, Plus, Trash2, X } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';
import { GARANZIE, PAGAMENTI, VATS, VOCI_SUGGERITE, statoLabel } from '@/domain/constants';
import { amountInput, eur, fmtDate, fmtDateTime, parseAmount, uid } from '@/domain/format';
import { billingOf, calc, daSaldare, isAz, monthlyPending, sameVehicle, scadenza, totale, withPayment } from '@/domain/logic';
import type { Job, LineItem, Photo, Settings } from '@/domain/types';
import { db } from '@/data/db';
import { addPhoto, mutateJob, removePhoto, saveSettings } from '@/data/repo';
import { useObjectUrl } from '@/app/hooks';
import { compressPhoto } from '@/platform/images';
import { haptic } from '@/platform/native';
import { AutoInput, Button, Field, Note, Section, Segmented, ToggleChip } from '@/ui/controls';
import { StatusPill } from '@/ui/status';

type Up = (fn: (j: Job) => Job) => Promise<void>;
export const updater =
  (id: string): Up =>
  (fn) =>
    mutateJob(id, fn);

/* ---------------- lavori eseguiti e totale ---------------- */

export function ItemsSection({ job, up, settings }: { job: Job; up: Up; settings: Settings }) {
  const [focusId, setFocusId] = useState<string | null>(null);
  const crew = useMemo(() => {
    const a = [...(settings.workers || [])];
    for (const w of [...(job.workers || []), settings.staffName || '']) if (w && !a.includes(w)) a.push(w);
    return a;
  }, [settings.workers, settings.staffName, job.workers]);
  /** Manodopera: ore × tariffa dell'officina, con chi l'ha fatta (di partenza chi usa l'app, o il primo operaio della scheda). */
  const addLabor = () => {
    const id = uid('i');
    const worker = (settings.role === 'staff' && settings.staffName) || job.workers[0] || crew[0] || '';
    const rate = settings.laborRate || 0;
    if (!rate) toast('Tariffa oraria non impostata', { description: 'La imposti una volta in Impostazioni → Valori predefiniti. Intanto scrivi l’importo qui.' });
    up((j) => ({
      ...j,
      workers: worker && !j.workers.includes(worker) ? [...j.workers, worker] : j.workers,
      items: [...j.items, { id, desc: 'Manodopera', kind: 'labor', worker, qty: 1, unit: rate, amount: rate }],
    }));
  };
  const c = calc(job);
  const due = daSaldare(job);
  const used = new Set(job.items.map((i) => i.desc.toLowerCase()));
  const quick = VOCI_SUGGERITE.filter((v) => !used.has(v.toLowerCase())).slice(0, 10);

  const add = (desc = '') => {
    const id = uid('i');
    setFocusId(id);
    up((j) => ({ ...j, items: [...j.items, { id, desc, amount: 0 }] }));
  };
  const setItem = (id: string, patch: Partial<Job['items'][number]>) => up((j) => ({ ...j, items: j.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }));
  const del = (id: string) => {
    haptic('light');
    const prev = job.items;
    up((j) => ({ ...j, items: j.items.filter((i) => i.id !== id) }));
    toast('Voce rimossa', { action: { label: 'Annulla', onClick: () => up((j) => ({ ...j, items: prev })) } });
  };

  return (
    <Section title="Lavori eseguiti" action={<span className="tnum text-[0.875rem] text-ink-3">{job.items.length ? `${job.items.length} ${job.items.length === 1 ? 'voce' : 'voci'}` : ''}</span>}>
      {job.items.length === 0 ? (
        <p className="text-[0.9375rem] text-ink-2">Aggiungi lavori e ricambi con il loro importo: il totale si calcola da solo.</p>
      ) : (
        <ul className="-mt-1 flex flex-col">
          <AnimatePresence initial={false}>
            {job.items.map((it, n) =>
              it.kind === 'labor' ? (
                <motion.li
                  key={it.id}
                  layout
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <LaborRow it={it} n={n} crew={crew} onChange={(patch) => setItem(it.id, patch)} onDelete={() => del(it.id)} />
                </motion.li>
              ) : (
                <motion.li
                  key={it.id}
                  layout
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <div className={`grid grid-cols-[minmax(0,1fr)_108px_40px] items-center gap-2 py-1.5 ${n ? 'border-t border-line' : ''}`}>
                    <AutoInput
                      list="voci"
                      aria-label={`Descrizione voce ${n + 1}`}
                      placeholder="Descrizione"
                      value={it.desc}
                      autoFocus={focusId === it.id && !it.desc}
                      onCommit={(v) => setItem(it.id, { desc: v })}
                      className="!min-h-12 !bg-transparent !px-1 hover:!border-transparent focus:!bg-surface-2 focus:!px-3"
                    />
                    <div className="relative">
                      <AutoInput
                        inputMode="decimal"
                        aria-label={`Importo voce ${n + 1} in euro`}
                        placeholder="0,00"
                        value={amountInput(it.amount)}
                        autoFocus={focusId === it.id && !!it.desc}
                        onCommit={(v) => setItem(it.id, { amount: parseAmount(v) })}
                        className="w-cond tnum !min-h-12 !pr-3 !pl-7 text-right text-[1.125rem] font-semibold"
                      />
                      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[0.9375rem] text-ink-3">€</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => del(it.id)}
                      aria-label={`Rimuovi voce ${n + 1}`}
                      className="press hit grid size-10 place-items-center rounded-full text-ink-3 hover:bg-danger-soft hover:text-danger"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </motion.li>
              ),
            )}
          </AnimatePresence>
        </ul>
      )}
      <datalist id="voci">
        {VOCI_SUGGERITE.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>

      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" icon={<Plus size={18} strokeWidth={2.4} />} onClick={() => add()}>
            Aggiungi voce
          </Button>
          <Button variant="outline" icon={<Clock size={18} strokeWidth={2.2} />} onClick={addLabor}>
            Manodopera
          </Button>
        </div>
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:-mx-5 sm:px-5 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0" aria-label="Voci frequenti">
          {quick.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => add(v)}
              className="press hit h-9 shrink-0 rounded-full bg-surface-2 px-3.5 text-[0.875rem] font-medium text-ink-2 hover:bg-surface-3 hover:text-ink"
            >
              + {v}
            </button>
          ))}
        </div>
      </div>

      <Field label="Acconto già versato" htmlFor="deposit">
        <div className="relative max-w-[220px]">
          <AutoInput id="deposit" inputMode="decimal" placeholder="0,00" value={amountInput(job.deposit)} onCommit={(v) => up((j) => ({ ...j, deposit: parseAmount(v) }))} className="tnum !pl-8" />
          <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-3">€</span>
        </div>
      </Field>

      <dl className="flex flex-col gap-1.5 rounded-[16px] bg-surface-2 p-4 text-[0.9688rem]">
        {isAz(job) && (
          <>
            <Row l="Imponibile" v={eur(c.net)} />
            <Row l={`IVA ${c.rate}%`} v={eur(c.vat)} />
          </>
        )}
        <Row l={isAz(job) ? 'Totale con IVA' : 'Totale lavori'} v={eur(c.gross)} />
        {job.deposit > 0 && <Row l="Acconto versato" v={`− ${eur(job.deposit)}`} />}
        <div className="mt-2 flex items-end justify-between gap-3 border-t border-line pt-3">
          <dt className="font-semibold text-ink">{job.paid ? 'Saldato' : 'Da saldare'}</dt>
          <dd className={`w-cond tnum text-[2.125rem] leading-none font-bold ${job.paid ? 'text-ok' : 'text-ink'}`}>{eur(job.paid ? (job.paidAmount ?? totale(job)) : due)}</dd>
        </div>
      </dl>
    </Section>
  );
}

/** Riga di manodopera: chi l'ha fatta, ore (a mezz'ora) e tariffa. L'importo è ore × tariffa. */
function LaborRow({ it, n, crew, onChange, onDelete }: { it: LineItem; n: number; crew: string[]; onChange: (p: Partial<LineItem>) => void; onDelete: () => void }) {
  const qty = it.qty && it.qty > 0 ? it.qty : 1;
  const unit = it.unit || 0;
  const setQty = (q: number) => {
    const v = Math.max(0.5, Math.round(q * 2) / 2);
    onChange({ qty: v, amount: Math.round(v * unit) });
  };
  return (
    <div className={`flex flex-col gap-2 py-2.5 ${n ? 'border-t border-line' : ''}`}>
      <div className="flex items-center gap-2">
        <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-accent-soft text-accent-ink">
          <Clock size={17} strokeWidth={2.2} />
        </span>
        <span className="text-[0.9688rem] font-semibold text-ink">Manodopera</span>
        <select
          aria-label={`Operatore della voce ${n + 1}`}
          value={it.worker || ''}
          onChange={(e) => onChange({ worker: e.target.value })}
          className="ctl !min-h-10 !w-auto min-w-0 flex-1 !py-0 text-[0.9375rem]"
        >
          <option value="">Chi l'ha fatta?</option>
          {crew.map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Rimuovi voce ${n + 1}`}
          className="press hit grid size-10 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-danger-soft hover:text-danger"
        >
          <Trash2 size={18} />
        </button>
      </div>
      <div className="flex items-center gap-2 pl-10">
        <div className="flex items-center rounded-[12px] bg-surface-2" role="group" aria-label="Ore">
          <button type="button" aria-label="Mezz'ora in meno" onClick={() => setQty(qty - 0.5)} className="press hit grid size-10 place-items-center text-ink-2">
            <Minus size={17} strokeWidth={2.4} />
          </button>
          <span className="tnum w-14 text-center text-[1rem] font-semibold text-ink">{qty.toLocaleString('it-IT')} h</span>
          <button type="button" aria-label="Mezz'ora in più" onClick={() => setQty(qty + 0.5)} className="press hit grid size-10 place-items-center text-ink-2">
            <Plus size={17} strokeWidth={2.4} />
          </button>
        </div>
        <span className="text-ink-3">×</span>
        <div className="relative w-[96px]">
          <AutoInput
            inputMode="decimal"
            aria-label="Tariffa oraria in euro"
            value={amountInput(unit)}
            onCommit={(v) => {
              const u = parseAmount(v);
              onChange({ unit: u, amount: Math.round(qty * u) });
            }}
            className="tnum !min-h-10 !pr-2 !pl-6 text-right"
          />
          <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[0.875rem] text-ink-3">€</span>
        </div>
        <span className="w-cond tnum ml-auto text-[1.125rem] font-semibold text-ink">{eur(it.amount)}</span>
      </div>
    </div>
  );
}

function Row({ l, v }: { l: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-2">{l}</dt>
      <dd className="tnum font-medium text-ink">{v}</dd>
    </div>
  );
}

/* ---------------- pagamento ---------------- */

export function PaymentSection({ job, up, title = 'Pagamento' }: { job: Job; up: Up; title?: string }) {
  const tot = totale(job);
  const due = daSaldare(job);
  if (monthlyPending(job) && !job.paid) {
    return (
      <Section title="Pagamento">
        <Note>Questo lavoro va nella fattura di fine mese della ditta. L'incasso lo segni da Fatture ditte, insieme agli altri lavori del mese.</Note>
        <Button variant="outline" onClick={() => up((j) => ({ ...j, billing: 'singola' }))} className="self-start">
          Fattura subito questo lavoro
        </Button>
      </Section>
    );
  }
  return (
    <Section title={title} id="pagamento">
      {job.paid ? (
        <>
          <div className="flex items-start gap-3 rounded-[16px] bg-ok-soft p-4 text-ok">
            <CheckCircle2 size={24} className="shrink-0" />
            <div>
              <p className="text-[1rem] font-semibold">Incassati {eur(job.paidAmount ?? tot)}</p>
              <p className="text-[0.9062rem] opacity-90">
                {fmtDateTime(job.paidAt)}
                {job.payMethod ? `, ${job.payMethod}` : ''}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="self-start" onClick={() => up((j) => ({ ...j, paid: false, paidAt: undefined, paidAmount: undefined }))}>
            Annulla incasso
          </Button>
        </>
      ) : tot <= 0 ? (
        <p className="text-[0.9375rem] text-ink-2">Inserisci i lavori eseguiti per calcolare quanto incassare.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Metodo di pagamento">
            {PAGAMENTI.map((p) => (
              <ToggleChip key={p} on={job.payMethod === p} onClick={() => up((j) => ({ ...j, payMethod: j.payMethod === p ? '' : p }))}>
                {p}
              </ToggleChip>
            ))}
          </div>
          <Button
            variant="primary"
            size="lg"
            block
            disabled={!job.payMethod}
            onClick={() => {
              haptic('success');
              up((j) => withPayment(j, j.payMethod));
              toast.success(`Incassati ${eur(due)}`, { description: job.status === 'pronto' ? 'Scheda consegnata e archiviata.' : undefined });
            }}
          >
            {due > 0 ? `Incassa ${eur(due)}` : 'Segna come saldato'}
            {job.payMethod ? ` · ${job.payMethod}` : ''}
          </Button>
          {!job.payMethod && <p className="-mt-2 text-[0.875rem] text-ink-3">Scegli prima il metodo di pagamento.</p>}
        </>
      )}
    </Section>
  );
}

/* ---------------- fattura (aziende) ---------------- */

export function InvoiceSection({ job, up }: { job: Job; up: Up }) {
  if (!isAz(job)) return null;
  return (
    <Section title="Fattura">
      <Field label="Aliquota IVA">
        <Segmented label="Aliquota IVA" value={job.vatRate} onChange={(v) => up((j) => ({ ...j, vatRate: v }))} options={VATS.map((v) => ({ v, l: v ? `${v}%` : 'Esente' }))} />
      </Field>
      <Field label="Gli importi inseriti sono">
        <Segmented
          label="Importi con o senza IVA"
          value={job.vatIncl === false ? 'no' : 'si'}
          onChange={(v) => up((j) => ({ ...j, vatIncl: v === 'si' }))}
          options={[
            { v: 'si', l: 'IVA inclusa' },
            { v: 'no', l: 'IVA esclusa' },
          ]}
        />
      </Field>
      <Field label="Quando fatturare">
        <Segmented
          label="Quando fatturare"
          value={billingOf(job)}
          onChange={(v) => up((j) => ({ ...j, billing: v }))}
          options={[
            { v: 'mensile', l: 'A fine mese' },
            { v: 'singola', l: 'Subito' },
          ]}
        />
      </Field>
      <Field label="Numero fattura" htmlFor="invno" hint="Quando l'hai emessa nel gestionale.">
        <AutoInput id="invno" autoComplete="off" placeholder="Es. 2026/118" value={job.invoiceNo} onCommit={(v) => up((j) => ({ ...j, invoiceNo: v }))} />
      </Field>
      {job.invoiced ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[16px] bg-ok-soft p-3.5 pl-4 text-ok">
          <span className="flex items-center gap-2 font-semibold">
            <CheckCircle2 size={20} /> Fattura emessa il {fmtDate(job.invoicedAt)}
          </span>
          <Button size="sm" variant="ghost" className="!text-ok" onClick={() => up((j) => ({ ...j, invoiced: false, invoicedAt: undefined }))}>
            Annulla
          </Button>
        </div>
      ) : (
        <Button
          variant="outline"
          block
          onClick={() => {
            haptic('success');
            up((j) => ({ ...j, invoiced: true, invoicedAt: Date.now() }));
          }}
        >
          Segna fattura emessa
        </Button>
      )}
      <p className="text-[0.8438rem] leading-snug text-ink-3">
        Il conto è un riepilogo per la fattura. La fattura fiscale si emette con il gestionale o il portale di fatturazione elettronica. Verifica le aliquote con il commercialista.
      </p>
    </Section>
  );
}

/* ---------------- garanzia ---------------- */

export function WarrantySection({ job, up }: { job: Job; up: Up }) {
  const txt = !job.warrantyMonths ? 'Nessuna garanzia sul riepilogo.' : `Valida fino al ${fmtDate(scadenza(job))}${job.deliveredAt ? ', dalla consegna.' : '. Si ricalcola alla consegna.'}`;
  return (
    <Section title="Garanzia lavori">
      <Segmented
        size="sm"
        label="Durata garanzia"
        value={job.warrantyMonths || 0}
        onChange={(m) => up((j) => ({ ...j, warrantyMonths: m }))}
        options={GARANZIE.map((g) => ({ v: g.m, l: g.m ? `${g.m} m` : 'No' }))}
      />
      <p className="-mt-1 text-[0.9062rem] text-ink-2">{txt}</p>
      {job.warrantyMonths > 0 && (
        <Field label="Cosa copre (facoltativo)" htmlFor="wnote">
          <AutoInput id="wnote" placeholder="Es. mano d'opera e ricambi montati" value={job.warrantyNote} onCommit={(v) => up((j) => ({ ...j, warrantyNote: v }))} />
        </Field>
      )}
    </Section>
  );
}

/* ---------------- operai ---------------- */

export function WorkersSection({ job, up, settings }: { job: Job; up: Up; settings: Settings }) {
  const [n, setN] = useState('');
  const all = useMemo(() => {
    const a = [...(settings.workers || [])];
    for (const w of job.workers || []) if (!a.includes(w)) a.push(w);
    return a;
  }, [settings.workers, job.workers]);
  const toggle = (w: string) => up((j) => ({ ...j, workers: j.workers.includes(w) ? j.workers.filter((x) => x !== w) : [...j.workers, w] }));
  const addNew = () => {
    const name = n.trim().replace(/\s+/g, ' ');
    if (!name) return;
    const ex = (settings.workers || []).find((w) => w.toLowerCase() === name.toLowerCase());
    if (!ex) saveSettings({ workers: [...(settings.workers || []), name] });
    const nm = ex || name;
    up((j) => ({ ...j, workers: j.workers.includes(nm) ? j.workers : [...j.workers, nm] }));
    setN('');
  };
  return (
    <Section title="Lavoro eseguito da">
      {all.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {all.map((w) => (
            <ToggleChip key={w} on={job.workers.includes(w)} onClick={() => toggle(w)}>
              {w}
            </ToggleChip>
          ))}
        </div>
      ) : (
        <p className="text-[0.9375rem] text-ink-2">Aggiungi chi lavora in officina: lo ritrovi su ogni scheda.</p>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          addNew();
        }}
      >
        <input className="ctl flex-1" placeholder="Nome operaio" aria-label="Nome nuovo operaio" value={n} onChange={(e) => setN(e.target.value)} enterKeyHint="done" />
        <Button type="submit" variant="outline" disabled={!n.trim()}>
          Aggiungi
        </Button>
      </form>
    </Section>
  );
}

/* ---------------- foto ---------------- */

function Thumb({ p, onOpen }: { p: Photo; onOpen: () => void }) {
  const url = useObjectUrl(p.blob);
  return (
    <button type="button" onClick={onOpen} className="press relative aspect-square overflow-hidden rounded-[14px] bg-surface-2" aria-label="Apri foto">
      {url && <img src={url} alt="" className="size-full object-cover" loading="lazy" />}
    </button>
  );
}

function Viewer({ p, onClose }: { p: Photo; onClose: () => void }) {
  const url = useObjectUrl(p.blob);
  return (
    <motion.div className="fixed inset-0 z-[60] flex flex-col bg-black/92" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-label="Foto">
      <div className="flex items-center justify-between px-3 pb-3 pt-[calc(env(safe-area-inset-top,0px)+12px)]">
        <button
          type="button"
          onClick={async () => {
            await removePhoto(p.id);
            onClose();
            toast('Foto eliminata');
          }}
          className="press hit flex h-10 items-center gap-2 rounded-full bg-white/10 px-4 text-[0.9375rem] font-medium text-white"
        >
          <Trash2 size={18} /> Elimina
        </button>
        <button type="button" onClick={onClose} aria-label="Chiudi" className="press hit grid size-10 place-items-center rounded-full bg-white/10 text-white">
          <X size={22} />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-3" onClick={onClose}>
        {url && <img src={url} alt="" className="max-h-full max-w-full rounded-[10px] object-contain" />}
      </div>
      <p className="pb-[calc(env(safe-area-inset-bottom,0px)+16px)] text-center text-[0.8125rem] text-white/60">{fmtDateTime(p.createdAt)}</p>
    </motion.div>
  );
}

export function PhotosSection({ job, bare }: { job: Job; bare?: boolean }) {
  const photos = useLiveQuery(() => db.photos.where('jobId').equals(job.id).sortBy('createdAt'), [job.id], []);
  const [open, setOpen] = useState<Photo | null>(null);
  const [busy, setBusy] = useState(false);
  const inp = useRef<HTMLInputElement>(null);
  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) {
        const { blob, w, h } = await compressPhoto(f);
        await addPhoto(job.id, blob, w, h);
      }
      haptic('success');
    } catch {
      toast.error('Non riesco a usare questa immagine. Prova con una foto JPG o PNG.');
    } finally {
      setBusy(false);
      if (inp.current) inp.current.value = '';
    }
  };
  const grid = (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
      {photos.map((p) => (
        <Thumb key={p.id} p={p} onOpen={() => setOpen(p)} />
      ))}
      <button
        type="button"
        disabled={busy}
        onClick={() => inp.current?.click()}
        className="press flex aspect-square flex-col items-center justify-center gap-1 rounded-[14px] border-[1.5px] border-dashed border-line-strong text-ink-2 hover:border-accent hover:text-accent-ink disabled:opacity-50"
      >
        <Camera size={22} />
        <span className="text-[0.7812rem] font-medium">{busy ? 'Salvo…' : 'Aggiungi'}</span>
      </button>
    </div>
  );
  const extras = (
    <>
      <input ref={inp} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => onFiles(e.target.files)} />
      <AnimatePresence>{open && <Viewer p={open} onClose={() => setOpen(null)} />}</AnimatePresence>
    </>
  );
  if (bare)
    return (
      <div>
        {grid}
        {extras}
      </div>
    );
  return (
    <Section title="Foto all'arrivo" action={photos.length ? <span className="tnum text-[0.875rem] text-ink-3">{photos.length}</span> : undefined}>
      <p className="-mt-1 text-[0.9062rem] text-ink-2">Graffi, ammaccature, cruscotto e chilometri: restano sulla scheda in caso di contestazioni.</p>
      {grid}
      {extras}
    </Section>
  );
}

/* ---------------- cronologia e storico veicolo ---------------- */

export function HistoryList({ job }: { job: Job }) {
  const h = [...(job.history || [])].reverse();
  return (
    <ol className="flex flex-col gap-2.5 border-l-2 border-line pl-4">
      {h.map((x, i) => (
        <li key={i} className="relative text-[0.9062rem]">
          <span className="absolute top-[7px] -left-[21px] size-2 rounded-full" style={{ background: `var(--st-${x.s})` }} />
          <span className="font-medium text-ink">{statoLabel(x.s)}</span> <span className="tnum text-ink-3">{fmtDateTime(x.t)}</span>
        </li>
      ))}
    </ol>
  );
}

export function VehicleHistory({ job, jobs }: { job: Job; jobs: Job[] }) {
  const o = jobs.filter((j) => sameVehicle(j, job));
  if (!o.length) return null;
  return (
    <Section title="Storico del veicolo" action={<span className="tnum text-[0.875rem] text-ink-3">{o.length}</span>}>
      <ul className="-my-1 flex flex-col">
        {o.map((j, i) => (
          <li key={j.id} className={i ? 'border-t border-line' : ''}>
            <Link to={`/job/${j.id}`} replace className="press -mx-2 flex items-center justify-between gap-3 rounded-[12px] px-2 py-3 hover:bg-surface-2">
              <span className="min-w-0">
                <span className="block truncate text-[0.9688rem] font-medium text-ink">{(j.services || []).join(', ') || j.request || 'Intervento'}</span>
                <span className="tnum block text-[0.875rem] text-ink-3">
                  {fmtDate(j.createdAt)}
                  {j.km ? `, ${j.km} km` : ''}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {totale(j) > 0 ? <span className="tnum text-[0.9375rem] font-semibold text-ink">{eur(totale(j))}</span> : <StatusPill s={j.status} size="sm" />}
                <ChevronRight size={18} className="text-ink-3" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}
