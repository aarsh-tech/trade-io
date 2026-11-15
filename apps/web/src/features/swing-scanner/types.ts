export interface ScanResult {
  rank: number;
  symbol: string;
  exchange: string;
  pattern: string;
  score: number;
  confidence: string;
  trendStrength: string;
  volumeSignal: string;
  currentPrice: number;
  pivotPrice: number;
  entryPrice: number;
  stopLoss: number;
  target1: number;
  target2: number;
  target3: number;
  riskReward: number;
  riskPct: number;
  contractions: number;
  suggestedQty: number;
  notes: string[];
  direction?: "LONG" | "SHORT";
  isFnO?: boolean;
  lotSize?: number;
}

export function getDirection(r: ScanResult): "LONG" | "SHORT" {
  if (r.direction) return r.direction;
  return r.target1 > r.entryPrice ? "LONG" : "SHORT";
}

/** One card / list row: a stock can have several setups (e.g. inside-bar long and short). */
export function resultKey(r: ScanResult): string {
  return `${r.symbol}-${r.pattern}-${getDirection(r)}`;
}

export const PATTERN_META: Record<string, { label: string; color: string }> = {
  VCP: { label: "VCP Contraction", color: "text-signal" },
  ROCKET_BASE: { label: "Rocket Base", color: "text-warn" },
  TIGHT_AREA: { label: "Tight Area", color: "text-accent-foreground" },
  INTRADAY_MOMENTUM: { label: "Momentum Surge", color: "text-profit" },
  CUP_HANDLE: { label: "Cup & Handle", color: "text-profit" },
  DAILY_INSIDE: { label: "1D Inside", color: "text-loss" },
  WEEKLY_INSIDE: { label: "Weekly Inside", color: "text-accent-foreground" },
  MONTHLY_INSIDE: { label: "Monthly Inside", color: "text-signal" },
  EMA_PULLBACK: { label: "20/50 EMA Pullback", color: "text-muted-foreground" },
};

export function patternMeta(pattern: string) {
  return PATTERN_META[pattern] ?? { label: pattern, color: "text-foreground/75" };
}

/** Quantity sized so T1 earns `targetRs` (F&O rounded to whole lots). Same rule the cards have always used. */
export function sizePosition(r: ScanResult, targetRs: number) {
  const risk = Math.abs(r.entryPrice - r.stopLoss);
  const isFnO = r.isFnO ?? false;
  const lotSize = r.lotSize ?? 1;
  const rawQty = risk > 0 ? Math.ceil(targetRs / risk) : r.suggestedQty;
  const lots = isFnO ? Math.max(1, Math.round(rawQty / lotSize)) : 0;
  const qty = isFnO ? lots * lotSize : rawQty;
  return { isFnO, lotSize, lots, qty };
}
