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
  useFirms,
  useFirmStatus,
  useResendInvite,
  useSetFirmAdmin,
  type AdminFirmSummary,
} from '@/hooks/use-admin';
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
  const firms = useFirms(!!me?.superadmin);
  const create = useCreateFirm();
  const status = useFirmStatus();
  const setAdminFirm = useFirmStore((s) => s.setAdminFirm);
  const resend = useResendInvite();
  const [changing, setChanging] = useState<AdminFirmSummary | null>(null);
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
              { name: name.trim(), slug: finalSlug, ownerEmail: owner.trim() },
              {
                onSuccess: () => {
                  setName('');
                  setSlug('');
                  setOwner('');
                  setSlugTouched(false);
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
        </form>
        <p className="mt-3 text-xs text-muted">{t('admin.firms.newHint')}</p>
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
            minWidth={1040}
            head={
              <>
                <Th>{t('admin.firms.name')}</Th>
                <Th>{t('admin.firms.admin')}</Th>
                <Th>{t('admin.firms.domain')}</Th>
                <Th>{t('admin.traders.status')}</Th>
                <Th right>{t('admin.overview.traders')}</Th>
                <Th right>{t('admin.overview.fundedActive')}</Th>
                <Th>{t('admin.firms.since')}</Th>
                <Th>
                  <span className="sr-only">{t('admin.actions')}</span>
                </Th>
              </>
            }
          >
            {firms.data.map((firm) => (
              <Tr key={firm.id}>
                <Td>
                  <p className="font-semibold whitespace-nowrap">{firm.name}</p>
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
                <Td className="text-muted">{firm.domain ?? '—'}</Td>
                <Td>
                  <StatusBadge status={firm.status} />
                </Td>
                <Td right>{firm.traders}</Td>
                <Td right>{firm.fundedActive}</Td>
                <Td className="whitespace-nowrap">{dateOnly(firm.createdAt, f.locale)}</Td>
                <Td className="text-right">
                  <div className="flex flex-wrap justify-end gap-2">
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
    </div>
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
