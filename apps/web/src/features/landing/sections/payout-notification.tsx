import { useTranslation } from 'react-i18next';
import { Wallet } from 'lucide-react';
import { FloatingCard } from '@/components/motion/floating-card';
import { IconTile } from '@/components/ui/icon-tile';
import { Badge } from '@/components/ui/badge';
import { usePayoutFeed } from '@/hooks/use-catalog';
import { useFormat } from '@/hooks/use-format';
import { cn } from '@/lib/cn';

/**
 * Shows the most recent REAL anonymised payout from /public/payouts-feed.
 * If there is none (or the feed fails), it shows a static card that is clearly labelled "Example".
 */
export function PayoutNotification({ className }: { className?: string }) {
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const feed = usePayoutFeed();
  if (feed.isPending) return null; // absolutely positioned: no layout shift when it appears

  const latest = feed.data?.items[0];
  const region = (code: string) =>
    new Intl.DisplayNames([i18n.language], { type: 'region' }).of(code) ?? code;

  return (
    <FloatingCard className={cn('w-[17rem]', className)}>
      <div className="flex items-center gap-3" data-testid="payout-notification">
        <IconTile icon={Wallet} size="sm" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">{t('landing.hero.payout.title')}</p>
          {latest ? (
            <p className="text-xs text-muted tabular-nums">
              {f.money(latest.amountMinor, latest.currency)} · {region(latest.countryCode)} ·{' '}
              {f.relativeTime(latest.paidAt)}
            </p>
          ) : (
            <p className="text-xs text-muted tabular-nums">
              {f.money(124_000n, 'USD')} · {t('landing.hero.payout.exampleMeta')}
            </p>
          )}
        </div>
      </div>
      {!latest && (
        <Badge className="mt-3" data-testid="payout-example-badge">
          {t('common.example')}
        </Badge>
      )}
    </FloatingCard>
  );
}
