import { BarChart2, Flame, Sparkles, TrendingUp, type LucideIcon } from "lucide-react";
import type { StrategyFormState } from "../new/types";

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
    type: "STOCKS_IN_PLAY",
    label: "Stocks-in-Play",
    tagline: "At 09:20 finds the stocks trading 10x their usual opening volume. In-play Fade (default) shorts a gap-up one when MFI, Stochastic, Bollinger or CMF turns down by 09:45, with a fixed stop and target; Opening-range break shorts the break of its first candle.",
    risk: "High",
    riskNote: "Short selling with runs of losing days; about 4 in 10 fade trades win and the winners are larger. Losing weeks are normal.",
    instrument: "Stocks (intraday, MIS, short selling)",
    bestFor: "News and results days, with fixed rupee risk per trade",
    timing: "Fade: 09:20 to 09:45 entries; ORB: until 15:00. Square-off 15:05",
    icon: Flame,
    tile: "bg-loss-subtle text-loss border-loss/30",
    defaultName: "In-play Fade",
    defaults: {
      symbol: "AUTO",
      exchange: "NSE",
      instrumentType: "STOCK",
      product: "MIS",
      stopLossRs: "500",
      maxTradesPerDay: "1",
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
  STOCKS_IN_PLAY: {
    Conservative: { stopLossRs: "250", maxTradesPerDay: "1" },
    Balanced: { stopLossRs: "400", maxTradesPerDay: "2" },
    Aggressive: { stopLossRs: "600", maxTradesPerDay: "3" },
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

  switch (form.type) {
    case "STOCKS_IN_PLAY": {
      const perTrade = n(form.stopLossRs);
      if (form.sipSetup === "FADE") {
        const tr = n(form.sipTargetR);
        return {
          perTrade: perTrade || null,
          perDay: perTrade ? perTrade * trades : null,
          targetPerTrade: perTrade && tr > 0 ? perTrade * tr : null,
          basis: `Shares are sized so the stop (${form.sipStopPct || 1.2}% from the entry) loses at most your max loss, and your free Zerodha funds allow at Zerodha's leverage for the stock (fallback ${form.sipLeverage || 4}x). A jump through the stop can lose a little more. Target ${tr > 0 ? `${tr}x the stop` : "off"}${n(form.sipBreakevenAtR) > 0 ? `; the stop moves to ${n(form.sipBreakevenLockR) > 0 ? `entry +${form.sipBreakevenLockR}x` : "the entry"} at +${form.sipBreakevenAtR}x` : ""}${form.sipProfitLock !== false ? ", then locks +0.5x at +1.5x and +1.5x at +2.5x" : ""}; otherwise 15:05.`,
        };
      }
      if (form.sipSetup === "OI") {
        const tr = n(form.sipTargetR);
        return {
          perTrade: perTrade || null,
          perDay: perTrade || null,
          targetPerTrade: perTrade && tr > 0 ? perTrade * tr : null,
          basis: `Shares are sized on yesterday's close so the stop (${form.sipStopPct || 1}% from the auction fill) loses at most your max loss, and your free Zerodha funds allow at Zerodha's leverage for the stock (fallback ${form.sipLeverage || 4}x). A jump through the stop can lose a little more. Target ${tr > 0 ? `${tr}x the stop` : "off"}; otherwise 15:05. 1 trade a day.`,
        };
      }
      if (form.sipSetup === "TREND") {
        return {
          perTrade: perTrade || null,
          perDay: perTrade ? perTrade * trades : null,
          targetPerTrade: null,
          basis: `Shares are sized so the stop at the day low (long) or high (short) loses at most your max loss, and your free Zerodha funds allow at Zerodha's leverage for the stock (fallback ${form.sipLeverage || 4}x); a far stop means fewer shares. A jump through the stop can lose a little more. No target: the trade rides until the 15-EMA crosses back over the 40-EMA, else 15:05.`,
        };
      }
      return {
        perTrade: perTrade || null,
        perDay: perTrade ? perTrade * trades : null,
        targetPerTrade: null,
        basis: `Shares are sized so the stop (${form.sipStopAtr || 0.2} x the stock's daily ATR) loses at most your max loss, and your free Zerodha funds allow at Zerodha's leverage for the stock (fallback ${form.sipLeverage || 4}x, split over ${trades || 2} positions), so most trades risk less. A gap through the stop can lose a little more. No target: winners run to 15:05.`,
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
