import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { Panel } from '@/components/ui/panel';
import { toast } from '@/components/ui/toaster';
import { useTraderProfile, useUpdateTraderProfile } from '@/hooks/use-features';
import { errorMessage } from '@/lib/errors';

/** Public nickname + leaderboard opt-in (no real names or emails are ever shown). */
export function ProfileCard({ showOptIn = true }: { showOptIn?: boolean }) {
  const { t } = useTranslation();
  const profile = useTraderProfile();
  const update = useUpdateTraderProfile();
  const saved = profile.data?.nickname ?? '';
  const [nickname, setNickname] = useState(saved);
  const [lastSaved, setLastSaved] = useState(saved);
  if (saved !== lastSaved) {
    setLastSaved(saved);
    setNickname(saved);
  }

  const save = (e: FormEvent) => {
    e.preventDefault();
    update.mutate(
      { nickname },
      {
        onSuccess: () => toast({ kind: 'success', title: t('ranking.saved') }),
        onError: (err) => toast({ kind: 'error', title: errorMessage(t, err) }),
      },
    );
  };

  return (
    <Panel title={t('ranking.profile')} bodyClassName="p-5">
      <form onSubmit={save} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Input
          label={t('ranking.nickname')}
          hint={t('ranking.nicknameHint')}
          value={nickname}
          pattern="[A-Za-z0-9_]{3,20}"
          maxLength={20}
          required
          onChange={(e) => setNickname(e.target.value)}
          className="flex-1"
        />
        <Button type="submit" variant="secondary" disabled={update.isPending} className="sm:mb-6">
          {t('ranking.saveNickname')}
        </Button>
      </form>
      {showOptIn && (
        <label className="mt-2 flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-5 shrink-0 accent-[var(--primary)]"
            checked={profile.data?.leaderboardOptIn ?? false}
            disabled={!profile.data?.nickname || update.isPending}
            onChange={(e) =>
              update.mutate(
                { leaderboardOptIn: e.target.checked },
                { onError: (err) => toast({ kind: 'error', title: errorMessage(t, err) }) },
              )
            }
          />
          <span>
            {t('ranking.optIn')}
            <span className="block text-xs text-muted">{t('ranking.optInHint')}</span>
          </span>
        </label>
      )}
    </Panel>
  );
}
