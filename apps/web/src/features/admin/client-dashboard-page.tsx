import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Lock } from 'lucide-react';
import { CLIENT_MODULES, type ClientModule } from '@brand/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Panel, PageHeader } from '@/components/ui/panel';
import { ErrorState, Skeleton } from '@/components/ui/feedback';
import { toast } from '@/components/ui/toaster';
import { useModules, useUpdateModules } from '@/hooks/use-admin';
import { errorMessage } from '@/lib/errors';
import { cn } from '@/lib/cn';
import { NAV_FOOTER, NAV_SECTIONS, type NavItem } from '@/features/app/nav';

/** Nav items that belong to a switchable module, keyed by module. */
const ITEMS = new Map<string, NavItem>(
  [...NAV_SECTIONS.flatMap((s) => s.items), ...NAV_FOOTER].map((i) => [i.key, i]),
);
const isModule = (key: string): key is ClientModule =>
  (CLIENT_MODULES as readonly string[]).includes(key);

function ModuleSwitch({
  module,
  on,
  onChange,
}: {
  module: ClientModule;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  const { t } = useTranslation();
  const Icon = ITEMS.get(module)?.icon;
  const id = `module-${module}`;
  return (
    <li className="flex items-start gap-4 px-5 py-4">
      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-card-muted">
        {Icon && <Icon className="size-5" aria-hidden="true" strokeWidth={1.75} />}
      </span>
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="font-semibold">
          {t(`app.nav.${module}`)}
        </label>
        <p className="text-sm text-muted">{t(`admin.modules.desc.${module}`)}</p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        className={cn(
          'relative mt-1 inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors',
          on
            ? 'border-[var(--accent-deep)] bg-[var(--brand-lime)]'
            : 'border-border-strong bg-card-muted',
        )}
      >
        <span className="sr-only">{on ? t('admin.modules.on') : t('admin.modules.off')}</span>
        <span
          aria-hidden="true"
          className={cn(
            'inline-block size-5 rounded-full bg-[var(--brand-ink)] shadow transition-transform motion-reduce:transition-none',
            on ? 'translate-x-6' : 'translate-x-1',
          )}
        />
      </button>
    </li>
  );
}

/** What a client sees in the menu with the current choice (core + switched-on modules). */
function MenuPreview({ disabled }: { disabled: Set<string> }) {
  const { t } = useTranslation();
  return (
    <Card padding="none" className="p-4">
      {NAV_SECTIONS.map((section) => {
        const items = section.items.filter((i) => !isModule(i.key) || !disabled.has(i.key));
        if (items.length === 0) return null;
        return (
          <div key={section.key} className="pb-3">
            <p className="px-2 pb-1.5 text-[10px] font-semibold tracking-[0.08em] text-muted uppercase">
              {t(`app.nav.sections.${section.key}`)}
            </p>
            <ul className="flex flex-col gap-0.5">
              {items.map(({ key, icon: Icon }) => (
                <li
                  key={key}
                  className="flex items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-sm"
                >
                  <Icon className="size-4 text-muted" aria-hidden="true" strokeWidth={1.75} />
                  {t(`app.nav.${key}`)}
                  {!isModule(key) && (
                    <Lock className="ml-auto size-3 text-muted" aria-hidden="true" />
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </Card>
  );
}

function Composer({ initial }: { initial: ClientModule[] }) {
  const { t } = useTranslation();
  const save = useUpdateModules();
  const [disabled, setDisabled] = useState(() => new Set<string>(initial));
  const dirty = disabled.size !== initial.length || initial.some((m) => !disabled.has(m));
  const toggle = (m: ClientModule, on: boolean) =>
    setDisabled((prev) => {
      const next = new Set(prev);
      if (on) next.delete(m);
      else next.add(m);
      return next;
    });

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex flex-col gap-4">
        <Panel
          title={t('admin.modules.switchable')}
          actions={
            <Button
              disabled={!dirty || save.isPending}
              onClick={() =>
                save.mutate([...disabled].filter(isModule), {
                  onSuccess: () => toast({ kind: 'success', title: t('admin.saved') }),
                  onError: (e) => toast({ kind: 'error', title: errorMessage(t, e) }),
                })
              }
            >
              {t('common.save')}
            </Button>
          }
        >
          <ul className="divide-y divide-border" data-testid="module-list">
            {CLIENT_MODULES.map((m) => (
              <ModuleSwitch
                key={m}
                module={m}
                on={!disabled.has(m)}
                onChange={(on) => toggle(m, on)}
              />
            ))}
          </ul>
        </Panel>
        <p className="text-xs text-muted">{t('admin.modules.coreNote')}</p>
      </div>
      <div className="flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold">{t('admin.modules.preview')}</h2>
        <MenuPreview disabled={disabled} />
      </div>
    </div>
  );
}

export function AdminClientDashboardPage() {
  const { t } = useTranslation();
  const modules = useModules();
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t('admin.nav.clientDashboard')} subtitle={t('admin.modules.subtitle')} />
      {modules.isPending ? (
        <Skeleton className="h-96 rounded-card" />
      ) : modules.isError ? (
        <ErrorState
          title={t('errors.generic')}
          retryLabel={t('common.retry')}
          onRetry={() => void modules.refetch()}
        />
      ) : (
        <Composer key={modules.data.disabled.join()} initial={modules.data.disabled} />
      )}
    </div>
  );
}
