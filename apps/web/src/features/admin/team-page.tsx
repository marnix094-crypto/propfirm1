import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UserPlus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/field';
import { Panel, PageHeader } from '@/components/ui/panel';
import { ErrorState, Skeleton } from '@/components/ui/feedback';
import { toast } from '@/components/ui/toaster';
import {
  useAdminMe,
  useChangeRole,
  useInvite,
  useRemoveMember,
  useTeam,
  type FirmRole,
} from '@/hooks/use-admin';
import { useFormat } from '@/hooks/use-format';
import { errorMessage } from '@/lib/errors';
import { AdminTable, Td, Th, Tr } from './ui';

const ROLES: FirmRole[] = ['OWNER', 'ADMIN', 'SUPPORT'];
const GRANTABLE: Record<FirmRole, FirmRole[]> = {
  OWNER: ['OWNER', 'ADMIN', 'SUPPORT'],
  ADMIN: ['SUPPORT'],
  SUPPORT: [],
};

export function AdminTeamPage() {
  const { t } = useTranslation();
  const f = useFormat();
  const me = useAdminMe().data;
  const team = useTeam();
  const invite = useInvite();
  const change = useChangeRole();
  const remove = useRemoveMember();
  const grantable = me ? GRANTABLE[me.role] : [];
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<FirmRole>('SUPPORT');
  const onError = (e: unknown) => toast({ kind: 'error', title: errorMessage(t, e) });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t('admin.nav.team')} subtitle={t('admin.team.subtitle')} />
      {grantable.length > 0 && (
        <Card>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              invite.mutate(
                { email: email.trim(), role },
                {
                  onSuccess: () => {
                    setEmail('');
                    toast({ kind: 'success', title: t('admin.team.invited') });
                  },
                  onError,
                },
              );
            }}
          >
            <Input
              className="min-w-64 flex-1"
              label={t('admin.team.email')}
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Select
              className="w-44"
              label={t('admin.team.role')}
              value={role}
              onChange={(e) => setRole(e.target.value as FirmRole)}
            >
              {grantable.map((r) => (
                <option key={r} value={r}>
                  {t(`admin.role.${r}`)}
                </option>
              ))}
            </Select>
            <Button type="submit" disabled={invite.isPending}>
              <UserPlus aria-hidden="true" /> {t('admin.team.invite')}
            </Button>
          </form>
          <p className="mt-3 text-xs text-muted">{t('admin.team.inviteHint')}</p>
        </Card>
      )}
      <Panel title={t('admin.team.members')}>
        {team.isPending ? (
          <Skeleton className="m-5 h-32" />
        ) : team.isError ? (
          <ErrorState
            title={t('errors.generic')}
            retryLabel={t('common.retry')}
            onRetry={() => void team.refetch()}
          />
        ) : (
          <AdminTable
            label={t('admin.team.members')}
            minWidth={640}
            head={
              <>
                <Th>{t('admin.team.email')}</Th>
                <Th>{t('admin.team.role')}</Th>
                <Th>{t('admin.team.twoFactor')}</Th>
                <Th>{t('admin.traders.lastLogin')}</Th>
                <Th>
                  <span className="sr-only">{t('admin.actions')}</span>
                </Th>
              </>
            }
          >
            {team.data.map((m) => {
              const manageable = grantable.includes(m.role);
              return (
                <Tr key={m.id}>
                  <Td>
                    <span className="font-semibold">{m.email}</span>
                    {m.isYou && (
                      <span className="ml-2 text-xs text-muted">({t('admin.team.you')})</span>
                    )}
                  </Td>
                  <Td>
                    {manageable && !m.isYou ? (
                      <select
                        aria-label={t('admin.team.roleFor', { email: m.email })}
                        value={m.role}
                        disabled={change.isPending}
                        onChange={(e) =>
                          change.mutate({ id: m.id, role: e.target.value as FirmRole }, { onError })
                        }
                        className="h-9 rounded-full border border-border bg-card px-3 text-sm"
                      >
                        {ROLES.filter((r) => grantable.includes(r)).map((r) => (
                          <option key={r} value={r}>
                            {t(`admin.role.${r}`)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      t(`admin.role.${m.role}`)
                    )}
                  </Td>
                  <Td>
                    {m.twoFactorEnabled ? (
                      <Badge variant="success">{t('admin.yes')}</Badge>
                    ) : (
                      <Badge variant="warning">{t('admin.team.no2fa')}</Badge>
                    )}
                  </Td>
                  <Td className="text-muted">
                    {m.lastLoginAt ? f.relativeTime(m.lastLoginAt) : '—'}
                  </Td>
                  <Td right>
                    {manageable && !m.isYou && (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={remove.isPending}
                        onClick={() => remove.mutate(m.id, { onError })}
                      >
                        {t('admin.team.remove')}
                      </Button>
                    )}
                  </Td>
                </Tr>
              );
            })}
          </AdminTable>
        )}
      </Panel>
      <p className="text-xs text-muted">{t('admin.team.rolesNote')}</p>
    </div>
  );
}
