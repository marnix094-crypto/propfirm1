import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/feedback';
import { usePerformance } from '@/hooks/use-trading';
import { useFormat } from '@/hooks/use-format';
import { cn } from '@/lib/cn';

/** Current month and day in Europe/Amsterdam (the trading-day time zone, D10). */
export function amsterdamToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Amsterdam',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Monday-first weeks: leading blanks before day 1, trailing blanks to complete the grid. */
export function calendarWeeks<T>(month: string, days: T[]): (T | null)[][] {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const cells: (T | null)[] = [...Array<null>(lead).fill(null), ...days];
  while (cells.length % 7) cells.push(null);
  const weeks: (T | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

const abs = (v: bigint) => (v < 0n ? -v : v);

/** Daily PnL calendar: every day of the month, tinted by result, with weekly totals. */
export function PnlCalendar({ accountId, currency }: { accountId: string; currency: string }) {
  const { t } = useTranslation();
  const f = useFormat();
  const [today] = useState(amsterdamToday);
  const thisMonth = today.slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const perf = usePerformance(accountId, month);
  const cal = perf.data?.calendar;

  const weekdays = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(f.locale, { weekday: 'short', timeZone: 'UTC' });
    // 2024-01-01 was a Monday.
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(Date.UTC(2024, 0, 1 + i))));
  }, [f.locale]);
  const title = useMemo(() => {
    const [y, m] = month.split('-').map(Number) as [number, number];
    return new Intl.DateTimeFormat(f.locale, {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(y, m - 1, 1)));
  }, [month, f.locale]);

  const maxAbs = useMemo(
    () =>
      (cal?.days ?? []).reduce(
        (mx, d) => (abs(BigInt(d.pnlMinor)) > mx ? abs(BigInt(d.pnlMinor)) : mx),
        0n,
      ),
    [cal],
  );
  const money = (m: bigint | string, sign = true) =>
    f.money(m, currency, {
      notation: 'compact',
      ...(sign ? { signDisplay: 'exceptZero' as const } : {}),
    });
  const tint = (pnl: bigint) => {
    if (pnl === 0n || maxAbs === 0n) return undefined;
    // 10–40% tint, proportional to the day's share of the month's largest move.
    const pct = 10 + Number((abs(pnl) * 30n) / maxAbs);
    return {
      backgroundColor: `color-mix(in srgb, var(${pnl > 0n ? '--profit' : '--loss'}) ${pct}%, transparent)`,
    };
  };

  const summary: [string, string, string?][] = cal
    ? [
        [
          t('dashboard.calendar.net'),
          money(cal.netMinor),
          BigInt(cal.netMinor) >= 0n ? 'text-profit' : 'text-loss',
        ],
        [t('dashboard.calendar.greenDays'), String(cal.greenDays)],
        [t('dashboard.calendar.redDays'), String(cal.redDays)],
        [t('dashboard.calendar.bestDay'), cal.bestDayMinor ? money(cal.bestDayMinor) : '—'],
        [t('dashboard.calendar.worstDay'), cal.worstDayMinor ? money(cal.worstDayMinor) : '—'],
      ]
    : [];

  return (
    <Card padding="none" data-testid="pnl-calendar">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <h2 className="text-sm font-semibold">{t('dashboard.calendar.title')}</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
            aria-label={t('dashboard.calendar.prev')}
            className="inline-flex size-8 items-center justify-center rounded-sm text-muted hover:bg-card-muted hover:text-fg"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </button>
          <p className="min-w-36 text-center text-sm font-medium capitalize" aria-live="polite">
            {title}
          </p>
          <button
            type="button"
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
            disabled={month >= thisMonth}
            aria-label={t('dashboard.calendar.next')}
            className="inline-flex size-8 items-center justify-center rounded-sm text-muted hover:bg-card-muted hover:text-fg disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {!cal ? (
        <Skeleton className="m-5 h-72" />
      ) : (
        <div className="p-3 sm:p-5">
          <dl className="mb-4 grid grid-cols-2 gap-x-6 gap-y-2 px-1 text-sm sm:grid-cols-5">
            {summary.map(([k, v, cls]) => (
              <div key={k}>
                <dt className="text-xs text-muted">{k}</dt>
                <dd className={cn('font-semibold tabular-nums', cls)}>{v}</dd>
              </div>
            ))}
          </dl>
          <table className="w-full table-fixed border-separate border-spacing-1">
            <caption className="sr-only">
              {t('dashboard.calendar.title')} — {title}
            </caption>
            <thead>
              <tr>
                {weekdays.map((d) => (
                  <th
                    key={d}
                    scope="col"
                    className="pb-1 text-left text-[11px] font-medium text-muted uppercase"
                  >
                    {d}
                  </th>
                ))}
                <th
                  scope="col"
                  className="hidden pb-1 text-right text-[11px] font-medium text-muted uppercase md:table-cell"
                >
                  {t('dashboard.calendar.week')}
                </th>
              </tr>
            </thead>
            <tbody>
              {calendarWeeks(month, cal.days).map((week, i) => {
                const total = week.reduce((s, d) => s + (d ? BigInt(d.pnlMinor) : 0n), 0n);
                const active = week.some((d) => d && (d.trades > 0 || d.pnlMinor !== '0'));
                return (
                  <tr key={i}>
                    {week.map((d, j) => {
                      if (!d) return <td key={j} aria-hidden="true" />;
                      const pnl = BigInt(d.pnlMinor);
                      const isToday = d.date === today;
                      const future = d.date > today;
                      return (
                        <td
                          key={d.date}
                          data-testid={`day-${d.date}`}
                          style={tint(pnl)}
                          className={cn(
                            'h-14 rounded-sm border border-border p-1.5 align-top sm:h-20 sm:p-2',
                            pnl === 0n && !future && 'bg-card-muted',
                            future && 'border-dashed bg-transparent',
                            isToday && 'border-primary',
                          )}
                        >
                          <span className="block text-[11px] leading-none text-muted tabular-nums">
                            {Number(d.date.slice(8))}
                          </span>
                          {(pnl !== 0n || d.trades > 0) && (
                            <span className="mt-1 block truncate text-[11px] font-semibold tabular-nums sm:mt-2 sm:text-sm">
                              {money(pnl)}
                            </span>
                          )}
                          {d.trades > 0 && (
                            <span className="hidden text-[11px] text-muted sm:block">
                              {t('dashboard.calendar.trades', { count: d.trades })}
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="hidden pl-2 text-right align-middle md:table-cell">
                      <span
                        className={cn(
                          'text-sm font-semibold tabular-nums',
                          !active ? 'text-muted' : total >= 0n ? 'text-profit' : 'text-loss',
                        )}
                      >
                        {active ? money(total) : '—'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
