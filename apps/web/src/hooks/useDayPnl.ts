import { useQuery } from "@tanstack/react-query";
import { orderApi } from "@/lib/api";
import { useRiskStatus } from "@/hooks/useRiskStatus";

export interface DayRealised {
  date: string;
  realizedPnl: number;
  grossPnl: number;
  charges: number;
  algoPnl: number;
  manualPnl: number;
  trades: number;
}

/**
 * Today's P&L: realised from real fills (same FIFO/charges matching as the ledger), unrealised from
 * live positions. Shared by the status bar and the dashboard so each endpoint is polled once.
 */
export function useDayPnl() {
  const { data: risk } = useRiskStatus();
  const { data: realised, isLoading } = useQuery({
    queryKey: ["orders", "day-pnl"],
    queryFn: async () => (await orderApi.dayPnl()).data?.data as DayRealised,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const unrealized = risk?.unrealizedPnl;
  const total = realised && unrealized !== undefined ? realised.realizedPnl + unrealized : undefined;
  return { realised, unrealized, total, risk, isLoading };
}
