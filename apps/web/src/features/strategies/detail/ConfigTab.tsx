"use client";

import { Button } from "@/components/ui/button";
import { LogOut, Pencil, Shield, SlidersHorizontal, Zap } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { DetailCtx } from "./useStrategyDetail";
import { SectionCard, typeLabel } from "./shared";

type Row = { label: string; value: ReactNode | null | undefined; tone?: "profit" | "loss" | "muted" };

const TONE = { profit: "text-profit", loss: "text-loss", muted: "text-muted-foreground" } as const;

/** "Active (detail)" when the flag is on (default on), otherwise "Off". */
function toggle(flag: unknown, detail?: string): { value: string; tone?: Row["tone"] } {
  return flag !== false ? { value: detail ? `On · ${detail}` : "On" } : { value: "Off", tone: "muted" };
}

const rs = (v: unknown) => (v === undefined || v === null || v === "" ? undefined : `₹${Number(v).toLocaleString("en-IN")}`);

function Rows({ rows }: { rows: Row[] }) {
  const shown = rows.filter((r) => r.value !== undefined && r.value !== null && r.value !== "");
  if (shown.length === 0) return <p className="px-4 py-6 text-center text-xs text-muted-foreground">Nothing configured here.</p>;
  return (
    <dl className="grid grid-cols-1 md:grid-cols-2 md:gap-x-8 px-4">
      {shown.map((r) => (
        <div key={r.label} className="flex min-h-11 items-center justify-between gap-4 border-b border-border/60 py-2 last:border-b-0 md:[&:nth-last-child(2):nth-child(odd)]:border-b-0">
          <dt className="text-[13px] text-muted-foreground">{r.label}</dt>
          <dd className={`text-right text-[13px] font-semibold text-foreground ${r.tone ? TONE[r.tone] : ""}`}>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function sizing(ctx: DetailCtx): string {
  const { cfg, is15Min, isEmaVwap, isNiftyScalper, isStockOptions, isGammaBlast } = ctx;
  const auto = cfg.symbol === "AUTO" || cfg.isAutoStockSelect;
  if (ctx.isEmaVwapOptions) return `Risk-based, max ${cfg.maxLots ?? 10} lots`;
  if (isNiftyScalper) return "Auto margin";
  if (isGammaBlast) return `${cfg.lots || 1} lot${(cfg.lots || 1) > 1 ? "s" : ""}`;
  if (isStockOptions) return auto ? "Auto lots" + (cfg.maxCapital ? ` (max ${rs(cfg.maxCapital)})` : "") : `${cfg.lots || 1} lot(s)`;
  if (is15Min || (isEmaVwap && cfg.symbol === "AUTO")) return "Risk-based (5x MIS)";
  if (cfg.symbol === "AUTO") return "Auto (5x MIS)";
  return cfg.qty ? `${cfg.qty} qty` : cfg.lots ? `${cfg.lots} lot(s)` : "Dynamic";
}

function stopLoss(ctx: DetailCtx): string {
  const { cfg, is15Min, isEmaVwap, isNiftyScalper, isStockOptions, isGammaBlast } = ctx;
  if (ctx.isEmaVwapOptions) return `${cfg.slBufferPct ?? 2}% below the setup low (min ₹${cfg.minSlBufferRs ?? 1}), on the exchange`;
  if (cfg.exitExactAtTarget) return isGammaBlast && cfg.stopLossPoints ? `-${cfg.stopLossPoints} pts (${rs(cfg.stopLossRs ?? 500)})` : `Fixed ${rs(cfg.stopLossRs ?? 500)}`;
  if (isGammaBlast) return cfg.stopLossPoints ? `-${cfg.stopLossPoints} pts (${rs(cfg.stopLossRs ?? 500)})` : `${cfg.initialSlPct || 50}% of premium`;
  if (isNiftyScalper) return `-${cfg.stopLossPoints ?? 7} pts (server SL)`;
  if (isStockOptions) return "Mother-candle low, breakeven at T1";
  if (is15Min) return "Candle SL";
  if (isEmaVwap) return "Structural swing stop (broker-side)";
  return rs(cfg.stopLossRs ?? cfg.dailyMaxLossRs ?? 500) ?? "Dynamic";
}

function targetText(ctx: DetailCtx): string {
  const { cfg, is15Min, isEmaVwap, isNiftyScalper, isStockOptions, isGammaBlast } = ctx;
  if (ctx.isEmaVwapOptions) return `Half at ${cfg.partialTargetR ?? 2}R, rest on a 5m close below the 15-EMA`;
  if (cfg.exitExactAtTarget) return isGammaBlast && cfg.targetPoints ? `+${cfg.targetPoints} pts (${rs(cfg.targetRs ?? 1000)})` : `Fixed ${rs(cfg.targetRs ?? 500)}`;
  if (isGammaBlast) return cfg.targetPoints ? `+${cfg.targetPoints} pts (${rs(cfg.targetRs ?? 1000)})` : (rs(cfg.targetRs ?? 1500) as string);
  if (isNiftyScalper) return `+${cfg.targetPoints ?? 10} pts, then trail`;
  if (isStockOptions) return `1:${cfg.target1RR ?? 1.5} and 1:${cfg.target2RR ?? 3} RR`;
  if (is15Min) return `1:${Number(cfg.riskRewardRatio ?? 2).toFixed(1)} RR, then trail`;
  if (isEmaVwap) return cfg.targetMode === "PARTIAL" ? "Half at 0.5x daily ATR, rest trails 15-EMA candle close" : cfg.targetMode === "QUICK" ? "Half at 0.5R, rest trails 15-EMA candle close" : "One target at 0.5x daily ATR (no trailing)";
  return rs(cfg.targetRs ?? cfg.dailyTargetRs ?? 500) ?? "Dynamic";
}

export function ConfigTab({ ctx }: { ctx: DetailCtx }) {
  const { id, strategy, activeTab, cfg, is15Min, isEmaVwap, isEmaVwapOptions, isNiftyScalper, isStockOptions, isGammaBlast } = ctx;
  if (activeTab !== "CONFIG") return null;

  const auto = cfg.symbol === "AUTO" || cfg.isAutoStockSelect;

  const instrument: Row[] = [
    { label: "Strategy type", value: typeLabel(strategy.type) },
    {
      label: "Symbol",
      value: isStockOptions && auto ? "Auto (180+ F&O stocks)" : isGammaBlast && cfg.symbol === "AUTO" ? "Auto (smart expiry)" : cfg.symbol || "Auto",
    },
    { label: "Exchange", value: cfg.exchange || (cfg.symbol === "SENSEX" ? "BFO" : "NSE") },
    { label: "Product", value: cfg.product || "MIS" },
    { label: "Timeframe", value: cfg.timeframe },
    { label: "Option moneyness", value: isStockOptions ? cfg.moneyness ?? "ITM" : undefined },
    { label: "Direction bias", value: isStockOptions ? cfg.directionBias ?? "Both" : undefined },
    { label: "Setup mode", value: isStockOptions ? cfg.setupType ?? "Both" : undefined },
    { label: "Broker", value: strategy.brokerAccount ? `${strategy.brokerAccount.broker} (${strategy.brokerAccount.clientId})` : "Virtual paper broker" },
  ];

  const entry: Row[] = [];
  if (isEmaVwap || isStockOptions) entry.push({ label: "EMA period", value: String(cfg.emaPeriod ?? 15) });
  if (isEmaVwap && !cfg.isOptionBuyingOnly) {
    entry.push({ label: "Entry timeframe", value: cfg.entryTimeframe === "1min" ? "1-minute (from 09:16), SL & exit on 5m" : "5-minute (from 09:20)" });
  }
  if (is15Min) {
    entry.push(
      { label: "Opening range", value: "9:15 to 9:30 breakout" },
      { label: "Max opening range", value: `${cfg.maxOpeningRangePts ?? 300} pts` },
      { label: "Entry window cutoff", value: `${cfg.primeWindowEndTime ?? "15:00"} IST` },
      { label: "RSI(14) filter", ...toggle(cfg.enableRsiFilter, ">55 long, <45 short") },
      { label: "Liquidity-sweep reversal", ...toggle(cfg.enableTrapReversal) },
      { label: "Breakout retest", ...toggle(cfg.enableRetestConfirmation, "body >= 40%") },
      { label: "CPR trend-day filter", ...toggle(cfg.enableCprFilter, `narrow CPR < ${cfg.cprNarrowThresholdPct ?? 0.18}%`) },
      { label: "CPR support / resistance", ...toggle(cfg.enableCprSupportResistance) },
      { label: "Midday chop filter", ...toggle(cfg.enableMiddayChopFilter, `${cfg.middayDeadZoneStart ?? "11:45"} to ${cfg.middayDeadZoneEnd ?? "13:00"}`) },
    );
  }
  if (isNiftyScalper) {
    entry.push(
      { label: "Volume surge (RVOL)", ...toggle(cfg.enableVolumeSurge, `>= ${cfg.minRvol ?? 1.15}x`) },
      { label: "VWAP trend bias", ...toggle(cfg.enableTrendBiasFilter, "CE above VWAP, PE below") },
      { label: "Entry window", value: `${cfg.entryStartTime ?? "09:20"} to 15:05 IST, no midday pause` },
      // These two are opt-in (default off), unlike the flags above — toggle() treats a missing
      // value as "on", which is backwards here, so they're built directly instead.
      {
        label: "SMC trap sniper",
        value: cfg.enableTrapSniper === true ? `On · ${cfg.trapSweepBufferPts ? `${cfg.trapSweepBufferPts} pt buffer` : "auto buffer"}` : "Off",
        tone: cfg.enableTrapSniper === true ? undefined : "muted",
      },
      {
        label: "PCR / OI confluence tag",
        value: cfg.enablePcrConfluence === true ? "On · informational only" : "Off",
        tone: cfg.enablePcrConfluence === true ? undefined : "muted",
      },
    );
  }
  if (isStockOptions) {
    entry.push(
      { label: "Volume surge (RVOL)", value: `>= ${cfg.minRvol ?? 1.25}x` },
      { label: "NIFTY macro trend gate", ...toggle(cfg.enableMarketTrendFilter, "aligned with NIFTY VWAP") },
      { label: "Midday dead zone", ...toggle(cfg.enableMiddayChopFilter, `${cfg.middayDeadZoneStart ?? "11:30"} to ${cfg.middayDeadZoneEnd ?? "13:00"}`) },
      { label: "Min stock price", value: rs(cfg.minStockPrice ?? 300) },
    );
  }
  if (isGammaBlast) {
    entry.push(
      { label: "Trading window", value: cfg.tradingMode === "AFTERNOON_ONLY" ? "Afternoon only (13:00 to 15:25)" : "Full day (09:20 to 15:25)" },
      { label: "Execution hours", value: `${cfg.startTime ?? "09:20"} to ${cfg.endTime ?? "15:25"} IST` },
      { label: "Morning ORB trigger", ...toggle(cfg.enableOrbMorningTrigger, "09:20 to 11:30 breakout + VWAP") },
      { label: "Midday channel breakout", ...toggle(cfg.enableMiddayBreakout, "11:30 to 13:30") },
      { label: "OI unwinding confirmation", ...toggle(cfg.enableOiFilter) },
    );
  }
  if (isEmaVwap) {
    entry.push(
      { label: "Entry signal", value: "15-EMA and VWAP crossover" },
      { label: "Volume confirmation", ...toggle(cfg.enableRvolVolumeFilter !== false, cfg.enableDynamicVolume === false ? `>= ${cfg.minRvol ?? 2.5}x average` : `z >= ${cfg.minVolumeZ ?? 1.5} vs the stock's own 10-session history`) },
    );
  }

  if (isEmaVwapOptions) {
    entry.push(
      { label: "Contracts watched", value: "ATM call and put, from the spot index price" },
      { label: "Setups", value: `${cfg.emaPeriod ?? 15}-EMA / VWAP crossover and inside candle, on the option's own 5m chart` },
      { label: "Setup valid for", value: "2 candles" },
      { label: "Expiry-day contract", value: cfg.useSameDayExpiry === true ? "Traded" : "Off (next expiry on expiry day)", tone: cfg.useSameDayExpiry === true ? undefined : "muted" },
      { label: "Entry window", value: `Until ${cfg.entryCutoffTime ?? "15:00"} IST` },
      { label: "PCR / futures OI", value: "Logged with every setup and trade, never a filter", tone: "muted" },
    );
  }

  const risk: Row[] = [
    { label: "Position sizing", value: sizing(ctx) },
    { label: "Max loss per trade", value: isEmaVwapOptions ? rs(cfg.stopLossRs) : undefined, tone: "loss" },
    { label: "Stop-loss", value: stopLoss(ctx), tone: "loss" },
    { label: "Max trades per day", value: String(cfg.maxTradesPerDay ?? 1) },
    { label: "Max losses per day", value: cfg.maxLossesPerDay !== undefined || isNiftyScalper || isStockOptions || is15Min ? String(cfg.maxLossesPerDay ?? (isNiftyScalper ? 2 : 1)) : undefined },
    { label: "Daily loss limit", value: rs(cfg.dailyMaxLossRs), tone: "loss" },
    { label: "Max capital", value: rs(cfg.maxCapital) },
    { label: "Initial SL %", value: isGammaBlast ? `${cfg.initialSlPct ?? 50}%` : undefined },
    { label: "Max conviction lots", value: isGammaBlast ? String(cfg.maxConvictionLots ?? 3) : undefined },
  ];

  const exits: Row[] = [
    { label: "Target", value: targetText(ctx), tone: "profit" },
    { label: "Daily profit target", value: rs(cfg.dailyTargetRs), tone: "profit" },
    {
      label: "Partial booking",
      ...(isNiftyScalper || isStockOptions || is15Min
        ? toggle(cfg.enablePartialBooking, `${cfg.partialBookingPct ?? 50}%${is15Min ? ` at +${cfg.partialBookingR ?? 1.8}R` : " at T1"}, runner trails`)
        : isGammaBlast
          ? toggle(cfg.enablePartialProfitBooking, "50% at 2x, runner trails")
          : isEmaVwapOptions
            ? { value: `Half the lots at ${cfg.partialTargetR ?? 2}R, then SL to cost (1 lot: SL to cost only)` }
            : isEmaVwap && !cfg.exitExactAtTarget && (cfg.targetMode === "PARTIAL" || cfg.targetMode === "QUICK")
              ? { value: "Half at the first target, runner exits on a 15-EMA candle close" }
              : { value: undefined }),
    },
    { label: "Breakeven lock", value: is15Min ? `At +${cfg.breakevenTriggerR ?? 0.7}R` : isNiftyScalper ? `At +${cfg.trailCostAtPoints ?? 6} pts` : undefined },
    { label: "Ratchet trailing", ...(isGammaBlast ? toggle(cfg.enableRatchetTrailing, "1.5x, 2x, 3x locks") : { value: undefined }) },
    { label: "Structural candle SL", ...(is15Min ? toggle(cfg.useStructuralCandleSl, "tight 45 to 80 pt risk") : { value: undefined }) },
    { label: "Theta stagnancy cutoff", value: isStockOptions ? `${cfg.maxStagnantTimeMin ?? 25} min` : undefined },
    { label: "Auto square-off", value: isEmaVwapOptions ? "15:05 IST" : "15:15 IST" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">Read-only summary of how this strategy trades.</p>
        <Button asChild size="default" className="shrink-0">
          <Link href={`/strategies/${id}/edit`}>
            <Pencil className="h-4 w-4" aria-hidden /> Edit
          </Link>
        </Button>
      </div>
      <SectionCard title="Instrument" icon={<SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />}>
        <Rows rows={instrument} />
      </SectionCard>
      <SectionCard title="Entry rules" icon={<Zap className="h-3.5 w-3.5" aria-hidden />}>
        <Rows rows={entry} />
      </SectionCard>
      <SectionCard title="Risk" icon={<Shield className="h-3.5 w-3.5" aria-hidden />}>
        <Rows rows={risk} />
      </SectionCard>
      <SectionCard title="Exits" icon={<LogOut className="h-3.5 w-3.5" aria-hidden />}>
        <Rows rows={exits} />
      </SectionCard>
    </div>
  );
}
