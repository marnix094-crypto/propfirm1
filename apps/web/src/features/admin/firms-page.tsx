import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/field';
import { Panel, PageHeader } from '@/components/ui/panel';
import { ErrorState, Skeleton } from '@/components/ui/feedback';
import { toast } from '@/components/ui/toaster';
import {
  useAdminMe,
  useCreateFirm,
  useFirmList,
  useFirmStatus,
  useResendInvite,
  useRunProvisioning,
  useSetFirmAdmin,
  useSetFirmDomain,
  type AdminFirmSummary,
} from '@/hooks/use-admin';
import { DomainSetupCard, ProvisioningSteps, SetupBadge } from './provisioning';
import { Modal } from '@/components/ui/modal';
import { useFormat } from '@/hooks/use-format';
import { errorMessage } from '@/lib/errors';
import { useFirmStore } from '@/stores/firm';
import { AdminTable, dateOnly, StatusBadge, Td, Th, Tr } from './ui';

const SLUG = /^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/;
const slugify = (v: string) =>
  v
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

/** Platform superadmins: every firm on Daily Funded. */
export function AdminFirmsPage() {
  const { t } = useTranslation();
  const { lang } = useParams();
  const navigate = useNavigate();
  const f = useFormat();
  const me = useAdminMe().data;
  const list = useFirmList(!!me?.superadmin);
  const firms = list;
  const items = list.data?.items ?? [];
  const create = useCreateFirm();
  const status = useFirmStatus();
  const setAdminFirm = useFirmStore((s) => s.setAdminFirm);
  const resend = useResendInvite();
  const [changing, setChanging] = useState<AdminFirmSummary | null>(null);
  const [details, setDetails] = useState<string | null>(null);
  const [domain, setDomain] = useState('');
  const [dedicated, setDedicated] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [owner, setOwner] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const finalSlug = slugTouched ? slug : slugify(name);
  const onError = (e: unknown) => toast({ kind: 'error', title: errorMessage(t, e) });

  if (!me?.superadmin)
    return (
      <ErrorState
        title={t('errors.ADMIN_FORBIDDEN')}
        retryLabel={t('common.retry')}
        onRetry={() => {}}
      />
    );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t('admin.nav.firms')} subtitle={t('admin.firms.subtitle')} />
      <Card>
        <h2 className="mb-4 text-[15px] font-semibold">{t('admin.firms.new')}</h2>
        <form
          className="grid gap-4 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate(
              {
                name: name.trim(),
                slug: finalSlug,
                ownerEmail: owner.trim(),
                ...(domain.trim() ? { domain: domain.trim().toLowerCase() } : {}),
                ...(dedicated ? { dedicatedDatabase: true } : {}),
              },
              {
                onSuccess: (d) => {
                  setName('');
                  setSlug('');
                  setOwner('');
                  setDomain('');
                  setDedicated(false);
                  setSlugTouched(false);
                  const created = d.items.find((x) => x.slug === finalSlug);
                  if (created) setDetails(created.id);
                  toast({ kind: 'success', title: t('admin.firms.created') });
                },
                onError,
              },
            );
          }}
        >
          <Input
            label={t('admin.firms.name')}
            required
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            label={t('admin.firms.slug')}
            required
            value={finalSlug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value.toLowerCase());
            }}
            error={finalSlug && !SLUG.test(finalSlug) ? t('admin.products.slugInvalid') : null}
          />
          <Input
            label={t('admin.firms.ownerEmail')}
            type="email"
            required
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
          />
          <Button type="submit" disabled={create.isPending || !SLUG.test(finalSlug)}>
            <Plus aria-hidden="true" /> {t('admin.firms.create')}
          </Button>
          <Input
            label={t('admin.setup.ownDomain')}
            hint={t('admin.setup.ownDomainHint')}
            placeholder="trade.acmeprop.com"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
          />
          <label className="flex items-start gap-3 text-sm md:col-span-2 md:self-center">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-[var(--primary)]"
              checked={dedicated}
              disabled={!list.data?.dedicatedAvailable}
              onChange={(e) => setDedicated(e.target.checked)}
            />
            <span>
              <span className="font-semibold">{t('admin.setup.dedicated')}</span>
              <span className="block text-xs text-muted">
                {list.data?.dedicatedAvailable
                  ? t('admin.setup.dedicatedHint')
                  : t('admin.setup.dedicatedUnavailable')}
              </span>
            </span>
          </label>
        </form>
        <p className="mt-3 text-xs text-muted">
          {list.data?.platformDomain
            ? t('admin.setup.newHint', {
                domain: `${finalSlug || 'slug'}.${list.data.platformDomain}`,
              })
            : t('admin.firms.newHint')}
        </p>
      </Card>
      <Panel title={t('admin.firms.list')}>
        {firms.isPending ? (
          <Skeleton className="m-5 h-32" />
        ) : firms.isError ? (
          <ErrorState
            title={t('errors.generic')}
            retryLabel={t('common.retry')}
            onRetry={() => void firms.refetch()}
          />
        ) : (
          <AdminTable
            label={t('admin.firms.list')}
            minWidth={1100}
            head={
              <>
                <Th>{t('admin.firms.name')}</Th>
                <Th>{t('admin.firms.admin')}</Th>
                <Th>{t('admin.firms.domain')}</Th>
                <Th>{t('admin.traders.status')}</Th>
                <Th right>{t('admin.overview.traders')}</Th>
                <Th right>{t('admin.overview.fundedActive')}</Th>
                <Th>
                  <span className="sr-only">{t('admin.actions')}</span>
                </Th>
              </>
            }
          >
            {items.map((firm) => (
              <Tr key={firm.id}>
                <Td>
                  <p className="font-semibold whitespace-nowrap">{firm.name}</p>
                  <p className="text-xs text-muted">
                    {t('admin.firms.since')} {dateOnly(firm.createdAt, f.locale)}
                  </p>
                  <p className="text-xs text-muted">
                    {firm.slug}{' '}
                    {firm.isDefault && <Badge className="ml-1">{t('admin.firms.default')}</Badge>}
                  </p>
                </Td>
                <Td>
                  {firm.admin ? (
                    <>
                      <p className="text-sm font-semibold">{firm.admin.email}</p>
                      <p className="text-xs text-muted">
                        {firm.admin.activated
                          ? firm.admin.twoFactorEnabled
                            ? t('admin.firms.adminActive')
                            : t('admin.firms.adminNo2fa')
                          : t('admin.firms.adminInvited')}
                      </p>
                    </>
                  ) : (
                    <span className="text-sm text-muted">
                      {firm.isDefault ? t('admin.firms.ownFirm') : t('admin.firms.noAdmin')}
                    </span>
                  )}
                </Td>
                <Td className="text-muted">
                  <p className="max-w-56 truncate">{firm.domain ?? firm.subdomain ?? '—'}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {firm.provisioning.length > 0 && <SetupBadge steps={firm.provisioning} />}
                    {firm.dedicatedDatabase && <Badge>{t('admin.setup.ownInstance')}</Badge>}
                  </div>
                </Td>
                <Td>
                  <StatusBadge status={firm.status} />
                </Td>
                <Td right>{firm.traders}</Td>
                <Td right>{firm.fundedActive}</Td>
                <Td className="text-right">
                  <div className="flex flex-col items-end gap-2 [&>*]:whitespace-nowrap">
                    <Button variant="secondary" size="sm" onClick={() => setDetails(firm.id)}>
                      {t('admin.setup.details')}
                    </Button>
                    {!firm.dedicatedDatabase && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setAdminFirm(firm.id);
                          void navigate(`/${lang}/admin`);
                        }}
                      >
                        {t('admin.firms.manage')}
                      </Button>
                    )}
                    {!firm.isDefault && (
                      <Button variant="secondary" size="sm" onClick={() => setChanging(firm)}>
                        {t('admin.firms.changeAdmin')}
                      </Button>
                    )}
                    {firm.admin && !firm.admin.activated && (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={resend.isPending}
                        onClick={() =>
                          resend.mutate(firm.id, {
                            onSuccess: () =>
                              toast({ kind: 'success', title: t('admin.firms.inviteSent') }),
                            onError,
                          })
                        }
                      >
                        {t('admin.firms.resendInvite')}
                      </Button>
                    )}
                    {!firm.isDefault && (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={status.isPending}
                        onClick={() =>
                          status.mutate(
                            {
                              id: firm.id,
                              status: firm.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE',
                            },
                            { onError },
                          )
                        }
                      >
                        {firm.status === 'ACTIVE'
                          ? t('admin.firms.suspend')
                          : t('admin.firms.activate')}
                      </Button>
                    )}
                  </div>
                </Td>
              </Tr>
            ))}
          </AdminTable>
        )}
      </Panel>
      {changing && <ChangeAdminDialog firm={changing} onClose={() => setChanging(null)} />}
      {details && items.find((x) => x.id === details) && (
        <SetupDialog firm={items.find((x) => x.id === details)!} onClose={() => setDetails(null)} />
      )}
    </div>
  );
}

/** Daily Funded: the automatic set-up of one firm — steps, DNS and own domain (D93–D95). */
function SetupDialog({ firm, onClose }: { firm: AdminFirmSummary; onClose: () => void }) {
  const { t } = useTranslation();
  const run = useRunProvisioning();
  const setDomain = useSetFirmDomain();
  const [domain, setDomainValue] = useState(firm.domain ?? '');
  const onError = (e: unknown) => toast({ kind: 'error', title: errorMessage(t, e) });
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('admin.setup.dialogTitle', { name: firm.name })}
      description={t('admin.setup.dialogBody')}
      closeLabel={t('common.close')}
      className="max-w-2xl"
    >
      <div className="flex max-h-[70vh] flex-col gap-6 overflow-y-auto pr-1">
        {firm.dedicatedDatabase && (
          <p className="rounded-[12px] border border-border bg-card-muted p-3 text-sm">
            {t('admin.setup.ownInstanceBody', { slug: firm.slug })}
          </p>
        )}
        <section aria-labelledby="setup-steps">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 id="setup-steps" className="text-sm font-semibold">
              {t('admin.setup.stepsTitle')}
            </h3>
            <Button
              size="sm"
              variant="secondary"
              disabled={run.isPending}
              onClick={() => run.mutate(firm.id, { onError })}
            >
              {t('admin.setup.runNow')}
            </Button>
          </div>
          {firm.provisioning.length > 0 ? (
            <ProvisioningSteps steps={firm.provisioning} />
          ) : (
            <p className="text-sm text-muted">{t('admin.setup.legacy')}</p>
          )}
        </section>
        <section aria-labelledby="setup-domain" className="flex flex-col gap-4">
          <h3 id="setup-domain" className="text-sm font-semibold">
            {t('admin.setup.domainTitle')}
          </h3>
          <DomainSetupCard
            setup={firm.domainSetup}
            checking={run.isPending}
            onCheck={() => run.mutate(firm.id, { onError })}
          />
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              setDomain.mutate(
                { id: firm.id, domain: domain.trim().toLowerCase() || null },
                {
                  onSuccess: () => toast({ kind: 'success', title: t('admin.setup.domainSaved') }),
                  onError,
                },
              );
            }}
          >
            <div className="min-w-56 flex-1">
              <Input
                label={t('admin.setup.ownDomain')}
                placeholder="trade.acmeprop.com"
                value={domain}
                onChange={(e) => setDomainValue(e.target.value)}
              />
            </div>
            <Button type="submit" variant="secondary" disabled={setDomain.isPending}>
              {domain.trim() ? t('admin.setup.saveDomain') : t('admin.setup.removeDomain')}
            </Button>
          </form>
        </section>
      </div>
    </Modal>
  );
}

/** Daily Funded: give a firm a new admin (the current one is deactivated). */
function ChangeAdminDialog({ firm, onClose }: { firm: AdminFirmSummary; onClose: () => void }) {
  const { t } = useTranslation();
  const set = useSetFirmAdmin();
  const [email, setEmail] = useState('');
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('admin.firms.changeAdminTitle', { name: firm.name })}
      description={t('admin.firms.changeAdminBody')}
      closeLabel={t('common.close')}
    >
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          set.mutate(
            { id: firm.id, email: email.trim() },
            {
              onSuccess: () => {
                onClose();
                toast({ kind: 'success', title: t('admin.firms.inviteSent') });
              },
              onError: (err) => toast({ kind: 'error', title: errorMessage(t, err) }),
            },
          );
        }}
      >
        <Input
          label={t('admin.firms.adminEmail')}
          type="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={set.isPending}>
            {t('admin.firms.sendInvite')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
