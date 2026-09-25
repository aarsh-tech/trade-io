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
      ...data.indices.map((i: any) => i.symbol),
      ...data.stocks.map((s: any) => s.symbol),
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

    socketInstance.on('ltp', (payload: { symbol: string; ltp: number }) => {
      queryClient.setQueryData(DASHBOARD_KEYS.overview, (oldData: any) => {
        if (!oldData) return oldData;
        
        const newLtp = payload.ltp;
        
        return {
          ...oldData,
          indices: oldData.indices.map((idx: any) => {
            if (idx.symbol === payload.symbol) {
              const prevPrice = idx.price - idx.changeAbs;
              const newChangeAbs = newLtp - (prevPrice || newLtp);
              const newChange = prevPrice ? (newChangeAbs / prevPrice) * 100 : 0;
              return { ...idx, price: newLtp, change: newChange, changeAbs: newChangeAbs };
            }
            return idx;
          }),
          stocks: oldData.stocks.map((stock: any) => {
            if (stock.symbol === payload.symbol) {
              // Usually we need previous close to calc % change.
              // Assuming change and changeAbs logic similar to indices.
              const prevPrice = stock.price ? stock.price / (1 + (stock.change / 100)) : newLtp;
              const newChangeAbs = newLtp - prevPrice;
              const newChange = prevPrice ? (newChangeAbs / prevPrice) * 100 : 0;
              return { ...stock, price: newLtp, change: newChange };
            }
            return stock;
          })
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
