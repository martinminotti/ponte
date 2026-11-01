import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Building2, KeyRound, LogOut, Store, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { useLiveQuery } from 'dexie-react-hooks';
import { cloudError, createWorkshop, joinWorkshop, myWorkshops, sendCode, signOut, verifyCode, type WorkshopRef } from '@/data/cloud/account';
import { afterSignIn, clearNotice, linkWorkshop, useCloud } from '@/data/cloud/session';
import { exportBackup, backupFileName } from '@/data/backup';
import { getSettings, localJobCount, saveSettings } from '@/data/repo';
import { setDeviceLocalOnly } from '@/app/device';
import { haptic, saveFile } from '@/platform/native';
import { configureBar, nativeBarAvailable } from '@/platform/nativeBar';
import { PonteIcon, PonteWordmark } from '@/ui/Brand';
import { Button, Field, Input, Note, Switch } from '@/ui/controls';
import { SPRING } from '@/ui/motion';
import { Back, Tile } from '@/features/welcome/parts';
import { OtpInput } from './OtpInput';

type Step = 'email' | 'code' | 'choose' | 'create' | 'join';

/** si parte dalla propria sezione: Oggi per il titolare, Schede per il dipendente */
const home = (role: 'owner' | 'staff') => {
  window.location.hash = role === 'staff' ? '#/schede' : '#/';
};

/**
 * Ingresso con l'officina nel cloud.
 * Email → codice di 6 cifre (niente password da ricordare) → officina: una delle proprie, una nuova (titolare),
 * oppure quella di un invito (dipendente). Chi preferisce può restare tutto sul dispositivo, come prima.
 */
export function AccountGate() {
  const cloud = useCloud();
  const [step, setStep] = useState<Step>(cloud.phase === 'choosing' ? 'choose' : 'email');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const dir = useRef(1);

  useEffect(() => {
    if (nativeBarAvailable()) configureBar({ mode: 'hidden' }, document.documentElement.dataset.theme === 'dark');
  }, []);
  useEffect(() => {
    if (cloud.phase === 'choosing' && (step === 'email' || step === 'code')) go('choose');
    if (cloud.phase === 'signed-out' && step !== 'email' && step !== 'code') go('email');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloud.phase]);

  const go = (s: Step, back = false) => {
    dir.current = back ? -1 : 1;
    setErr(null);
    setStep(s);
  };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      haptic('warning');
      setErr(cloudError(e).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col bg-bg px-5 pt-[calc(env(safe-area-inset-top,0px)+36px)] pb-[calc(env(safe-area-inset-bottom,0px)+20px)]">
      <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col">
        <div className="flex flex-col items-center text-center">
          <PonteIcon size={64} />
          <PonteWordmark height={27} className="mt-3.5 text-ink" />
        </div>

        {cloud.notice && (
          <div className="mt-6">
            <Note tone="warn">
              <span className="flex items-start justify-between gap-3">
                {cloud.notice}
                <button type="button" onClick={clearNotice} className="press shrink-0 font-semibold underline underline-offset-2">
                  Ok
                </button>
              </span>
            </Note>
          </div>
        )}

        <div className="relative mt-8 flex-1">
          <AnimatePresence mode="popLayout" initial={false} custom={dir.current}>
            <motion.div
              key={step}
              custom={dir.current}
              variants={{ in: (d: number) => ({ opacity: 0, x: 40 * d }), at: { opacity: 1, x: 0 }, out: (d: number) => ({ opacity: 0, x: -40 * d }) }}
              initial="in"
              animate="at"
              exit="out"
              transition={SPRING}
              className="flex flex-col gap-3"
            >
              {step === 'email' && (
                <EmailStep
                  email={email}
                  setEmail={setEmail}
                  busy={busy}
                  err={err}
                  onSend={() =>
                    run(async () => {
                      await sendCode(email);
                      go('code');
                    })
                  }
                />
              )}
              {step === 'code' && (
                <CodeStep
                  email={email}
                  busy={busy}
                  err={err}
                  onBack={() => go('email', true)}
                  onResend={() =>
                    run(async () => {
                      await sendCode(email);
                      toast.success('Codice inviato di nuovo');
                    })
                  }
                  onVerify={(c) =>
                    run(async () => {
                      const u = await verifyCode(email, c);
                      haptic('success');
                      await afterSignIn(u);
                    })
                  }
                />
              )}
              {step === 'choose' && <ChooseStep onCreate={() => go('create')} onJoin={() => go('join')} />}
              {step === 'create' && <CreateStep onBack={() => go('choose', true)} />}
              {step === 'join' && <JoinStep onBack={() => go('choose', true)} />}
            </motion.div>
          </AnimatePresence>
        </div>

        {(step === 'email' || step === 'code') && (
          <button type="button" onClick={() => setDeviceLocalOnly(true)} className="press mx-auto mt-6 h-11 px-4 text-[0.9375rem] font-medium text-ink-2">
            Usa Ponte solo su questo dispositivo
          </button>
        )}
      </div>
    </div>
  );
}

function Title({ children, sub }: { children: string; sub?: string }) {
  return (
    <div className="mb-1">
      <h1 className="w-wide text-[1.5rem] leading-tight font-semibold text-ink">{children}</h1>
      {sub && <p className="mt-1.5 text-[0.9688rem] leading-snug text-ink-2">{sub}</p>}
    </div>
  );
}

function EmailStep({ email, setEmail, busy, err, onSend }: { email: string; setEmail: (v: string) => void; busy: boolean; err: string | null; onSend: () => void }) {
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        if (ok && !busy) onSend();
      }}
    >
      <Title sub="Le schede su tutti i telefoni e i computer dell’officina, sempre al sicuro. Ti mandiamo un codice: niente password da ricordare.">Entra nella tua officina</Title>
      <Field label="Email" htmlFor="acc-email" error={err ?? undefined}>
        <Input
          id="acc-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="send"
          placeholder="nome@esempio.it"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <Button type="submit" variant="primary" size="lg" block disabled={!ok || busy}>
        {busy ? 'Invio il codice…' : 'Ricevi il codice'}
      </Button>
    </form>
  );
}

function CodeStep({ email, busy, err, onBack, onResend, onVerify }: { email: string; busy: boolean; err: string | null; onBack: () => void; onResend: () => void; onVerify: (c: string) => void }) {
  const [code, setCode] = useState('');
  const [wait, setWait] = useState(45);
  useEffect(() => {
    const t = setInterval(() => setWait((w) => Math.max(0, w - 1)), 1000);
    return () => clearInterval(t);
  }, []);
  // un codice sbagliato si cancella, pronto per riscriverlo
  useEffect(() => {
    if (err) setCode('');
  }, [err]);
  return (
    <>
      <Back onClick={onBack} />
      <Title sub={`L’abbiamo mandato a ${email.trim()}. Se non lo vedi, guarda nella posta indesiderata.`}>Scrivi il codice</Title>
      <OtpInput value={code} onChange={setCode} onComplete={onVerify} disabled={busy} invalid={!!err} />
      {err && <p className="text-center text-[0.9375rem] font-medium text-danger">{err}</p>}
      {busy && <p className="text-center text-[0.9375rem] text-ink-2">Controllo…</p>}
      <button
        type="button"
        disabled={wait > 0 || busy}
        onClick={() => {
          setWait(45);
          onResend();
        }}
        className="press mx-auto mt-1 h-11 px-4 text-[0.9375rem] font-semibold text-accent-ink disabled:text-ink-3"
      >
        {wait > 0 ? `Invia di nuovo fra ${wait} s` : 'Invia di nuovo il codice'}
      </button>
    </>
  );
}

function ChooseStep({ onCreate, onJoin }: { onCreate: () => void; onJoin: () => void }) {
  const cloud = useCloud();
  const [list, setList] = useState<WorkshopRef[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = () => {
    setErr(null);
    myWorkshops().then(setList, (e) => setErr(cloudError(e).message));
  };
  useEffect(load, []);
  const open = async (w: WorkshopRef) => {
    setBusy(w.id);
    try {
      home(w.role);
      await linkWorkshop(w, { upload: false });
      haptic('success');
    } catch (e) {
      setErr(cloudError(e).message);
      setBusy(null);
    }
  };
  return (
    <>
      <Title sub={cloud.user?.email}>{list?.length ? 'Le tue officine' : 'Ci sei quasi'}</Title>
      {err && (
        <Note tone="danger">
          {err}{' '}
          <button type="button" className="font-semibold underline" onClick={load}>
            Riprova
          </button>
        </Note>
      )}
      {list === null && !err && <div className="h-[76px] animate-pulse rounded-[18px] bg-surface-2" />}
      {list?.map((w) => (
        <Tile
          key={w.id}
          icon={<Store size={24} />}
          title={busy === w.id ? 'Apro…' : w.name || 'Officina senza nome'}
          text={w.role === 'owner' ? 'Titolare' : `Dipendente${w.displayName ? ` · ${w.displayName}` : ''}`}
          onClick={() => !busy && open(w)}
          accent
        />
      ))}
      {list && (
        <>
          {list.length > 0 && <p className="mt-3 px-1 text-[0.875rem] font-medium text-ink-3">Oppure</p>}
          <Tile icon={<Building2 size={24} />} title="Crea la tua officina" text="Sei il titolare: poi inviti i dipendenti" onClick={onCreate} accent={!list.length} />
          <Tile icon={<KeyRound size={24} />} title="Ho un codice d’invito" text="Te l’ha dato il titolare: entri come dipendente" onClick={onJoin} />
        </>
      )}
      <button type="button" onClick={() => void signOut()} className="press mx-auto mt-4 flex h-11 items-center gap-2 px-4 text-[0.9375rem] font-medium text-ink-2">
        <LogOut size={17} /> Esci da {cloud.user?.email || 'questo account'}
      </button>
    </>
  );
}

/** schede vere (non di esempio) già su questo dispositivo */
function useLocalJobs(): number {
  return useLiveQuery(localJobCount, [], 0);
}

function CreateStep({ onBack }: { onBack: () => void }) {
  const local = useLocalJobs();
  const [shop, setShop] = useState('');
  const [me, setMe] = useState('');
  const [upload, setUpload] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    getSettings().then((s) => setShop((v) => v || s.shop));
  }, []);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!shop.trim() || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const s = await getSettings();
      await saveSettings({ shop: shop.trim() });
      const id = await createWorkshop(me.trim(), { shop: shop.trim(), shopAddr: s.shopAddr, shopVat: s.shopVat, shopPhone: s.shopPhone, prefix: s.prefix });
      home('owner');
      await linkWorkshop({ id, name: shop.trim(), role: 'owner', displayName: me.trim() }, { upload: upload && local > 0 });
      haptic('success');
      toast.success('Officina creata', { description: 'Ora puoi invitare i dipendenti da Impostazioni.' });
    } catch (e2) {
      setErr(cloudError(e2).message);
      setBusy(false);
    }
  };
  return (
    <form className="flex flex-col gap-3" onSubmit={submit}>
      <Back onClick={onBack} />
      <Title sub="Sarai il titolare: vedi tutto e decidi chi entra.">La tua officina</Title>
      <Field label="Nome dell’officina" htmlFor="acc-shop">
        <Input id="acc-shop" autoComplete="organization" placeholder="Es. Autofficina Guidi" value={shop} onChange={(e) => setShop(e.target.value)} />
      </Field>
      <Field label="Il tuo nome" htmlFor="acc-me" hint="Lo vedono i tuoi dipendenti.">
        <Input id="acc-me" autoComplete="name" placeholder="Es. Mario Guidi" value={me} onChange={(e) => setMe(e.target.value)} />
      </Field>
      {local > 0 && (
        <div className="card p-3.5">
          <Switch
            checked={upload}
            onChange={setUpload}
            label={`Porta le ${local} schede di questo dispositivo`}
            description={upload ? 'Con numeri, foto e impostazioni: le ritrovi su tutti i dispositivi.' : 'Si parte da un archivio vuoto: le schede di questo dispositivo vengono tolte.'}
          />
        </div>
      )}
      {err && <Note tone="danger">{err}</Note>}
      <Button type="submit" variant="primary" size="lg" block disabled={!shop.trim() || busy}>
        {busy ? 'Creo l’officina…' : 'Crea officina'}
      </Button>
    </form>
  );
}

function JoinStep({ onBack }: { onBack: () => void }) {
  const local = useLocalJobs();
  const [code, setCode] = useState('');
  const [me, setMe] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const clean = code
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
  const shown = clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (clean.length !== 8 || !me.trim() || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const id = await joinWorkshop(clean, me.trim());
      if (!id) {
        haptic('warning');
        setErr('Codice non valido o già usato. Chiedine uno nuovo al titolare.');
        setBusy(false);
        return;
      }
      const w = (await myWorkshops()).find((x) => x.id === id);
      home('staff');
      await linkWorkshop(w ?? { id, name: '', role: 'staff', displayName: me.trim() }, { upload: false });
      haptic('success');
    } catch (e2) {
      setErr(cloudError(e2).message);
      setBusy(false);
    }
  };
  const backup = async () => {
    try {
      await saveFile(backupFileName(), new Blob([JSON.stringify(await exportBackup())], { type: 'application/json' }));
      toast.success('Backup salvato');
    } catch {
      toast.error('Non sono riuscito a creare il backup.');
    }
  };
  return (
    <form className="flex flex-col gap-3" onSubmit={submit}>
      <Back onClick={onBack} />
      <Title sub="Il titolare lo crea in Impostazioni → Squadra.">Codice d’invito</Title>
      <Field label="Codice" htmlFor="acc-code">
        <Input
          id="acc-code"
          autoCapitalize="characters"
          autoComplete="one-time-code"
          spellCheck={false}
          placeholder="ABCD-2345"
          className="tnum text-center text-[1.375rem] font-semibold tracking-[0.18em] uppercase"
          value={shown}
          onChange={(e) => setCode(e.target.value)}
        />
      </Field>
      <Field label="Il tuo nome" htmlFor="acc-name" hint="Compare sulle schede e sulla manodopera che segni.">
        <Input id="acc-name" autoComplete="given-name" placeholder="Es. Luca" value={me} onChange={(e) => setMe(e.target.value)} />
      </Field>
      {local > 0 && (
        <Note tone="warn" icon={<UserPlus size={18} />}>
          Le {local} schede di questo dispositivo non entrano nell’officina e verranno tolte.{' '}
          <button type="button" onClick={backup} className="font-semibold underline underline-offset-2">
            Salva prima un backup
          </button>
        </Note>
      )}
      {err && <Note tone="danger">{err}</Note>}
      <Button type="submit" variant="primary" size="lg" block disabled={clean.length !== 8 || !me.trim() || busy}>
        {busy ? 'Entro…' : 'Entra nell’officina'}
      </Button>
    </form>
  );
}
