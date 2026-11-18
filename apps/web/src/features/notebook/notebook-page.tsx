import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { Input, Textarea } from '@/components/ui/field';
import { Modal } from '@/components/ui/modal';
import { PageHeader, Panel } from '@/components/ui/panel';
import { toast } from '@/components/ui/toaster';
import {
  useDeleteJournal,
  useJournal,
  useSaveJournal,
  type JournalEntry,
} from '@/hooks/use-journal';
import { useAccounts, useActiveAccount } from '@/hooks/use-trading';
import { useFormat } from '@/hooks/use-format';
import { errorMessage } from '@/lib/errors';
import { cn } from '@/lib/cn';
import { amsterdamToday } from '../portfolio/pnl-calendar';

type Draft = { id?: string; date: string; title: string; body: string; tags: string };

const fromEntry = (e: JournalEntry): Draft => ({
  id: e.id,
  date: e.date,
  title: e.title,
  body: e.body,
  tags: e.tags.join(', '),
});

/** Notebook: a private trading journal stored on the server (synced across devices). */
export function NotebookPage() {
  const { t } = useTranslation();
  const f = useFormat();
  const journal = useJournal();
  const save = useSaveJournal();
  const del = useDeleteJournal();
  const { account } = useActiveAccount();
  const accounts = useAccounts();
  const [today] = useState(amsterdamToday);
  const blank = (): Draft => ({ date: today, title: '', body: '', tags: '' });
  const [draft, setDraft] = useState<Draft>(blank);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const entries = useMemo(() => journal.data?.pages.flatMap((p) => p.items) ?? [], [journal.data]);
  const accountLabel = (id: string | null) =>
    id ? (accounts.data ?? []).find((a) => a.id === id)?.label : undefined;
  const day = (d: string) =>
    new Intl.DateTimeFormat(f.locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(
      new Date(`${d}T00:00:00Z`),
    );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const tags = draft.tags
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 8);
    try {
      const saved = await save.mutateAsync({
        id: draft.id,
        body: {
          date: draft.date,
          title: draft.title.trim(),
          body: draft.body,
          tags,
          ...(draft.id || !account ? {} : { accountId: account.id }),
        },
      });
      setDraft(fromEntry(saved));
      toast({ kind: 'success', title: t('notebook.saved') });
    } catch (err) {
      toast({ kind: 'error', title: errorMessage(t, err) });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t('app.nav.notebook')}
        subtitle={t('notebook.subtitle')}
        actions={
          <Button size="sm" onClick={() => setDraft(blank())}>
            <Plus aria-hidden="true" /> {t('notebook.new')}
          </Button>
        }
      />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <Panel
          title={t('notebook.entries')}
          className="lg:max-h-[calc(100dvh-11rem)] lg:overflow-y-auto"
        >
          {journal.isPending ? (
            <Skeleton className="m-5 h-40" />
          ) : journal.isError ? (
            <ErrorState
              title={t('errors.generic')}
              retryLabel={t('common.retry')}
              onRetry={() => void journal.refetch()}
            />
          ) : entries.length === 0 ? (
            <EmptyState title={t('notebook.empty')} body={t('notebook.emptyBody')} />
          ) : (
            <ul data-testid="notebook-list">
              {entries.map((e) => (
                <li key={e.id} className="border-b border-border last:border-b-0">
                  <button
                    type="button"
                    onClick={() => setDraft(fromEntry(e))}
                    aria-current={draft.id === e.id ? 'true' : undefined}
                    className={cn(
                      'w-full px-5 py-3 text-left transition-colors hover:bg-card-muted',
                      draft.id === e.id && 'bg-card-muted',
                    )}
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="truncate font-medium">{e.title}</span>
                      <span className="shrink-0 text-xs text-muted tabular-nums">
                        {day(e.date)}
                      </span>
                    </span>
                    {e.body && (
                      <span className="mt-0.5 line-clamp-2 block text-sm text-muted">{e.body}</span>
                    )}
                    <span className="mt-1.5 flex flex-wrap gap-1">
                      {accountLabel(e.accountId) && (
                        <span className="text-[11px] text-muted">{accountLabel(e.accountId)}</span>
                      )}
                      {e.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-border px-1.5 text-[11px] text-muted"
                        >
                          #{tag}
                        </span>
                      ))}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {journal.hasNextPage && (
            <div className="p-3">
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                disabled={journal.isFetchingNextPage}
                onClick={() => void journal.fetchNextPage()}
              >
                {t('notebook.more')}
              </Button>
            </div>
          )}
        </Panel>

        <Panel title={draft.id ? t('notebook.edit') : t('notebook.new')}>
          <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4 p-5">
            <div className="grid gap-4 sm:grid-cols-[180px_minmax(0,1fr)]">
              <Input
                label={t('notebook.date')}
                type="date"
                required
                value={draft.date}
                max={today}
                onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
              />
              <Input
                label={t('notebook.titleLabel')}
                required
                maxLength={120}
                value={draft.title}
                placeholder={t('notebook.titlePlaceholder')}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              />
            </div>
            <Textarea
              label={t('notebook.body')}
              maxLength={10_000}
              rows={10}
              value={draft.body}
              placeholder={t('notebook.bodyPlaceholder')}
              onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
            />
            <Input
              label={t('notebook.tags')}
              hint={t('notebook.tagsHint')}
              value={draft.tags}
              onChange={(e) => setDraft((d) => ({ ...d, tags: e.target.value }))}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              {draft.id ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 aria-hidden="true" /> {t('notebook.delete')}
                </Button>
              ) : (
                <span />
              )}
              <Button type="submit" disabled={save.isPending || !draft.title.trim()}>
                {save.isPending && (
                  <Loader2 className="motion-safe:animate-spin" aria-hidden="true" />
                )}
                {t('notebook.save')}
              </Button>
            </div>
          </form>
        </Panel>
      </div>

      <Modal
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t('notebook.deleteTitle')}
        description={t('notebook.deleteBody')}
        closeLabel={t('common.close')}
      >
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={del.isPending}
            onClick={() =>
              del.mutate(draft.id!, {
                onSuccess: () => {
                  setConfirmDelete(false);
                  setDraft(blank());
                  toast({ kind: 'success', title: t('notebook.deleted') });
                },
                onError: (e) => toast({ kind: 'error', title: errorMessage(t, e) }),
              })
            }
          >
            {t('notebook.delete')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
