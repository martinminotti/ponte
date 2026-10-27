import type { ReactNode } from 'react';
import { Drawer } from 'vaul';
import * as Dialog from '@radix-ui/react-dialog';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { useWide } from '@/app/hooks';
import { SPRING } from './motion';

type SheetProps = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
};

/**
 * Telefono: foglio che sale dal basso e si chiude trascinando giù (stile iOS).
 * Schermi larghi: finestra al centro, come su Mac e iPad con tastiera; Esc o clic fuori la chiudono.
 */
export function Sheet(p: SheetProps) {
  const wide = useWide();
  return wide ? <CenterDialog {...p} /> : <BottomSheet {...p} />;
}

function CenterDialog({ open, onOpenChange, title, description, children, footer }: SheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div className="fixed inset-0 z-50 bg-black/30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} />
            </Dialog.Overlay>
            <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center p-6">
              <Dialog.Content asChild forceMount aria-describedby={undefined}>
                <motion.div
                  className="pointer-events-auto flex max-h-[min(720px,88dvh)] w-full max-w-[520px] flex-col rounded-[24px] bg-surface shadow-[0_24px_80px_-12px_rgba(0,0,0,.35),0_0_0_1px_var(--line)] outline-none"
                  initial={{ opacity: 0, scale: 0.96, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97, y: 4, transition: { duration: 0.14 } }}
                  transition={SPRING}
                >
                  <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-2">
                    <div className="min-w-0">
                      <Dialog.Title className="w-wide text-[1.25rem] font-semibold text-ink">{title}</Dialog.Title>
                      {description && <Dialog.Description className="mt-1 text-[0.9062rem] text-ink-2">{description}</Dialog.Description>}
                    </div>
                    <Dialog.Close className="press hit -mr-2 grid size-9 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-surface-2" aria-label="Chiudi">
                      <X size={18} strokeWidth={2.4} />
                    </Dialog.Close>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pt-2 pb-6">{children}</div>
                  {footer && <div className="border-t border-line px-6 py-4">{footer}</div>}
                </motion.div>
              </Dialog.Content>
            </div>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}

function BottomSheet({ open, onOpenChange, title, description, children, footer }: SheetProps) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} repositionInputs={false}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" />
        <Drawer.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] w-full max-w-[560px] flex-col rounded-t-[28px] bg-surface outline-none glass:inset-x-2 glass:bottom-[calc(env(safe-area-inset-bottom,0px)+6px)] glass:w-auto glass:rounded-[34px] glass:bg-[var(--glass-fill-thick)] glass:shadow-[var(--glass-shadow)] glass:backdrop-blur-2xl glass:backdrop-saturate-150 glass:ring-1 glass:ring-white/40 dark:glass:ring-white/10"
        >
          <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-line-strong" aria-hidden="true" />
          <div className="flex items-start justify-between gap-3 px-5 pt-3 pb-2">
            <div className="min-w-0">
              <Drawer.Title className="w-wide text-[1.25rem] font-semibold text-ink">{title}</Drawer.Title>
              {description && <Drawer.Description className="mt-1 text-[0.9062rem] text-ink-2">{description}</Drawer.Description>}
            </div>
            <Drawer.Close className="press hit -mt-0.5 -mr-1 grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-2" aria-label="Chiudi">
              <X size={18} strokeWidth={2.4} />
            </Drawer.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-2 pb-5">{children}</div>
          {footer && (
            <div className="border-t border-line bg-surface px-5 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] glass:rounded-b-[34px] glass:border-transparent glass:bg-transparent glass:pb-[max(12px,calc(env(safe-area-inset-bottom,0px)-6px))]">
              {footer}
            </div>
          )}
          {!footer && <div className="safe-bottom glass:pb-0" />}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
