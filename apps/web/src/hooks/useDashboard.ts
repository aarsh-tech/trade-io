import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { marketApi } from "@/lib/api";
import { TRADING_QUERY } from "@/lib/query-options";
import { useMarketSocket } from "@/components/market-socket-provider";
import { useMarketStore, type MarketTick } from "@/store/market-store";

export type { FeedState, FeedStatus } from "@/store/market-store";

export const DASHBOARD_KEYS = {
  overview: ["dashboard", "overview"] as const,
};

export function useDashboard() {
  const { subscribe } = useMarketSocket();
  const feed = useMarketStore((s) => s.feed);

  const marketOverviewQuery = useQuery({
    queryKey: DASHBOARD_KEYS.overview,
    queryFn: async () => {
      const res = await marketApi.marketOverview();
      return res.data.data;
    },
    // 30s automatic polling fallback (WebSocket streams real-time LTP ticks)
    refetchInterval: 30000,
    staleTime: 15000,
    ...TRADING_QUERY,
  });

  // Live ticks come from the shared MarketSocketProvider; overlay them on the REST snapshot.
  const symbolsKey = useMemo(() => {
    const d = marketOverviewQuery.data;
    if (!d) return "";
    return [...d.indices.map((i: any) => i.key), ...d.stocks.map((s: any) => s.key)].join(",");
  }, [marketOverviewQuery.data?.indices, marketOverviewQuery.data?.stocks]);

  useEffect(() => {
    if (!symbolsKey) return;
    return subscribe(symbolsKey.split(","));
  }, [symbolsKey, subscribe]);

  const ticks = useMarketStore(
    useShallow((s) => {
      const out: Record<string, MarketTick> = {};
      if (!symbolsKey) return out;
      for (const key of symbolsKey.split(",")) if (s.ticks[key]) out[key] = s.ticks[key];
      return out;
    }),
  );

  const market = useMemo(() => {
    const data = marketOverviewQuery.data;
    if (!data) return { indices: [], stocks: [] };
    return {
      ...data,
      indices: data.indices.map((idx: any) => {
        const t = ticks[idx.key];
        if (!t) return idx;
        return { ...idx, price: t.ltp, change: t.changePct ?? idx.change, changeAbs: t.change ?? idx.changeAbs };
      }),
      stocks: data.stocks.map((stock: any) => {
        const t = ticks[stock.key];
        if (!t) return stock;
        return { ...stock, price: t.ltp, change: t.changePct ?? stock.change };
      }),
    };
  }, [marketOverviewQuery.data, ticks]);

  const moversQuery = useQuery({
    queryKey: ["dashboard", "movers"],
    queryFn: async () => {
      const res = await marketApi.movers();
      return res.data.data;
    },
    refetchInterval: 30 * 1000,
    ...TRADING_QUERY,
  });

  return {
    market,
    feed,
    movers: moversQuery.data || { topGainers: [], topLosers: [] },
    isLoading: marketOverviewQuery.isLoading || moversQuery.isLoading,
    refresh: () => {
      marketOverviewQuery.refetch();
      moversQuery.refetch();
    },
  };
}
