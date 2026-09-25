import { useQuery } from "@tanstack/react-query";
import { riskApi } from "@/lib/api";

export interface RiskStatus {
  killSwitchActive: boolean;
  totalDailyPnl: number;
  realizedPnl: number;
  unrealizedPnl: number;
  maxDailyLoss: number;
  lossUsagePct: number;
}

/** Shared by the top bar and the status bar so the (broker-hitting) endpoint is polled once. */
export function useRiskStatus() {
  return useQuery({
    queryKey: ["risk", "status"],
    queryFn: async () => (await riskApi.getStatus()).data?.data as RiskStatus,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}
