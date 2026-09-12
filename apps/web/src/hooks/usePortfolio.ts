import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { brokerApi } from "@/lib/api";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export const PORTFOLIO_KEYS = {
  all: ["portfolio"] as const,
  holdings: (brokerId?: string) => [...PORTFOLIO_KEYS.all, "holdings", brokerId].filter(Boolean),
  positions: (brokerId?: string) => [...PORTFOLIO_KEYS.all, "positions", brokerId].filter(Boolean),
  margins: (brokerId?: string) => [...PORTFOLIO_KEYS.all, "margins", brokerId].filter(Boolean),
};

export function usePortfolio(brokerId?: string | null) {
  const queryClient = useQueryClient();
  const router = useRouter();

  const holdingsQuery = useQuery({
    queryKey: PORTFOLIO_KEYS.holdings(brokerId || undefined),
    queryFn: async () => {
      if (!brokerId) return [];
      const res = await brokerApi.holdings(brokerId);
      return res.data.data;
    },
    enabled: !!brokerId,
    // Holdings are long-term CNC delivery assets; refresh lazily every 60s or on manual sync
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const positionsQuery = useQuery({
    queryKey: PORTFOLIO_KEYS.positions(brokerId || undefined),
    queryFn: async () => {
      if (!brokerId) return [];
      const res = await brokerApi.positions(brokerId);
      return res.data.data;
    },
    enabled: !!brokerId,
    // Positions refresh every 15s while real-time LTP & PnL stream over WebSocket
    refetchInterval: 15000,
    staleTime: 5000,
  });

  const marginsQuery = useQuery({
    queryKey: PORTFOLIO_KEYS.margins(brokerId || undefined),
    queryFn: async () => {
      if (!brokerId) return null;
      const res = await brokerApi.margins(brokerId);
      return res.data.data;
    },
    enabled: !!brokerId,
    // Margins refresh every 30s to prevent Zerodha rate limit throttling
    refetchInterval: 30000,
    staleTime: 15000,
  });

  const renewSessionMutation = useMutation({
    mutationFn: async (rawToken: string) => {
      if (!brokerId) throw new Error("No broker selected");
      let token = (rawToken || "").trim();
      if (token.includes("request_token=")) {
        try {
          const match = token.match(/request_token=([a-zA-Z0-9]+)/);
          if (match && match[1]) token = match[1];
        } catch {}
      }
      if (!token) throw new Error("Please enter or paste a valid request token");
      const res = await brokerApi.setSession(brokerId, token);
      return res.data;
    },
    onSuccess: async (data: any) => {
      const payload = data?.data;
      // 1. Immediately prime query cache with fresh live data from backend response
      if (payload?.margins) {
        queryClient.setQueryData(PORTFOLIO_KEYS.margins(brokerId || undefined), payload.margins);
      }
      if (payload?.holdings) {
        queryClient.setQueryData(PORTFOLIO_KEYS.holdings(brokerId || undefined), payload.holdings);
      }
      if (payload?.positions) {
        queryClient.setQueryData(PORTFOLIO_KEYS.positions(brokerId || undefined), payload.positions);
      }

      // 2. Refetch queries in parallel to ensure 100% synchronization across pages
      await Promise.allSettled([
        queryClient.refetchQueries({ queryKey: PORTFOLIO_KEYS.all, exact: false }),
        queryClient.refetchQueries({ queryKey: ["brokers"], exact: false }),
        queryClient.refetchQueries({ queryKey: ["dashboard"], exact: false }),
      ]);

      toast.success("Broker session authenticated! Live portfolio & margins synced.");
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || err?.message || "Failed to renew session");
    },
  });

  return {
    holdings: holdingsQuery.data || [],
    positions: positionsQuery.data || [],
    margins: marginsQuery.data || null,
    isLoading: holdingsQuery.isLoading || positionsQuery.isLoading || marginsQuery.isLoading,
    isHoldingsLoading: holdingsQuery.isLoading,
    isPositionsLoading: positionsQuery.isLoading,
    isMarginsLoading: marginsQuery.isLoading,
    error: holdingsQuery.error || positionsQuery.error || marginsQuery.error,
    refreshHoldings: () => holdingsQuery.refetch(),
    refreshPositions: () => positionsQuery.refetch(),
    getLoginUrl: async () => {
      if (!brokerId) return null;
      try {
        const res = await brokerApi.loginUrl(brokerId);
        return res.data?.url || (res.data as any)?.data?.url || null;
      } catch (err: any) {
        toast.error(err?.response?.data?.message || "Failed to retrieve broker login URL. Please check broker credentials in Settings.");
        return null;
      }
    },
    renewSession: renewSessionMutation.mutateAsync,
    isRenewing: renewSessionMutation.isPending,
    placeOrder: async (data: any) => {
      if (!brokerId) throw new Error("No broker selected");
      const res = await brokerApi.placeOrder(brokerId, data);
      queryClient.invalidateQueries({ queryKey: PORTFOLIO_KEYS.positions(brokerId) });
      // toast.success(`Order placed: ${res.data.data.orderId}`);
      return res.data.data;
    }
  };
}

