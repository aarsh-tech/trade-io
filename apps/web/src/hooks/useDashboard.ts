import { useQuery } from "@tanstack/react-query";
import { marketApi, brokerApi } from "@/lib/api";

export const DASHBOARD_KEYS = {
  overview: ["dashboard", "overview"] as const,
  stats: ["dashboard", "stats"] as const,
};

export function useDashboard() {
  const marketOverviewQuery = useQuery({
    queryKey: DASHBOARD_KEYS.overview,
    queryFn: async () => {
      const res = await marketApi.marketOverview();
      return res.data.data;
    },
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  const statsQuery = useQuery({
    queryKey: DASHBOARD_KEYS.stats,
    queryFn: async () => {
      // In a real app, we'd fetch this from a summary endpoint
      // For now, we aggregate from holdings or a mock-up
      return {
        portfolioValue: 165800,
        todayPnl: 3650,
        pnlChange: 2.25,
        winRate: 68.4,
      };
    },
  });

  return {
    market: marketOverviewQuery.data || { indices: [], stocks: [] },
    stats: statsQuery.data,
    isLoading: marketOverviewQuery.isLoading || statsQuery.isLoading,
    refresh: () => {
      marketOverviewQuery.refetch();
      statsQuery.refetch();
    }
  };
}
