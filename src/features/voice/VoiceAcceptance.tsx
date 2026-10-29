import { useEffect, useRef, useState, type FormEvent } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, ArrowUp, Keyboard, ListChecks, RotateCcw, Settings2, Sparkles, Undo2, Volume2, VolumeX, X } from 'lucide-react';
import { validate, type Draft, type FieldKey } from '@/domain/draft';
import { haptic } from '@/platform/native';
import { Button } from '@/ui/controls';
import { SPRING, SPRING_FAST } from '@/ui/motion';
import { openAppSettings } from '@/voice/listen';
import type { VoiceHost } from '@/voice/session';
import type { Shot } from '@/features/form/parts';
import { LiveCard } from './LiveCard';
import { Orb, orbLabel } from './Orb';
import { useVoiceSession } from './useVoice';

export interface RestoreOffer {
  label: string;
  onRestore: () => void;
  onDiscard: () => void;
}

/**
 * Accettazione a voce: una schermata, un pulsante.
 * In alto la scheda che si compone; in basso cosa ha capito l'assistente, cosa stai dicendo e il microfono.
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
  /** chiude la voce e torna al modulo, con tutto quello che è stato scritto */
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

  // la riga appena scritta resta in vista, anche se la scheda è lunga
  const first = state?.recent[0];
  useEffect(() => {
    if (!first || !state?.recentAt) return;
    document.querySelector(`[data-vf~="${first}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [first, state?.recentAt]);

  const ready = Object.keys(validate(draft)).length === 0;
  const phase = state?.phase ?? 'idle';
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

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Content asChild forceMount aria-describedby={undefined} onOpenAutoFocus={(e) => e.preventDefault()}>
              <motion.div
                className="fixed inset-0 z-50 flex flex-col bg-bg outline-none"
                initial={{ opacity: 0, y: 28 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 28, transition: { duration: 0.18 } }}
                transition={SPRING}
              >
                {/* testata */}
                <header className="shrink-0 pt-[env(safe-area-inset-top,0px)]">
                  <div className="mx-auto flex h-14 max-w-[680px] items-center gap-2 px-3">
                    <button type="button" onClick={onExit} className="press flex h-11 items-center gap-1.5 rounded-full px-3 text-[1rem] font-medium text-accent-ink hover:bg-surface-2">
                      <X size={20} strokeWidth={2.4} /> Chiudi
                    </button>
                    <Dialog.Title className="min-w-0 flex-1 truncate text-center text-[1rem] font-semibold text-ink">{editing ? 'Modifica a voce' : 'Accettazione a voce'}</Dialog.Title>
                    <button type="button" onClick={onClose} className="press flex h-11 items-center gap-1.5 rounded-full px-3 text-[1rem] font-medium text-accent-ink hover:bg-surface-2">
                      <ListChecks size={20} /> Modulo
                    </button>
                  </div>
                </header>

                {/* scheda che si compone */}
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                  <div className="mx-auto flex max-w-[680px] flex-col gap-3 px-4 pt-1 pb-6">
                    <AnimatePresence initial={false}>
                      {state?.notice && (
                        <motion.div
                          key="notice"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={SPRING_FAST}
                          className="overflow-hidden"
                        >
                          <div className="flex items-start gap-2.5 rounded-[14px] bg-warn-soft px-3.5 py-3 text-[0.9062rem] leading-snug font-medium text-warn" role="status">
                            <AlertTriangle size={18} className="mt-px shrink-0" />
                            <span>{state.notice}</span>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                    {restore && (
                      <div className="flex flex-col gap-3 rounded-[18px] bg-surface p-4 ring-1 ring-line">
                        <p className="text-[0.9688rem] leading-snug text-ink">
                          <span className="font-semibold">Hai un’accettazione non finita.</span> {restore.label}
                        </p>
                        <div className="flex gap-2">
                          <Button variant="primary" size="sm" className="flex-1" icon={<RotateCcw size={17} />} onClick={restore.onRestore}>
                            Riprendila
                          </Button>
                          <Button variant="outline" size="sm" onClick={restore.onDiscard}>
                            Inizia da capo
                          </Button>
                        </div>
                      </div>
                    )}
                    {state && !state.started && <Example />}
                    <LiveCard
                      d={draft}
                      recent={state?.recent ?? []}
                      recentAt={state?.recentAt ?? 0}
                      known={state?.known ?? null}
                      onUseKnown={() => session?.useKnown()}
                      onDismissKnown={() => session?.dismissKnown()}
                      onEdit={onEdit}
                      shots={shots}
                      onShots={onShots}
                    />
                  </div>
                </div>

                {/* conversazione e microfono */}
                <footer className="glass shrink-0 border-t border-line pb-[calc(env(safe-area-inset-bottom,0px)+10px)]">
                  <div className="mx-auto flex max-w-[680px] flex-col items-center px-4 pt-3">
                    {state?.problem ? (
                      <Problem title={state.problem.title} text={state.problem.text} settings={state.problem.settings} retry={state.problem.retry} onRetry={() => session?.start()} onForm={onClose} />
                    ) : (
                      <div className="flex min-h-[64px] w-full flex-col items-center justify-end text-center" aria-live="polite">
                        <AnimatePresence mode="popLayout" initial={false}>
                          <motion.p
                            key={state?.reply.show ?? 'x'}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={SPRING_FAST}
                            className="w-wide max-w-[36ch] text-[1.125rem] leading-snug font-semibold text-balance text-ink"
                          >
                            {state?.reply.show ?? 'Un attimo…'}
                          </motion.p>
                        </AnimatePresence>
                        <p className="mt-1 line-clamp-2 min-h-[1.4em] max-w-[42ch] text-[0.9062rem] leading-snug text-ink-2" aria-live="off">
                          {state?.partial ? `«${state.partial}»` : lastHeard(state?.lines)}
                        </p>
                      </div>
                    )}

                    <div className="mt-1 grid w-full grid-cols-[1fr_auto_1fr] items-center">
                      <div className="flex justify-start">
                        <SideButton label="Annulla" icon={<Undo2 size={22} />} disabled={!state?.canUndo} onClick={() => session?.undo()} />
                      </div>
                      <Orb phase={phase} level={state?.level ?? 0} onPress={() => session?.toggle()} invite={!state?.started} />
                      <div className="flex justify-end gap-1">
                        {state?.canSpeak && session && (
                          <SideButton
                            label={state.speak ? 'Voce sì' : 'Voce no'}
                            icon={state.speak ? <Volume2 size={22} /> : <VolumeX size={22} />}
                            onClick={() => session.setSpeak(!state.speak)}
                            pressed={state.speak}
                          />
                        )}
                        <SideButton label="Scrivi" icon={<Keyboard size={22} />} onClick={() => setTyping((x) => !x)} pressed={typing} />
                      </div>
                    </div>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[0.8438rem] font-medium text-ink-3">
                      {orbLabel(phase)}
                      {state?.mode === 'ai' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[0.75rem] text-ink-2" title="Le frasi sono interpretate dal servizio AI collegato">
                          <Sparkles size={12} /> AI
                        </span>
                      )}
                    </p>

                    <AnimatePresence initial={false}>
                      {typing && (
                        <motion.form
                          key="type"
                          onSubmit={send}
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={SPRING_FAST}
                          className="w-full overflow-hidden"
                        >
                          <div className="relative mt-3">
                            <input
                              ref={inputRef}
                              className="ctl pr-14"
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
                              className="press absolute top-1/2 right-1.5 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-accent text-on-accent disabled:opacity-35"
                            >
                              <ArrowUp size={20} strokeWidth={2.6} />
                            </button>
                          </div>
                        </motion.form>
                      )}
                    </AnimatePresence>

                    <div className="mt-2 w-full">
                      <Button variant={ready ? 'primary' : 'secondary'} size="lg" block onClick={save} disabled={phase === 'saving' || !session}>
                        {editing ? 'Salva modifiche' : ready ? 'Registra accettazione' : 'Registra'}
                      </Button>
                    </div>
                  </div>
                </footer>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}

function lastHeard(lines?: { who: string; text: string }[]): string {
  const u = [...(lines || [])].reverse().find((l) => l.who === 'user');
  return u ? `Ho sentito: «${u.text.length > 90 ? u.text.slice(0, 88) + '…' : u.text}»` : '';
}

function SideButton({ label, icon, onClick, disabled, pressed }: { label: string; icon: React.ReactNode; onClick: () => void; disabled?: boolean; pressed?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      className="press flex h-14 min-w-16 flex-col items-center justify-center gap-0.5 rounded-[16px] px-2 text-ink-2 hover:bg-surface-2 disabled:opacity-35"
    >
      {icon}
      <span className="text-[0.75rem] font-medium">{label}</span>
    </button>
  );
}

function Problem({ title, text, settings, retry, onRetry, onForm }: { title: string; text: string; settings: boolean; retry: boolean; onRetry: () => void; onForm: () => void }) {
  return (
    <div className="flex w-full flex-col items-center pb-1 text-center" role="alert">
      <p className="w-wide text-[1.125rem] font-semibold text-ink">{title}</p>
      <p className="mt-1 max-w-[38ch] text-[0.9375rem] leading-snug text-ink-2">{text}</p>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {settings && (
          <Button size="sm" variant="primary" icon={<Settings2 size={17} />} onClick={openAppSettings}>
            Apri Impostazioni
          </Button>
        )}
        {retry && (
          <Button size="sm" variant={settings ? 'outline' : 'primary'} icon={<RotateCcw size={17} />} onClick={onRetry}>
            Riprova
          </Button>
        )}
        <Button size="sm" variant="outline" icon={<ListChecks size={17} />} onClick={onForm}>
          Usa il modulo
        </Button>
      </div>
    </div>
  );
}

/** come si parla: un esempio vero, prima della prima frase */
function Example() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15, duration: 0.3 }} className="rounded-[18px] border border-dashed border-line-strong px-4 py-3.5">
      <p className="text-[0.8125rem] font-semibold tracking-[0.02em] text-ink-3 uppercase">Prova a dire</p>
      <p className="mt-1 text-[1rem] leading-relaxed text-ink">«Golf grigia, targa GK 482 TR. È di Marco Bianchi, telefono 335 812 4471. Fa rumore ai freni, la vuole venerdì.»</p>
      <p className="mt-2 text-[0.875rem] leading-snug text-ink-2">Puoi dire tutto insieme o un pezzo alla volta. Se sbaglio: «no, la targa è…» oppure «annulla». Alla fine: «registra».</p>
    </motion.div>
  );
}
