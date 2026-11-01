import { useCallback, useEffect, useState } from 'react';
import { CloudOff, Cloud, CloudUpload, Crown, LogOut, RefreshCw, Share2, Trash2, UserMinus, UserPlus, X } from 'lucide-react';
import { toast } from 'sonner';
import { useMembers } from '@/app/hooks';
import { setDeviceLocalOnly } from '@/app/device';
import { cloudError, createInvite, formatCode, listInvites, removeMember, revokeInvite, setMember, type Invite } from '@/data/cloud/account';
import { deleteMyAccount, leaveDevice, syncNow, useCloud } from '@/data/cloud/session';
import { useSyncStatus } from '@/data/sync/status';
import { haptic, shareText } from '@/platform/native';
import { Button, Field, Input, Note, Section } from '@/ui/controls';
import { Sheet } from '@/ui/Sheet';

const ago = (t?: number) => {
  if (!t) return '';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 45) return 'adesso';
  if (s < 3600) return `${Math.round(s / 60)} min fa`;
  return new Date(t).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
};

/** Pallino di stato: tutto inviato, in invio, senza rete. */
export function SyncLine() {
  const st = useSyncStatus();
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  const offline = st.state === 'offline';
  const err = st.state === 'error';
  const text =
    st.state === 'syncing'
      ? 'Sincronizzo…'
      : offline
        ? st.pending
          ? `Senza rete · ${st.pending} ${st.pending === 1 ? 'modifica' : 'modifiche'} da inviare`
          : 'Senza rete · i dati sono sul dispositivo'
        : err
          ? 'Sincronizzazione in pausa, riprovo'
          : st.pending
            ? `${st.pending} ${st.pending === 1 ? 'modifica' : 'modifiche'} da inviare`
            : `Tutto sincronizzato${st.lastSyncAt ? ` · ${ago(st.lastSyncAt)}` : ''}`;
  return (
    <div className="flex items-center justify-between gap-3">
      <p className={`flex min-w-0 items-center gap-2 text-[0.9062rem] font-medium ${offline || err ? 'text-warn' : 'text-ink-2'}`} aria-live="polite">
        {offline ? <CloudOff size={18} className="shrink-0" /> : st.pending ? <CloudUpload size={18} className="shrink-0" /> : <Cloud size={18} className="shrink-0 text-ok" />}
        <span className="truncate">{text}</span>
      </p>
      <button
        type="button"
        aria-label="Sincronizza ora"
        onClick={() => {
          haptic('light');
          void syncNow();
        }}
        className="press grid size-10 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-surface-2"
      >
        <RefreshCw size={18} className={st.state === 'syncing' ? 'animate-spin' : ''} />
      </button>
    </div>
  );
}

/** Impostazioni con l'officina nel cloud: chi sei, la squadra, gli inviti, uscita ed eliminazione dell'account. */
export function AccountSection() {
  const cloud = useCloud();
  const members = useMembers();
  const w = cloud.workshop!;
  const owner = w.role === 'owner';
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [leave, setLeave] = useState<{ pending: number } | null>(null);
  const [del, setDel] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadInvites = useCallback(() => {
    if (owner) listInvites(w.id).then(setInvites, () => {});
  }, [owner, w.id]);
  useEffect(loadInvites, [loadInvites]);
  const open = invites.filter((i) => !i.usedAt && !i.revokedAt && new Date(i.expiresAt).getTime() > Date.now());

  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      if (ok) toast.success(ok);
      haptic('success');
    } catch (e) {
      toast.error(cloudError(e).message);
    }
  };

  const exit = async (force = false) => {
    setBusy(true);
    const r = await leaveDevice({ signOut: true, force });
    setBusy(false);
    if (r.pending) setLeave(r);
  };

  return (
    <>
      <Section title="Officina">
        <div className="flex items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-[14px] bg-accent-soft text-accent-ink">{owner ? <Crown size={22} /> : <Cloud size={22} />}</span>
          <div className="min-w-0">
            <p className="w-wide truncate text-[1.0625rem] font-semibold text-ink">{w.name || 'La tua officina'}</p>
            <p className="truncate text-[0.875rem] text-ink-2">
              {owner ? 'Titolare' : `Dipendente${w.displayName ? ` · ${w.displayName}` : ''}`} · {cloud.user?.email}
            </p>
          </div>
        </div>
        <SyncLine />
      </Section>

      <Section title="Squadra" action={<span className="tnum text-[0.875rem] text-ink-3">{members.length || ''}</span>}>
        <ul className="flex flex-col divide-y divide-line">
          {members.map((m) => {
            const me = m.userId === cloud.user?.id;
            return (
              <li key={m.userId} className="flex min-h-12 items-center gap-3 py-2">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-[0.875rem] font-semibold text-ink-2">{(m.displayName || '?').slice(0, 1).toUpperCase()}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.9688rem] font-medium text-ink">
                    {m.displayName || 'Senza nome'}
                    {me && <span className="text-ink-3"> (tu)</span>}
                  </span>
                  <span className="block text-[0.8125rem] text-ink-3">{m.role === 'owner' ? 'Titolare' : 'Dipendente'}</span>
                </span>
                {owner && !me && (
                  <>
                    {m.role === 'staff' && (
                      <button
                        type="button"
                        aria-label={`Rendi ${m.displayName} titolare`}
                        onClick={() => act(() => setMember(w.id, m.userId, { role: 'owner' }), `${m.displayName} ora è titolare`)}
                        className="press grid size-10 place-items-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink"
                      >
                        <Crown size={18} />
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label={`Togli ${m.displayName} dall’officina`}
                      onClick={() => act(() => removeMember(w.id, m.userId), `${m.displayName} non fa più parte dell’officina`)}
                      className="press grid size-10 place-items-center rounded-full text-ink-3 hover:bg-danger-soft hover:text-danger"
                    >
                      <UserMinus size={18} />
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
        {owner && (
          <>
            {open.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-[0.8125rem] font-medium text-ink-3">Inviti in attesa</p>
                {open.map((i) => (
                  <div key={i.code} className="flex items-center justify-between gap-2 rounded-[12px] bg-surface-2 py-1.5 pr-1.5 pl-3">
                    <span className="min-w-0 truncate text-[0.9062rem] text-ink">
                      <span className="tnum font-semibold tracking-[0.08em]">{formatCode(i.code)}</span>
                      {i.displayName && <span className="text-ink-2"> · {i.displayName}</span>}
                    </span>
                    <button
                      type="button"
                      aria-label="Revoca l’invito"
                      onClick={() => act(() => revokeInvite(i.code).then(loadInvites), 'Invito revocato')}
                      className="press grid size-9 place-items-center rounded-full text-ink-3 hover:text-danger"
                    >
                      <X size={18} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <Button variant="primary" icon={<UserPlus size={19} />} onClick={() => setInviteOpen(true)}>
              Invita un dipendente
            </Button>
          </>
        )}
      </Section>

      <Section title="Account">
        <div className="flex flex-col gap-2.5 sm:flex-row">
          <Button variant="outline" block icon={<LogOut size={18} />} disabled={busy} onClick={() => exit()}>
            {busy ? 'Invio le ultime modifiche…' : 'Esci da questo dispositivo'}
          </Button>
          <Button variant="ghost" block icon={<Trash2 size={18} />} className="text-danger" onClick={() => setDel(true)}>
            Elimina account
          </Button>
        </div>
      </Section>

      <InviteSheet open={inviteOpen} onOpenChange={setInviteOpen} workshop={w.id} shop={w.name} onCreated={loadInvites} />

      <Sheet
        open={!!leave}
        onOpenChange={(o) => !o && setLeave(null)}
        title="Modifiche non ancora inviate"
        description={`${leave?.pending ?? 0} modifiche fatte su questo dispositivo non sono ancora arrivate al server (manca la rete). Se esci ora, si perdono.`}
      >
        <div className="flex flex-col gap-2.5">
          <Button variant="primary" block onClick={() => setLeave(null)}>
            Resto, riprovo con la rete
          </Button>
          <Button
            variant="danger"
            block
            onClick={async () => {
              setLeave(null);
              await exit(true);
            }}
          >
            Esci comunque
          </Button>
        </div>
      </Sheet>

      <Sheet
        open={del}
        onOpenChange={setDel}
        title="Eliminare l’account?"
        description={
          owner
            ? 'Esci da tutte le officine. Quelle di cui sei l’unico titolare vengono chiuse e i loro dati (schede, foto) cancellati per tutti. Non si può annullare: se ti servono, esporta prima un backup.'
            : 'Esci dall’officina e il tuo account viene cancellato. Le schede dell’officina restano al titolare.'
        }
      >
        <div className="flex flex-col gap-2.5">
          <Button
            variant="danger"
            block
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await deleteMyAccount();
                setDeviceLocalOnly(false);
              } catch (e) {
                toast.error(cloudError(e).message);
                setBusy(false);
              }
            }}
          >
            {busy ? 'Elimino…' : 'Elimina definitivamente'}
          </Button>
          <Button variant="ghost" block onClick={() => setDel(false)}>
            Annulla
          </Button>
        </div>
      </Sheet>
    </>
  );
}

function InviteSheet({ open, onOpenChange, workshop, shop, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; workshop: string; shop: string; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) {
      setName('');
      setCode(null);
    }
  }, [open]);
  const text = code ? `Entra in ${shop || 'officina'} su Ponte: apri l’app, scegli «Ho un codice d’invito» e scrivi ${formatCode(code)}. Il codice vale 7 giorni e si usa una volta.` : '';
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={code ? 'Codice d’invito' : 'Invita un dipendente'}
      description={code ? 'Dallo al dipendente: lo scrive in Ponte al primo accesso. Vale 7 giorni, una volta sola.' : undefined}
    >
      {!code ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              setCode(await createInvite(workshop, name.trim()));
              haptic('success');
              onCreated();
            } catch (err) {
              toast.error(cloudError(err).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Nome del dipendente" htmlFor="inv-name" hint="Facoltativo: se lo scrivi, entra già con questo nome.">
            <Input id="inv-name" autoComplete="off" placeholder="Es. Luca" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Button type="submit" variant="primary" size="lg" block disabled={busy}>
            {busy ? 'Creo il codice…' : 'Crea il codice'}
          </Button>
        </form>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="tnum rounded-[18px] bg-surface-2 py-5 text-center text-[2.25rem] leading-none font-bold tracking-[0.14em] text-ink select-text">{formatCode(code)}</p>
          <Button
            variant="primary"
            size="lg"
            block
            icon={<Share2 size={19} />}
            onClick={async () => {
              const r = await shareText(text, 'Invito a Ponte');
              if (r === 'copied') toast.success('Messaggio copiato');
            }}
          >
            Manda l’invito
          </Button>
          <Note>Chi entra con il codice vede e lavora sulle schede; non può cancellarle né cambiare i dati dell’officina.</Note>
        </div>
      )}
    </Sheet>
  );
}

/** Con l'app tutta sul dispositivo: invito a collegare l'officina al cloud. */
export function ConnectCloudSection() {
  return (
    <Section title="Più dispositivi">
      <p className="text-[0.9375rem] leading-relaxed text-ink-2">
        Collega l’officina al cloud: le schede arrivano su tutti i telefoni e i computer, i dipendenti entrano con un codice e i dati restano al sicuro anche se un telefono si rompe.
      </p>
      <Button variant="primary" icon={<Cloud size={19} />} className="self-start" onClick={() => setDeviceLocalOnly(false)}>
        Collega l’officina
      </Button>
    </Section>
  );
}
