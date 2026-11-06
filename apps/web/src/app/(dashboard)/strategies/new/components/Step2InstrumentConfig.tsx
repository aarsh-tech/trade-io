"use client";

import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { StrategyFormState, getLotSize } from "../types";
import { marketApi } from "@/lib/api";
import { Field, NumberField, Section } from "../../_components/form-ui";
import { BrokerPicker } from "../../_components/broker-picker";
import { InstrumentSearch, type InstrumentHit } from "../../_components/instrument-search";
import type { BrokerAccount } from "../types";

interface Step2Props {
  form: StrategyFormState;
  set: (k: keyof StrategyFormState, v: any) => void;
  brokers: BrokerAccount[];
  brokersLoading?: boolean;
  brokersError?: boolean;
  onRetryBrokers?: () => void;
}

export function Step2InstrumentConfig({ form, set, brokers, brokersLoading, brokersError, onRetryBrokers }: Step2Props) {
  const selectInstrument = (item: InstrumentHit) => {
    set("symbol", item.symbol);
    set("exchange", item.exchange);
    set("instrumentType", item.segment === "NFO-OPT" || item.segment === "BFO-OPT" ? "OPTION" : (item.segment === "INDICES" ? "INDEX" : "STOCK"));
    if (item.lotSize && item.lotSize > 0) {
      set("lotSize", item.lotSize);
    }
  };

  React.useEffect(() => {
    if (!form.symbol || form.symbol === "AUTO") return;
    let isMounted = true;
    marketApi.getLotSize(form.symbol, form.brokerAccountId)
      .then((res: any) => {
        if (isMounted && res.data?.lotSize) {
          set("lotSize", res.data.lotSize);
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, [form.symbol, form.brokerAccountId]);

  return (
    <div className="space-y-5">
      <Section title="Broker account" description="Used for live prices and lot sizes, and for orders when you trade live.">
        <BrokerPicker
          brokers={brokers}
          loading={brokersLoading}
          error={brokersError}
          value={form.brokerAccountId}
          onChange={(id) => set("brokerAccountId", id)}
          onRetry={onRetryBrokers}
        />
      </Section>

      {/* ── STOCKS-IN-PLAY BREAKOUT: STOCK SELECTION AND TIMING ── */}
      {form.type === "STOCKS_IN_PLAY" && (
        <>
          <Section title="Setup" description="The fade, trend and opening-range setups use the same 09:20 opening-volume scan. The OI setup instead trades yesterday's NSE futures data in the pre-open auction.">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {([
                {
                  value: "TREND",
                  title: "15/40 EMA trend",
                  text: "Watches the stock with the biggest opening volume and takes its first 15/40 EMA crossover on the 5m chart (long above VWAP, short below), only in the direction of the gap. Stop at the day low/high, rides until the EMAs cross back. 2-year backtest: +₹5.0k at ₹500 risk on 94 trades, about breakeven.",
                },
                {
                  value: "FADE",
                  title: "In-play Fade",
                  text: "Stock gapped up on 10x opening volume, then MFI, Stochastic, Bollinger or CMF turns down from overbought by 09:45: short it. Optional long side on gap-down stocks. Fixed stop and target. 2-year backtest: +₹70k at ₹500 risk, both years positive.",
                },
                {
                  value: "OI",
                  title: "OI short build-up (pre-open)",
                  text: "Shorts the stock that fell 3% or more yesterday while its futures open interest rose the most (5–80%), in the 09:00–09:07 pre-open auction, so it fills at the 09:15 opening price. 1% stop, 3x target, else 15:05. 1 trade a day. 2-year backtest: +₹41k at ₹500 risk, both years positive; entered at 09:16 instead it earned only ₹3.5k, so the auction fill is the edge. Runs alongside the In-play Fade as a separate strategy.",
                },
                {
                  value: "ORB",
                  title: "Opening-range break",
                  text: "Shorts the break of a red first candle's low. ATR stop, no target: held to 15:05. Fat-tailed: about 1 trade in 3 wins.",
                },
              ] as const).map((o) => (
                <label
                  key={o.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted ${form.sipSetup === o.value ? "border-primary bg-muted" : "border-border bg-card"}`}
                >
                  <input
                    type="radio"
                    name="sipSetup"
                    checked={form.sipSetup === o.value}
                    onChange={() => {
                      set("sipSetup", o.value);
                      // Each setup's backtested defaults for the fields they share.
                      set("maxTradesPerDay", o.value === "ORB" ? "2" : "1");
                      set("sipMinAvgValueCr", o.value === "ORB" ? "25" : "10");
                      if (o.value === "OI") { set("sipStopPct", "1"); set("sipTargetR", "3"); }
                      if (o.value === "FADE" && form.sipSetup === "OI") set("sipStopPct", "1.2");
                    }}
                    className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer"
                  />
                  <span>
                    <span className="block text-xs font-semibold text-foreground">{o.title}</span>
                    <span className="block text-xs text-muted-foreground">{o.text}</span>
                  </span>
                </label>
              ))}
            </div>
          </Section>

          <Section
            title="Which stocks it trades"
            description={
              form.sipSetup === "OI"
                ? "No symbol to pick. Before the open the strategy reads NSE's end-of-day F&O and cash-market files for the previous trading day and keeps the stocks that fell 3% or more (less than 25%) while their total stock-futures open interest rose 5% to 80% (fresh shorts), skipping expiry days and stocks that traded under ₹25 Cr. It shorts only the one with the biggest OI rise."
                : form.sipSetup === "TREND"
                ? "No symbol to pick. At 09:20 the strategy ranks every NIFTY 500 and F&O stock by its first 5-minute candle volume against its usual opening volume and watches the top one(s) for the rest of the session."
                : form.sipSetup === "FADE"
                ? `No symbol to pick. At 09:20 the strategy checks every NIFTY 500 and F&O stock and keeps the ones that opened above yesterday's close${form.sipFadeLongs ? " (short side) or below it (long side)" : ""} with a first 5-minute candle far above their usual opening volume. Stocks within 2.5% of the circuit they would have to exit into are skipped.`
                : "No symbol to pick. At 09:20 the strategy checks every NIFTY 500 and F&O stock and keeps the ones whose first 5-minute candle traded far above their usual opening volume (news, results, block deals)."
            }
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {form.sipSetup === "TREND" && (
                <NumberField
                  label="Stocks watched"
                  value={form.sipWatchCount}
                  onChange={(v) => set("sipWatchCount", v)}
                  min={1}
                  hint="Highest opening volume first. Backtest: 1 stock +₹5.0k, 3 stocks +₹2.0k, 5 or more lost."
                />
              )}
              {form.sipSetup !== "TREND" && form.sipSetup !== "OI" && (
              <NumberField
                label="Opening volume multiple"
                value={form.sipMinRvol}
                onChange={(v) => set("sipMinRvol", v)}
                min={2}
                decimal
                hint="First candle volume vs its 10-day average. The backtest edge was in stocks at 10x or more; lower values trade more and earned less."
              />
              )}
              {form.sipSetup === "OI" ? (
              <div className="rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground sm:col-span-2">
                1 trade a day: the top pick only, as backtested. A later pick is used only when the top one cannot be sized with your capital or another strategy already holds it.
              </div>
              ) : (
              <NumberField
                label={form.sipSetup === "FADE" && form.sipFadeLongs ? "Trades per day (short + long together)" : "Max positions (= trades per day)"}
                value={form.maxTradesPerDay}
                onChange={(v) => set("maxTradesPerDay", v)}
                min={1}
                hint={
                  form.sipSetup === "TREND"
                    ? "1 is what was backtested: the first crossover that passes the rules takes the day."
                    : form.sipSetup === "FADE"
                    ? "1 is what was backtested (the earliest signal of the day). 2 earned less per trade with a bigger drawdown."
                    : "Positions can be open together; capital is split between them. 2 had the steadiest backtest."
                }
              />
              )}
              {form.sipSetup === "TREND" && (
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-muted sm:col-span-2">
                <input
                  type="checkbox"
                  checked={form.sipWithGapOnly !== false}
                  onChange={(e) => set("sipWithGapOnly", e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-border"
                />
                <span>
                  <span className="block text-xs font-semibold text-foreground">Only trade with the gap</span>
                  <span className="block text-xs text-muted-foreground">A stock that opened above yesterday&apos;s close is only bought, one that opened below it only shorted. Backtest with 1 stock watched: +₹5.0k with this on, +₹3.7k with it off.</span>
                </span>
              </label>
              )}
              {form.sipSetup === "FADE" && (
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-muted sm:col-span-2">
                <input
                  type="checkbox"
                  checked={form.sipFadeLongs === true}
                  onChange={(e) => set("sipFadeLongs", e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-border"
                />
                <span>
                  <span className="block text-xs font-semibold text-foreground">Also trade the long side (gap-down stocks)</span>
                  <span className="block text-xs text-muted-foreground">On a gap-down stock in play, an oversold turn-up (MFI, Stochastic, Bollinger or CMF) by 09:45 arms a long, bought only if price then breaks the first 5-minute candle's high within 30 minutes. Same stop, target and stop ladder. The trades per day cover both sides: the first signal of the day, short or long, takes it (a short wins a tie). Backtest (1 a day, Recommended exits): +₹77.8k, 64% wins, worst month −₹1.3k vs short only +₹69.6k, worst month −₹2.5k. The long side alone is weak (+₹8.1k, about ₹0 in year 1).</span>
                </span>
              </label>
              )}
              {form.sipSetup === "ORB" && (
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-muted sm:col-span-2">
                <input
                  type="checkbox"
                  checked={form.sipAllowLongs === true}
                  onChange={(e) => set("sipAllowLongs", e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-border"
                />
                <span>
                  <span className="block text-xs font-semibold text-foreground">Also buy stocks whose first candle is green</span>
                  <span className="block text-xs text-muted-foreground">Off by default: in 2 years of NSE data the long side earned about nothing after costs; the edge came from shorting red first candles.</span>
                </span>
              </label>
              )}
            </div>
          </Section>

          <Section
            title="Timing"
            description={
              form.sipSetup === "OI"
                ? "Starts by itself at 08:50 (log in to Kite before 09:00). The SELL LIMIT, 5% under yesterday's close, goes in at 09:00; the exchange's pre-open auction fills it at the 09:15 opening price. If the stock opens more than 5% lower there is no fill and no trade that day. The exchange stop goes in at 09:15, then the position is held until its target, its stop or the 15:05 square-off."
                : form.sipSetup === "TREND"
                ? "Crossovers are checked on every 5-minute close from 09:25 to 14:30; only each side's first one of the day counts, and the order goes in within seconds of that close. The trade exits on the 5-minute close where the 15-EMA crosses back, at its stop, or at the 15:05 square-off."
                : form.sipSetup === "FADE"
                ? `Signals are checked on the 5-minute closes from 09:20 to 09:45, and the short is placed within seconds of that close.${form.sipFadeLongs ? " A long waits up to 30 minutes for the first-candle high to break (until 10:15 at the latest)." : " No new entries after the 09:45 close."} A position is held until its target, its stop or the 15:05 square-off.`
                : "Entries happen the moment price breaks the first candle (shorts: its low). Every position is held until its stop or the 15:05 square-off."
            }
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {form.sipSetup === "ORB" && (
              <Field label="No new entries from" hint="IST. Open positions are still managed until 15:05.">
                {(a11y) => (
                  <Input
                    {...a11y}
                    type="time"
                    value={form.sipEntryCutoffTime}
                    onChange={(e) => set("sipEntryCutoffTime", e.target.value)}
                    className="font-semibold tabular-nums"
                  />
                )}
              </Field>
              )}
              <div className="rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground">
                <span className="block font-semibold text-foreground">Product: MIS (intraday)</span>
                Short selling needs MIS. Stocks where Zerodha blocks MIS are skipped.
              </div>
            </div>
          </Section>
        </>
      )}

      {/* ── STANDARD INSTRUMENT SELECTOR FOR OTHER STRATEGIES OR MANUAL MODE ── */}
      {form.type !== "STOCKS_IN_PLAY" && (
        <>
          <div className="space-y-3">
            <InstrumentSearch onSelect={selectInstrument} label="Search symbol (stock, option or future)" placeholder="e.g. RELIANCE, APOLLOHOSP, NIFTY 22000 CE" />

            <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/40 border border-border">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-foreground/75 font-medium">Current Selection</p>
                <div className="flex items-center gap-2.5 mt-0.5">
                  <p className="text-sm font-semibold text-foreground">{form.symbol} <span className="text-xs font-semibold text-foreground/75 font-medium">({form.exchange})</span></p>
                  {(form.lotSize || getLotSize(form.symbol, form.lotSize)) > 1 && (
                    <span className="text-xs font-semibold text-warn bg-warn-subtle border border-warn/60 px-2.5 py-0.5 rounded-md">
                      1 Lot = {form.lotSize || getLotSize(form.symbol, form.lotSize)} Qty
                    </span>
                  )}
                </div>
              </div>
              <Badge variant="secondary" className="font-semibold text-xs">{form.instrumentType}</Badge>
            </div>
          </div>

          {form.type === "BREAKOUT_15MIN" && (
            <div className="flex items-start gap-3 p-4 rounded-lg border-2 border-primary/30 bg-brand-subtle">
              <Sparkles className="h-5 w-5 text-accent-foreground shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <p className="font-semibold text-foreground">Strict Risk Sizing &amp; Exchange Server SL Active</p>
                <p className="text-xs text-foreground font-medium leading-relaxed font-normal">
                  Automatically queries live Zerodha cash margin. Sizes quantity strictly by your Stop Loss ₹ (never risking more than configured) and caps capital deployment at 25% (5x MIS leverage). Arms a server-side SL-L order at Zerodha on entry fill and monitors Target 1 (+2R) for uncapped momentum trailing.
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs sm:text-sm font-semibold text-foreground block">
                  {form.type === "BREAKOUT_15MIN" ? "Minimum / Base Lots" : "Number of Lots"}
                </label>
                <span className="text-xs font-semibold text-warn bg-warn-subtle border border-warn/60 px-2.5 py-0.5 rounded-md">
                  1 Lot = {form.lotSize || getLotSize(form.symbol, form.lotSize)} Qty
                </span>
              </div>
              <Input
                type="number"
                min={1}
                value={form.lots}
                onChange={(e) => set("lots", e.target.value)}
                className="font-semibold text-xs h-10 bg-background border-border text-foreground rounded-lg"
              />
              <p className="text-xs text-foreground/75 font-medium mt-1">
                {form.type === 'BREAKOUT_15MIN'
                  ? 'Dynamic Margin Allocation: Auto-scales lots from Zerodha cash (85% deployed, 15% buffer)'
                  : form.symbol === 'AUTO'
                  ? 'Quantity will be dynamically calculated to achieve target'
                  : `Total Quantity: ${Number(form.lots) * (form.lotSize || getLotSize(form.symbol, form.lotSize))} shares`}
              </p>
            </div>
            <div>
              <label className="text-xs sm:text-sm font-semibold text-foreground mb-2 block">Product Type</label>
              <select
                value={form.product}
                onChange={(e) => set("product", e.target.value)}
                className="flex h-10 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 font-semibold"
              >
                <option value="MIS">MIS (Intraday)</option>
                <option value="NRML">NRML (Overnight)</option>
              </select>
            </div>
          </div>
        </>
      )}

      {/* ── Strategy-Specific Config Sections ── */}
      {form.type === "BREAKOUT_15MIN" && (
        <div className="space-y-4">
          <div className="p-4 rounded-lg bg-brand-subtle border-2 border-primary/30">
            <p className="text-xs sm:text-sm font-semibold text-accent-foreground font-semibold">🚀 15-Minute Opening Range Breakout Setup</p>
            <p className="text-xs text-foreground font-medium mt-1 leading-relaxed font-normal">
              Monitors the first 15-minute candle (09:15–09:30 AM). Enters when a 5-minute candle closes beyond the high or low with volume &amp; VWAP alignment. If a false breakout occurs, it detects the liquidity trap and reverses immediately!
            </p>
          </div>
          <div>
            <label className="text-xs sm:text-sm font-semibold text-foreground mb-2 block">Quick Instrument Presets</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[
                { label: "NIFTY 50 (Index Option)", sym: "NIFTY 50", exch: "NSE", type: "INDEX" as const },
                { label: "BANKNIFTY (Index Option)", sym: "BANKNIFTY", exch: "NSE", type: "INDEX" as const },
                { label: "AUTO Stock Picker", sym: "AUTO", exch: "NSE", type: "STOCK" as const },
              ].map((p) => (
                <button
                  key={p.sym}
                  type="button"
                  onClick={() => {
                    set("symbol", p.sym);
                    set("exchange", p.exch);
                    set("instrumentType", p.type);
                  }}
                  className={cn(
                    "text-xs p-3 rounded-lg border text-left transition-all font-medium bg-card",
                    form.symbol === p.sym
                      ? "border-primary bg-brand-subtle/40  text-foreground font-semibold  ring-1 ring-primary/30"
                      : "border-border hover:border-primary/50 hover:bg-accent/40 text-foreground"
                  )}
                >
                  <p className="font-semibold text-xs sm:text-sm text-foreground">{p.label}</p>
                  <p className="text-xs text-foreground/75 font-medium mt-0.5">{p.exch}:{p.sym}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Lower Timeframe for Traps & Breakout Entries */}
          <div className="p-4 rounded-lg border border-border bg-card space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs sm:text-sm font-semibold text-foreground block">Entry &amp; Trap Timeframe</label>
                <p className="text-xs text-foreground/75 font-medium mt-0.5">
                  Establishes 15m range (09:15–09:30), then monitors this lower timeframe for liquidity sweep traps &amp; reclaim entries.
                </p>
              </div>
              <span className="text-xs font-semibold text-accent-foreground bg-brand-subtle border border-primary/60 px-2.5 py-0.5 rounded-full">
                Multi-Timeframe
              </span>
            </div>
            <select
              value={form.b15EntryTimeframe || "3min"}
              onChange={(e) => set("b15EntryTimeframe", e.target.value)}
              className="flex h-10 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 font-semibold"
            >
              <option value="3min">3-Minute Candles (Recommended — Optimal Institutional Trap Detection)</option>
              <option value="1min">1-Minute Candles (High Sensitivity &amp; Fastest Reversal Entry)</option>
              <option value="5min">5-Minute Candles (Standard Breakout Timeframe)</option>
            </select>
          </div>
        </div>
      )}

      {form.type === "EMA_VWAP_CROSSOVER" && (
        <div className="space-y-4">
          <div>
            <label className="text-xs sm:text-sm font-semibold text-foreground mb-2 block">EMA Period</label>
            <Input type="number" value={form.emaPeriod} onChange={(e) => set("emaPeriod", e.target.value)} className="font-semibold text-xs h-10 bg-background border-border text-foreground rounded-lg" />
          </div>
          <p className="text-xs text-muted-foreground">
            Trades the stock itself (intraday). For NIFTY, BANKNIFTY or SENSEX options, use the EMA-VWAP Index Options strategy.
          </p>
          <div className="p-4 rounded-lg border border-border bg-card space-y-2.5">
            <div>
              <label htmlFor="ema-vwap-entry-tf" className="text-xs sm:text-sm font-semibold text-foreground block">Entry Timeframe</label>
              <p className="text-xs text-foreground/75 font-medium mt-0.5">
                Candles used to find entries. The stop-loss and the 15-EMA trend exit always use 5-minute candles. In the 2-year backtest 1-minute entries made ₹22.5k (second year negative) against ₹35.5k for 5-minute.
              </p>
            </div>
            <select
              id="ema-vwap-entry-tf"
              value={form.entryTimeframe || "5min"}
              onChange={(e) => set("entryTimeframe", e.target.value as "1min" | "5min")}
              className="flex h-10 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 font-semibold"
            >
              <option value="5min">5-Minute Candles (Standard — trading starts 09:20)</option>
              <option value="1min">1-Minute Candles (Earlier entries — trading starts 09:16, more signals)</option>
            </select>
          </div>
          <NumberField
            label="Stocks checked per scan"
            value={form.scanDepth ?? "20"}
            onChange={(v) => set("scanDepth", v)}
            min={1}
            hint="AUTO stock selection only. The top-ranked momentum stocks checked for a setup on every scan (1 to 25); the best-scoring setup is traded."
          />
          <NumberField
            label="Setups watched at once"
            value={form.maxArmedSetups ?? "1"}
            onChange={(v) => set("maxArmedSetups", v)}
            min={1}
            hint="AUTO stock selection only (1 to 5). The best setups from each scan are all watched; the first to break its trigger is entered (if two break together, the higher score). 1 = only the top-scored setup (recommended). 2-year backtest: 1 made ₹47.6k, 2 made ₹43.6k, 3 made ₹44.7k."
          />
        </div>
      )}

    </div>
  );
}
