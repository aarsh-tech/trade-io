import { useQuery, useQueryClient } from "@tanstack/react-query";
import { marketApi } from "@/lib/api";
import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";

export const DASHBOARD_KEYS = {
  overview: ["dashboard", "overview"] as const,
  stats: ["dashboard", "stats"] as const,
};

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL?.replace('/v1', '') || "http://localhost:3002";

export function useDashboard() {
  const queryClient = useQueryClient();
  const [socket, setSocket] = useState<Socket | null>(null);

  const marketOverviewQuery = useQuery({
    queryKey: DASHBOARD_KEYS.overview,
    queryFn: async () => {
      const res = await marketApi.marketOverview();
      return res.data.data;
    },
    // No more short refetchInterval since we use websockets
    refetchInterval: 5 * 60 * 1000, 
  });

  const statsQuery = useQuery({
    queryKey: DASHBOARD_KEYS.stats,
    queryFn: async () => {
      return {
        portfolioValue: 165800,
        todayPnl: 3650,
        pnlChange: 2.25,
        winRate: 68.4,
      };
    },
  });

  // WebSocket Setup
  useEffect(() => {
    if (!marketOverviewQuery.data) return;

    const data = marketOverviewQuery.data;
    const symbolsToSub = [
      ...data.indices.map((i: any) => i.symbol),
      ...data.stocks.map((s: any) => s.symbol),
    ];

    const socketInstance = io(`${SOCKET_URL}/market`, {
      transports: ['websocket'],
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

  return {
    market: marketOverviewQuery.data || { indices: [], stocks: [] },
    stats: statsQuery.data || { portfolioValue: 0, todayPnl: 0, pnlChange: 0, winRate: 0 },
    isLoading: marketOverviewQuery.isLoading || statsQuery.isLoading,
    refresh: () => {
      marketOverviewQuery.refetch();
      statsQuery.refetch();
    }
  };
}
