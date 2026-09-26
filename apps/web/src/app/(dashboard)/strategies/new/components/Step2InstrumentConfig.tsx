"use client";

import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Zap, Target, BarChart2, TrendingUp, Loader2, Sparkles, Clock, ArrowUpRight, ArrowDownRight, Shuffle } from "lucide-react";
import { cn } from "@/lib/utils";
import { StrategyFormState, getLotSize } from "../types";
import { marketApi } from "@/lib/api";
import { Advanced, Section } from "../../_components/form-ui";
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

      {/* ── DAILY INDEX SCALPER SPECIAL CONFIG ── */}
      {form.type === "GAMMA_BLAST_EXPIRY" && (
        <div className="space-y-4">
          <div className="p-4 rounded-lg bg-warn-subtle border-2 border-warn/30">
            <div className="flex items-center gap-2 mb-1.5">
              <Sparkles className="h-4 w-4 text-warn" />
              <p className="text-xs sm:text-sm font-semibold text-warn font-semibold">
                Daily Index Scalper Configuration (SENSEX &amp; NIFTY — All Trading Days)
              </p>
            </div>
            <p className="text-xs text-foreground font-medium leading-relaxed">
              Executes on <strong>ALL trading days (Mon–Fri)</strong> from 09:20 AM to 03:25 PM IST. Selects high-delta ATM contracts (Delta ~0.50) calculated directly from running Future prices for precise 1:1 index points tracking with zero theta-decay trap.
            </p>
          </div>

          {/* Underlier Selection */}
          <div>
            <label className="text-xs sm:text-sm font-semibold text-foreground mb-2 block">Underlying Index &amp; Trading Schedule</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { label: "AUTO (Smart All-Days)", val: "AUTO", desc: "Mon–Wed: NIFTY | Thu–Fri: SENSEX (Switches to live expiry)", lotSize: 65 },
                { label: "NIFTY 50 (All Days)", val: "NIFTY", desc: "Trades NIFTY every day (Mon–Fri). High-Delta ATM daily.", lotSize: 65 },
                { label: "BSE SENSEX (All Days)", val: "SENSEX", desc: "Trades SENSEX every day (Mon–Fri). High-Delta ATM daily.", lotSize: 20 },
              ].map((item) => (
                <button
                  key={item.val}
                  type="button"
                  onClick={() => {
                    set("gbIndex", item.val);
                    set("symbol", item.val);
                    set("exchange", item.val === "SENSEX" ? "BFO" : "NFO");
                  }}
                  className={cn(
                    "text-left p-3.5 rounded-lg border-2 transition-all flex flex-col justify-between bg-card",
                    form.gbIndex === item.val || form.symbol === item.val
                      ? "border-warn bg-warn-subtle/40   ring-1 ring-warn/30"
                      : "border-border hover:border-warn/50 hover:bg-accent/40"
                  )}
                >
                  <div>
                    <p className="font-semibold text-xs sm:text-sm text-foreground">{item.label}</p>
                    <p className="text-xs text-foreground/75 font-medium mt-1 leading-snug">{item.desc}</p>
                  </div>
                  <Badge variant="secondary" className="text-[10px] font-semibold mt-2.5 w-fit border border-border/70">
                    1 Lot = {item.lotSize} Qty
                  </Badge>
                </button>
              ))}
            </div>
          </div>

          {/* Lots & Product */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs sm:text-sm font-semibold text-foreground">Base Position Lots</label>
                <span className="text-xs text-accent-foreground font-semibold bg-brand-subtle px-2 py-0.5 rounded-md border border-primary/60">
                  1 to 5 Lots Recommended
                </span>
              </div>
              <Input
                type="number"
                min={1}
                max={10}
                value={form.lots}
                onChange={(e) => set("lots", e.target.value)}
                className="font-semibold text-xs h-10 bg-background border-border text-foreground rounded-lg"
              />
              <p className="text-xs text-foreground/75 font-medium mt-1">
                Total Qty: {Number(form.lots || 1) * (form.symbol === "SENSEX" ? 20 : 65)} shares
              </p>
            </div>
            <div>
              <label className="text-xs sm:text-sm font-semibold text-foreground mb-2 block">Product Type</label>
              <select
                value={form.product}
                onChange={(e) => set("product", e.target.value)}
                className="flex h-10 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 font-semibold"
              >
                <option value="NRML">NRML (Recommended — Avoids 3:12 PM RMS close)</option>
                <option value="MIS">MIS (Intraday)</option>
              </select>
            </div>
          </div>

          {/* Smart Auto Premium Discovery */}
          <div className="flex items-start gap-3 p-4 rounded-lg border-2 border-profit/30 bg-profit-subtle">
            <Sparkles className="h-5 w-5 text-profit shrink-0 mt-0.5" />
            <div>
              <p className="text-xs sm:text-sm font-semibold text-foreground">
                Strict High-Delta ATM &amp; ITM Strike Selection (Zero Cheap OTM)
              </p>
              <p className="text-xs text-foreground font-medium mt-1 leading-relaxed">
                Cheap OTM options are completely excluded. The engine trades strictly At-The-Money (ATM, Delta ~0.50) or 1-strike In-The-Money (ITM, Delta ~0.55–0.65) contracts for direct 1:1 index tracking without theta decay.
              </p>
            </div>
          </div>

          {/* Multi-Lot & High-Conviction Sizing Controls */}
          <div className="p-4 rounded-lg border border-border bg-card space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm font-semibold text-foreground">High-Conviction A+ Setup Boost</p>
                <p className="text-xs text-foreground/75 font-medium mt-0.5">
                  Automatically boost position up to 3–5 lots when Range Breakout + Volume Surge + OI Unwinding align
                </p>
              </div>
              <input
                type="checkbox"
                checked={form.gbEnableHighConvictionBoost}
                onChange={(e) => set("gbEnableHighConvictionBoost", e.target.checked)}
                className="h-4 w-4 rounded border-border text-accent-foreground focus:ring-primary cursor-pointer"
              />
            </div>

            {form.gbEnableHighConvictionBoost && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-border">
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">Max Conviction Lots</label>
                  <select
                    value={form.gbMaxConvictionLots}
                    onChange={(e) => set("gbMaxConvictionLots", e.target.value)}
                    className="flex h-10 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground font-semibold"
                  >
                    <option value="2">2 Lots</option>
                    <option value="3">3 Lots (Recommended)</option>
                    <option value="4">4 Lots</option>
                    <option value="5">5 Lots (Aggressive Max)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">2.0x Partial Profit Booking</label>
                  <div className="flex items-center h-10 gap-2">
                    <input
                      type="checkbox"
                      id="partialBooking"
                      checked={form.gbEnablePartialProfitBooking}
                      onChange={(e) => set("gbEnablePartialProfitBooking", e.target.checked)}
                      className="h-4 w-4 rounded border-border text-accent-foreground focus:ring-primary cursor-pointer"
                    />
                    <label htmlFor="partialBooking" className="text-xs text-foreground font-medium font-medium">
                      Exit 50% lots @ 2.0x milestone; trail remainder
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Execution Window Mode */}
          <div>
            <label className="text-xs sm:text-sm font-semibold text-foreground mb-2 block">Execution Window &amp; Daypart Mode</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  set("gbTradingMode", "FULL_DAY");
                  set("gbStartTime", "09:20");
                  set("gbEndTime", "15:25");
                }}
                className={cn(
                  "p-3.5 rounded-lg border-2 text-left transition-all bg-card",
                  (form.gbTradingMode || "FULL_DAY") === "FULL_DAY" && (form.gbStartTime || "09:20") === "09:20"
                    ? "border-profit bg-profit-subtle/40  ring-1 ring-profit/30 font-semibold"
                    : "border-border hover:border-profit/50 hover:bg-accent/40"
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-foreground">🚀 Full Day Scalper</span>
                  <Badge className="text-[9px] bg-profit/20 text-profit border-profit/30 font-semibold">
                    RECOMMENDED
                  </Badge>
                </div>
                <p className="text-xs font-semibold text-profit">09:20 AM – 03:25 PM IST</p>
                <p className="text-xs text-foreground/75 font-medium mt-1 leading-snug">
                  Trades Morning ORB (09:20–11:30), Midday Flags (11:30–13:30), &amp; Afternoon Momentum (13:30–15:25).
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  set("gbTradingMode", "AFTERNOON_ONLY");
                  set("gbStartTime", "13:00");
                  set("gbEndTime", "15:25");
                }}
                className={cn(
                  "p-3.5 rounded-lg border-2 text-left transition-all bg-card",
                  form.gbTradingMode === "AFTERNOON_ONLY" || form.gbStartTime === "13:00"
                    ? "border-warn bg-warn-subtle/40  ring-1 ring-warn/30 font-semibold"
                    : "border-border hover:border-warn/50 hover:bg-accent/40"
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-foreground">⏰ Afternoon Only</span>
                  <Badge className="text-[9px] bg-warn/20 text-warn border-warn/30 font-semibold">
                    AFTERNOON TREND
                  </Badge>
                </div>
                <p className="text-xs font-semibold text-warn">01:00 PM – 03:25 PM IST</p>
                <p className="text-xs text-foreground/75 font-medium mt-1 leading-snug">
                  Trades only during the afternoon high-volatility window using high-delta ATM contracts.
                </p>
              </button>
            </div>
          </div>

          {/* Time Window Details Pill */}
          <div className="flex items-center justify-between p-3.5 rounded-lg bg-secondary/40 border border-border">
            <div className="flex items-center gap-2.5">
              <Clock className="h-4 w-4 text-accent-foreground shrink-0" />
              <div>
                <p className="text-xs font-semibold text-foreground">
                  Active Window: {form.gbStartTime || "09:20"} – {form.gbEndTime || "15:25"} IST
                </p>
                <p className="text-xs text-foreground/75 font-medium mt-0.5">
                  Hold &amp; trail through 15:25–15:30 candle | Hard Auto-Exit @ 03:29:30 PM before market close
                </p>
              </div>
            </div>
            <Badge className="text-[10px] bg-profit/15 text-profit border border-profit/30 font-semibold shrink-0">
              Auto Square-Off Active
            </Badge>
          </div>
        </div>
      )}

      {/* ── STOCK OPTIONS BUYING: DEDICATED AUTO VS MANUAL STOCK SELECTION ── */}
      {form.type === "STOCK_OPTIONS_BUYING" && (
        <div className="space-y-4">
          <div>
            <label className="text-xs sm:text-sm font-semibold text-foreground mb-2 block">Stock Selection Mode</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  set("sIsAutoStockSelect", true);
                  set("symbol", "AUTO");
                  set("exchange", "NSE");
                  set("instrumentType", "STOCK");
                }}
                className={cn(
                  "p-4 rounded-lg border-2 text-left transition-all relative overflow-hidden bg-card",
                  form.sIsAutoStockSelect !== false && form.symbol === "AUTO"
                    ? "border-primary bg-brand-subtle/40   ring-1 ring-primary/30"
                    : "border-border hover:border-primary/50 hover:bg-accent/40 "
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-accent-foreground uppercase tracking-wider flex items-center gap-1">
                    <Sparkles className="h-3.5 w-3.5" /> Recommended
                  </span>
                  <Badge className="text-[9px] bg-primary text-primary-foreground font-semibold">180+ F&amp;O Scanner</Badge>
                </div>
                <p className="font-semibold text-sm text-foreground mt-2">
                  🎯 Auto F&amp;O Momentum Scanner
                </p>
                <p className="text-xs text-foreground font-medium mt-1 leading-relaxed">
                  Scans all 180+ liquid F&amp;O stocks. Picks momentum leaders with 5%–10% intraday potential (RVOL ≥ 1.25, Open=Low/High institutional footprints).
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  set("sIsAutoStockSelect", false);
                  if (form.symbol === "AUTO") {
                    set("symbol", "APOLLOHOSP");
                  }
                }}
                className={cn(
                  "p-4 rounded-lg border-2 text-left transition-all relative overflow-hidden bg-card",
                  form.sIsAutoStockSelect === false && form.symbol !== "AUTO"
                    ? "border-primary bg-brand-subtle/40   ring-1 ring-primary/30"
                    : "border-border hover:border-primary/50 hover:bg-accent/40 "
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-foreground/75 font-medium uppercase tracking-wider">
                    Custom Stock
                  </span>
                  <Badge variant="outline" className="text-[9px] font-semibold border-border text-foreground">Single Stock</Badge>
                </div>
                <p className="font-semibold text-sm text-foreground mt-2">
                  📌 Manual Stock Selection
                </p>
                <p className="text-xs text-foreground font-medium mt-1 leading-relaxed">
                  Trade options on a specific F&amp;O stock you choose (e.g. APOLLOHOSP, RELIANCE, TRENT, BAJFINANCE).
                </p>
              </button>
            </div>
          </div>

          {form.sIsAutoStockSelect !== false && form.symbol === "AUTO" ? (
            <div className="p-4 rounded-lg border-2 border-primary/30 bg-brand-subtle space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-primary/20 text-accent-foreground border border-primary/30">
                    <Zap className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm font-semibold text-foreground">
                      Live F&amp;O Momentum Engine Active
                    </p>
                    <p className="text-xs text-foreground/75 font-medium mt-0.5">
                      Scanning all 180+ NSE F&amp;O instruments continuously from 09:15 AM
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className="text-xs border-primary/40 text-accent-foreground bg-brand-subtle font-semibold px-2.5 py-0.5">
                  Symbol: AUTO
                </Badge>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center pt-2 border-t border-border/60">
                <div className="p-2.5 rounded-lg bg-card border border-border/70">
                  <p className="text-xs font-semibold text-accent-foreground">180+ Liquid Stocks</p>
                  <p className="text-[10px] text-foreground/75 font-medium mt-0.5">Scanned dynamically</p>
                </div>
                <div className="p-2.5 rounded-lg bg-card border border-border/70">
                  <p className="text-xs font-semibold text-accent-foreground">5%–10% Velocity</p>
                  <p className="text-[10px] text-foreground/75 font-medium mt-0.5">Day range expansion</p>
                </div>
                <div className="p-2.5 rounded-lg bg-card border border-border/70">
                  <p className="text-xs font-semibold text-profit">Auto Lot &amp; Strike</p>
                  <p className="text-[10px] text-foreground/75 font-medium mt-0.5">Live NFO master fetch</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-foreground block">Quick F&amp;O Presets</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { sym: "APOLLOHOSP", name: "Apollo Hospitals", lot: 125 },
                  { sym: "RELIANCE", name: "Reliance Industries", lot: 250 },
                  { sym: "TRENT", name: "Trent Limited", lot: 100 },
                  { sym: "BAJFINANCE", name: "Bajaj Finance", lot: 125 },
                ].map((preset) => (
                  <button
                    key={preset.sym}
                    type="button"
                    onClick={() => {
                      set("symbol", preset.sym);
                      set("exchange", "NSE");
                      set("instrumentType", "STOCK");
                      set("lotSize", preset.lot);
                    }}
                    className={cn(
                      "p-3 rounded-lg border text-left text-xs transition-all bg-card",
                      form.symbol === preset.sym
                        ? "border-primary bg-brand-subtle/40  text-foreground font-semibold  ring-1 ring-primary/30"
                        : "border-border hover:border-primary/50 hover:bg-accent/40 text-foreground"
                    )}
                  >
                    <p className="font-semibold text-xs">{preset.sym}</p>
                    <p className="text-[10px] text-foreground/75 font-medium mt-0.5">1 Lot = {preset.lot}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── STANDARD INSTRUMENT SELECTOR FOR OTHER STRATEGIES OR MANUAL MODE ── */}
      {form.type !== "GAMMA_BLAST_EXPIRY" && !(form.type === "STOCK_OPTIONS_BUYING" && form.sIsAutoStockSelect !== false && form.symbol === "AUTO") && (
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

          {form.type === "NIFTY_OPTIONS_SCALPER" && (
            <div className="flex items-start gap-3 p-4 rounded-lg border-2 border-signal/30 bg-signal-subtle">
              <Sparkles className="h-5 w-5 text-signal shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <p className="font-semibold text-foreground">Dynamic Margin Lot Sizing Active</p>
                <p className="text-xs text-foreground font-medium leading-relaxed font-normal">
                  Instead of a fixed 1-lot limit, the engine detects your live Zerodha margin, preserves a 15% cash buffer, and deploys 85% tradeable margin into lots (1 Lot = {form.lotSize || getLotSize(form.symbol || 'NIFTY', form.lotSize)} Qty).
                </p>
              </div>
            </div>
          )}

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
                  {form.type === "NIFTY_OPTIONS_SCALPER" || form.type === "BREAKOUT_15MIN" ? "Minimum / Base Lots" : "Number of Lots"}
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
                {form.type === 'NIFTY_OPTIONS_SCALPER' || form.type === 'BREAKOUT_15MIN'
                  ? 'Dynamic Margin Allocation: Auto-scales lots from Zerodha cash (85% deployed, 15% buffer)'
                  : form.type === 'STOCK_OPTIONS_BUYING' && form.symbol === 'AUTO'
                  ? 'Auto F&O Mode: Real lot size resolved dynamically from Zerodha NFO master for the triggered stock'
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
      {form.type === "NIFTY_OPTIONS_SCALPER" && (
        <div className="space-y-4">
          <div className="p-4 rounded-lg bg-signal-subtle border-2 border-signal/30">
            <p className="text-xs sm:text-sm font-semibold text-signal font-semibold">⚡ Nifty 10-Point Scalper Engine Setup</p>
            <p className="text-xs text-foreground font-medium mt-1 leading-relaxed font-normal">
              Trades rapid momentum impulses on high-delta options using 3 confluence triggers (EMA-VWAP Crossover, Pullback Rejection &amp; 15-Min ORB). Automatically scales lots from live margin, trails to breakeven at +6 pts, and rides uncapped runners with dynamic momentum ratchets.
            </p>
          </div>

          <div>
            <label className="text-xs sm:text-sm font-semibold text-foreground mb-2 block">Index Presets</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { label: "🌟 AUTO_HYBRID", sym: "AUTO_HYBRID", exch: "NSE/BSE", lots: "1", sub: "Nifty (Tue) + Sensex (Thu/Fri)" },
                { label: "NIFTY 50", sym: "NIFTY 50", exch: "NSE", lots: "1", sub: "NSE:NIFTY 50 (Lot: 65)" },
                { label: "SENSEX", sym: "SENSEX", exch: "BSE", lots: "1", sub: "BSE:SENSEX (Lot: 20)" },
                { label: "BANKNIFTY", sym: "BANKNIFTY", exch: "NSE", lots: "1", sub: "NSE:BANKNIFTY (Lot: 30)" },
              ].map((p) => (
                <button
                  key={p.sym}
                  type="button"
                  onClick={() => {
                    set("symbol", p.sym);
                    set("exchange", p.exch);
                    set("lots", p.lots);
                  }}
                  className={cn(
                    "text-xs p-3 rounded-lg border text-left transition-all font-medium bg-card",
                    form.symbol === p.sym
                      ? "border-signal bg-signal-subtle/40   ring-1 ring-signal/30"
                      : "border-border hover:border-signal/50 hover:bg-accent/40 text-foreground"
                  )}
                >
                  <p className="font-semibold text-xs sm:text-sm text-foreground">{p.label}</p>
                  <p className="text-xs text-foreground/75 font-medium mt-0.5">{p.sub}</p>
                </button>
              ))}
            </div>

            {form.symbol.toUpperCase().includes("HYBRID") && (
              <div className="mt-3 p-4 rounded-lg border-2 border-profit/30 bg-profit-subtle text-xs space-y-2">
                <div className="flex items-center gap-1.5 font-semibold">
                  <Sparkles className="h-4 w-4 text-profit" />
                  <span className="text-foreground text-xs sm:text-sm">AUTO_HYBRID Weekly Expiry Engine Schedule</span>
                  <Badge className="bg-profit/20 text-profit text-[9px] font-semibold ml-auto border-0">
                    +88% Monthly ROI Backtest
                  </Badge>
                </div>
                <div className="text-xs text-foreground font-medium grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 font-normal">
                  <div>• <span className="font-semibold text-foreground">Tuesday:</span> NIFTY 50 Weekly Expiry (+10 pt target, 90% win rate)</div>
                  <div>• <span className="font-semibold text-foreground">Thursday:</span> SENSEX Weekly Expiry (+35 pt target, 70% win rate)</div>
                  <div>• <span className="font-semibold text-foreground">Friday:</span> SENSEX Momentum (+35 pt target, 100% win rate)</div>
                  <div>• <span className="font-semibold text-foreground">Mon &amp; Wed:</span> NIFTY 50 (institutional tight 0.05 spread)</div>
                </div>
              </div>
            )}
          </div>

          {/* Dynamic Compounding Capital Controls */}
          <div className="p-4 rounded-lg border border-border bg-card space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5 pr-4">
                <p className="text-xs sm:text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <TrendingUp className="h-4 w-4 text-signal" />
                  Dynamic Compounding Position Sizing
                </p>
                <p className="text-xs text-foreground/75 font-medium leading-relaxed">
                  Deploys 85% tradeable margin from live Zerodha balance (preserving 15% cash buffer). Compounds lots up as capital grows to achieve &ge;60% monthly ROI.
                </p>
              </div>
              <input
                type="checkbox"
                checked={form.dsEnableDynamicSizing !== false}
                onChange={(e) => set("dsEnableDynamicSizing", e.target.checked)}
                className="h-4 w-4 rounded accent-signal shrink-0 cursor-pointer"
              />
            </div>

            {form.dsEnableDynamicSizing !== false && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-border">
                <div>
                  <label className="text-xs font-semibold block text-foreground mb-1">
                    Custom Capital Cap (₹, Optional)
                  </label>
                  <Input
                    type="number"
                    placeholder="Empty = Live Kite cash"
                    value={form.dsMaxCapital || ""}
                    onChange={(e) => set("dsMaxCapital", e.target.value)}
                    className="h-9 text-xs bg-background border-border text-foreground rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold block text-foreground mb-1">
                    Max Safety Lot Ceiling
                  </label>
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    placeholder="25"
                    value={form.dsMaxLots || "25"}
                    onChange={(e) => set("dsMaxLots", e.target.value)}
                    className="h-9 text-xs bg-background border-border text-foreground rounded-lg"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Timeframe selector */}
          <div className="p-4 rounded-lg border border-border bg-card space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs sm:text-sm font-semibold text-foreground block">Scalping Candle Timeframe</label>
                <p className="text-xs text-foreground/75 font-medium mt-0.5">
                  Calculates EMA, VWAP and StochRSI on this timeframe for entry signals.
                </p>
              </div>
              <span className="text-xs font-semibold text-signal bg-signal-subtle border border-signal/60 px-2.5 py-0.5 rounded-full">
                {form.dsTimeframe === "3minute" ? "High Sensitivity (3m)" : "Standard Scalp (5m)"}
              </span>
            </div>
            <select
              value={form.dsTimeframe || "5minute"}
              onChange={(e) => set("dsTimeframe", e.target.value as any)}
              className="flex h-10 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 font-semibold"
            >
              <option value="5minute">5-Minute Candles (Recommended — Higher Confluence &amp; Fewer Whipsaws)</option>
              <option value="3minute">3-Minute Candles (High Sensitivity — Earliest Momentum Impulse Entry)</option>
            </select>
          </div>

          {/* Confluence & Noise Protection Filters */}
          <div className="space-y-2.5 pt-1">
            <label className="text-xs sm:text-sm font-semibold text-foreground block">
              Institutional Edge &amp; Noise Filters
            </label>

            {/* Trend Bias Filter */}
            <div className="flex items-center justify-between p-3.5 rounded-lg border border-border bg-card">
              <div className="space-y-0.5 pr-4">
                <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5 text-signal" />
                  Day VWAP Trend Bias Filter
                </p>
                <p className="text-xs text-foreground/75 font-medium leading-relaxed">
                  Only buys CE when Index is above Day VWAP; only buys PE when Index is below Day VWAP. Eliminates over 50% of counter-trend trap entries.
                </p>
              </div>
              <input
                type="checkbox"
                checked={form.dsEnableTrendBiasFilter !== false}
                onChange={(e) => set("dsEnableTrendBiasFilter", e.target.checked)}
                className="h-4 w-4 rounded accent-signal shrink-0 cursor-pointer"
              />
            </div>

            {/* Institutional RVOL Volume Surge */}
            <div className="flex items-center justify-between p-3.5 rounded-lg border border-border bg-card">
              <div className="space-y-0.5 pr-4">
                <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <BarChart2 className="h-3.5 w-3.5 text-accent-foreground" />
                  Institutional Volume Surge (RVOL &ge; 1.15x)
                </p>
                <p className="text-xs text-foreground/75 font-medium leading-relaxed">
                  Requires trigger candle volume to be 1.15x higher than 10-period average or higher than previous candle. Skips low-volume retail traps.
                </p>
              </div>
              <input
                type="checkbox"
                checked={form.dsEnableVolumeSurge !== false}
                onChange={(e) => set("dsEnableVolumeSurge", e.target.checked)}
                className="h-4 w-4 rounded accent-signal shrink-0 cursor-pointer"
              />
            </div>

            {/* Macro Day Trend Alignment (Proven 76.9% Win Rate) */}
            <div className="flex items-center justify-between p-3.5 rounded-lg border-2 border-profit/30 bg-profit-subtle">
              <div className="space-y-0.5 pr-4">
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5 text-profit" />
                  <p className="text-xs font-semibold text-foreground">
                    Macro Day Trend Alignment
                  </p>
                  <Badge className="bg-profit/20 text-profit text-[9px] font-semibold border-0">
                    76.9% Win Rate Shield
                  </Badge>
                </div>
                <p className="text-xs text-foreground font-medium leading-relaxed">
                  On Bull Days (Open &ge; Prev Close), suppresses counter-trend PE pullbacks. On Bear Days, suppresses counter-trend CE pullbacks. Proven on Zerodha data to eliminate 80% of losing traps.
                </p>
              </div>
              <input
                type="checkbox"
                checked={form.dsEnableMacroDayBias !== false}
                onChange={(e) => set("dsEnableMacroDayBias", e.target.checked)}
                className="h-4 w-4 rounded accent-profit shrink-0 cursor-pointer"
              />
            </div>

            {/* Midday Dead-Zone Filter */}
            <div className="flex items-center justify-between p-3.5 rounded-lg border border-border bg-card">
              <div className="space-y-0.5 pr-4">
                <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-warn" />
                  Extended Midday Dead-Zone Shield (11:30 AM – 1:30 PM IST)
                </p>
                <p className="text-xs text-foreground/75 font-medium leading-relaxed">
                  Skips new entries during the European transition lunch lull (11:30–13:30) when liquidity drops and theta decay accelerates. Focuses capital on prime morning &amp; afternoon breakout windows.
                </p>
              </div>
              <input
                type="checkbox"
                checked={form.dsEnableMiddayChopFilter !== false}
                onChange={(e) => set("dsEnableMiddayChopFilter", e.target.checked)}
                className="h-4 w-4 rounded accent-signal shrink-0 cursor-pointer"
              />
            </div>
          </div>
        </div>
      )}

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
          <div>
            <label className="text-xs sm:text-sm font-semibold text-foreground mb-2 block">Trading Instrument</label>
            <div className="p-1.5 rounded-lg bg-secondary/40 border border-border grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => set("isOptionBuyingOnly", false)}
                className={cn(
                  "flex flex-col items-center gap-1 py-3.5 rounded-lg text-xs font-semibold transition-all",
                  !form.isOptionBuyingOnly
                    ? "bg-card border border-border  text-accent-foreground "
                    : "text-foreground/75 font-medium hover:text-foreground"
                )}
              >
                <BarChart2 className="h-5 w-5 mb-0.5" />
                <span>Equity / Stock</span>
                <span className="text-[10px] font-normal opacity-80">Trade NSE/BSE directly</span>
              </button>
              <button
                type="button"
                onClick={() => set("isOptionBuyingOnly", true)}
                className={cn(
                  "flex flex-col items-center gap-1 py-3.5 rounded-lg text-xs font-semibold transition-all",
                  form.isOptionBuyingOnly
                    ? "bg-card border border-border  text-accent-foreground "
                    : "text-foreground/75 font-medium hover:text-foreground"
                )}
              >
                <Target className="h-5 w-5 mb-0.5" />
                <span>Options (CE/PE)</span>
                <span className="text-[10px] font-normal opacity-80">Buy ATM options on NFO</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {form.type === "STOCK_OPTIONS_BUYING" && (
        <Advanced title="Entry and filter settings" description="Direction, setup type, timeframe and filters. Defaults are tuned; open to fine-tune.">
        <div className="space-y-5">
          <div className="p-4 rounded-lg bg-brand-subtle border-2 border-primary/30">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="h-4 w-4 text-accent-foreground" />
              <p className="text-xs sm:text-sm font-semibold text-accent-foreground font-semibold">
                Institutional 80% Profitability Engine (EMA-VWAP + Inside Candle + Pullbacks)
              </p>
            </div>
            <p className="text-xs text-foreground font-medium leading-relaxed mt-1 font-normal">
              Engineered for asymmetric risk-to-reward. Combines 15-EMA/VWAP momentum alignment with Inside Candle range compression and pullback rejections, backed by strict High-Delta ITM strike liquidity filters.
            </p>
          </div>

          {/* Trade Directional Bias */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs sm:text-sm font-semibold text-foreground">Trade Directional Bias</label>
              <span className="text-xs text-accent-foreground font-semibold bg-brand-subtle border border-primary/60 px-2 py-0.5 rounded-md">
                Set PE-Only for Breakdown Setups (e.g. APOLLOHOSP M-Pattern)
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { label: "Both (Auto)", val: "BOTH", desc: "Long on Call, Short on Put", icon: Shuffle },
                { label: "Bullish (CE Only)", val: "CALL_ONLY", desc: "Only buy Calls on Breakouts", icon: ArrowUpRight },
                { label: "Bearish (PE Only)", val: "PUT_ONLY", desc: "Only buy Puts on Breakdowns", icon: ArrowDownRight },
              ].map((item) => {
                const Icon = item.icon;
                const isSelected = (form.sDirectionBias || "BOTH") === item.val;
                return (
                  <button
                    key={item.val}
                    type="button"
                    onClick={() => set("sDirectionBias", item.val)}
                    className={cn(
                      "text-left p-3.5 rounded-lg border-2 transition-all flex flex-col justify-between bg-card",
                      isSelected
                        ? "border-primary bg-brand-subtle/40   ring-1 ring-primary/30"
                        : "border-border hover:border-primary/50 hover:bg-accent/40"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-xs sm:text-sm text-foreground">{item.label}</p>
                      <Icon className={cn("h-4 w-4", isSelected ? "text-accent-foreground " : "text-muted-foreground")} />
                    </div>
                    <p className="text-xs text-foreground/75 font-medium mt-1">{item.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Setup Trigger Architecture */}
          <div>
            <label className="text-xs sm:text-sm font-semibold text-foreground mb-2 block">Trigger Setup Mode</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { label: "Dual Setup (Recommended)", val: "BOTH", desc: "Inside Candle + 15-EMA Pullback" },
                { label: "Inside Candle Only", val: "INSIDE_CANDLE", desc: "Pure Range Compression Breakout" },
                { label: "Pullback Rejection", val: "PULLBACK_REJECTION", desc: "EMA/VWAP Re-test with Wick" },
              ].map((item) => {
                const isSelected = (form.sSetupType || "BOTH") === item.val;
                return (
                  <button
                    key={item.val}
                    type="button"
                    onClick={() => set("sSetupType", item.val)}
                    className={cn(
                      "text-left p-3.5 rounded-lg border-2 transition-all bg-card",
                      isSelected
                        ? "border-primary bg-brand-subtle/40   ring-1 ring-primary/30"
                        : "border-border hover:border-primary/50 hover:bg-accent/40"
                    )}
                  >
                    <p className="font-semibold text-xs sm:text-sm text-foreground">{item.label}</p>
                    <p className="text-xs text-foreground/75 font-medium mt-1">{item.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Timeframe & EMA Period */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs sm:text-sm font-semibold text-foreground mb-1 block">Candle Timeframe</label>
              <select
                value={form.sTimeframe}
                onChange={(e) => set("sTimeframe", e.target.value)}
                className="flex h-10 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 font-semibold"
              >
                <option value="5min">5-Minute Candles (Aggressive / Fast Breakouts)</option>
                <option value="15min">15-Minute Candles (Recommended — High Win Rate)</option>
              </select>
            </div>
            <div>
              <label className="text-xs sm:text-sm font-semibold text-foreground mb-1 block">EMA Period</label>
              <Input type="number" value={form.sEmaPeriod} onChange={e => set("sEmaPeriod", e.target.value)} className="font-semibold text-xs h-10 bg-background border-border text-foreground rounded-lg" />
            </div>
          </div>

          {/* Moneyness & RVOL Filter */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs sm:text-sm font-semibold text-foreground mb-1 block">Option Strike Moneyness</label>
              <select
                value={form.sMoneyness || "ITM"}
                onChange={(e) => set("sMoneyness", e.target.value)}
                className="flex h-10 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 font-semibold"
              >
                <option value="ITM">In-The-Money (ITM) — Delta ≥ 0.55 (Recommended — Reduced Theta)</option>
                <option value="ATM">At-The-Money (ATM) — Balanced Delta ~0.50</option>
              </select>
            </div>
            <div>
              <label className="text-xs sm:text-sm font-semibold text-foreground mb-1 block">Min Volume Surge (RVOL)</label>
              <select
                value={form.sMinRvol || "1.25"}
                onChange={(e) => set("sMinRvol", e.target.value)}
                className="flex h-10 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 font-semibold"
              >
                <option value="1.0">1.0x Volume SMA (Standard Volume)</option>
                <option value="1.25">1.25x Volume SMA (Recommended — Institutional Filter)</option>
                <option value="1.5">1.5x Volume SMA (High Conviction Surge)</option>
              </select>
            </div>
          </div>

          {/* HTF Trend Filter Toggle */}
          <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-card">
            <div>
              <p className="text-xs sm:text-sm font-semibold text-foreground">Higher Timeframe (15-Min) Trend Filter</p>
              <p className="text-xs text-foreground/75 font-medium mt-0.5">
                Ensures trade aligns with the 50-EMA on the 15-min chart before triggering option entry.
              </p>
            </div>
            <input
              type="checkbox"
              checked={form.sEnableHtfFilter !== false}
              onChange={(e) => set("sEnableHtfFilter", e.target.checked)}
              className="h-4 w-4 rounded border-border text-accent-foreground focus:ring-primary cursor-pointer"
            />
          </div>
        </div>
        </Advanced>
      )}
    </div>
  );
}
