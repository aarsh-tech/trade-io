import { useCallback, useEffect, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useMarketSocket } from "@/components/market-socket-provider";
import { findTick, useMarketStore } from "@/store/market-store";

export type { MarketTick } from "@/store/market-store";

/** Latest tick for one symbol; re-renders only when that symbol's tick changes. Does not subscribe. */
export function useTick(symbol: string | null | undefined) {
  return useMarketStore((s) => findTick(s, symbol));
}

/**
 * Subscribes to `symbols` on the shared market socket (ref-counted) and returns their live prices.
 * Only the requested symbols are selected, so the caller re-renders when one of them ticks, not on every tick.
 */
export function useMarketData(symbols: string[]) {
  const { subscribe } = useMarketSocket();
  const symbolsKey = symbols.slice().sort().join(",");

  useEffect(() => {
    const list = symbolsKey ? symbolsKey.split(",") : [];
    if (list.length === 0) return;
    return subscribe(list);
  }, [symbolsKey, subscribe]);

  const isConnected = useMarketStore((s) => s.connected);

  const prices = useMarketStore(
    useShallow((s) => {
      const out: Record<string, number> = {};
      if (!symbolsKey) return out;
      for (const sym of symbolsKey.split(",")) {
        const t = findTick(s, sym);
        if (!t) continue;
        out[sym] = t.ltp;
        out[t.key] = t.ltp;
        out[t.symbol] = t.ltp;
      }
      return out;
    }),
  );

  const getPrice = useCallback(
    (symbol: string) => {
      if (!symbol) return null;
      const raw = symbol.includes(":") ? symbol.split(":")[1] : symbol;
      return prices[symbol] ?? prices[raw] ?? prices[`NSE:${raw}`] ?? prices[`NFO:${raw}`] ?? prices[`BSE:${raw}`] ?? null;
    },
    [prices],
  );

  return useMemo(() => ({ prices, getPrice, isConnected }), [prices, getPrice, isConnected]);
}
