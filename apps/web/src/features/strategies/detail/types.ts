const LOT_SIZES: Record<string, number> = {
  NIFTY: 65,
  BANKNIFTY: 30,
  SENSEX: 20,
  FINNIFTY: 60,
  MIDCPNIFTY: 120,
};

export function getLotSize(symbol: string) {
  const s = (symbol || "").toUpperCase();
  if (s.includes("BANKNIFTY")) return 30;
  if (s.includes("NIFTY")) return 65;
  if (s.includes("SENSEX")) return 20;
  for (const key in LOT_SIZES) {
    if (s.includes(key)) return LOT_SIZES[key];
  }
  return 1;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StrategyConfig {
  symbol?: string;
  exchange?: string;
  instrumentType?: string;
  qty?: number;
  lots?: number;
  product?: string;
  stopLossRs?: number;
  targetRs?: number;
  maxTradesPerDay?: number;
  isPaperTrade?: boolean;
  emaPeriod?: number;
  riskRewardRatio?: number;
  moneyness?: string;
  enableDynamicAtr?: boolean;
  enableFakeoutReversal?: boolean;
  enableBreakevenTrail?: boolean;
  maxCapital?: number;
  target1RR?: number;
  target2RR?: number;
  minRvol?: number;
  triggerOffset?: number;
  enableHtfFilter?: boolean;
  enableTrailingSl?: boolean;
  dailyTargetRs?: number;
  dailyMaxLossRs?: number;
  [key: string]: any;
}

export interface Execution {
  id: string;
  status: string;
  startedAt: string;
  stoppedAt?: string;
  logs: string;
  errorMsg?: string;
}

export interface Strategy {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
  isPaperTrade: boolean;
  autoStart?: boolean;
  brokerAccountId: string | null;
  config: StrategyConfig;
  brokerAccount?: { broker: string; clientId: string } | null;
  executions: Execution[];
  createdAt: string;
  performance?: {
    totalTrades: number;
    winRate: number;
    netPnl: number;
    profitFactor: number;
    avgProfitPerWin: number;
  };
}
