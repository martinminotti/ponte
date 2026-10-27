import { useState, type ReactNode } from 'react';
import * as DM from '@radix-ui/react-dropdown-menu';
import { motion } from 'motion/react';
import { useWide } from '@/app/hooks';
import { Sheet } from './Sheet';

export type MenuEntry = { icon: ReactNode; label: string; onSelect: () => void; danger?: boolean; separator?: boolean };

/**
 * Menu di azioni. Su telefono un foglio dal basso con voci grandi;
 * su schermi larghi un menu che nasce dal pulsante che lo apre (origine sul pulsante).
 */
export function ActionMenu({ title, items, trigger }: { title: string; items: MenuEntry[]; trigger: (open: () => void) => ReactNode }) {
  const wide = useWide();
  const [open, setOpen] = useState(false);

  if (wide) {
    return (
      <DM.Root open={open} onOpenChange={setOpen} modal={false}>
        <DM.Trigger asChild>
          <span className="inline-flex">{trigger(() => {})}</span>
        </DM.Trigger>
        <DM.Portal>
          <DM.Content align="end" sideOffset={6} collisionPadding={12} asChild>
            <motion.div
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', bounce: 0, duration: 0.22 }}
              style={{ transformOrigin: 'var(--radix-dropdown-menu-content-transform-origin)' }}
              className="z-50 min-w-[240px] rounded-[16px] bg-surface p-1.5 shadow-[0_16px_48px_-8px_rgba(0,0,0,.28),0_0_0_1px_var(--line)] outline-none"
            >
              {items.map((it) => (
                <div key={it.label}>
                  {it.separator && <DM.Separator className="mx-2 my-1.5 h-px bg-line" />}
                  <DM.Item
                    onSelect={it.onSelect}
                    className={`flex h-10 cursor-pointer items-center gap-3 rounded-[10px] px-3 text-[15px] font-medium outline-none select-none data-[highlighted]:bg-surface-2 ${it.danger ? 'text-danger' : 'text-ink'}`}
                  >
                    <span className={it.danger ? 'text-danger' : 'text-ink-2'}>{it.icon}</span>
                    {it.label}
                  </DM.Item>
                </div>
              ))}
            </motion.div>
          </DM.Content>
        </DM.Portal>
      </DM.Root>
    );
  }

  return (
    <>
      {trigger(() => setOpen(true))}
      <Sheet open={open} onOpenChange={setOpen} title={title}>
        <div className="flex flex-col gap-1">
          {items.map((it) => (
            <div key={it.label}>
              {it.separator && <div className="my-2 h-px bg-line" />}
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  it.onSelect();
                }}
                className={`press flex h-14 w-full items-center gap-3.5 rounded-[14px] px-3 text-left text-[16.5px] font-medium hover:bg-surface-2 ${it.danger ? 'text-danger' : 'text-ink'}`}
              >
                <span className={it.danger ? 'text-danger' : 'text-ink-2'}>{it.icon}</span>
                {it.label}
              </button>
            </div>
          ))}
        </div>
      </Sheet>
    </>
  );
}
