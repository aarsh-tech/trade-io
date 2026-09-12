"use client";

import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Zap, Target, BarChart2, TrendingUp, Loader2, Sparkles, Clock, ArrowUpRight, ArrowDownRight, Shuffle } from "lucide-react";
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
    if (item.lotSize && item.lotSize > 0) {
      set("lotSize", item.lotSize);
    }
    setSearchResults([]);
    setSearchQuery("");
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
      {/* ── GAMMA BLAST SPECIAL CONFIG ── */}
      {form.type === "GAMMA_BLAST_EXPIRY" && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-amber-50 border-2 border-amber-300 shadow-xs">
            <div className="flex items-center gap-2 mb-1.5">
              <Sparkles className="h-4 w-4 text-amber-700 " />
              <p className="text-xs sm:text-sm font-bold text-amber-950 font-black">
                Gamma Blast (CAS &amp; Expiry Special) Configuration
              </p>
            </div>
            <p className="text-xs text-slate-900 font-medium leading-relaxed">
              Trades explosive 01:00 PM – 03:05 PM momentum spikes on NIFTY (Tuesdays) &amp; SENSEX (Thursdays). The engine automatically selects cheap ₹8–₹15 / ₹12–₹25 strikes using live Open Interest (OI) &amp; range breakout triggers.
            </p>
          </div>

          {/* Expiry Day Mode Selection */}
          <div>
            <label className="text-xs sm:text-sm font-bold text-foreground mb-2 block">Expiry Day Mode</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                    "text-left p-3.5 rounded-2xl border-2 transition-all flex flex-col justify-between bg-card",
                    form.gbIndex === item.val || form.symbol === item.val
                      ? "border-amber-500 bg-amber-50/40  shadow-xs ring-1 ring-amber-500/30"
                      : "border-border hover:border-amber-400/50 hover:bg-accent/40"
                  )}
                >
                  <div>
                    <p className="font-bold text-xs sm:text-sm text-foreground">{item.label}</p>
                    <p className="text-xs text-slate-700 font-medium mt-1 leading-snug">{item.desc}</p>
                  </div>
                  <Badge variant="secondary" className="text-[10px] font-bold mt-2.5 w-fit border border-border/70">
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
                <label className="text-xs sm:text-sm font-bold text-foreground">Base Position Lots</label>
                <span className="text-xs text-blue-700  font-bold bg-blue-50  px-2 py-0.5 rounded-md border border-blue-200/60 ">
                  1 to 5 Lots Recommended
                </span>
              </div>
              <Input
                type="number"
                min={1}
                max={10}
                value={form.lots}
                onChange={(e) => set("lots", e.target.value)}
                className="font-semibold text-xs h-10 bg-background border-border text-foreground rounded-xl"
              />
              <p className="text-xs text-slate-700 font-medium mt-1">
                Total Qty: {Number(form.lots || 1) * (form.symbol === "SENSEX" ? 20 : 65)} shares
              </p>
            </div>
            <div>
              <label className="text-xs sm:text-sm font-bold text-foreground mb-2 block">Product Type</label>
              <select
                value={form.product}
                onChange={(e) => set("product", e.target.value)}
                className="flex h-10 w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 font-semibold"
              >
                <option value="NRML">NRML (Recommended — Avoids 3:12 PM RMS close)</option>
                <option value="MIS">MIS (Intraday)</option>
              </select>
            </div>
          </div>

          {/* Smart Auto Premium Discovery */}
          <div className="flex items-start gap-3 p-4 rounded-2xl border-2 border-blue-300 bg-blue-50 shadow-xs">
            <Sparkles className="h-5 w-5 text-blue-600  shrink-0 mt-0.5" />
            <div>
              <p className="text-xs sm:text-sm font-bold text-foreground">
                Auto-Adaptive Near-OTM Strike Discovery Enabled
              </p>
              <p className="text-xs text-slate-900 font-medium mt-1 leading-relaxed">
                The engine automatically targets high-delta Near-OTM contracts (1–3 strikes from Spot ATM) that rapidly cross In-The-Money during breakouts and retain intrinsic cash settlement value.
              </p>
            </div>
          </div>

          {/* Multi-Lot & High-Conviction Sizing Controls */}
          <div className="p-4 rounded-2xl border border-border bg-card shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm font-bold text-foreground">High-Conviction A+ Setup Boost</p>
                <p className="text-xs text-slate-700 font-medium mt-0.5">
                  Automatically boost position up to 3–5 lots when Range Breakout + Volume Surge + OI Unwinding align
                </p>
              </div>
              <input
                type="checkbox"
                checked={form.gbEnableHighConvictionBoost}
                onChange={(e) => set("gbEnableHighConvictionBoost", e.target.checked)}
                className="h-4 w-4 rounded border-border text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
            </div>

            {form.gbEnableHighConvictionBoost && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-border">
                <div>
                  <label className="text-xs font-bold text-foreground block mb-1">Max Conviction Lots</label>
                  <select
                    value={form.gbMaxConvictionLots}
                    onChange={(e) => set("gbMaxConvictionLots", e.target.value)}
                    className="flex h-10 w-full rounded-xl border border-border bg-background px-3 py-1.5 text-xs text-foreground font-semibold"
                  >
                    <option value="2">2 Lots</option>
                    <option value="3">3 Lots (Recommended)</option>
                    <option value="4">4 Lots</option>
                    <option value="5">5 Lots (Aggressive Max)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-foreground block mb-1">2.0x Partial Profit Booking</label>
                  <div className="flex items-center h-10 gap-2">
                    <input
                      type="checkbox"
                      id="partialBooking"
                      checked={form.gbEnablePartialProfitBooking}
                      onChange={(e) => set("gbEnablePartialProfitBooking", e.target.checked)}
                      className="h-4 w-4 rounded border-border text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <label htmlFor="partialBooking" className="text-xs text-slate-900 font-medium font-medium">
                      Exit 50% lots @ 2.0x milestone; trail remainder
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Time Window */}
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-secondary/40 border border-border">
            <div className="flex items-center gap-2.5">
              <Clock className="h-4 w-4 text-blue-600  shrink-0" />
              <div>
                <p className="text-xs font-bold text-foreground">Execution Window: 01:00 PM – 03:25 PM IST</p>
                <p className="text-xs text-slate-700 font-medium mt-0.5">Active hold &amp; trail through 15:25–15:30 candle | Hard Auto-Exit @ 03:29:30 PM before market close</p>
              </div>
            </div>
            <Badge className="text-[10px] bg-emerald-500/15 text-emerald-700  border border-emerald-500/30 font-bold shrink-0">
              CAS Guard Enabled
            </Badge>
          </div>
        </div>
      )}

      {/* ── STOCK OPTIONS BUYING: DEDICATED AUTO VS MANUAL STOCK SELECTION ── */}
      {form.type === "STOCK_OPTIONS_BUYING" && (
        <div className="space-y-4">
          <div>
            <label className="text-xs sm:text-sm font-bold text-foreground mb-2 block">Stock Selection Mode</label>
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
                  "p-4 rounded-2xl border-2 text-left transition-all relative overflow-hidden bg-card",
                  form.sIsAutoStockSelect !== false && form.symbol === "AUTO"
                    ? "border-blue-600 bg-blue-50/40  shadow-xs ring-1 ring-blue-500/30"
                    : "border-border hover:border-blue-400/50 hover:bg-accent/40 shadow-2xs"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold text-blue-700  uppercase tracking-wider flex items-center gap-1">
                    <Sparkles className="h-3.5 w-3.5" /> Recommended
                  </span>
                  <Badge className="text-[9px] bg-blue-600 text-white font-extrabold">180+ F&amp;O Scanner</Badge>
                </div>
                <p className="font-extrabold text-sm text-foreground mt-2">
                  🎯 Auto F&amp;O Momentum Scanner
                </p>
                <p className="text-xs text-slate-800 font-medium mt-1 leading-relaxed">
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
                  "p-4 rounded-2xl border-2 text-left transition-all relative overflow-hidden bg-card",
                  form.sIsAutoStockSelect === false && form.symbol !== "AUTO"
                    ? "border-indigo-600 bg-indigo-50/40  shadow-xs ring-1 ring-indigo-500/30"
                    : "border-border hover:border-indigo-400/50 hover:bg-accent/40 shadow-2xs"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-700 font-medium uppercase tracking-wider">
                    Custom Stock
                  </span>
                  <Badge variant="outline" className="text-[9px] font-bold border-border text-foreground">Single Stock</Badge>
                </div>
                <p className="font-extrabold text-sm text-foreground mt-2">
                  📌 Manual Stock Selection
                </p>
                <p className="text-xs text-slate-800 font-medium mt-1 leading-relaxed">
                  Trade options on a specific F&amp;O stock you choose (e.g. APOLLOHOSP, RELIANCE, TRENT, BAJFINANCE).
                </p>
              </button>
            </div>
          </div>

          {form.sIsAutoStockSelect !== false && form.symbol === "AUTO" ? (
            <div className="p-4 rounded-2xl border-2 border-blue-300 bg-blue-50 space-y-3 shadow-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-blue-500/20 text-blue-700  border border-blue-500/30">
                    <Zap className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm font-bold text-foreground">
                      Live F&amp;O Momentum Engine Active
                    </p>
                    <p className="text-xs text-slate-700 font-medium mt-0.5">
                      Scanning all 180+ NSE F&amp;O instruments continuously from 09:15 AM
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className="text-xs border-blue-500/40 text-blue-700  bg-blue-50  font-bold px-2.5 py-0.5">
                  Symbol: AUTO
                </Badge>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center pt-2 border-t border-border/60">
                <div className="p-2.5 rounded-xl bg-card border border-border/70 shadow-2xs">
                  <p className="text-xs font-bold text-blue-700 ">180+ Liquid Stocks</p>
                  <p className="text-[10px] text-slate-700 font-medium mt-0.5">Scanned dynamically</p>
                </div>
                <div className="p-2.5 rounded-xl bg-card border border-border/70 shadow-2xs">
                  <p className="text-xs font-bold text-indigo-700 ">5%–10% Velocity</p>
                  <p className="text-[10px] text-slate-700 font-medium mt-0.5">Day range expansion</p>
                </div>
                <div className="p-2.5 rounded-xl bg-card border border-border/70 shadow-2xs">
                  <p className="text-xs font-bold text-emerald-700 ">Auto Lot &amp; Strike</p>
                  <p className="text-[10px] text-slate-700 font-medium mt-0.5">Live NFO master fetch</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-xs font-bold text-foreground block">Quick F&amp;O Presets</label>
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
                      "p-3 rounded-xl border text-left text-xs transition-all bg-card",
                      form.symbol === preset.sym
                        ? "border-blue-600 bg-blue-50/40  text-foreground font-bold shadow-xs ring-1 ring-blue-500/30"
                        : "border-border hover:border-blue-400/50 hover:bg-accent/40 text-foreground"
                    )}
                  >
                    <p className="font-bold text-xs">{preset.sym}</p>
                    <p className="text-[10px] text-slate-700 font-medium mt-0.5">1 Lot = {preset.lot}</p>
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
          <div className="relative space-y-2">
            <label className="text-xs sm:text-sm font-bold text-foreground block">Search Symbol (Stock, Option, Future)</label>
            <div className="relative">
              <Input
                placeholder="Search e.g. RELIANCE, APOLLOHOSP, NIFTY 22000 CE..."
                value={searchQuery}
                onChange={(e) => handleSymbolSearch(e.target.value)}
                className="pr-10 h-10 text-xs font-semibold bg-background border-border text-foreground rounded-xl placeholder:text-muted-foreground/60 shadow-2xs"
              />
              {isSearching && (
                <div className="absolute right-3 top-2.5">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>

            {/* Search Results Dropdown */}
            {searchResults.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded-2xl shadow-xl max-h-60 overflow-y-auto divide-y divide-border">
                {searchResults.map((item) => {
                  const itemPrice = item.ltp || item.ltpNSE || item.price;
                  return (
                    <button
                      key={`${item.exchange}:${item.symbol}`}
                      onClick={() => selectInstrument(item)}
                      className="w-full flex items-center justify-between p-3.5 hover:bg-accent/50 transition-colors text-left group"
                    >
                      <div>
                        <p className="text-sm font-bold text-foreground group-hover:text-blue-600 transition-colors">
                          {item.symbol}
                        </p>
                        <p className="text-xs text-slate-700 font-medium uppercase truncate max-w-[220px]">
                          {item.name}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {item.lotSize && item.lotSize > 1 ? (
                          <Badge variant="outline" className="text-[10px] font-bold border-amber-500/40 text-amber-700  bg-amber-50 ">
                            Lot: {item.lotSize}
                          </Badge>
                        ) : null}
                        {itemPrice ? (
                          <div className="text-right">
                            <p className="text-xs font-bold text-emerald-700 ">
                              ₹{Number(itemPrice).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </p>
                            <span className="text-[10px] text-slate-500">Live LTP</span>
                          </div>
                        ) : null}
                        <Badge className="text-[10px] font-bold">{item.exchange}</Badge>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex items-center justify-between p-4 rounded-2xl bg-secondary/40 border border-border">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-700 font-medium">Current Selection</p>
                <div className="flex items-center gap-2.5 mt-0.5">
                  <p className="text-sm font-bold text-foreground">{form.symbol} <span className="text-xs font-semibold text-slate-700 font-medium">({form.exchange})</span></p>
                  {(form.lotSize || getLotSize(form.symbol, form.lotSize)) > 1 && (
                    <span className="text-xs font-bold text-amber-700  bg-amber-50  border border-amber-200/60  px-2.5 py-0.5 rounded-md">
                      1 Lot = {form.lotSize || getLotSize(form.symbol, form.lotSize)} Qty
                    </span>
                  )}
                </div>
              </div>
              <Badge variant="secondary" className="font-bold text-xs">{form.instrumentType}</Badge>
            </div>
          </div>

          {form.type === "NIFTY_OPTIONS_SCALPER" && (
            <div className="flex items-start gap-3 p-4 rounded-2xl border-2 border-purple-300 bg-purple-50 shadow-xs">
              <Sparkles className="h-5 w-5 text-purple-600  shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <p className="font-bold text-foreground">Dynamic Margin Lot Sizing Active</p>
                <p className="text-xs text-slate-900 font-medium leading-relaxed font-normal">
                  Instead of a fixed 1-lot limit, the engine detects your live Zerodha margin, preserves a 15% cash buffer, and deploys 85% tradeable margin into lots (1 Lot = {form.lotSize || getLotSize(form.symbol || 'NIFTY', form.lotSize)} Qty).
                </p>
              </div>
            </div>
          )}

          {form.type === "BREAKOUT_15MIN" && (
            <div className="flex items-start gap-3 p-4 rounded-2xl border-2 border-blue-300 bg-blue-50 shadow-xs">
              <Sparkles className="h-5 w-5 text-blue-600  shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <p className="font-bold text-foreground">Strict Risk Sizing &amp; Exchange Server SL Active</p>
                <p className="text-xs text-slate-900 font-medium leading-relaxed font-normal">
                  Automatically queries live Zerodha cash margin. Sizes quantity strictly by your Stop Loss ₹ (never risking more than configured) and caps capital deployment at 25% (5x MIS leverage). Arms a server-side SL-L order at Zerodha on entry fill and monitors Target 1 (+2R) for uncapped momentum trailing.
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs sm:text-sm font-bold text-foreground block">
                  {form.type === "NIFTY_OPTIONS_SCALPER" || form.type === "BREAKOUT_15MIN" ? "Minimum / Base Lots" : "Number of Lots"}
                </label>
                <span className="text-xs font-bold text-amber-700  bg-amber-50  border border-amber-200/60  px-2.5 py-0.5 rounded-md">
                  1 Lot = {form.lotSize || getLotSize(form.symbol, form.lotSize)} Qty
                </span>
              </div>
              <Input
                type="number"
                min={1}
                value={form.lots}
                onChange={(e) => set("lots", e.target.value)}
                className="font-semibold text-xs h-10 bg-background border-border text-foreground rounded-xl"
              />
              <p className="text-xs text-slate-700 font-medium mt-1">
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
              <label className="text-xs sm:text-sm font-bold text-foreground mb-2 block">Product Type</label>
              <select
                value={form.product}
                onChange={(e) => set("product", e.target.value)}
                className="flex h-10 w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 font-semibold"
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
          <div className="p-4 rounded-2xl bg-purple-50 border-2 border-purple-300 shadow-xs">
            <p className="text-xs sm:text-sm font-bold text-purple-950 font-black">⚡ Nifty 10-Point Scalper Engine Setup</p>
            <p className="text-xs text-slate-900 font-medium mt-1 leading-relaxed font-normal">
              Trades rapid momentum impulses on high-delta options using 3 confluence triggers (EMA-VWAP Crossover, Pullback Rejection &amp; 15-Min ORB). Automatically scales lots from live margin, trails to breakeven at +6 pts, and rides uncapped runners with dynamic momentum ratchets.
            </p>
          </div>

          <div>
            <label className="text-xs sm:text-sm font-bold text-foreground mb-2 block">Index Presets</label>
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
                    "text-xs p-3 rounded-2xl border text-left transition-all font-medium bg-card",
                    form.symbol === p.sym
                      ? "border-purple-600 bg-purple-50/40  shadow-xs ring-1 ring-purple-500/30"
                      : "border-border hover:border-purple-400/50 hover:bg-accent/40 text-foreground"
                  )}
                >
                  <p className="font-bold text-xs sm:text-sm text-foreground">{p.label}</p>
                  <p className="text-xs text-slate-700 font-medium mt-0.5">{p.sub}</p>
                </button>
              ))}
            </div>

            {form.symbol.toUpperCase().includes("HYBRID") && (
              <div className="mt-3 p-4 rounded-2xl border-2 border-emerald-300 bg-emerald-50 text-xs space-y-2 shadow-xs">
                <div className="flex items-center gap-1.5 font-bold">
                  <Sparkles className="h-4 w-4 text-emerald-600 " />
                  <span className="text-foreground text-xs sm:text-sm">AUTO_HYBRID Weekly Expiry Engine Schedule</span>
                  <Badge className="bg-emerald-600/20 text-emerald-700  text-[9px] font-bold ml-auto border-0">
                    +88% Monthly ROI Backtest
                  </Badge>
                </div>
                <div className="text-xs text-slate-900 font-medium grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 font-normal">
                  <div>• <span className="font-bold text-foreground">Tuesday:</span> NIFTY 50 Weekly Expiry (+10 pt target, 90% win rate)</div>
                  <div>• <span className="font-bold text-foreground">Thursday:</span> SENSEX Weekly Expiry (+35 pt target, 70% win rate)</div>
                  <div>• <span className="font-bold text-foreground">Friday:</span> SENSEX Momentum (+35 pt target, 100% win rate)</div>
                  <div>• <span className="font-bold text-foreground">Mon &amp; Wed:</span> NIFTY 50 (institutional tight 0.05 spread)</div>
                </div>
              </div>
            )}
          </div>

          {/* Dynamic Compounding Capital Controls */}
          <div className="p-4 rounded-2xl border border-border bg-card shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5 pr-4">
                <p className="text-xs sm:text-sm font-bold text-foreground flex items-center gap-1.5">
                  <TrendingUp className="h-4 w-4 text-purple-600 " />
                  Dynamic Compounding Position Sizing
                </p>
                <p className="text-xs text-slate-700 font-medium leading-relaxed">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-border">
                <div>
                  <label className="text-xs font-bold block text-foreground mb-1">
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
                  <label className="text-xs font-bold block text-foreground mb-1">
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
          <div className="p-4 rounded-2xl border border-border bg-card shadow-xs space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs sm:text-sm font-bold text-foreground block">Scalping Candle Timeframe</label>
                <p className="text-xs text-slate-700 font-medium mt-0.5">
                  Calculates EMA, VWAP and StochRSI on this timeframe for entry signals.
                </p>
              </div>
              <span className="text-xs font-bold text-purple-700  bg-purple-50  border border-purple-200/60  px-2.5 py-0.5 rounded-full">
                {form.dsTimeframe === "3minute" ? "High Sensitivity (3m)" : "Standard Scalp (5m)"}
              </span>
            </div>
            <select
              value={form.dsTimeframe || "5minute"}
              onChange={(e) => set("dsTimeframe", e.target.value as any)}
              className="flex h-10 w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 font-semibold"
            >
              <option value="5minute">5-Minute Candles (Recommended — Higher Confluence &amp; Fewer Whipsaws)</option>
              <option value="3minute">3-Minute Candles (High Sensitivity — Earliest Momentum Impulse Entry)</option>
            </select>
          </div>

          {/* Confluence & Noise Protection Filters */}
          <div className="space-y-2.5 pt-1">
            <label className="text-xs sm:text-sm font-bold text-foreground block">
              Institutional Edge &amp; Noise Filters
            </label>

            {/* Trend Bias Filter */}
            <div className="flex items-center justify-between p-3.5 rounded-2xl border border-border bg-card shadow-2xs">
              <div className="space-y-0.5 pr-4">
                <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5 text-purple-600 " />
                  Day VWAP Trend Bias Filter
                </p>
                <p className="text-xs text-slate-700 font-medium leading-relaxed">
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
            <div className="flex items-center justify-between p-3.5 rounded-2xl border border-border bg-card shadow-2xs">
              <div className="space-y-0.5 pr-4">
                <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <BarChart2 className="h-3.5 w-3.5 text-blue-600 " />
                  Institutional Volume Surge (RVOL &ge; 1.15x)
                </p>
                <p className="text-xs text-slate-700 font-medium leading-relaxed">
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
            <div className="flex items-center justify-between p-3.5 rounded-2xl border-2 border-emerald-300 bg-emerald-50 shadow-2xs">
              <div className="space-y-0.5 pr-4">
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-600 " />
                  <p className="text-xs font-bold text-foreground">
                    Macro Day Trend Alignment
                  </p>
                  <Badge className="bg-emerald-600/20 text-emerald-700  text-[9px] font-bold border-0">
                    76.9% Win Rate Shield
                  </Badge>
                </div>
                <p className="text-xs text-slate-900 font-medium leading-relaxed">
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
            <div className="flex items-center justify-between p-3.5 rounded-2xl border border-border bg-card shadow-2xs">
              <div className="space-y-0.5 pr-4">
                <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-amber-600 " />
                  Extended Midday Dead-Zone Shield (11:30 AM – 1:30 PM IST)
                </p>
                <p className="text-xs text-slate-700 font-medium leading-relaxed">
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
          <div className="p-4 rounded-2xl bg-blue-50 border-2 border-blue-300 shadow-xs">
            <p className="text-xs sm:text-sm font-bold text-blue-950 font-black">🚀 15-Minute Opening Range Breakout Setup</p>
            <p className="text-xs text-slate-900 font-medium mt-1 leading-relaxed font-normal">
              Monitors the first 15-minute candle (09:15–09:30 AM). Enters when a 5-minute candle closes beyond the high or low with volume &amp; VWAP alignment. If a false breakout occurs, it detects the liquidity trap and reverses immediately!
            </p>
          </div>
          <div>
            <label className="text-xs sm:text-sm font-bold text-foreground mb-2 block">Quick Instrument Presets</label>
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
                    "text-xs p-3 rounded-2xl border text-left transition-all font-medium bg-card",
                    form.symbol === p.sym
                      ? "border-blue-600 bg-blue-50/40  text-foreground font-bold shadow-xs ring-1 ring-blue-500/30"
                      : "border-border hover:border-blue-400/50 hover:bg-accent/40 text-foreground"
                  )}
                >
                  <p className="font-bold text-xs sm:text-sm text-foreground">{p.label}</p>
                  <p className="text-xs text-slate-700 font-medium mt-0.5">{p.exch}:{p.sym}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Lower Timeframe for Traps & Breakout Entries */}
          <div className="p-4 rounded-2xl border border-border bg-card shadow-xs space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs sm:text-sm font-bold text-foreground block">Entry &amp; Trap Timeframe</label>
                <p className="text-xs text-slate-700 font-medium mt-0.5">
                  Establishes 15m range (09:15–09:30), then monitors this lower timeframe for liquidity sweep traps &amp; reclaim entries.
                </p>
              </div>
              <span className="text-xs font-bold text-indigo-700  bg-indigo-50  border border-indigo-200/60  px-2.5 py-0.5 rounded-full">
                Multi-Timeframe
              </span>
            </div>
            <select
              value={form.b15EntryTimeframe || "3min"}
              onChange={(e) => set("b15EntryTimeframe", e.target.value)}
              className="flex h-10 w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 font-semibold"
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
            <label className="text-xs sm:text-sm font-bold text-foreground mb-2 block">EMA Period</label>
            <Input type="number" value={form.emaPeriod} onChange={(e) => set("emaPeriod", e.target.value)} className="font-semibold text-xs h-10 bg-background border-border text-foreground rounded-xl" />
          </div>
          <div>
            <label className="text-xs sm:text-sm font-bold text-foreground mb-2 block">Trading Instrument</label>
            <div className="p-1.5 rounded-2xl bg-secondary/40 border border-border grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => set("isOptionBuyingOnly", false)}
                className={cn(
                  "flex flex-col items-center gap-1 py-3.5 rounded-xl text-xs font-bold transition-all",
                  !form.isOptionBuyingOnly
                    ? "bg-card border border-border shadow-xs text-blue-600 "
                    : "text-slate-700 font-medium hover:text-foreground"
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
                  "flex flex-col items-center gap-1 py-3.5 rounded-xl text-xs font-bold transition-all",
                  form.isOptionBuyingOnly
                    ? "bg-card border border-border shadow-xs text-blue-600 "
                    : "text-slate-700 font-medium hover:text-foreground"
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
        <div className="space-y-5">
          <div className="p-4 rounded-2xl bg-blue-50 border-2 border-blue-300 shadow-xs">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="h-4 w-4 text-blue-600 " />
              <p className="text-xs sm:text-sm font-bold text-blue-950 font-black">
                Institutional 80% Profitability Engine (EMA-VWAP + Inside Candle + Pullbacks)
              </p>
            </div>
            <p className="text-xs text-slate-900 font-medium leading-relaxed mt-1 font-normal">
              Engineered for asymmetric risk-to-reward. Combines 15-EMA/VWAP momentum alignment with Inside Candle range compression and pullback rejections, backed by strict High-Delta ITM strike liquidity filters.
            </p>
          </div>

          {/* Trade Directional Bias */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs sm:text-sm font-bold text-foreground">Trade Directional Bias</label>
              <span className="text-xs text-blue-700  font-bold bg-blue-50  border border-blue-200/60  px-2 py-0.5 rounded-md">
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
                      "text-left p-3.5 rounded-2xl border-2 transition-all flex flex-col justify-between bg-card",
                      isSelected
                        ? "border-blue-600 bg-blue-50/40  shadow-xs ring-1 ring-blue-500/30"
                        : "border-border hover:border-blue-400/50 hover:bg-accent/40"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-bold text-xs sm:text-sm text-foreground">{item.label}</p>
                      <Icon className={cn("h-4 w-4", isSelected ? "text-blue-600 " : "text-slate-400")} />
                    </div>
                    <p className="text-xs text-slate-700 font-medium mt-1">{item.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Setup Trigger Architecture */}
          <div>
            <label className="text-xs sm:text-sm font-bold text-foreground mb-2 block">Trigger Setup Mode</label>
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
                      "text-left p-3.5 rounded-2xl border-2 transition-all bg-card",
                      isSelected
                        ? "border-indigo-600 bg-indigo-50/40  shadow-xs ring-1 ring-indigo-500/30"
                        : "border-border hover:border-indigo-400/50 hover:bg-accent/40"
                    )}
                  >
                    <p className="font-bold text-xs sm:text-sm text-foreground">{item.label}</p>
                    <p className="text-xs text-slate-700 font-medium mt-1">{item.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Timeframe & EMA Period */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs sm:text-sm font-bold text-foreground mb-1 block">Candle Timeframe</label>
              <select
                value={form.sTimeframe}
                onChange={(e) => set("sTimeframe", e.target.value)}
                className="flex h-10 w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 font-semibold"
              >
                <option value="5min">5-Minute Candles (Aggressive / Fast Breakouts)</option>
                <option value="15min">15-Minute Candles (Recommended — High Win Rate)</option>
              </select>
            </div>
            <div>
              <label className="text-xs sm:text-sm font-bold text-foreground mb-1 block">EMA Period</label>
              <Input type="number" value={form.sEmaPeriod} onChange={e => set("sEmaPeriod", e.target.value)} className="font-semibold text-xs h-10 bg-background border-border text-foreground rounded-xl" />
            </div>
          </div>

          {/* Moneyness & RVOL Filter */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs sm:text-sm font-bold text-foreground mb-1 block">Option Strike Moneyness</label>
              <select
                value={form.sMoneyness || "ITM"}
                onChange={(e) => set("sMoneyness", e.target.value)}
                className="flex h-10 w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 font-semibold"
              >
                <option value="ITM">In-The-Money (ITM) — Delta ≥ 0.55 (Recommended — Reduced Theta)</option>
                <option value="ATM">At-The-Money (ATM) — Balanced Delta ~0.50</option>
              </select>
            </div>
            <div>
              <label className="text-xs sm:text-sm font-bold text-foreground mb-1 block">Min Volume Surge (RVOL)</label>
              <select
                value={form.sMinRvol || "1.25"}
                onChange={(e) => set("sMinRvol", e.target.value)}
                className="flex h-10 w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 font-semibold"
              >
                <option value="1.0">1.0x Volume SMA (Standard Volume)</option>
                <option value="1.25">1.25x Volume SMA (Recommended — Institutional Filter)</option>
                <option value="1.5">1.5x Volume SMA (High Conviction Surge)</option>
              </select>
            </div>
          </div>

          {/* HTF Trend Filter Toggle */}
          <div className="flex items-center justify-between p-4 rounded-2xl border border-border bg-card shadow-xs">
            <div>
              <p className="text-xs sm:text-sm font-bold text-foreground">Higher Timeframe (15-Min) Trend Filter</p>
              <p className="text-xs text-slate-700 font-medium mt-0.5">
                Ensures trade aligns with the 50-EMA on the 15-min chart before triggering option entry.
              </p>
            </div>
            <input
              type="checkbox"
              checked={form.sEnableHtfFilter !== false}
              onChange={(e) => set("sEnableHtfFilter", e.target.checked)}
              className="h-4 w-4 rounded border-border text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
          </div>
        </div>
      )}
    </div>
  );
}
