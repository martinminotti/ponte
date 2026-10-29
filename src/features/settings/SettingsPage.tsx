import { useEffect, useRef, useState } from 'react';
import { Check, Download, ImagePlus, Pipette, ShieldCheck, Sparkles, Trash2, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { Page } from '@/app/layout';
import { useJobs, useSettings, useWide } from '@/app/hooks';
import { BrandMark } from '@/app/Shell';
import { GARANZIE, PRESETS, VATS } from '@/domain/constants';
import { amountInput, fmtDateTime, parseAmount } from '@/domain/format';
import type { GlassPref, Settings, ThemePref } from '@/domain/types';
import { backupFileName, exportBackup, importBackup } from '@/data/backup';
import { seedDemo } from '@/data/demo';
import { deleteDemo, requestPersistence, saveSettings } from '@/data/repo';
import { readLogo } from '@/platform/images';
import { haptic, saveFile } from '@/platform/native';
import { AutoInput, Button, Field, Note, Section, Segmented } from '@/ui/controls';
import { Sheet } from '@/ui/Sheet';
import { VoiceSettingsSection } from '@/features/voice/VoiceSettings';

export function SettingsPage() {
  const admin = useSettings().role !== 'staff';
  const s = useSettings();
  const jobs = useJobs() || [];
  const wide = useWide();
  const logoIn = useRef<HTMLInputElement>(null);
  const importIn = useRef<HTMLInputElement>(null);
  const [newW, setNewW] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted, () => setPersisted(null));
  }, []);

  const save = (patch: Parameters<typeof saveSettings>[0]) => saveSettings(patch);
  const custom = !PRESETS.some((p) => p.c.toLowerCase() === s.accent.toLowerCase());

  const onLogo = async (f?: File) => {
    if (!f) return;
    try {
      await save({ logo: await readLogo(f) });
      haptic('success');
    } catch {
      toast.error('Non riesco a usare questa immagine. Prova con un PNG o JPG più piccolo.');
    } finally {
      if (logoIn.current) logoIn.current.value = '';
    }
  };

  const addWorker = () => {
    const n = newW.trim().replace(/\s+/g, ' ');
    if (!n) return;
    if (!s.workers.some((w) => w.toLowerCase() === n.toLowerCase())) save({ workers: [...s.workers, n] });
    setNewW('');
  };

  const doExport = async () => {
    try {
      const data = await exportBackup();
      const blob = new Blob([JSON.stringify(data)], {
        type: 'application/json',
      });
      await saveFile(backupFileName(), blob);
      await save({ lastBackupAt: Date.now() });
      toast.success('Backup salvato', {
        description: `${data.jobs.length} schede, ${data.photos.length} foto.`,
      });
    } catch {
      toast.error('Non sono riuscito a creare il backup.');
    }
  };

  const doImport = async (mode: 'merge' | 'replace') => {
    if (!pending) return;
    try {
      const r = await importBackup(pending, mode);
      haptic('success');
      toast.success(mode === 'replace' ? `Archivio sostituito: ${r.added} schede` : `Importate ${r.added} schede nuove, ${r.updated} aggiornate`);
    } catch (e) {
      toast.error((e as Error).message || 'Importazione non riuscita.');
    } finally {
      setPending(null);
    }
  };

  const demoN = jobs.filter((j) => j.demo).length;
  const daysSinceBackup = s.lastBackupAt ? Math.floor((Date.now() - s.lastBackupAt) / 86_400_000) : null;

  return (
    <Page className="pb-safe-bar lg:pb-10">
      <div className="mx-auto max-w-[760px] px-4 lg:px-8 lg:pt-4 xl:max-w-[1240px]">
        {!wide && (
          <header className="pt-[calc(env(safe-area-inset-top,0px)+16px)]">
            <BrandMark />
          </header>
        )}
        <h1 className="w-wide mt-5 text-[1.625rem] font-semibold tracking-[-0.01em] text-ink lg:text-[2.125rem] lg:tracking-[-0.02em]">Impostazioni</h1>
        <p className="mt-1 text-[0.9375rem] text-ink-2">Le modifiche si salvano da sole.</p>

        <div className="mt-5 flex flex-col gap-3 xl:grid xl:grid-cols-2 xl:items-start xl:gap-4">
          <div className="flex flex-col gap-3 xl:gap-4">
            <ProfileSection s={s} />
            {admin && (
              <Section title="Dati dell'officina">
                <div className="flex items-center gap-4">
                  <span className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-[18px] bg-white p-2 ring-1 ring-line">
                    {s.logo ? <img src={s.logo} alt="Logo dell'officina" className="max-h-full max-w-full object-contain" /> : <ImagePlus size={28} className="text-[#8a929c]" />}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => logoIn.current?.click()}>
                      {s.logo ? 'Cambia logo' : 'Carica logo'}
                    </Button>
                    {s.logo && (
                      <Button variant="ghost" size="sm" onClick={() => save({ logo: '' })}>
                        Rimuovi
                      </Button>
                    )}
                  </div>
                  <input ref={logoIn} type="file" accept="image/*" hidden onChange={(e) => onLogo(e.target.files?.[0])} />
                </div>
                <Field label="Nome officina" htmlFor="s-shop" hint="Compare in alto, sui documenti e firma i messaggi WhatsApp.">
                  <AutoInput id="s-shop" placeholder="Es. Autofficina Rossi" value={s.shop} onCommit={(v) => save({ shop: v.trim() })} />
                </Field>
                <Field label="Indirizzo" htmlFor="s-addr">
                  <AutoInput id="s-addr" placeholder="Via, CAP, città" value={s.shopAddr} onCommit={(v) => save({ shopAddr: v.trim() })} />
                </Field>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Partita IVA o COE" htmlFor="s-vat">
                    <AutoInput id="s-vat" className="tnum" value={s.shopVat} onCommit={(v) => save({ shopVat: v.trim() })} />
                  </Field>
                  <Field label="Telefono" htmlFor="s-phone">
                    <AutoInput id="s-phone" type="tel" inputMode="tel" value={s.shopPhone} onCommit={(v) => save({ shopPhone: v.trim() })} />
                  </Field>
                </div>
              </Section>
            )}

            {admin && <VoiceSettingsSection s={s} />}

            <Section title="Aspetto">
              <Field label="Colore dei documenti" hint="Il colore di intestazione e totali sul conto e sui PDF. L'app resta arancio Ponte.">
                <div className="flex flex-wrap gap-3" role="radiogroup" aria-label="Colore">
                  {PRESETS.map((p) => {
                    const on = p.c.toLowerCase() === s.accent.toLowerCase();
                    return (
                      <button
                        key={p.c}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        aria-label={p.n}
                        title={p.n}
                        onClick={() => {
                          save({ accent: p.c });
                        }}
                        className="press grid size-11 place-items-center rounded-full text-white"
                        style={{
                          background: p.c,
                          boxShadow: on ? `0 0 0 3px var(--surface), 0 0 0 5px ${p.c}` : 'inset 0 0 0 1px rgba(0,0,0,.08)',
                        }}
                      >
                        {on && <Check size={20} strokeWidth={3} />}
                      </button>
                    );
                  })}
                  <label
                    className="press relative grid size-11 cursor-pointer place-items-center rounded-full text-white"
                    title="Colore personalizzato"
                    style={{
                      background: custom ? s.accent : 'conic-gradient(#e53935,#fdd835,#43a047,#1e88e5,#8e24aa,#e53935)',
                      boxShadow: custom ? `0 0 0 3px var(--surface), 0 0 0 5px ${s.accent}` : undefined,
                    }}
                  >
                    {custom ? <Check size={20} strokeWidth={3} /> : <Pipette size={18} />}
                    <input
                      type="color"
                      aria-label="Colore personalizzato"
                      value={s.accent}
                      onChange={(e) => save({ accent: e.target.value })}
                      className="absolute inset-0 size-full cursor-pointer opacity-0"
                    />
                  </label>
                </div>
              </Field>
              <Field label="Tema">
                <Segmented<ThemePref>
                  label="Tema"
                  value={s.theme}
                  onChange={(v) => save({ theme: v })}
                  options={[
                    { v: 'system', l: 'Automatico' },
                    { v: 'light', l: 'Chiaro' },
                    { v: 'dark', l: 'Scuro' },
                  ]}
                />
              </Field>
              <Field label="Vetro liquido" hint="Barre e comandi traslucidi in stile iOS. Automatico: attivo su iPhone e iPad.">
                <Segmented<GlassPref>
                  label="Vetro liquido"
                  value={s.glass || 'auto'}
                  onChange={(v) => save({ glass: v })}
                  options={[
                    { v: 'auto', l: 'Automatico' },
                    { v: 'on', l: 'Sempre' },
                    { v: 'off', l: 'Mai' },
                  ]}
                />
              </Field>
            </Section>
          </div>
          <div className="flex flex-col gap-3 xl:gap-4">
            {admin && (
              <Section title="Operai" action={<span className="tnum text-[0.875rem] text-ink-3">{s.workers.length || ''}</span>}>
                {s.workers.length > 0 ? (
                  <ul className="flex flex-wrap gap-2">
                    {s.workers.map((w, i) => (
                      <li key={w} className="flex h-10 items-center gap-1 rounded-full bg-surface-2 pr-1 pl-4 text-[0.9375rem] font-medium text-ink">
                        {w}
                        <button
                          type="button"
                          aria-label={`Rimuovi ${w}`}
                          onClick={() => save({ workers: s.workers.filter((_, k) => k !== i) })}
                          className="press hit grid size-8 place-items-center rounded-full text-ink-3 hover:bg-surface-3 hover:text-danger"
                        >
                          <X size={16} />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[0.9375rem] text-ink-2">Chi lavora in officina: li segni su ogni scheda e compaiono sul conto.</p>
                )}
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    addWorker();
                  }}
                >
                  <input className="ctl flex-1" placeholder="Nome operaio" aria-label="Nome nuovo operaio" value={newW} onChange={(e) => setNewW(e.target.value)} />
                  <Button type="submit" variant="outline" disabled={!newW.trim()}>
                    Aggiungi
                  </Button>
                </form>
              </Section>
            )}

            {admin && (
              <Section title="Valori predefiniti">
                <Field label="Prefisso telefonico" htmlFor="s-prefix" hint="39 per l'Italia, 378 per San Marino. Si usa per i numeri scritti senza +.">
                  <div className="relative max-w-[160px]">
                    <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-3">+</span>
                    <AutoInput id="s-prefix" inputMode="numeric" className="tnum !pl-7" value={s.prefix} onCommit={(v) => save({ prefix: v.replace(/\D/g, '') || '39' })} />
                  </div>
                </Field>
                <Field label="Garanzia sulle nuove schede">
                  <Segmented
                    size="sm"
                    label="Garanzia predefinita"
                    value={s.warranty}
                    onChange={(m) => save({ warranty: m })}
                    options={GARANZIE.map((g) => ({
                      v: g.m,
                      l: g.m ? `${g.m} m` : 'No',
                    }))}
                  />
                </Field>
                <Field label="Tariffa oraria manodopera" htmlFor="s-rate" hint="Si usa per le voci di manodopera: ore × tariffa. Si può cambiare voce per voce.">
                  <div className="relative max-w-[200px]">
                    <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-3">€</span>
                    <AutoInput
                      id="s-rate"
                      inputMode="decimal"
                      placeholder="0,00"
                      className="tnum !pr-12 !pl-8"
                      value={amountInput(s.laborRate || 0)}
                      onCommit={(v) => save({ laborRate: parseAmount(v) })}
                    />
                    <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-ink-3">/ ora</span>
                  </div>
                </Field>
                <Field label="IVA per le aziende" hint="22% Italia, 17% San Marino. Si cambia anche scheda per scheda.">
                  <Segmented size="sm" label="IVA predefinita" value={s.vat} onChange={(v) => save({ vat: v })} options={VATS.map((v) => ({ v, l: v ? `${v}%` : 'Esente' }))} />
                </Field>
              </Section>
            )}

            {admin && (
              <Section title="Archivio e backup">
                <dl className="grid grid-cols-2 gap-3">
                  <div className="rounded-[14px] bg-surface-2 p-3.5">
                    <dt className="text-[0.8125rem] text-ink-3">Schede</dt>
                    <dd className="w-cond tnum text-[1.625rem] leading-tight font-bold text-ink">{jobs.length}</dd>
                  </div>
                  <div className="rounded-[14px] bg-surface-2 p-3.5">
                    <dt className="text-[0.8125rem] text-ink-3">Ultimo backup</dt>
                    <dd className="mt-1 text-[0.9375rem] font-semibold text-ink">{s.lastBackupAt ? fmtDateTime(s.lastBackupAt) : 'Mai'}</dd>
                  </div>
                </dl>
                {(daysSinceBackup === null || daysSinceBackup > 7) && jobs.length > 0 && (
                  <Note tone="warn">L'archivio è salvato solo su questo dispositivo. Fai un backup ogni settimana e tienilo su un altro dispositivo o nel cloud.</Note>
                )}
                <div className="flex flex-col gap-2.5 sm:flex-row">
                  <Button variant="primary" block icon={<Download size={19} />} onClick={doExport}>
                    Esporta backup
                  </Button>
                  <Button variant="outline" block icon={<Upload size={19} />} onClick={() => importIn.current?.click()}>
                    Importa backup
                  </Button>
                </div>
                <input
                  ref={importIn}
                  type="file"
                  accept="application/json,.json"
                  hidden
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) setPending(await f.text());
                    e.target.value = '';
                  }}
                />
                {persisted === false && (
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await requestPersistence();
                      setPersisted(ok);
                      toast[ok ? 'success' : 'message'](ok ? 'Archivio protetto' : 'Il browser non ha concesso la protezione. Installa l’app sulla schermata Home e riprova.');
                    }}
                    className="press flex items-center gap-2 self-start text-[0.9062rem] font-semibold text-accent-ink"
                  >
                    <ShieldCheck size={18} /> Proteggi l'archivio dalla pulizia automatica del browser
                  </button>
                )}
                {persisted && (
                  <p className="flex items-center gap-2 text-[0.875rem] text-ok">
                    <ShieldCheck size={17} /> Archivio protetto dalla pulizia automatica.
                  </p>
                )}
                <div className="h-px bg-line" />
                {demoN > 0 ? (
                  <Button variant="danger" icon={<Trash2 size={18} />} className="self-start" onClick={async () => toast(`${await deleteDemo()} schede di esempio eliminate`)}>
                    Elimina le {demoN} schede di esempio
                  </Button>
                ) : (
                  <Button variant="ghost" icon={<Sparkles size={18} />} className="self-start" onClick={async () => toast.success(`${await seedDemo()} schede di esempio caricate`)}>
                    Carica schede di esempio
                  </Button>
                )}
              </Section>
            )}

            <p className="px-1 pt-2 pb-4 text-[0.8125rem] leading-relaxed text-ink-3">
              Ponte {__APP_VERSION__}. I documenti generati sono riepiloghi, non fatture: la fattura fiscale va emessa con il gestionale o il portale di fatturazione elettronica. Le aliquote IVA
              proposte vanno verificate con il commercialista.
            </p>
          </div>
        </div>
      </div>

      <Sheet open={!!pending} onOpenChange={(o) => !o && setPending(null)} title="Importa backup" description="Come vuoi usare il file?">
        <div className="flex flex-col gap-2.5">
          <button type="button" onClick={() => doImport('merge')} className="press rounded-[16px] bg-surface-2 p-4 text-left hover:bg-surface-3">
            <span className="block text-[1rem] font-semibold text-ink">Unisci all'archivio</span>
            <span className="block text-[0.9062rem] text-ink-2">Aggiunge le schede nuove e aggiorna quelle modificate più di recente nel file.</span>
          </button>
          <button type="button" onClick={() => doImport('replace')} className="press rounded-[16px] bg-danger-soft p-4 text-left">
            <span className="block text-[1rem] font-semibold text-danger">Sostituisci tutto</span>
            <span className="block text-[0.9062rem] text-danger/80">Cancella l'archivio di questo dispositivo e carica solo il file.</span>
          </button>
        </div>
      </Sheet>
    </Page>
  );
}

/** Chi sta usando l'app su questo dispositivo, e il PIN del titolare. */
function ProfileSection({ s }: { s: Settings }) {
  const admin = s.role !== 'staff';
  return (
    <Section title="Profilo">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 text-[0.9688rem] text-ink">
          {admin ? (
            <>
              Stai usando Ponte come <span className="font-semibold">titolare</span>.
            </>
          ) : (
            <>
              Stai usando Ponte come <span className="font-semibold">{s.staffName || 'dipendente'}</span> (dipendente).
            </>
          )}
        </p>
        <Button variant="outline" size="sm" onClick={() => window.dispatchEvent(new Event('ro:profile'))}>
          Cambia
        </Button>
      </div>
      {admin && (
        <Field
          label="PIN del titolare"
          htmlFor="s-pin"
          hint={s.adminPin ? 'Chi entra come titolare deve scriverlo. Cancellalo per toglierlo.' : 'Facoltativo: 4 cifre per non far entrare i dipendenti come titolare.'}
        >
          <AutoInput
            id="s-pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            placeholder="4 cifre"
            className="tnum max-w-[160px] tracking-[0.4em]"
            value={s.adminPin || ''}
            onCommit={(v) => {
              const p = v.replace(/\D/g, '').slice(0, 4);
              if (!p) saveSettings({ adminPin: undefined }).then(() => toast('PIN tolto'));
              else if (p.length === 4) saveSettings({ adminPin: p }).then(() => toast.success('PIN impostato'));
            }}
          />
        </Field>
      )}
    </Section>
  );
}
