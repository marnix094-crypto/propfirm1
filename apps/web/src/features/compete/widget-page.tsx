import { useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import { useFormat } from '@/hooks/use-format';
import { cn } from '@/lib/cn';
import { Leaderboard } from './leaderboard';
import { useCompeteOperator, useCurrentRound, useLeaderboard } from './hooks';
import { Clock, PlayersProgress, PrizePodium, StatusPill, useOperatorTheme } from './arena-ui';
import { ArenaMark } from './layout';
import { useCompeteSession } from './session';

export const WIDGET_KINDS = ['countdown', 'leaderboard', 'join'] as const;
type Kind = (typeof WIDGET_KINDS)[number];

/** Tells the embedding page (compete-embed.js) how tall the widget is. */
function useReportHeight(ref: React.RefObject<HTMLElement | null>, id: string | null) {
  useEffect(() => {
    if (!ref.current || window.parent === window) return;
    const post = () =>
      window.parent.postMessage(
        { type: 'df-compete-widget', id, height: Math.ceil(ref.current!.scrollHeight) },
        '*',
      );
    const ro = new ResizeObserver(post);
    ro.observe(ref.current);
    post();
    return () => ro.disconnect();
  }, [ref, id]);
}

/** Forced theme + transparent page background while a widget is shown. */
function useWidgetChrome(theme: string | null) {
  useEffect(() => {
    const root = document.documentElement;
    const prev = root.dataset.theme;
    if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
    const style = document.createElement('style');
    style.textContent = 'html,body{background:transparent!important}';
    document.head.appendChild(style);
    return () => {
      style.remove();
      if (prev) root.dataset.theme = prev;
    };
  }, [theme]);
}

/**
 * Embeddable widgets for the operator's own website (D108), shown in an iframe by
 * `compete-embed.js`. Public, read-only; links open the full Compete app in the top window.
 */
export function CompeteWidgetPage() {
  const { t } = useTranslation('compete');
  const f = useFormat();
  const { lang, kind: raw } = useParams();
  const [params] = useSearchParams();
  const kind: Kind = (WIDGET_KINDS as readonly string[]).includes(raw ?? '')
    ? (raw as Kind)
    : 'countdown';
  const ref = useRef<HTMLDivElement>(null);
  const status = useCompeteSession((s) => s.status);
  useEffect(() => {
    // Signed-in players (first-party cookie) see "to my dashboard"; everyone else the public data.
    if (status === 'unknown') void useCompeteSession.getState().refresh();
  }, [status]);
  const op = useCompeteOperator();
  const round = useCurrentRound();
  const lb = useLeaderboard(kind === 'leaderboard' ? round.data : undefined);
  useOperatorTheme(op.data?.primaryColor);
  useWidgetChrome(params.get('theme'));
  useReportHeight(ref, params.get('id'));

  const r = round.data;
  const base = `/${lang}/compete`;
  const live = r?.status === 'LIVE';
  const cta = r && (
    <a
      href={r.myEntry ? `${base}/app` : `${base}/register`}
      target="_top"
      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[12px] bg-[linear-gradient(180deg,var(--btn-primary-from),var(--btn-primary-to))] px-5 text-sm font-semibold text-[var(--btn-primary-fg)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:outline-none"
    >
      {live
        ? t('widget.watch')
        : t('cta.join', { fee: f.moneyCompact(r.entryFeeMinor, r.currency) })}
      <ArrowRight className="size-4" aria-hidden="true" />
    </a>
  );

  return (
    <div ref={ref} className="p-1" data-testid={`compete-widget-${kind}`}>
      <title>{t('widget.docTitle', { firm: op.data?.name ?? '' })}</title>
      <div
        className={cn(
          'overflow-hidden rounded-[20px] border border-border bg-card text-fg',
          kind !== 'leaderboard' && 'p-5',
        )}
      >
        {!r || !op.data ? (
          <div className="h-40 animate-pulse rounded-[14px] bg-card-muted motion-reduce:animate-none" />
        ) : kind === 'leaderboard' ? (
          live || r.status === 'SETTLED' ? (
            <Leaderboard
              data={lb.data}
              currency={r.currency}
              loading={lb.isPending}
              limit={5}
              className="rounded-none border-0"
            />
          ) : (
            <div className="flex flex-col gap-4 p-5">
              <div className="flex items-center justify-between gap-3">
                <ArenaMark name={op.data.name} logo={op.data.logoDataUrl} small />
                <StatusPill status={r.status} />
              </div>
              <p className="text-sm text-muted">{t('widget.noLeaderboardYet')}</p>
              <Clock to={r.startsAt} className="text-3xl" />
              {cta}
            </div>
          )
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <ArenaMark name={op.data.name} logo={op.data.logoDataUrl} small />
              <StatusPill status={r.status} />
            </div>
            <div>
              <p className="text-xs font-medium text-muted">
                {live ? t('round.endsIn') : t('round.startsIn')}
              </p>
              <Clock to={live ? r.endsAt : r.startsAt} className="text-4xl" />
            </div>
            {kind === 'countdown' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-medium text-muted">{t('round.pot')}</p>
                    <p className="font-display text-xl font-bold tabular-nums">
                      {f.money(r.potMinor, r.currency)}
                    </p>
                  </div>
                  <PlayersProgress round={r} />
                </div>
                <PrizePodium
                  amounts={r.prizesMinor}
                  splitBps={r.prizeSplitBps}
                  currency={r.currency}
                  compact
                />
              </>
            )}
            {cta}
          </div>
        )}
      </div>
    </div>
  );
}
