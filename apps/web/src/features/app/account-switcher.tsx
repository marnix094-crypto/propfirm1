import { useState } from 'react';
import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, Sparkles } from 'lucide-react';
import { Sheet } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/feedback';
import { useAccounts, useActiveAccount } from '@/hooks/use-trading';
import { useFormat } from '@/hooks/use-format';
import { useTradingUi } from '@/stores/trading';
import { cn } from '@/lib/cn';

const initials = (kind: string) => kind.slice(0, 2);

export function AccountSwitcher({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { lang } = useParams();
  const f = useFormat();
  const [open, setOpen] = useState(false);
  const accounts = useAccounts();
  const { account } = useActiveAccount();
  const setActive = useTradingUi((s) => s.setActiveAccount);

  if (!account) return <Skeleton className={cn('h-10 w-44 rounded-full', className)} />;

  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title={t('app.account.title')}
      closeLabel={t('common.close')}
      trigger={
        <button
          type="button"
          aria-label={t('app.account.switch')}
          className={cn(
            'inline-flex h-10 max-w-full items-center gap-2 rounded-full border border-border bg-card py-1 pr-3 pl-1 text-sm font-semibold transition-colors hover:border-border-strong',
            className,
          )}
        >
          <span className="inline-flex size-8 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--primary-light),var(--accent-deep))] text-xs font-bold text-white">
            {initials(account.kind)}
          </span>
          <span className="truncate">{account.label}</span>
          <ChevronDown className="size-4 shrink-0 text-muted" aria-hidden="true" />
        </button>
      }
    >
      <ul className="flex flex-col gap-2" aria-label={t('app.account.title')}>
        {(accounts.data ?? []).map((a) => {
          const active = a.id === account.id;
          return (
            <li key={a.id}>
              <button
                type="button"
                aria-current={active ? 'true' : undefined}
                onClick={() => {
                  setActive(a.id);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center gap-3 rounded-[18px] border p-3.5 text-left transition-colors',
                  active
                    ? 'border-primary bg-primary-tint/30'
                    : 'border-border hover:border-border-strong',
                )}
              >
                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--primary-light),var(--accent-deep))] text-sm font-bold text-white">
                  {initials(a.kind)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 font-semibold">
                    {a.label} <Badge variant="simulated">{t(`app.account.kinds.${a.kind}`)}</Badge>
                  </span>
                  <span className="block text-sm text-muted tabular-nums">
                    {f.money(a.equityMinor, a.currency)} · {t('app.account.virtual')}
                  </span>
                </span>
                {active && <Check className="size-5 text-accent" aria-hidden="true" />}
              </button>
            </li>
          );
        })}
      </ul>
      <a
        href={`/${lang}#pricing`}
        className="mt-4 flex items-center gap-3 rounded-[18px] border border-dashed border-border-strong p-3.5 transition-colors hover:bg-primary-tint/20"
      >
        <Sparkles className="size-5 shrink-0 text-accent" aria-hidden="true" />
        <span>
          <span className="block font-semibold">{t('app.account.getFunded')}</span>
          <span className="block text-sm text-muted">{t('app.account.getFundedBody')}</span>
        </span>
      </a>
    </Sheet>
  );
}
