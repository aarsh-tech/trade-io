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
  const { cfg, is15Min, isEmaVwap } = ctx;
  if (ctx.strategy.type === "STOCKS_IN_PLAY") return `Risk based, within the free Zerodha funds at Zerodha's leverage per stock (fallback ${cfg.leverage ?? 4}x), up to ${cfg.setup === "OI" ? 1 : cfg.maxPositions ?? (cfg.setup === "TREND" || cfg.setup === "FADE" ? 1 : 2)} position${Number(cfg.maxPositions ?? 1) > 1 ? "s" : ""}`;
  if (is15Min || (isEmaVwap && cfg.symbol === "AUTO")) return "Risk-based (5x MIS)";
  if (cfg.symbol === "AUTO") return "Auto (5x MIS)";
  return cfg.qty ? `${cfg.qty} qty` : cfg.lots ? `${cfg.lots} lot(s)` : "Dynamic";
}

function stopLoss(ctx: DetailCtx): string {
  const { cfg, is15Min, isEmaVwap } = ctx;
  if (ctx.strategy.type === "STOCKS_IN_PLAY") {
    if (cfg.setup === "TREND") return "The day low (long) / day high (short) at the signal, at least 0.3% away, on the exchange";
    if (cfg.setup === "OI") return `${cfg.stopPct ?? 1}% above the auction fill, on the exchange from 09:15`;
    if (cfg.setup === "FADE") return `${cfg.fixedStopPct === true ? `${cfg.stopPct ?? 1.2}% ${cfg.fadeLongs === true ? "beyond" : "above"} the fill` : `Structural: 0.8–1.5% (by ATR) past the day high${cfg.fadeLongs === true ? " (long: low)" : ""}, sized to lose the max loss (1x = ₹${cfg.stopLossRs ?? "—"})`}, on the exchange${Number(cfg.breakevenAtR ?? 1) > 0 ? `; moved to ${Number(cfg.breakevenLockR ?? 0.2) > 0 ? `entry +${cfg.breakevenLockR ?? 0.2}x` : "the entry"} at +${cfg.breakevenAtR ?? 1}x the stop` : ""}${cfg.profitLock !== false ? "; locks +0.5x at +1.5x, +1.5x at +2.5x" : ""}`;
    return `${cfg.stopAtrFraction ?? 0.2} x 14-day ATR from the fill, on the exchange`;
  }
  if (cfg.exitExactAtTarget) return `Fixed ${rs(cfg.stopLossRs ?? 500)}`;
  if (is15Min) return "Candle SL";
  if (isEmaVwap) return `Beyond the setup's swing, 0.85% to ${Number(cfg.maxStopPct) > 0 ? Number(cfg.maxStopPct) : 1.2}% from entry (broker-side)`;
  return rs(cfg.stopLossRs ?? cfg.dailyMaxLossRs ?? 500) ?? "Dynamic";
}

/** EMA-VWAP stocks stagnation time-stop: unset = off (the engine fills the backtested 0), 0 = off. */
function stagnationText(v: unknown): string {
  const min = v === undefined || v === null || v === "" ? 0 : Number(v);
  return min === 0 ? "Off" : `Closes if within 0.25% of entry after ${Number.isFinite(min) && min > 0 ? min : 35} min`;
}

function targetText(ctx: DetailCtx): string {
  const { cfg, is15Min, isEmaVwap } = ctx;
  if (ctx.strategy.type === "STOCKS_IN_PLAY") {
    if (cfg.setup === "TREND") return "None: exits at market on the 5m close where the 15-EMA crosses back over the 40-EMA, else the stop or 15:05";
    if (cfg.setup === "OI" && Number(cfg.targetR ?? 3) > 0) return `${cfg.targetR ?? 3}x the stop (${(Number(cfg.stopPct ?? 1) * Number(cfg.targetR ?? 3)).toFixed(1)}% below the entry), closed at market`;
    if (cfg.setup === "FADE" && Number(cfg.targetR ?? 3) > 0 && cfg.fixedStopPct !== true) return `${cfg.targetR ?? 3}x the max loss (≈ ₹${Math.round(Number(cfg.stopLossRs ?? 0) * Number(cfg.targetR ?? 3))}), closed at market`;
    if (cfg.setup === "FADE" && Number(cfg.targetR ?? 3) > 0) return `${cfg.targetR ?? 3}x the stop (${(Number(cfg.stopPct ?? 1.2) * Number(cfg.targetR ?? 3)).toFixed(1)}% ${cfg.fadeLongs === true ? "from" : "below"} the entry), closed at market`;
    return "None: held until the stop or 15:05";
  }
  if (cfg.exitExactAtTarget) return `Fixed ${rs(cfg.targetRs ?? 500)}`;
  if (is15Min) return `1:${Number(cfg.riskRewardRatio ?? 2).toFixed(1)} RR, then trail`;
  if (isEmaVwap) return cfg.targetMode === "PARTIAL" ? "Half at 0.5x daily ATR, rest trails 15-EMA candle close" : cfg.targetMode === "QUICK" ? "Half at 0.5R, rest trails 15-EMA candle close" : cfg.targetMode === "FULL" ? "One target at 0.5x daily ATR (no trailing)" : "None: whole position trails 15-EMA candle close";
  return rs(cfg.targetRs ?? cfg.dailyTargetRs ?? 500) ?? "Dynamic";
}

export function ConfigTab({ ctx }: { ctx: DetailCtx }) {
  const { id, strategy, activeTab, cfg, is15Min, isEmaVwap } = ctx;
  if (activeTab !== "CONFIG") return null;

  const instrument: Row[] = [
    { label: "Strategy type", value: typeLabel(strategy.type) },
    { label: "Symbol", value: cfg.symbol || "Auto" },
    { label: "Exchange", value: cfg.exchange || (cfg.symbol === "SENSEX" ? "BFO" : "NSE") },
    { label: "Product", value: cfg.product || "MIS" },
    { label: "Timeframe", value: cfg.timeframe },
    { label: "Broker", value: strategy.brokerAccount ? `${strategy.brokerAccount.broker} (${strategy.brokerAccount.clientId})` : "Virtual paper broker" },
  ];

  const entry: Row[] = [];
  if (isEmaVwap) entry.push({ label: "EMA period", value: String(cfg.emaPeriod ?? 15) });
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
  if (isEmaVwap) {
    entry.push(
      { label: "Entry signal", value: "Opening drive, inside candle, 15-EMA/VWAP crossover or pullback" },
      { label: "Stocks checked per scan", value: cfg.symbol === "AUTO" ? `Top ${cfg.scanDepth ?? 20}, best setup traded` : undefined },
      { label: "Setups watched at once", value: cfg.symbol === "AUTO" ? (Number(cfg.maxArmedSetups ?? 1) > 1 ? `${Number(cfg.maxArmedSetups)}, first to trigger is entered` : "1 (top-scored only)") : undefined },
      { label: "Volume confirmation", ...toggle(cfg.enableRvolVolumeFilter !== false, cfg.enableDynamicVolume === false ? `>= ${cfg.minRvol ?? 2.5}x average` : `z >= ${cfg.minVolumeZ ?? 1.5} vs the stock's own 10-session history`) },
    );
  }

  if (strategy.type === "STOCKS_IN_PLAY" && cfg.setup === "FADE") {
    entry.push(
      { label: "Setup", value: cfg.fadeLongs === true ? "In-play Fade (short + long)" : "In-play Fade (short only)" },
      { label: "Stocks scanned", value: `NIFTY 500 + F&O, price >= ₹${cfg.minPrice ?? 50}, avg daily value >= ₹${cfg.minAvgValueCr ?? 10} Cr` },
      { label: "In play when", value: `Opened ${cfg.fadeLongs === true ? "above (short) or below (long)" : "above"} yesterday's close and the first 5m candle volume >= ${cfg.minRvol ?? 10}x its 10-day average; not within 2.5% of the circuit it would exit into` },
      { label: "Short signal", value: "MFI back below 80, Stochastic %K under %D from above 80, close back under the upper Bollinger band, or CMF below -0.1" },
      { label: "Short entry", value: "Market short right after the 5m close with the signal; earliest signal wins, ties by volume" },
      ...(cfg.fadeLongs === true
        ? [
            { label: "Long signal", value: "MFI back above 20, Stochastic %K over %D from below 20, close back over the lower Bollinger band, or CMF above +0.1" },
            { label: "Long entry", value: "Market buy only when price then breaks the first 5m candle's high, within 30 min of the signal" },
            { label: "Trades a day", value: `${cfg.maxPositions ?? 1} over both sides: the first entry, short or long, takes it` },
          ]
        : []),
      { label: "Entry window", value: cfg.fadeLongs === true ? "Signals on 5m closes 09:20 to 09:45 IST; long breaks until 10:15" : "5m closes 09:20 to 09:45 IST" },
      { label: "Room to yesterday's low", value: Number(cfg.skipNearPdlR ?? 0) > 0 ? `Skip when yesterday's low${cfg.fadeLongs === true ? " (long: high)" : ""} is less than ${cfg.skipNearPdlR}x the stop away` : "Off" },
    );
  } else if (strategy.type === "STOCKS_IN_PLAY" && cfg.setup === "OI") {
    entry.push(
      { label: "Setup", value: "OI short build-up (pre-open)" },
      { label: "Signal", value: "From NSE's end-of-day files: yesterday the stock fell >= 3% (under 25%) while its total stock-futures OI rose 5% to 80%; not an expiry day, >= ₹25 Cr traded. Biggest OI rise first" },
      { label: "Entry", value: "SELL LIMIT 5% under yesterday's close, sent at 09:00 in the pre-open auction; fills at the 09:15 opening price, no fill (no trade) on a bigger gap down" },
      { label: "Trades a day", value: "1 (the top pick)" },
      { label: "Starts", value: "By itself at 08:50; needs a Kite login before 09:00" },
    );
  } else if (strategy.type === "STOCKS_IN_PLAY" && cfg.setup === "TREND") {
    entry.push(
      { label: "Setup", value: "15/40 EMA trend" },
      { label: "Stocks scanned", value: `NIFTY 500 + F&O, price >= ₹${cfg.minPrice ?? 50}, avg daily value >= ₹${cfg.minAvgValueCr ?? 10} Cr` },
      { label: "Watched", value: `The ${cfg.watchCount ?? 1} stock${Number(cfg.watchCount ?? 1) > 1 ? "s" : ""} with the highest first 5m candle volume vs its 10-day average` },
      { label: "Signal", value: "Each side's first 15/40 EMA crossover of the day on the 5m chart, with the close above VWAP (long) or below it (short)" },
      { label: "With the gap only", ...toggle(cfg.withGapOnly !== false, "A gap-up stock is never shorted, a gap-down stock never bought") },
      { label: "Entry", value: "Market order right after the 5m close with the crossover" },
      { label: "Entry window", value: "5m closes 09:25 to 14:30 IST" },
    );
  } else if (strategy.type === "STOCKS_IN_PLAY") {
    entry.push(
      { label: "Setup", value: "Opening-range break" },
      { label: "Stocks scanned", value: `NIFTY 500 + F&O, price >= ₹${cfg.minPrice ?? 50}, avg daily value >= ₹${cfg.minAvgValueCr ?? 25} Cr` },
      { label: "In play when", value: `First 5m candle volume >= ${cfg.minRvol ?? 10}x its 10-day average` },
      { label: "Direction", value: cfg.allowLongs === true ? "Short red first candles, buy green ones" : "Short red first candles only" },
      { label: "Entry", value: "Market order on the break of the first candle" },
      { label: "Entry window", value: `09:20 to ${cfg.entryCutoffTime ?? "15:00"} IST` },
    );
  }

  const risk: Row[] = [
    { label: "Position sizing", value: sizing(ctx) },
    { label: "Max loss per trade", value: strategy.type === "STOCKS_IN_PLAY" ? rs(cfg.stopLossRs) : undefined, tone: "loss" },
    { label: "Stop-loss", value: stopLoss(ctx), tone: "loss" },
    { label: "Max trades per day", value: String(cfg.maxTradesPerDay ?? 1) },
    { label: "Max losses per day", value: cfg.maxLossesPerDay !== undefined || is15Min ? String(cfg.maxLossesPerDay ?? 1) : undefined },
    { label: "Daily loss limit", value: rs(cfg.dailyMaxLossRs), tone: "loss" },
    { label: "Max capital", value: strategy.type === "STOCKS_IN_PLAY" ? undefined : rs(cfg.maxCapital) },
  ];

  const exits: Row[] = [
    { label: "Target", value: targetText(ctx), tone: "profit" },
    { label: "Daily profit target", value: rs(cfg.dailyTargetRs), tone: "profit" },
    {
      label: "Partial booking",
      ...(is15Min
        ? toggle(cfg.enablePartialBooking, `${cfg.partialBookingPct ?? 50}% at +${cfg.partialBookingR ?? 1.8}R, runner trails`)
        : isEmaVwap && !cfg.exitExactAtTarget && (cfg.targetMode === "PARTIAL" || cfg.targetMode === "QUICK")
          ? { value: "Half at the first target, runner exits on a 15-EMA candle close" }
          : { value: undefined }),
    },
    { label: "Breakeven lock", value: is15Min ? `At +${cfg.breakevenTriggerR ?? 0.7}R` : undefined },
    { label: "Structural candle SL", ...(is15Min ? toggle(cfg.useStructuralCandleSl, "tight 45 to 80 pt risk") : { value: undefined }) },
    { label: "Stagnation exit", value: isEmaVwap ? stagnationText(cfg.stagnationMinutes) : undefined },
    { label: "Profit lock", ...(isEmaVwap && !cfg.exitExactAtTarget && (cfg.targetMode ?? "EMA") === "EMA" ? toggle(cfg.profitLock, "+1.5R → stop +0.5R, +3R → stop +2R") : { value: undefined }) },
    { label: "Slow trail", ...(isEmaVwap && !cfg.exitExactAtTarget && (cfg.targetMode ?? "EMA") === "EMA" ? toggle(cfg.slowTrail, "after +1.5R, exit on the 40-EMA") : { value: undefined }) },
    { label: "Min day move", value: isEmaVwap ? (cfg.minDayMovePct === undefined || cfg.minDayMovePct === null ? "1.5% past prev close" : Number(cfg.minDayMovePct) > 0 ? `${Number(cfg.minDayMovePct)}% past prev close` : "Off") : undefined },
    { label: "Max stop distance", value: isEmaVwap ? `${Number(cfg.maxStopPct) > 0 ? Number(cfg.maxStopPct) : 1.2}% of entry` : undefined },
    { label: "Auto square-off", value: isEmaVwap || strategy.type === "STOCKS_IN_PLAY" ? "15:05 IST" : "15:15 IST" },
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
