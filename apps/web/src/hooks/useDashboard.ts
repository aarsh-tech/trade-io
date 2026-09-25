import { useQuery, useQueryClient } from "@tanstack/react-query";
import { marketApi, getSocketBaseUrl } from "@/lib/api";
import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";

export const DASHBOARD_KEYS = {
  overview: ["dashboard", "overview"] as const,
};

export function useDashboard() {
  const queryClient = useQueryClient();
  const [socket, setSocket] = useState<Socket | null>(null);

  const marketOverviewQuery = useQuery({
    queryKey: DASHBOARD_KEYS.overview,
    queryFn: async () => {
      const res = await marketApi.marketOverview();
      return res.data.data;
    },
    // 30s automatic polling fallback (WebSocket streams real-time LTP ticks)
    refetchInterval: 30000,
    staleTime: 15000,
  });

  // WebSocket Setup
  useEffect(() => {
    if (!marketOverviewQuery.data) return;

    const data = marketOverviewQuery.data;
    const symbolsToSub = [
      ...data.indices.map((i: any) => i.key),
      ...data.stocks.map((s: any) => s.key),
    ];

    const token = localStorage.getItem('accessToken');
    if (!token) return;

    const socketInstance = io(`${getSocketBaseUrl()}/market`, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });

    socketInstance.on('connect', () => {
      socketInstance.emit('subscribe', { symbols: symbolsToSub });
    });

    // One batched message per flush; each tick carries Kite's previous close, so change/changePct are
    // exact (no re-deriving from the last price).
    socketInstance.on('ticks', (ticks: Array<{ key: string; ltp: number; change: number | null; changePct: number | null }>) => {
      if (!Array.isArray(ticks) || ticks.length === 0) return;
      const byKey = new Map(ticks.map((t) => [t.key, t]));
      queryClient.setQueryData(DASHBOARD_KEYS.overview, (oldData: any) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          indices: oldData.indices.map((idx: any) => {
            const t = byKey.get(idx.key);
            if (!t) return idx;
            return { ...idx, price: t.ltp, change: t.changePct ?? idx.change, changeAbs: t.change ?? idx.changeAbs };
          }),
          stocks: oldData.stocks.map((stock: any) => {
            const t = byKey.get(stock.key);
            if (!t) return stock;
            return { ...stock, price: t.ltp, change: t.changePct ?? stock.change };
          }),
        };
      });
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, [marketOverviewQuery.data?.stocks?.length, queryClient]);

  const moversQuery = useQuery({
    queryKey: ["dashboard", "movers"],
    queryFn: async () => {
      const res = await marketApi.movers();
      return res.data.data;
    },
    refetchInterval: 30 * 1000,
  });

  return {
    market: marketOverviewQuery.data || { indices: [], stocks: [] },
    movers: moversQuery.data || { topGainers: [], topLosers: [] },
    isLoading: marketOverviewQuery.isLoading || moversQuery.isLoading,
    refresh: () => {
      marketOverviewQuery.refetch();
      moversQuery.refetch();
    },
  };
}
