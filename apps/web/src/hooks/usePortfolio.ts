import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { brokerApi } from "@/lib/api";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export const PORTFOLIO_KEYS = {
  all: ["portfolio"] as const,
  holdings: (brokerId?: string) => [...PORTFOLIO_KEYS.all, "holdings", brokerId].filter(Boolean),
  positions: (brokerId?: string) => [...PORTFOLIO_KEYS.all, "positions", brokerId].filter(Boolean),
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
  });

  const positionsQuery = useQuery({
    queryKey: PORTFOLIO_KEYS.positions(brokerId || undefined),
    queryFn: async () => {
      if (!brokerId) return [];
      const res = await brokerApi.positions(brokerId);
      return res.data.data;
    },
    enabled: !!brokerId,
  });

  const renewSessionMutation = useMutation({
    mutationFn: (requestToken: string) => {
      if (!brokerId) throw new Error("No broker selected");
      return brokerApi.setSession(brokerId, requestToken);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PORTFOLIO_KEYS.all });
      queryClient.invalidateQueries({ queryKey: ["brokers"] }); // Force broker list to refresh
      toast.success("Session renewed successfully!");
      router.push("/portfolio");
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || "Failed to renew session");
    },
  });

  return {
    holdings: holdingsQuery.data || [],
    positions: positionsQuery.data || [],
    isLoading: holdingsQuery.isLoading || positionsQuery.isLoading,
    isHoldingsLoading: holdingsQuery.isLoading,
    isPositionsLoading: positionsQuery.isLoading,
    error: holdingsQuery.error || positionsQuery.error,
    refreshHoldings: () => holdingsQuery.refetch(),
    getLoginUrl: async () => {
      if (!brokerId) return null;
      const res = await brokerApi.loginUrl(brokerId);
      return res.data.url;
    },
    renewSession: renewSessionMutation.mutateAsync,
    isRenewing: renewSessionMutation.isPending,
  };
}
