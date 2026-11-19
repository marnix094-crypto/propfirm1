import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, CircleDashed, Copy, Loader2, MinusCircle, RefreshCw, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useFormat } from '@/hooks/use-format';
import type { DomainSetup, ProvisioningStep } from '@/hooks/use-admin';
import { cn } from '@/lib/cn';

const STEP_ICON = {
  DONE: { icon: Check, cls: 'text-profit' },
  SKIPPED: { icon: MinusCircle, cls: 'text-muted' },
  WAITING: { icon: CircleDashed, cls: 'text-warn' },
  PENDING: { icon: CircleDashed, cls: 'text-muted' },
  RUNNING: { icon: Loader2, cls: 'text-accent motion-safe:animate-spin' },
  FAILED: { icon: XCircle, cls: 'text-loss' },
} as const;

/** Overall state of a firm's automatic set-up, for the firms table. */
export function setupState(steps: ProvisioningStep[]): 'ready' | 'waiting' | 'failed' | 'running' {
  if (steps.some((s) => s.status === 'FAILED')) return 'failed';
  if (steps.some((s) => s.status === 'RUNNING' || s.status === 'PENDING')) return 'running';
  if (steps.some((s) => s.status === 'WAITING')) return 'waiting';
  return 'ready';
}

export function SetupBadge({ steps }: { steps: ProvisioningStep[] }) {
  const { t } = useTranslation();
  const state = setupState(steps);
  const variant = {
    ready: 'success',
    waiting: 'warning',
    failed: 'danger',
    running: 'neutral',
  } as const;
  return <Badge variant={variant[state]}>{t(`admin.setup.state.${state}`)}</Badge>;
}

/** The set-up steps of one firm with their outcome (D93). */
export function ProvisioningSteps({ steps }: { steps: ProvisioningStep[] }) {
  const { t } = useTranslation();
  return (
    <ol className="flex flex-col gap-2">
      {steps.map((s) => {
        const { icon: Icon, cls } = STEP_ICON[s.status];
        return (
          <li
            key={s.step}
            className="flex items-start gap-3 rounded-[12px] border border-border px-3 py-2.5"
          >
            <Icon className={cn('mt-0.5 size-4 shrink-0', cls)} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{t(`admin.setup.steps.${s.step}`)}</p>
              <p className="text-xs text-muted">
                {t(`admin.setup.status.${s.status}`)}
                {s.detail &&
                  ` · ${t(`admin.setup.detail.${s.detail}`, { defaultValue: s.detail })}`}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function CopyValue({ value }: { value: string }) {
  const { t } = useTranslation();
  const [done, setDone] = useState(false);
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <code className="min-w-0 truncate font-mono text-xs">{value}</code>
      <button
        type="button"
        className="shrink-0 rounded-sm p-1 text-muted hover:text-fg"
        aria-label={t('admin.setup.copy', { value })}
        onClick={() =>
          void navigator.clipboard?.writeText(value).then(() => {
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          })
        }
      >
        {done ? (
          <Check className="size-3.5" aria-hidden="true" />
        ) : (
          <Copy className="size-3.5" aria-hidden="true" />
        )}
      </button>
    </span>
  );
}

/** DNS instructions + status of an own domain (D95); used by firm admins and Daily Funded. */
export function DomainSetupCard({
  setup,
  onCheck,
  checking,
}: {
  setup: DomainSetup;
  onCheck?: () => void;
  checking?: boolean;
}) {
  const { t } = useTranslation();
  const f = useFormat();
  const variant = {
    NONE: 'neutral',
    PENDING_DNS: 'warning',
    ACTIVE: 'success',
    FAILED: 'danger',
  } as const;
  const records = [
    setup.domain &&
      setup.cnameTarget && { type: 'CNAME', name: setup.domain, value: setup.cnameTarget },
    setup.txtName && setup.txtValue && { type: 'TXT', name: setup.txtName, value: setup.txtValue },
  ].filter(Boolean) as { type: string; name: string; value: string }[];
  return (
    <div className="flex flex-col gap-4">
      {setup.subdomain && (
        <p className="text-sm">
          {t('admin.setup.subdomain')}{' '}
          <a
            className="font-semibold text-link hover:underline"
            href={`https://${setup.subdomain}`}
            target="_blank"
            rel="noreferrer"
          >
            {setup.subdomain}
          </a>
        </p>
      )}
      {setup.domain ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{setup.domain}</span>
            <Badge variant={variant[setup.status]}>
              {t(`admin.setup.domainStatus.${setup.status}`)}
            </Badge>
            {setup.checkedAt && (
              <span className="text-xs text-muted">
                {t('admin.setup.checkedAt', {
                  time: new Date(setup.checkedAt).toLocaleString(f.locale),
                })}
              </span>
            )}
          </div>
          {setup.status !== 'ACTIVE' && (
            <>
              <p className="text-sm text-muted">{t('admin.setup.dnsIntro')}</p>
              <div
                className="overflow-x-auto rounded-[12px] border border-border"
                tabIndex={0}
                role="region"
                aria-label={t('admin.setup.records')}
              >
                <table className="w-full min-w-[520px] text-sm">
                  <thead className="text-left text-xs text-muted">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-medium">
                        {t('admin.setup.type')}
                      </th>
                      <th scope="col" className="px-3 py-2 font-medium">
                        {t('admin.setup.name')}
                      </th>
                      <th scope="col" className="px-3 py-2 font-medium">
                        {t('admin.setup.value')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((r) => (
                      <tr key={r.type} className="border-t border-border">
                        <td className="px-3 py-2 font-semibold">{r.type}</td>
                        <td className="max-w-56 px-3 py-2">
                          <CopyValue value={r.name} />
                        </td>
                        <td className="max-w-72 px-3 py-2">
                          <CopyValue value={r.value} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted">{t('admin.setup.dnsNote')}</p>
            </>
          )}
          {onCheck && setup.status !== 'ACTIVE' && (
            <div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={onCheck}
                disabled={checking}
              >
                <RefreshCw aria-hidden="true" /> {t('admin.setup.checkNow')}
              </Button>
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-muted">{t('admin.setup.noDomain')}</p>
      )}
    </div>
  );
}
