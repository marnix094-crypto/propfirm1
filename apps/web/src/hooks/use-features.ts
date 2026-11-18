import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { call, client, uid, type Schemas } from '@/lib/api-client';
import { useSession } from '@/stores/session';
import { qk } from './use-trading';

export type PointsSummary = Schemas['PointsSummaryDto'];
export type Offer = Schemas['OfferDto'];
export type RankingRow = Schemas['RankingRowDto'];
export type Competition = Schemas['CompetitionDto'];
export type CopierLink = Schemas['CopierLinkDto'];
export type Certificate = Schemas['CertificateDto'];

const useAuthed = () => useSession((s) => s.status === 'authenticated');

// ---------------------------------------------------------------- points & offers
export function usePoints() {
  return useQuery({
    queryKey: ['points'],
    queryFn: () => call(() => client.GET('/api/v1/points')),
    enabled: useAuthed(),
  });
}

export function useRedeem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rewardId: Schemas['RedeemDto']['rewardId']) =>
      call(() =>
        client.POST('/api/v1/points/redeem', {
          body: { rewardId },
          params: { header: { 'Idempotency-Key': `redeem-${uid()}` } },
        }),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['points'] });
      void qc.invalidateQueries({ queryKey: ['offers'] });
    },
  });
}

export function useOffers() {
  return useQuery({
    queryKey: ['offers'],
    queryFn: () => call(() => client.GET('/api/v1/offers')),
    enabled: useAuthed(),
  });
}

// ---------------------------------------------------------------- community
export function useTraderProfile() {
  return useQuery({
    queryKey: ['trader-profile'],
    queryFn: () => call(() => client.GET('/api/v1/me/profile')),
    enabled: useAuthed(),
  });
}

export function useUpdateTraderProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Schemas['UpdateTraderProfileDto']) =>
      call(() => client.PATCH('/api/v1/me/profile', { body })),
    onSuccess: (p) => {
      qc.setQueryData(['trader-profile'], p);
      void qc.invalidateQueries({ queryKey: ['leaderboard'] });
      void qc.invalidateQueries({ queryKey: ['competitions'] });
    },
  });
}

export function useLeaderboard() {
  return useQuery({
    queryKey: ['leaderboard'],
    queryFn: () => call(() => client.GET('/api/v1/leaderboard')),
    enabled: useAuthed(),
    refetchInterval: 30_000,
  });
}

export function useCompetitions() {
  return useQuery({
    queryKey: ['competitions'],
    queryFn: () => call(() => client.GET('/api/v1/competitions')),
    enabled: useAuthed(),
    refetchInterval: 30_000,
  });
}

export function useJoinCompetition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      call(() => client.POST('/api/v1/competitions/{id}/join', { params: { path: { id } } })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['competitions'] });
      void qc.invalidateQueries({ queryKey: qk.accounts });
    },
  });
}

export function useTransparency() {
  return useQuery({
    queryKey: ['public', 'transparency'],
    queryFn: () => call(() => client.GET('/api/v1/public/transparency')),
    staleTime: 60_000,
  });
}

// ---------------------------------------------------------------- copier
export function useCopier() {
  return useQuery({
    queryKey: ['copier'],
    queryFn: () => call(() => client.GET('/api/v1/copier')),
    enabled: useAuthed(),
    refetchInterval: 10_000,
  });
}

export function useCopierMutations() {
  const qc = useQueryClient();
  const done = () => void qc.invalidateQueries({ queryKey: ['copier'] });
  return {
    create: useMutation({
      mutationFn: (body: Schemas['CreateCopierLinkDto']) =>
        call(() => client.POST('/api/v1/copier/links', { body })),
      onSuccess: done,
    }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: Schemas['UpdateCopierLinkDto'] }) =>
        call(() => client.PATCH('/api/v1/copier/links/{id}', { params: { path: { id } }, body })),
      onSuccess: done,
    }),
    remove: useMutation({
      mutationFn: (id: string) =>
        call(() => client.DELETE('/api/v1/copier/links/{id}', { params: { path: { id } } })),
      onSuccess: done,
    }),
  };
}

// ---------------------------------------------------------------- certificates
export function useCertificates() {
  return useQuery({
    queryKey: ['certificates'],
    queryFn: () => call(() => client.GET('/api/v1/certificates')),
    enabled: useAuthed(),
  });
}

export function usePublicCertificate(id: string | undefined) {
  return useQuery({
    queryKey: ['public', 'certificate', id],
    queryFn: () =>
      call(() => client.GET('/api/v1/public/certificates/{id}', { params: { path: { id: id! } } })),
    enabled: !!id,
    retry: false,
  });
}
