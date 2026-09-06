"use client";

import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Zap, Target, Flame, BarChart2, TrendingUp, Info, Loader2, Sparkles, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { StrategyFormState, getLotSize } from "../types";
import { marketApi } from "@/lib/api";

interface Step2Props {
  form: StrategyFormState;
  set: (k: keyof StrategyFormState, v: any) => void;
}

export function Step2InstrumentConfig({ form, set }: Step2Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const handleSymbolSearch = async (query: string) => {
    setSearchQuery(query);
    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const res = await marketApi.search(query);
      setSearchResults(res.data?.data || []);
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const selectInstrument = (item: any) => {
    set("symbol", item.symbol);
    set("exchange", item.exchange);
    set("instrumentType", item.segment === "NFO-OPT" || item.segment === "BFO-OPT" ? "OPTION" : (item.segment === "INDICES" ? "INDEX" : "STOCK"));
    setSearchResults([]);
    setSearchQuery("");
  };

  return (
    <div className="space-y-5">
      {/* ── GAMMA BLAST SPECIAL CONFIG ── */}
      {form.type === "GAMMA_BLAST_EXPIRY" && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/10 border border-amber-500/20">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <p className="text-xs font-bold text-amber-700 dark:text-amber-300">
                Gamma Blast (CAS & Expiry Special) Configuration
              </p>
            </div>
            <p className="text-[11px] text-amber-600 dark:text-amber-400 leading-relaxed">
              Trades explosive 01:00 PM – 03:05 PM momentum spikes on NIFTY (Tuesdays) & SENSEX (Thursdays). The engine automatically selects cheap ₹8–₹15 / ₹12–₹25 strikes using live Open Interest (OI) & range breakout triggers.
            </p>
          </div>

          {/* Expiry Day Mode Selection */}
          <div>
            <label className="text-sm font-semibold mb-2 block">Expiry Day Mode</label>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "AUTO (Smart Expiry)", val: "AUTO", desc: "Tue: NIFTY, Thu: SENSEX", lotSize: 65 },
                { label: "NIFTY 50", val: "NIFTY", desc: "Tuesday Expiry (Lot: 65)", lotSize: 65 },
                { label: "BSE SENSEX", val: "SENSEX", desc: "Thursday Expiry (Lot: 20)", lotSize: 20 },
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
                    "text-left p-3.5 rounded-xl border-2 transition-all flex flex-col justify-between",
                    form.gbIndex === item.val || form.symbol === item.val
                      ? "border-amber-500 bg-amber-50/60 dark:bg-amber-950/20 shadow-sm"
                      : "border-[hsl(var(--border))] hover:border-amber-400/50"
                  )}
                >
                  <div>
                    <p className="font-bold text-xs text-[hsl(var(--foreground))]">{item.label}</p>
                    <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-0.5">{item.desc}</p>
                  </div>
                  <Badge variant="secondary" className="text-[9px] font-semibold mt-2 w-fit">
                    1 Lot = {item.lotSize} Qty
                  </Badge>
                </button>
              ))}
            </div>
          </div>

          {/* Lots & Product */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-semibold">Base Position Lots</label>
                <span className="text-[10px] text-indigo-500 font-semibold">
                  1 to 5 Lots Recommended
                </span>
              </div>
              <Input
                type="number"
                min={1}
                max={10}
                value={form.lots}
                onChange={(e) => set("lots", e.target.value)}
              />
              <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1">
                Total Qty: {Number(form.lots || 1) * (form.symbol === "SENSEX" ? 20 : 65)} shares
              </p>
            </div>
            <div>
              <label className="text-sm font-semibold mb-2 block">Product Type</label>
              <select
                value={form.product}
                onChange={(e) => set("product", e.target.value)}
                className="flex h-10 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--input))] px-3 py-2 text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.5)] font-semibold"
              >
                <option value="NRML">NRML (Recommended — Avoids 3:12 PM RMS close)</option>
                <option value="MIS">MIS (Intraday)</option>
              </select>
            </div>
          </div>

          {/* Smart Auto Premium Discovery */}
          <div className="flex items-start gap-3 p-4 rounded-xl border border-[hsl(var(--primary)/0.2)] bg-[hsl(var(--primary)/0.05)]">
            <Sparkles className="h-5 w-5 text-indigo-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-[hsl(var(--foreground))]">
                Auto-Adaptive Near-OTM Strike Discovery Enabled
              </p>
              <p className="text-[11px] text-[hsl(var(--muted-foreground))] mt-0.5 leading-relaxed">
                The engine automatically targets high-delta Near-OTM contracts (1–3 strikes from Spot ATM) that rapidly cross In-The-Money during breakouts and retain intrinsic cash settlement value.
              </p>
            </div>
          </div>

          {/* Multi-Lot & High-Conviction Sizing Controls */}
          <div className="p-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary)/0.15)] space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-[hsl(var(--foreground))]">High-Conviction A+ Setup Boost</p>
                <p className="text-[11px] text-[hsl(var(--muted-foreground))] mt-0.5">
                  Automatically boost position up to 3–5 lots when Range Breakout + Volume Surge + OI Unwinding align
                </p>
              </div>
              <input
                type="checkbox"
                checked={form.gbEnableHighConvictionBoost}
                onChange={(e) => set("gbEnableHighConvictionBoost", e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
            </div>

            {form.gbEnableHighConvictionBoost && (
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[hsl(var(--border)/0.5)]">
                <div>
                  <label className="text-[11px] font-semibold block mb-1">Max Conviction Lots</label>
                  <select
                    value={form.gbMaxConvictionLots}
                    onChange={(e) => set("gbMaxConvictionLots", e.target.value)}
                    className="flex h-9 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--input))] px-2.5 py-1.5 text-xs text-[hsl(var(--foreground))] font-semibold"
                  >
                    <option value="2">2 Lots</option>
                    <option value="3">3 Lots (Recommended)</option>
                    <option value="4">4 Lots</option>
                    <option value="5">5 Lots (Aggressive Max)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold block mb-1">2.0x Partial Profit Booking</label>
                  <div className="flex items-center h-9 gap-2">
                    <input
                      type="checkbox"
                      id="partialBooking"
                      checked={form.gbEnablePartialProfitBooking}
                      onChange={(e) => set("gbEnablePartialProfitBooking", e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <label htmlFor="partialBooking" className="text-[11px] text-[hsl(var(--muted-foreground))]">
                      Exit 50% lots @ 2.0x milestone; trail remainder
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Time Window */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-[hsl(var(--secondary)/0.3)] border border-[hsl(var(--border))]">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-indigo-500" />
              <div>
                <p className="text-xs font-bold">Execution Window: 01:00 PM – 03:25 PM IST</p>
                <p className="text-[10px] text-[hsl(var(--muted-foreground))]">Active hold & trail through 15:25–15:30 candle | Hard Auto-Exit @ 03:29:30 PM before market close</p>
              </div>
            </div>
            <Badge className="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              CAS Guard Enabled
            </Badge>
          </div>
        </div>
      )}

      {/* ── STANDARD INSTRUMENT SELECTOR FOR OTHER STRATEGIES ── */}
      {form.type !== "GAMMA_BLAST_EXPIRY" && (
        <>
          <div className="relative space-y-2">
            <label className="text-sm font-medium block">Search Symbol (Stock, Option, Future)</label>
            <div className="relative">
              <Input
                placeholder="Search e.g. RELIANCE, NIFTY 22000 CE..."
                value={searchQuery}
                onChange={(e) => handleSymbolSearch(e.target.value)}
                className="pr-10"
              />
              {isSearching && (
                <div className="absolute right-3 top-2.5">
                  <Loader2 className="h-5 w-5 animate-spin text-[hsl(var(--muted-foreground))]" />
                </div>
              )}
            </div>

            {/* Search Results Dropdown */}
            {searchResults.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-xl shadow-xl max-h-60 overflow-y-auto divide-y divide-[hsl(var(--border)/0.5)]">
                {searchResults.map((item) => {
                  const itemPrice = item.ltp || item.ltpNSE || item.price;
                  return (
                    <button
                      key={`${item.exchange}:${item.symbol}`}
                      onClick={() => selectInstrument(item)}
                      className="w-full flex items-center justify-between p-3 hover:bg-[hsl(var(--secondary)/0.5)] transition-colors text-left group"
                    >
                      <div>
                        <p className="text-sm font-bold text-[hsl(var(--foreground))] group-hover:text-indigo-600 transition-colors">
                          {item.symbol}
                        </p>
                        <p className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase truncate max-w-[220px]">
                          {item.name}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {itemPrice ? (
                          <div className="text-right">
                            <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                              ₹{Number(itemPrice).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </p>
                            <span className="text-[9px] text-slate-400">Live LTP</span>
                          </div>
                        ) : null}
                        <Badge className="text-[10px] font-semibold">{item.exchange}</Badge>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex items-center justify-between p-3 rounded-lg bg-[hsl(var(--secondary)/0.3)] border border-[hsl(var(--border))]">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Current Selection</p>
                <p className="text-sm font-bold">{form.symbol} <span className="text-[10px] font-normal text-[hsl(var(--muted-foreground))]">({form.exchange})</span></p>
              </div>
              <Badge variant="secondary">{form.instrumentType}</Badge>
            </div>
          </div>

          {form.type === "NIFTY_OPTIONS_SCALPER" && (
            <div className="flex items-start gap-3 p-3.5 rounded-xl border border-purple-500/20 bg-purple-500/5 text-purple-700 dark:text-purple-300">
              <Sparkles className="h-4 w-4 text-purple-500 shrink-0 mt-0.5" />
              <div className="text-xs space-y-0.5">
                <p className="font-bold">Dynamic Margin Lot Sizing Active</p>
                <p className="text-[11px] opacity-80 leading-relaxed">
                  Instead of a fixed 1-lot limit, the engine detects your live Zerodha margin, preserves a 15% cash buffer, and deploys 85% tradeable margin into lots (1 Lot = {getLotSize(form.symbol || 'NIFTY')} Qty).
                </p>
              </div>
            </div>
          )}

          {form.type === "BREAKOUT_15MIN" && (
            <div className="flex items-start gap-3 p-3.5 rounded-xl border border-blue-500/20 bg-blue-500/5 text-blue-700 dark:text-blue-300">
              <Sparkles className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
              <div className="text-xs space-y-0.5">
                <p className="font-bold">Dynamic Margin & Exchange Server SL Active</p>
                <p className="text-[11px] opacity-80 leading-relaxed">
                  Automatically queries live Zerodha cash margin (reserving 15% buffer). Sizes 85% tradeable margin at 5x MIS leverage for stocks or affordable lots for index options. Arms a server-side SL-L order at Zerodha on entry fill and monitors Target 1 (+2R) for uncapped momentum trailing.
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium block">
                  {form.type === "NIFTY_OPTIONS_SCALPER" || form.type === "BREAKOUT_15MIN" ? "Minimum / Base Lots" : "Number of Lots"}
                </label>
                <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                  1 Lot = {getLotSize(form.symbol)} Qty
                </span>
              </div>
              <Input
                type="number"
                min={1}
                value={form.lots}
                onChange={(e) => set("lots", e.target.value)}
              />
              <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1">
                {form.type === 'NIFTY_OPTIONS_SCALPER' || form.type === 'BREAKOUT_15MIN'
                  ? 'Dynamic Margin Allocation: Auto-scales lots from Zerodha cash (85% deployed, 15% buffer)'
                  : form.symbol === 'AUTO'
                  ? 'Quantity will be dynamically calculated to achieve target'
                  : `Total Quantity: ${Number(form.lots) * getLotSize(form.symbol)} shares`}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Product Type</label>
              <select
                value={form.product}
                onChange={(e) => set("product", e.target.value)}
                className="flex h-10 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--input))] px-3 py-2 text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.5)]"
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
          <div className="p-3 rounded-xl bg-purple-50/60 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800">
            <p className="text-xs font-semibold text-purple-700 dark:text-purple-300">⚡ Nifty 10-Point Scalper Engine Setup</p>
            <p className="text-[11px] text-purple-600 dark:text-purple-400 mt-1 leading-relaxed">
              Trades rapid momentum impulses on high-delta options using 3 confluence triggers (EMA-VWAP Crossover, Pullback Rejection &amp; 15-Min ORB). Automatically scales lots from live margin, trails to breakeven at +6 pts, and rides uncapped runners with dynamic momentum ratchets.
            </p>
          </div>

          <div>
            <label className="text-sm font-semibold mb-2 block">Index Presets</label>
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
                    "text-xs p-2.5 rounded-lg border text-left transition-all font-medium",
                    form.symbol === p.sym
                      ? "border-purple-500 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 font-bold shadow-sm"
                      : "border-[hsl(var(--border))] hover:border-purple-400/50 text-[hsl(var(--muted-foreground))]"
                  )}
                >
                  <p className="font-semibold text-xs text-[hsl(var(--foreground))]">{p.label}</p>
                  <p className="text-[10px] opacity-70 mt-0.5">{p.sub}</p>
                </button>
              ))}
            </div>

            {form.symbol.toUpperCase().includes("HYBRID") && (
              <div className="mt-3 p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 text-emerald-800 dark:text-emerald-300 text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <Sparkles className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>AUTO_HYBRID Weekly Expiry Engine Schedule</span>
                  <Badge className="bg-emerald-600/20 text-emerald-700 dark:text-emerald-300 text-[9px] font-bold ml-auto border-0">
                    +88% Monthly ROI Backtest
                  </Badge>
                </div>
                <div className="text-[11px] opacity-90 grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                  <div>• <span className="font-semibold">Tuesday:</span> NIFTY 50 Weekly Expiry (+10 pt target, 90% win rate)</div>
                  <div>• <span className="font-semibold">Thursday:</span> SENSEX Weekly Expiry (+35 pt target, 70% win rate)</div>
                  <div>• <span className="font-semibold">Friday:</span> SENSEX Momentum (+35 pt target, 100% win rate)</div>
                  <div>• <span className="font-semibold">Mon &amp; Wed:</span> NIFTY 50 (institutional tight 0.05 spread)</div>
                </div>
              </div>
            )}
          </div>

          {/* Dynamic Compounding Capital Controls */}
          <div className="p-3.5 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary)/0.15)] space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5 pr-4">
                <p className="text-xs font-semibold text-[hsl(var(--foreground))] flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5 text-purple-500" />
                  Dynamic Compounding Position Sizing
                </p>
                <p className="text-[10px] text-[hsl(var(--muted-foreground))] leading-relaxed">
                  Deploys 85% tradeable margin from live Zerodha balance (preserving 15% cash buffer). Compounds lots up as capital grows to achieve &ge;60% monthly ROI.
                </p>
              </div>
              <input
                type="checkbox"
                checked={form.dsEnableDynamicSizing !== false}
                onChange={(e) => set("dsEnableDynamicSizing", e.target.checked)}
                className="h-4 w-4 rounded accent-purple-600 shrink-0 cursor-pointer"
              />
            </div>

            {form.dsEnableDynamicSizing !== false && (
              <div className="grid grid-cols-2 gap-3 pt-1 border-t border-[hsl(var(--border)/0.5)]">
                <div>
                  <label className="text-[11px] font-medium block text-[hsl(var(--muted-foreground))] mb-1">
                    Custom Capital Cap (₹, Optional)
                  </label>
                  <Input
                    type="number"
                    placeholder="Empty = Live Kite cash"
                    value={form.dsMaxCapital || ""}
                    onChange={(e) => set("dsMaxCapital", e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium block text-[hsl(var(--muted-foreground))] mb-1">
                    Max Safety Lot Ceiling
                  </label>
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    placeholder="25"
                    value={form.dsMaxLots || "25"}
                    onChange={(e) => set("dsMaxLots", e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Timeframe selector */}
          <div className="p-3.5 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary)/0.15)] space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-bold block">Scalping Candle Timeframe</label>
                <p className="text-[10px] text-[hsl(var(--muted-foreground))]">
                  Calculates EMA, VWAP and StochRSI on this timeframe for entry signals.
                </p>
              </div>
              <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40 px-2 py-0.5 rounded-full">
                {form.dsTimeframe === "3minute" ? "High Sensitivity (3m)" : "Standard Scalp (5m)"}
              </span>
            </div>
            <select
              value={form.dsTimeframe || "5minute"}
              onChange={(e) => set("dsTimeframe", e.target.value as any)}
              className="flex h-10 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--input))] px-3 py-2 text-xs text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.5)] font-semibold"
            >
              <option value="5minute">5-Minute Candles (Recommended — Higher Confluence &amp; Fewer Whipsaws)</option>
              <option value="3minute">3-Minute Candles (High Sensitivity — Earliest Momentum Impulse Entry)</option>
            </select>
          </div>

          {/* Confluence & Noise Protection Filters */}
          <div className="space-y-2.5 pt-1">
            <label className="text-xs font-bold text-[hsl(var(--foreground))] block">
              Institutional Edge &amp; Noise Filters
            </label>

            {/* Trend Bias Filter */}
            <div className="flex items-center justify-between p-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary)/0.15)]">
              <div className="space-y-0.5 pr-4">
                <p className="text-xs font-semibold text-[hsl(var(--foreground))] flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5 text-purple-500" />
                  Day VWAP Trend Bias Filter
                </p>
                <p className="text-[10px] text-[hsl(var(--muted-foreground))] leading-relaxed">
                  Only buys CE when Index is above Day VWAP; only buys PE when Index is below Day VWAP. Eliminates over 50% of counter-trend trap entries.
                </p>
              </div>
              <input
                type="checkbox"
                checked={form.dsEnableTrendBiasFilter !== false}
                onChange={(e) => set("dsEnableTrendBiasFilter", e.target.checked)}
                className="h-4 w-4 rounded accent-purple-600 shrink-0 cursor-pointer"
              />
            </div>

            {/* Institutional RVOL Volume Surge */}
            <div className="flex items-center justify-between p-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary)/0.15)]">
              <div className="space-y-0.5 pr-4">
                <p className="text-xs font-semibold text-[hsl(var(--foreground))] flex items-center gap-1.5">
                  <BarChart2 className="h-3.5 w-3.5 text-blue-500" />
                  Institutional Volume Surge (RVOL &ge; 1.15x)
                </p>
                <p className="text-[10px] text-[hsl(var(--muted-foreground))] leading-relaxed">
                  Requires trigger candle volume to be 1.15x higher than 10-period average or higher than previous candle. Skips low-volume retail traps.
                </p>
              </div>
              <input
                type="checkbox"
                checked={form.dsEnableVolumeSurge !== false}
                onChange={(e) => set("dsEnableVolumeSurge", e.target.checked)}
                className="h-4 w-4 rounded accent-purple-600 shrink-0 cursor-pointer"
              />
            </div>

            {/* Macro Day Trend Alignment (Proven 76.9% Win Rate) */}
            <div className="flex items-center justify-between p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5">
              <div className="space-y-0.5 pr-4">
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                  <p className="text-xs font-semibold text-[hsl(var(--foreground))]">
                    Macro Day Trend Alignment
                  </p>
                  <Badge className="bg-emerald-600/20 text-emerald-600 dark:text-emerald-400 text-[9px] font-bold border-0">
                    76.9% Win Rate Shield
                  </Badge>
                </div>
                <p className="text-[10px] text-[hsl(var(--muted-foreground))] leading-relaxed">
                  On Bull Days (Open &ge; Prev Close), suppresses counter-trend PE pullbacks. On Bear Days, suppresses counter-trend CE pullbacks. Proven on Zerodha data to eliminate 80% of losing traps.
                </p>
              </div>
              <input
                type="checkbox"
                checked={form.dsEnableMacroDayBias !== false}
                onChange={(e) => set("dsEnableMacroDayBias", e.target.checked)}
                className="h-4 w-4 rounded accent-emerald-600 shrink-0 cursor-pointer"
              />
            </div>

            {/* Midday Dead-Zone Filter */}
            <div className="flex items-center justify-between p-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary)/0.15)]">
              <div className="space-y-0.5 pr-4">
                <p className="text-xs font-semibold text-[hsl(var(--foreground))] flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-amber-500" />
                  Extended Midday Dead-Zone Shield (11:30 AM – 1:30 PM IST)
                </p>
                <p className="text-[10px] text-[hsl(var(--muted-foreground))] leading-relaxed">
                  Skips new entries during the European transition lunch lull (11:30–13:30) when liquidity drops and theta decay accelerates. Focuses capital on prime morning &amp; afternoon breakout windows.
                </p>
              </div>
              <input
                type="checkbox"
                checked={form.dsEnableMiddayChopFilter !== false}
                onChange={(e) => set("dsEnableMiddayChopFilter", e.target.checked)}
                className="h-4 w-4 rounded accent-purple-600 shrink-0 cursor-pointer"
              />
            </div>
          </div>
        </div>
      )}

      {form.type === "BREAKOUT_15MIN" && (
        <div className="space-y-4">
          <div className="p-3 rounded-xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
            <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">🚀 15-Minute Opening Range Breakout Setup</p>
            <p className="text-[11px] text-blue-600 dark:text-blue-400 mt-1 leading-relaxed">
              Monitors the first 15-minute candle (09:15–09:30 AM). Enters when a 5-minute candle closes beyond the high or low with volume & VWAP alignment. If a false breakout occurs, it detects the liquidity trap and reverses immediately!
            </p>
          </div>
          <div>
            <label className="text-sm font-semibold mb-2 block">Quick Instrument Presets</label>
            <div className="grid grid-cols-3 gap-2">
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
                    "text-xs p-2.5 rounded-lg border text-left transition-all font-medium",
                    form.symbol === p.sym
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-bold shadow-sm"
                      : "border-[hsl(var(--border))] hover:border-blue-400/50 text-[hsl(var(--muted-foreground))]"
                  )}
                >
                  <p className="font-semibold text-xs text-[hsl(var(--foreground))]">{p.label}</p>
                  <p className="text-[10px] opacity-70 mt-0.5">{p.exch}:{p.sym}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Lower Timeframe for Traps & Breakout Entries */}
          <div className="p-3.5 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary)/0.15)] space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-bold block">Entry & Trap Timeframe</label>
                <p className="text-[10px] text-[hsl(var(--muted-foreground))]">
                  Establishes 15m range (09:15–09:30), then monitors this lower timeframe for liquidity sweep traps & reclaim entries.
                </p>
              </div>
              <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded-full">
                Multi-Timeframe
              </span>
            </div>
            <select
              value={form.b15EntryTimeframe || "3min"}
              onChange={(e) => set("b15EntryTimeframe", e.target.value)}
              className="flex h-10 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--input))] px-3 py-2 text-xs text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.5)] font-semibold"
            >
              <option value="3min">3-Minute Candles (Recommended — Optimal Institutional Trap Detection)</option>
              <option value="1min">1-Minute Candles (High Sensitivity & Fastest Reversal Entry)</option>
              <option value="5min">5-Minute Candles (Standard Breakout Timeframe)</option>
            </select>
          </div>
        </div>
      )}

      {form.type === "EMA_VWAP_CROSSOVER" && (
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">EMA Period</label>
            <Input type="number" value={form.emaPeriod} onChange={(e) => set("emaPeriod", e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-semibold mb-2 block">Trading Instrument</label>
            <div className="p-1 rounded-xl bg-[hsl(var(--secondary)/0.3)] border border-[hsl(var(--border))] grid grid-cols-2 gap-1">
              <button
                type="button"
                onClick={() => set("isOptionBuyingOnly", false)}
                className={cn(
                  "flex flex-col items-center gap-1 py-3 rounded-lg text-xs font-semibold transition-all",
                  !form.isOptionBuyingOnly
                    ? "bg-[hsl(var(--background))] border border-[hsl(var(--border))] shadow-sm text-[hsl(var(--primary))]"
                    : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                )}
              >
                <BarChart2 className="h-5 w-5 mb-0.5" />
                <span>Equity / Stock</span>
                <span className="text-[10px] font-normal opacity-70">Trade NSE/BSE directly</span>
              </button>
              <button
                type="button"
                onClick={() => set("isOptionBuyingOnly", true)}
                className={cn(
                  "flex flex-col items-center gap-1 py-3 rounded-lg text-xs font-semibold transition-all",
                  form.isOptionBuyingOnly
                    ? "bg-[hsl(var(--background))] border border-[hsl(var(--border))] shadow-sm text-[hsl(var(--primary))]"
                    : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                )}
              >
                <Target className="h-5 w-5 mb-0.5" />
                <span>Options (CE/PE)</span>
                <span className="text-[10px] font-normal opacity-70">Buy ATM options on NFO</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {form.type === "STOCK_OPTIONS_BUYING" && (
        <div className="space-y-4">
          <div className="p-3 rounded-xl bg-blue-50 border border-blue-100">
            <p className="text-xs font-semibold text-blue-700">🔥 Stock Options Buying (EMA + VWAP Crossover + Inside Candle)</p>
            <p className="text-[11px] text-blue-600 mt-1">Triggers when 15-EMA crosses VWAP on the stock, followed by an Inside Candle (Mother & Baby) setup.</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Timeframe</label>
              <select
                value={form.sTimeframe}
                onChange={(e) => set("sTimeframe", e.target.value)}
                className="flex h-10 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--input))] px-3 py-2 text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.5)]"
              >
                <option value="5min">5 Minute Candles</option>
                <option value="15min">15 Minute Candles</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">EMA Period</label>
              <Input type="number" value={form.sEmaPeriod} onChange={e => set("sEmaPeriod", e.target.value)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
