import { create } from "zustand";

export interface MarketTick {
  key: string;
  symbol: string;
  exchange: string;
  ltp: number;
  close: number | null;
  change: number | null;
  changePct: number | null;
  volume: number | null;
  exchangeTs: string | null;
  ts: string;
  source: "ws" | "rest";
}

export type FeedState = "connected" | "stale" | "closed";

export interface FeedStatus {
  status: FeedState;
  lastExchangeTs: string | null;
  lastMessageAt: string | null;
}

interface MarketStore {
  /** Latest tick per `EXCH:SYMBOL` key. Only ticks that arrived in a flush get a new object. */
  ticks: Record<string, MarketTick>;
  /** Latest tick per bare symbol (alias of `ticks`, for call sites that only know the symbol). */
  bySymbol: Record<string, MarketTick>;
  connected: boolean;
  feed: FeedStatus;
  applyTicks: (batch: MarketTick[]) => void;
  setConnected: (connected: boolean) => void;
  setFeed: (feed: FeedStatus) => void;
}

export const useMarketStore = create<MarketStore>()((set) => ({
  ticks: {},
  bySymbol: {},
  connected: false,
  feed: { status: "closed", lastExchangeTs: null, lastMessageAt: null },
  applyTicks: (batch) =>
    set((state) => {
      const ticks = { ...state.ticks };
      const bySymbol = { ...state.bySymbol };
      for (const t of batch) {
        ticks[t.key] = t;
        bySymbol[t.symbol] = t;
      }
      return { ticks, bySymbol };
    }),
  setConnected: (connected) => set({ connected }),
  setFeed: (feed) => set({ feed }),
}));

/** Resolve a tick for `EXCH:SYMBOL` or a bare symbol (NSE, NFO, then BSE preferred, as before). */
export function findTick(
  state: Pick<MarketStore, "ticks" | "bySymbol">,
  symbol: string | null | undefined,
): MarketTick | null {
  if (!symbol) return null;
  if (state.ticks[symbol]) return state.ticks[symbol];
  const raw = symbol.includes(":") ? symbol.split(":")[1] : symbol;
  return (
    state.ticks[`NSE:${raw}`] ??
    state.ticks[`NFO:${raw}`] ??
    state.ticks[`BSE:${raw}`] ??
    state.bySymbol[raw] ??
    null
  );
}
