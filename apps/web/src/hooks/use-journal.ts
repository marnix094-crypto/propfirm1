import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { call, client, type Schemas } from '@/lib/api-client';
import { useSession } from '@/stores/session';

export type JournalEntry = Schemas['JournalEntryDto'];
export type JournalInput = Schemas['CreateJournalEntryDto'];

const KEY = ['journal'] as const;

/** Notebook entries, newest first, loaded page by page. */
export function useJournal() {
  const authed = useSession((s) => s.status === 'authenticated');
  return useInfiniteQuery({
    queryKey: KEY,
    queryFn: ({ pageParam }) =>
      call(() =>
        client.GET('/api/v1/journal', {
          params: { query: { limit: 30, ...(pageParam ? { cursor: pageParam } : {}) } },
        }),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: authed,
  });
}

export function useSaveJournal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: JournalInput }) =>
      id
        ? call(() =>
            client.PATCH('/api/v1/journal/{id}', {
              params: { path: { id } },
              body: { date: body.date, title: body.title, body: body.body, tags: body.tags },
            }),
          )
        : call(() => client.POST('/api/v1/journal', { body })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteJournal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      call(() => client.DELETE('/api/v1/journal/{id}', { params: { path: { id } } })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
}
