import { Fragment, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, ArrowUp, Camera, History, Keyboard, ListChecks, RotateCcw, Settings2, Undo2, Volume2, VolumeX, X } from 'lucide-react';
import { toast } from 'sonner';
import { validate, type Draft, type FieldKey } from '@/domain/draft';
import { uid } from '@/domain/format';
import { veic } from '@/domain/logic';
import type { Job } from '@/domain/types';
import { compressPhoto } from '@/platform/images';
import { haptic } from '@/platform/native';
import { Button } from '@/ui/controls';
import { SPRING, SPRING_FAST } from '@/ui/motion';
import { openAppSettings } from '@/voice/listen';
import type { VoiceHost } from '@/voice/session';
import type { Shot } from '@/features/form/parts';
import { LiveCard } from './LiveCard';
import { Orb } from './Orb';
import { useVoiceSession } from './useVoice';

export interface RestoreOffer {
  label: string;
  onRestore: () => void;
  onDiscard: () => void;
}

/**
 * Accettazione a voce. Mentre si parla si guarda la scheda, non si legge:
 * in alto solo cerchi di vetro (esci, voce, modulo), al centro la scheda che si compone,
 * in basso una riga sola (la domanda, o quello che stai dicendo) e il microfono.
 * La bozza è la stessa del modulo: si passa dall'una all'altro senza perdere niente.
 */
export function VoiceAcceptance({
  open,
  draft,
  host,
  editing,
  onClose,
  onExit,
  onEdit,
  shots,
  onShots,
  words,
  restore,
}: {
  open: boolean;
  draft: Draft;
  host: VoiceHost;
  editing: boolean;
  /** torna al modulo, con tutto quello che è stato scritto */
  onClose: () => void;
  /** esce dall'accettazione (la bozza resta da riprendere) */
  onExit: () => void;
  onEdit: (f: FieldKey) => void;
  shots?: Shot[];
  onShots?: (l: Shot[]) => void;
  words: string[];
  restore?: RestoreOffer | null;
}) {
  const { session, state } = useVoiceSession(open, host, words);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const photoIn = useRef<HTMLInputElement>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const lastAt = useRef(0);

  // un tocco leggero quando l'assistente scrive nella scheda: si sente che è successo qualcosa
  useEffect(() => {
    if (state?.recentAt && state.recentAt !== lastAt.current) {
      lastAt.current = state.recentAt;
      haptic('light');
    }
  }, [state?.recentAt]);

  useEffect(() => {
    if (state?.problem && !state.problem.retry) setTyping(true);
  }, [state?.problem]);

  // un colpo leggero quando il microfono si apre dopo un tocco (non a ogni giro di conversazione)
  const prevPhase = useRef(state?.phase);
  useEffect(() => {
    const p = prevPhase.current;
    prevPhase.current = state?.phase;
    if (state?.phase === 'listening' && (p === 'starting' || p === 'paused' || p === 'idle' || p === 'error')) haptic('light');
  }, [state?.phase]);

  // la riga appena scritta resta in vista, anche se la scheda è lunga
  const first = state?.recent[0];
  useEffect(() => {
    if (!first || !state?.recentAt) return;
    document.querySelector(`[data-vf~="${first}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [first, state?.recentAt]);

  const ready = editing || Object.keys(validate(draft)).length === 0;
  const phase = state?.phase ?? 'idle';
  const problem = state?.problem ?? null;

  const send = (e?: FormEvent) => {
    e?.preventDefault();
    const t = text.trim();
    if (!t || !session) return;
    session.submitText(t);
    setText('');
    inputRef.current?.focus();
  };
  const save = () => {
    haptic('medium');
    void session?.save();
  };
  const onPhotos = async (files: FileList | null) => {
    if (!files?.length || !shots || !onShots) return;
    setPhotoBusy(true);
    try {
      const add: Shot[] = [];
      for (const f of Array.from(files)) {
        const { blob, w, h } = await compressPhoto(f);
        add.push({ id: uid('s'), blob, w, h, url: URL.createObjectURL(blob) });
      }
      onShots([...shots, ...add]);
      haptic('success');
    } catch {
      toast.error('Non riesco a usare questa foto.');
    } finally {
      setPhotoBusy(false);
      if (photoIn.current) photoIn.current.value = '';
    }
  };

  // una riga sola: quello che stai dicendo, altrimenti la domanda dell'assistente
  const line = state?.partial
    ? { k: 'p', t: state.partial, you: true }
    : { k: state?.reply.show ?? '', t: phase === 'paused' && !state?.reply.show.startsWith('In pausa') ? 'In pausa' : (state?.reply.show ?? ''), you: false };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Content asChild forceMount aria-describedby={undefined} onOpenAutoFocus={(e) => e.preventDefault()}>
              <motion.div
                className="fixed inset-0 z-50 bg-bg outline-none"
                initial={{ opacity: 0, y: 28 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 28, transition: { duration: 0.18 } }}
                transition={SPRING}
              >
                {/* la scheda scorre sotto i comandi di vetro */}
                <div className="absolute inset-0 overflow-y-auto overscroll-contain">
                  <div className="mx-auto flex max-w-[560px] flex-col gap-3 px-4 pt-[calc(env(safe-area-inset-top,0px)+72px)] pb-[calc(env(safe-area-inset-bottom,0px)+300px)]">
                    <AnimatePresence initial={false}>
                      {state?.notice && (
                        <motion.div
                          key="notice"
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          transition={SPRING_FAST}
                          className="flex justify-center"
                          role="status"
                        >
                          <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-warn-soft px-3 py-1.5 text-[0.8438rem] font-semibold text-warn">
                            <AlertTriangle size={15} className="shrink-0" />
                            <span className="truncate">{state.notice}</span>
                          </span>
                        </motion.div>
                      )}
                      {state?.known && (
                        <Offer
                          key="known"
                          icon={<History size={20} />}
                          title="Già visto in officina"
                          sub={knownWho(state.known)}
                          action="Usa i dati"
                          onAction={() => session?.useKnown()}
                          onDismiss={() => session?.dismissKnown()}
                        />
                      )}
                      {restore && !state?.known && (
                        <Offer
                          key="restore"
                          icon={<RotateCcw size={20} />}
                          title="Accettazione non finita"
                          sub={restore.label}
                          action="Riprendi"
                          onAction={restore.onRestore}
                          onDismiss={restore.onDiscard}
                        />
                      )}
                    </AnimatePresence>
                    <LiveCard d={draft} recent={state?.recent ?? []} recentAt={state?.recentAt ?? 0} onEdit={onEdit} shots={shots} onShots={onShots} />
                  </div>
                </div>

                {/* testata: tre cerchi di vetro */}
                <header className="pointer-events-none absolute inset-x-0 top-0 pt-[env(safe-area-inset-top,0px)]">
                  <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-bg via-bg/85 to-transparent" />
                  <div className="relative mx-auto flex h-[60px] max-w-[560px] items-center gap-2 px-3">
                    <Circle label="Esci" onClick={onExit}>
                      <X size={22} strokeWidth={2.4} />
                    </Circle>
                    <Dialog.Title className="min-w-0 flex-1 truncate text-center text-[1rem] font-semibold text-ink">{editing ? 'Modifica a voce' : 'A voce'}</Dialog.Title>
                    {state?.canSpeak && session && (
                      <Circle label={state.speak ? 'Togli la voce' : 'Rimetti la voce'} pressed={state.speak} onClick={() => session.setSpeak(!state.speak)}>
                        {state.speak ? <Volume2 size={21} /> : <VolumeX size={21} />}
                      </Circle>
                    )}
                    <Circle label="Apri il modulo" onClick={onClose}>
                      <ListChecks size={21} />
                    </Circle>
                  </div>
                </header>

                {/* in basso: una riga, il microfono, e «Registra» quando la scheda è pronta */}
                <footer className="pointer-events-none absolute inset-x-0 bottom-0 pb-[calc(env(safe-area-inset-bottom,0px)+8px)]">
                  <div aria-hidden="true" className="absolute inset-x-0 -top-10 bottom-0 bg-gradient-to-t from-bg via-bg/92 to-transparent" />
                  <div className="relative mx-auto flex max-w-[560px] flex-col items-center px-3">
                    {problem ? (
                      <div className="pointer-events-auto flex w-full flex-col items-center px-2 pb-1 text-center" role="alert">
                        <p className="w-wide text-[1.125rem] font-semibold text-ink">{problem.title}</p>
                        <p className="mt-0.5 line-clamp-2 max-w-[36ch] text-[0.9062rem] leading-snug text-ink-2">{problem.text}</p>
                        <div className="mt-3 flex flex-wrap justify-center gap-2">
                          {problem.settings && (
                            <Button size="sm" variant="primary" icon={<Settings2 size={17} />} onClick={openAppSettings}>
                              Apri Impostazioni
                            </Button>
                          )}
                          {!typing && (
                            <Button size="sm" variant="secondary" icon={<Keyboard size={17} />} onClick={() => setTyping(true)}>
                              Scrivi
                            </Button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex min-h-[3.75rem] w-full items-end justify-center px-4 text-center" aria-live="polite">
                        <AnimatePresence mode="popLayout" initial={false}>
                          <motion.p
                            key={line.k}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={SPRING_FAST}
                            className={
                              line.you
                                ? 'line-clamp-2 max-w-[32ch] text-[1.0625rem] leading-snug font-medium text-ink-2'
                                : 'w-wide line-clamp-2 max-w-[24ch] text-[1.3125rem] leading-tight font-semibold text-balance text-ink'
                            }
                          >
                            {line.you ? <LiveWords text={line.t} /> : line.t}
                          </motion.p>
                        </AnimatePresence>
                      </div>
                    )}

                    <div className="pointer-events-auto mt-1 flex items-center justify-center gap-7">
                      <Circle size="lg" label="Annulla l’ultima modifica" disabled={!state?.canUndo} onClick={() => session?.undo()}>
                        <Undo2 size={23} />
                      </Circle>
                      <Orb phase={phase} level={state?.level ?? 0} hearing={!!state?.partial} onPress={() => session?.toggle()} invite={!state?.started} />
                      {shots && onShots ? (
                        <Circle size="lg" label={photoBusy ? 'Preparo la foto' : 'Foto all’arrivo'} disabled={photoBusy} onClick={() => photoIn.current?.click()} badge={shots.length || undefined}>
                          <Camera size={23} />
                        </Circle>
                      ) : (
                        <Circle size="lg" label="Scrivi" pressed={typing} onClick={() => setTyping((x) => !x)}>
                          <Keyboard size={22} />
                        </Circle>
                      )}
                    </div>

                    <AnimatePresence initial={false}>
                      {typing && (
                        <motion.form
                          key="type"
                          onSubmit={send}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 8 }}
                          transition={SPRING_FAST}
                          className="pointer-events-auto mt-2 w-full"
                        >
                          <div className="glass relative rounded-[30px] p-1.5">
                            <input
                              ref={inputRef}
                              className="h-12 w-full rounded-[24px] bg-transparent pr-14 pl-4 text-[1rem] text-ink outline-none placeholder:text-ink-3"
                              placeholder="Scrivi come parleresti…"
                              autoComplete="off"
                              enterKeyHint="send"
                              value={text}
                              onChange={(e) => setText(e.target.value)}
                              aria-label="Frase per l’assistente"
                            />
                            <button
                              type="submit"
                              aria-label="Invia"
                              disabled={!text.trim()}
                              className="press absolute top-1/2 right-2.5 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-accent text-on-accent disabled:opacity-35"
                            >
                              <ArrowUp size={20} strokeWidth={2.6} />
                            </button>
                          </div>
                        </motion.form>
                      )}
                    </AnimatePresence>

                    <AnimatePresence initial={false}>
                      {ready && (
                        <motion.div
                          key="save"
                          initial={{ opacity: 0, y: 16, scale: 0.97 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 16, scale: 0.97 }}
                          transition={SPRING}
                          className="pointer-events-auto mt-2 w-full"
                        >
                          <div className="glass rounded-[30px] p-1.5">
                            <Button variant="primary" size="lg" block onClick={save} disabled={phase === 'saving' || !session} className="!rounded-[24px]">
                              {editing ? 'Salva modifiche' : 'Registra accettazione'}
                            </Button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </footer>
                {shots && onShots && <input ref={photoIn} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => onPhotos(e.target.files)} />}
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}

/**
 * Quello che stai dicendo, parola per parola: ogni parola nuova emerge da una leggera sfocatura,
 * così si vede che il telefono ti sta seguendo. Le correzioni del riconoscimento cambiano la parola senza scatti.
 */
function LiveWords({ text }: { text: string }) {
  const words = text.split(/\s+/).filter(Boolean);
  // sullo schermo solo la coda della frase: mentre si parla conta l'ultima parola
  const from = Math.max(0, words.length - 14);
  return (
    <span>
      {from > 0 && '… '}
      {words.slice(from).map((w, i) => (
        <Fragment key={from + i}>
          <motion.span
            className="inline-block"
            initial={{ opacity: 0, y: 3, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
          >
            {w}
          </motion.span>{' '}
        </Fragment>
      ))}
    </span>
  );
}

function knownWho(j: Job): string {
  const who = (j.client === 'azienda' ? j.company?.name : j.owner)?.replace(/\.+$/, '');
  return [veic(j), who].filter(Boolean).join(' · ');
}

/** cerchio di vetro, come i comandi della testata nel resto dell'app */
function Circle({
  label,
  onClick,
  children,
  disabled,
  pressed,
  size = 'md',
  badge,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
  pressed?: boolean;
  size?: 'md' | 'lg';
  badge?: number;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      className={`glass press pointer-events-auto relative grid shrink-0 place-items-center rounded-full text-ink disabled:opacity-35 ${size === 'lg' ? 'size-[54px]' : 'size-11'}`}
    >
      {children}
      {badge ? <span className="tnum absolute -top-0.5 -right-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[0.75rem] font-bold text-on-accent">{badge}</span> : null}
    </button>
  );
}

/** proposta in una riga: veicolo già visto, bozza da riprendere */
function Offer({ icon, title, sub, action, onAction, onDismiss }: { icon: ReactNode; title: string; sub: string; action: string; onAction: () => void; onDismiss: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={SPRING_FAST}
      className="flex items-center gap-3 rounded-[20px] bg-accent-soft py-2.5 pr-2 pl-4"
      role="status"
    >
      <span className="shrink-0 text-accent-ink">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.9375rem] font-semibold text-ink">{title}</span>
        <span className="block truncate text-[0.8438rem] text-ink-2">{sub}</span>
      </span>
      <Button size="sm" variant="primary" onClick={onAction}>
        {action}
      </Button>
      <button type="button" aria-label="No, grazie" onClick={onDismiss} className="press hit grid size-9 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-black/5">
        <X size={18} strokeWidth={2.4} />
      </button>
    </motion.div>
  );
}
