import type { ReactNode } from 'react';
import { Drawer } from 'vaul';
import { X } from 'lucide-react';

/** Foglio che sale dal basso (stile iOS), si chiude trascinando giù. Su schermi larghi resta centrato. */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
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
              <Drawer.Title className="w-wide text-[20px] font-semibold text-ink">{title}</Drawer.Title>
              {description && <Drawer.Description className="mt-1 text-[14.5px] text-ink-2">{description}</Drawer.Description>}
            </div>
            <Drawer.Close className="press -mt-0.5 -mr-1 grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-2" aria-label="Chiudi">
              <X size={18} strokeWidth={2.4} />
            </Drawer.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-2 pb-5">{children}</div>
          {footer && <div className="safe-bottom border-t border-line bg-surface px-5 pt-3 pb-3 glass:rounded-b-[34px] glass:border-transparent glass:bg-transparent glass:pb-[max(12px,calc(env(safe-area-inset-bottom,0px)-6px))]">{footer}</div>}
          {!footer && <div className="safe-bottom glass:pb-0" />}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
