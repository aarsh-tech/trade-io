import { Flame, TrendingUp, Zap, Target, BarChart2, Sparkles, type LucideIcon } from "lucide-react";
import type { StrategyFormState } from "../new/types";
import { getLotSize } from "../new/types";

export type StrategyType = Exclude<StrategyFormState["type"], "">;
export type RiskLevel = "Low" | "Medium" | "High";

export interface StrategyTypeMeta {
  type: StrategyType;
  label: string;
  /** One plain-English sentence: what it does. */
  tagline: string;
  risk: RiskLevel;
  /** Why this risk level. */
  riskNote: string;
  instrument: string;
  bestFor: string;
  timing: string;
  icon: LucideIcon;
  /** Semantic token classes for the icon tile. */
  tile: string;
  /** Name suggested when the user has not typed one. */
  defaultName: string;
  /** Form values applied when the type is picked on the create page. */
  defaults: Partial<StrategyFormState>;
}

export const STRATEGY_TYPES: StrategyTypeMeta[] = [
  {
    type: "EMA_VWAP_CROSSOVER",
    label: "Intraday Stock Picker",
    tagline: "Picks the day's strongest F&O stock and trades it on EMA + VWAP confirmation with a fixed rupee stop-loss and target.",
    risk: "Medium",
    riskNote: "Loss per trade is capped at your stop-loss amount.",
    instrument: "Stocks (intraday, MIS)",
    bestFor: "Simple, fixed-risk daily trades",
    timing: "From 09:15",
    icon: TrendingUp,
    tile: "bg-profit-subtle text-profit border-profit/30",
    defaultName: "Intraday Stock Picker",
    defaults: {
      symbol: "AUTO",
      exchange: "NSE",
      instrumentType: "STOCK",
      product: "MIS",
      targetRs: "500",
      stopLossRs: "500",
      maxTradesPerDay: "2",
    },
  },
  {
    type: "BREAKOUT_15MIN",
    label: "15-Min Breakout",
    tagline: "Trades the break of the first 15-minute range, and reverses when a breakout turns out to be a trap.",
    risk: "Medium",
    riskNote: "Stops for the day after the loss limit you set (1 by default).",
    instrument: "Index options (NIFTY, BANKNIFTY)",
    bestFor: "Trending mornings, disciplined loss limits",
    timing: "From 09:30",
    icon: BarChart2,
    tile: "bg-brand-subtle text-accent-foreground border-primary/30",
    defaultName: "15-Min Breakout",
    defaults: {
      symbol: "NIFTY 50",
      exchange: "NSE",
      instrumentType: "INDEX",
      product: "MIS",
      lots: "1",
      targetRs: "1500",
      stopLossRs: "1000",
      maxTradesPerDay: "2",
    },
  },
  {
    type: "NIFTY_OPTIONS_SCALPER",
    label: "Nifty Options Scalper",
    tagline: "Takes quick point-based scalps on index options, with an exchange stop-loss and a daily loss circuit-breaker.",
    risk: "High",
    riskNote: "Fast trades; lots can scale with your available margin.",
    instrument: "Index options (NIFTY, SENSEX)",
    bestFor: "Short scalps with tight, point-based risk",
    timing: "From 09:20",
    icon: Target,
    tile: "bg-signal-subtle text-signal border-signal/30",
    defaultName: "Nifty Options Scalper",
    defaults: {
      symbol: "NIFTY 50",
      exchange: "NSE",
      instrumentType: "INDEX",
      product: "MIS",
      lots: "1",
      dsTargetPoints: "10",
      dsStopLossPoints: "7",
      maxTradesPerDay: "3",
    },
  },
  {
    type: "GAMMA_BLAST_EXPIRY",
    label: "Daily Index Scalper",
    tagline: "Trades NIFTY or SENSEX option breakouts through the day and trails profit as the option runs.",
    risk: "High",
    riskNote: "Options can move fast; the stop-loss is your main protection.",
    instrument: "Index options (NIFTY / SENSEX)",
    bestFor: "Active traders comfortable with fast option moves",
    timing: "09:20 to 15:25",
    icon: Zap,
    tile: "bg-warn-subtle text-warn border-warn/30",
    defaultName: "Daily Index Scalper",
    defaults: {
      symbol: "AUTO",
      exchange: "NFO",
      instrumentType: "OPTION",
      product: "NRML",
      lots: "1",
      gbIndex: "AUTO",
      gbStartTime: "09:20",
      gbEndTime: "15:25",
      gbEnableOiFilter: true,
      gbEnableVolumeSurge: true,
      gbEnableRatchetTrailing: true,
      gbInitialSlPct: "50",
      stopLossRs: "500",
      targetRs: "1500",
      maxTradesPerDay: "2",
    },
  },
  {
    type: "STOCK_OPTIONS_BUYING",
    label: "Stock Option Auto-Hunter",
    tagline: "Scans F&O stocks for the strongest mover, buys an option on it, and books profit in two steps.",
    risk: "High",
    riskNote: "You can lose the premium paid on a trade.",
    instrument: "Stock options (auto-picked)",
    bestFor: "Momentum days, hands-off stock selection",
    timing: "From 09:15",
    icon: Flame,
    tile: "bg-brand-subtle text-accent-foreground border-primary/30",
    defaultName: "Stock Option Auto-Hunter",
    defaults: {
      symbol: "AUTO",
      exchange: "NSE",
      instrumentType: "STOCK",
      sIsAutoStockSelect: true,
      sMaxCapital: "25000",
      lots: "1",
      maxTradesPerDay: "1",
    },
  },
];

const FALLBACK_META: Omit<StrategyTypeMeta, "type" | "label"> = {
  tagline: "Custom strategy configuration.",
  risk: "Medium",
  riskNote: "",
  instrument: "Varies",
  bestFor: "",
  timing: "",
  icon: Sparkles,
  tile: "bg-secondary text-foreground border-border",
  defaultName: "",
  defaults: {},
};

export function getTypeMeta(type: string): StrategyTypeMeta {
  const found = STRATEGY_TYPES.find((t) => t.type === type);
  if (found) return found;
  return { ...FALLBACK_META, type: (type || "EMA_VWAP_CROSSOVER") as StrategyType, label: type ? type.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : "Strategy" };
}

export const RISK_STYLE: Record<RiskLevel, string> = {
  Low: "bg-profit-subtle text-profit border-profit/30",
  Medium: "bg-warn-subtle text-warn border-warn/30",
  High: "bg-loss-subtle text-loss border-loss/30",
};

// ─── Risk presets ─────────────────────────────────────────────────────────────

export type PresetLevel = "Conservative" | "Balanced" | "Aggressive";
export const PRESET_LEVELS: PresetLevel[] = ["Conservative", "Balanced", "Aggressive"];

type P = Partial<StrategyFormState>;
const PRESETS: Record<string, Record<PresetLevel, P>> = {
  BREAKOUT_15MIN: {
    Conservative: { stopLossRs: "500", targetRs: "1000", maxTradesPerDay: "1", b15MaxLossesPerDay: "1" },
    Balanced: { stopLossRs: "1000", targetRs: "1500", maxTradesPerDay: "2", b15MaxLossesPerDay: "1" },
    Aggressive: { stopLossRs: "1500", targetRs: "3000", maxTradesPerDay: "3", b15MaxLossesPerDay: "2" },
  },
  EMA_VWAP_CROSSOVER: {
    Conservative: { stopLossRs: "300", targetRs: "300", maxTradesPerDay: "1" },
    Balanced: { stopLossRs: "500", targetRs: "500", maxTradesPerDay: "2" },
    Aggressive: { stopLossRs: "800", targetRs: "1200", maxTradesPerDay: "3" },
  },
  GAMMA_BLAST_EXPIRY: {
    Conservative: { stopLossRs: "300", targetRs: "1000", maxTradesPerDay: "1" },
    Balanced: { stopLossRs: "500", targetRs: "1500", maxTradesPerDay: "2" },
    Aggressive: { stopLossRs: "800", targetRs: "2500", maxTradesPerDay: "3" },
  },
  NIFTY_OPTIONS_SCALPER: {
    Conservative: { dsStopLossPoints: "5", dsTargetPoints: "8", maxTradesPerDay: "2", dsMaxLossesPerDay: "1" },
    Balanced: { dsStopLossPoints: "7", dsTargetPoints: "10", maxTradesPerDay: "3", dsMaxLossesPerDay: "2" },
    Aggressive: { dsStopLossPoints: "10", dsTargetPoints: "20", maxTradesPerDay: "4", dsMaxLossesPerDay: "3" },
  },
  STOCK_OPTIONS_BUYING: {
    Conservative: { sMaxCapital: "15000", sRiskRewardRatio: "2", maxTradesPerDay: "1", sMaxLossesPerDay: "1" },
    Balanced: { sMaxCapital: "25000", sRiskRewardRatio: "2", maxTradesPerDay: "1", sMaxLossesPerDay: "1" },
    Aggressive: { sMaxCapital: "50000", sRiskRewardRatio: "3", maxTradesPerDay: "2", sMaxLossesPerDay: "2" },
  },
};
PRESETS.EMA_RSI_OPTIONS = PRESETS.EMA_VWAP_CROSSOVER;

export function getPresets(type: string): Record<PresetLevel, P> | null {
  return PRESETS[type] ?? null;
}

/** Which preset the form currently matches exactly, or null when the user has customised it. */
export function activePreset(form: StrategyFormState): PresetLevel | null {
  const presets = getPresets(form.type);
  if (!presets) return null;
  for (const level of PRESET_LEVELS) {
    const p = presets[level];
    if ((Object.keys(p) as (keyof StrategyFormState)[]).every((k) => String(form[k]) === String(p[k]))) return level;
  }
  return null;
}

// ─── Live risk estimate ───────────────────────────────────────────────────────

export interface RiskEstimate {
  perTrade: number | null;
  perDay: number | null;
  targetPerTrade: number | null;
  /** How the numbers were derived, shown under the summary. */
  basis: string;
}

const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

export function estimateRisk(form: StrategyFormState): RiskEstimate {
  const trades = Math.max(0, Math.floor(n(form.maxTradesPerDay)));
  const lotSize = form.lotSize || getLotSize(form.symbol, form.lotSize);
  const qty = Math.max(0, n(form.lots)) * lotSize;

  switch (form.type) {
    case "STOCK_OPTIONS_BUYING": {
      const perTrade = n(form.sMaxCapital);
      const cap = Math.max(0, Math.floor(n(form.sMaxLossesPerDay) || 1));
      return {
        perTrade: perTrade || null,
        perDay: perTrade ? perTrade * Math.min(trades, cap) : null,
        targetPerTrade: null,
        basis: "Worst case: the full premium you deploy, times the trades allowed before the daily loss limit.",
      };
    }
    case "NIFTY_OPTIONS_SCALPER": {
      const perTrade = n(form.dsStopLossPoints) * qty;
      const cap = Math.max(0, Math.floor(n(form.dsMaxLossesPerDay) || 1));
      const dyn = form.dsEnableDynamicSizing !== false;
      return {
        perTrade: perTrade || null,
        perDay: perTrade ? perTrade * Math.min(trades, cap) : null,
        targetPerTrade: n(form.dsTargetPoints) * qty || null,
        basis: dyn
          ? `Stop-loss points x ${form.lots || 1} base lot(s). Dynamic sizing can add lots (up to ${form.dsMaxLots || 25}), which raises these numbers.`
          : "Stop-loss points x quantity, times the trades allowed before the loss limit.",
      };
    }
    case "BREAKOUT_15MIN": {
      const perTrade = n(form.stopLossRs);
      const cap = Math.max(0, Math.floor(n(form.b15MaxLossesPerDay) || 1));
      return {
        perTrade: perTrade || null,
        perDay: perTrade ? perTrade * Math.min(trades, cap) : null,
        targetPerTrade: n(form.targetRs) || null,
        basis: "Stop-loss per trade, times the trades allowed before the daily loss limit.",
      };
    }
    default: {
      const perTrade = n(form.stopLossRs);
      return {
        perTrade: perTrade || null,
        perDay: perTrade ? perTrade * trades : null,
        targetPerTrade: n(form.targetRs) || null,
        basis: "Stop-loss per trade, times the maximum trades per day.",
      };
    }
  }
}

export const inr = (v: number | null | undefined) =>
  v === null || v === undefined ? "n/a" : `₹${Math.round(v).toLocaleString("en-IN")}`;
