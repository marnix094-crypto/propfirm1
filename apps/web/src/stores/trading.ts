import { create } from 'zustand';

const KEY = 'brand-active-account';
const read = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

interface TradingUiState {
  /** Per-device convenience: last selected account (server remains the source of truth). */
  activeAccountId: string | null;
  setActiveAccount: (id: string) => void;
}

export const useTradingUi = create<TradingUiState>((set) => ({
  activeAccountId: read(),
  setActiveAccount: (id) => {
    try {
      localStorage.setItem(KEY, id);
    } catch {
      /* ignore */
    }
    set({ activeAccountId: id });
  },
}));

export interface LiveQuote {
  bid: string;
  ask: string;
  ts: number;
}

/** High-frequency quote store; components select a single symbol to avoid re-render storms. */
export const useQuotes = create<{
  quotes: Record<string, LiveQuote>;
  put: (s: string, q: LiveQuote) => void;
}>((set) => ({
  quotes: {},
  put: (s, q) => set((st) => ({ quotes: { ...st.quotes, [s]: q } })),
}));

export const useQuote = (symbol: string | undefined) =>
  useQuotes((s) => (symbol ? s.quotes[symbol] : undefined));

type ConnState = 'idle' | 'connecting' | 'connected' | 'disconnected';
export const useConnection = create<{
  market: ConnState;
  account: ConnState;
  set: (k: 'market' | 'account', v: ConnState) => void;
}>((set) => ({
  market: 'idle',
  account: 'idle',
  set: (k, v) => set({ [k]: v } as Partial<{ market: ConnState; account: ConnState }>),
}));
