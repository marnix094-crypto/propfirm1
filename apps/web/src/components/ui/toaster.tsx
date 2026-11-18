import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';
import { create } from 'zustand';

interface Toast {
  id: number;
  kind: 'success' | 'error' | 'info';
  title: string;
  body?: string;
}

let next = 1;
export const useToasts = create<{
  toasts: Toast[];
  push: (t: Omit<Toast, 'id'>) => void;
  dismiss: (id: number) => void;
}>((set, get) => ({
  toasts: [],
  push: (t) => {
    const id = next++;
    set({ toasts: [...get().toasts.slice(-3), { ...t, id }] });
    setTimeout(() => get().dismiss(id), 5000);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export const toast = (t: Omit<Toast, 'id'>) => useToasts.getState().push(t);

export function Toaster({ closeLabel }: { closeLabel: string }) {
  const { toasts, dismiss } = useToasts();
  return (
    <div
      data-capture-hide
      aria-live="polite"
      className="pointer-events-none fixed inset-x-3 top-3 z-[60] flex flex-col items-center gap-2 sm:inset-x-auto sm:top-auto sm:right-4 sm:bottom-4 sm:items-end"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-[18px] border border-border bg-card p-3.5 shadow-float"
          >
            {t.kind === 'error' ? (
              <AlertCircle className="mt-0.5 size-5 shrink-0 text-loss" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{t.title}</p>
              {t.body && <p className="text-sm text-muted tabular-nums">{t.body}</p>}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label={closeLabel}
              className="rounded-full p-1 text-muted hover:text-fg"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
