import { useEffect } from 'react';
import { realtime } from '@/lib/realtime';

/** Subscribe to live quotes for the given symbols while mounted. */
export function useLiveSymbols(symbols: string[]) {
  const key = [...new Set(symbols)].sort().join(',');
  useEffect(() => {
    if (!key) return;
    return realtime.watchSymbols(key.split(','));
  }, [key]);
}

/** Subscribe to the private account stream while mounted. */
export function useLiveAccount(accountId: string | undefined) {
  useEffect(() => {
    if (!accountId) return;
    return realtime.watchAccount(accountId);
  }, [accountId]);
}
