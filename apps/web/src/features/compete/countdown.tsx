import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';

/** Milliseconds until `iso`, updated every second (0 when passed). */
export function useRemaining(iso: string | undefined): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return iso ? Math.max(0, Date.parse(iso) - now) : 0;
}

const two = (n: number) => String(n).padStart(2, '0');

/** Countdown as hours / minutes / seconds tiles (screen readers get one sentence). */
export function Countdown({
  to,
  className,
  size = 'lg',
}: {
  to: string;
  className?: string;
  size?: 'lg' | 'sm';
}) {
  const { t } = useTranslation('compete');
  const ms = useRemaining(to);
  const total = Math.floor(ms / 1000);
  const parts = [
    { v: Math.floor(total / 3600), k: 'hours' },
    { v: Math.floor((total % 3600) / 60), k: 'minutes' },
    { v: total % 60, k: 'seconds' },
  ] as const;
  return (
    <div className={cn('flex items-end gap-2', className)}>
      <span className="sr-only">
        {t('countdown.sr', { h: parts[0].v, m: parts[1].v, s: parts[2].v })}
      </span>
      {parts.map((p, i) => (
        <div key={p.k} className="flex items-end gap-2" aria-hidden="true">
          {i > 0 && (
            <span className={cn('pb-5 font-bold text-muted', size === 'sm' && 'pb-3')}>:</span>
          )}
          <div className="flex flex-col items-center">
            <span
              className={cn(
                'rounded-[14px] border border-border bg-card px-3 font-display font-bold tabular-nums',
                size === 'lg' ? 'py-2 text-4xl sm:text-5xl' : 'py-1 text-2xl',
              )}
            >
              {two(p.v)}
            </span>
            <span className="mt-1 text-[11px] font-semibold tracking-wider text-muted uppercase">
              {t(`countdown.${p.k}`)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
