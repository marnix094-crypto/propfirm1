import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Crown, Medal } from 'lucide-react';
import { brandPalette, DEFAULT_BRAND_COLOR, isHexColor } from '@/lib/brand-color';
import { useFormat } from '@/hooks/use-format';
import { cn } from '@/lib/cn';
import { useRemaining } from './countdown';
import type { CompeteRound } from './api';

/**
 * White label (D107): the operator's brand colour drives the Compete surface in both themes.
 * Injected as a style element while a Compete page is mounted; the website keeps our brand.
 */
export function useOperatorTheme(color: string | undefined) {
  useEffect(() => {
    if (!color || !isHexColor(color) || color.toLowerCase() === DEFAULT_BRAND_COLOR.toLowerCase())
      return;
    const p = brandPalette(color);
    const base = `--primary:${p.fill};--primary-light:${p.fill};--brand-lime:${p.fill};--btn-primary-from:${p.fill};--btn-primary-to:${p.fill};--btn-primary-fg:${p.onFill};`;
    const el = document.createElement('style');
    el.dataset.competeBrand = '';
    el.textContent =
      `:root[data-theme='dark']{${base}--accent-deep:${p.onInk};--text-link:${p.onInk};--focus-ring:${p.onInk};--brand-on-ink:${p.onInk};--primary-tint:color-mix(in srgb,${p.fill} 24%,transparent);}` +
      `:root[data-theme='light']{${base}--accent-deep:${p.deep};--text-link:${p.deep};--focus-ring:${p.deep};--brand-on-ink:${p.onInk};--primary-tint:${p.tint};}`;
    document.head.appendChild(el);
    return () => el.remove();
  }, [color]);
}

const two = (n: number) => String(n).padStart(2, '0');

/** One-line countdown (`01:23:45`), large; screen readers get a sentence. */
export function Clock({ to, className }: { to: string; className?: string }) {
  const { t } = useTranslation('compete');
  const s = Math.floor(useRemaining(to) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return (
    <span className={cn('font-display font-bold tabular-nums', className)}>
      <span className="sr-only">{t('countdown.sr', { h, m, s: s % 60 })}</span>
      <span aria-hidden="true">
        {h > 0 && `${two(h)}:`}
        {two(m)}:{two(s % 60)}
      </span>
    </span>
  );
}

/** Thin bar: time elapsed in the live round (or nothing before the start). */
export function RoundTimeBar({ round }: { round: CompeteRound }) {
  const left = useRemaining(round.endsAt);
  if (round.status !== 'LIVE') return null;
  const total = Date.parse(round.endsAt) - Date.parse(round.startsAt);
  const done = total > 0 ? Math.min(1, Math.max(0, 1 - left / total)) : 0;
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-border" aria-hidden="true">
      <div
        className="h-full origin-left rounded-full bg-primary transition-transform duration-1000"
        style={{ transform: `scaleX(${done})` }}
      />
    </div>
  );
}

/** Players vs. the minimum needed for the round to go ahead. */
export function PlayersProgress({
  round,
  className,
}: {
  round: Pick<CompeteRound, 'participants' | 'minParticipants'>;
  className?: string;
}) {
  const { t } = useTranslation('compete');
  const { participants: n, minParticipants: min } = round;
  const ok = n >= min;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted">{t('round.participants')}</span>
        <span className="font-semibold tabular-nums">
          {n}
          <span className="font-normal text-muted"> / {min}</span>
        </span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-border"
        role="progressbar"
        aria-label={t('arena.minimumBar', { n: min })}
        aria-valuemin={0}
        aria-valuemax={min}
        aria-valuenow={Math.min(n, min)}
      >
        <div
          className={cn('h-full rounded-full', ok ? 'bg-[var(--profit)]' : 'bg-primary')}
          style={{ width: `${Math.min(100, (n / Math.max(1, min)) * 100)}%` }}
        />
      </div>
      <span className={cn('text-xs', ok ? 'text-profit' : 'text-muted')}>
        {ok ? t('arena.minimumReached') : t('arena.minimumNeeded', { count: min - n })}
      </span>
    </div>
  );
}

/** The three prizes of a round as a compact podium (2 · 1 · 3). */
export function PrizePodium({
  amounts,
  splitBps,
  currency,
  compact = false,
}: {
  amounts: string[];
  /** Shown instead of amounts while the pot is still empty. */
  splitBps: number[];
  currency: string;
  compact?: boolean;
}) {
  const { t } = useTranslation('compete');
  const f = useFormat();
  const empty = amounts.every((a) => a === '0');
  const order = [1, 0, 2].filter((i) => i < Math.max(amounts.length, splitBps.length));
  return (
    <ol className="grid grid-cols-3 items-end gap-2" aria-label={t('arena.prizes')}>
      {order.map((i) => (
        <li
          key={i}
          className={cn(
            'flex flex-col items-center rounded-[14px] border text-center',
            i === 0
              ? 'glow-card-strong border-primary/60 bg-primary-tint/40'
              : 'border-border bg-card-muted/60',
            compact ? 'px-2 py-2' : 'px-3',
            !compact && (i === 0 ? 'py-5' : i === 1 ? 'py-3.5' : 'py-2.5'),
            i === 0 ? 'order-2' : i === 1 ? 'order-1' : 'order-3',
          )}
        >
          {i === 0 ? (
            <Crown className="size-4 text-accent" aria-hidden="true" />
          ) : (
            <Medal className="size-4 text-muted" aria-hidden="true" />
          )}
          <span className="mt-1 text-[11px] font-semibold text-muted">
            {t(`prizes.place${i + 1}`)}
          </span>
          <span
            className={cn(
              'font-display font-bold tabular-nums',
              compact ? 'text-sm' : i === 0 ? 'text-xl' : 'text-base',
            )}
          >
            {empty || amounts[i] === undefined
              ? f.bps(splitBps[i] ?? 0, 0)
              : f.money(amounts[i]!, currency)}
          </span>
        </li>
      ))}
    </ol>
  );
}

export type JourneyStep = 'account' | 'pay' | 'start' | 'trade';
const JOURNEY: JourneyStep[] = ['account', 'pay', 'start', 'trade'];

/** Where the player is: account → payment → start → trading. */
export function Journey({ current }: { current: JourneyStep }) {
  const { t } = useTranslation('compete');
  const at = JOURNEY.indexOf(current);
  return (
    <ol className="grid grid-cols-4 gap-2" aria-label={t('arena.journey')}>
      {JOURNEY.map((s, i) => {
        const done = i < at;
        const active = i === at;
        return (
          <li key={s} className="flex flex-col gap-2" aria-current={active ? 'step' : undefined}>
            <span
              className={cn(
                'h-1 rounded-full',
                done || active ? 'bg-primary' : 'bg-border',
                active && 'opacity-70',
              )}
              aria-hidden="true"
            />
            <span
              className={cn(
                'flex items-center gap-1.5 text-xs font-semibold',
                done ? 'text-fg' : active ? 'text-accent' : 'text-muted',
              )}
            >
              {done && <Check className="size-3.5 text-accent" aria-hidden="true" />}
              <span className="sr-only">
                {done ? t('arena.stepDone') : active ? t('arena.stepNow') : t('arena.stepNext')}
                :{' '}
              </span>
              {t(`arena.steps.${s}`)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Pill with the round status (pulsing dot while live). */
export function StatusPill({ status }: { status: CompeteRound['status'] }) {
  const { t } = useTranslation('compete');
  const live = status === 'LIVE';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold',
        live
          ? 'border-[color-mix(in_srgb,var(--profit)_45%,transparent)] text-profit'
          : 'border-border text-muted',
      )}
    >
      <span className="relative flex size-2" aria-hidden="true">
        {live && (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--profit)] opacity-60 motion-reduce:animate-none" />
        )}
        <span
          className={cn(
            'relative inline-flex size-2 rounded-full',
            live ? 'bg-[var(--profit)]' : 'bg-primary',
          )}
        />
      </span>
      {t(`status.${status}`)}
    </span>
  );
}

/** Signed return in basis points, coloured. */
export function ReturnText({ bps, className }: { bps: string | number; className?: string }) {
  const f = useFormat();
  const v = Number(bps);
  return (
    <span
      className={cn(
        'tabular-nums',
        v > 0 ? 'text-profit' : v < 0 ? 'text-loss' : 'text-muted',
        className,
      )}
    >
      {(v > 0 ? '+' : '') + f.bps(v)}
    </span>
  );
}
