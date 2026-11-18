import { useQuery } from '@tanstack/react-query';
import { call, client, type Schemas } from '@/lib/api-client';
import { useFirmStore } from '@/stores/firm';

export type FirmBranding = Schemas['FirmBrandingDto'];

/** Public branding of the firm this browser belongs to (domain or `?firm=` preview). */
export function useFirmBranding() {
  const slug = useFirmStore((s) => s.slug);
  return useQuery({
    queryKey: ['firm-branding', slug],
    queryFn: () => call(() => client.GET('/api/v1/public/firm')),
    staleTime: 5 * 60_000,
    retry: 1,
  });
}
