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
                <label className="text-sm font-semibold">Lots to Trade</label>
                <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                  Fixed 1 Lot (Recommended)
                </span>
              </div>
              <Input
                type="number"
                min={1}
                max={5}
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

          {/* Premium Thresholds */}
          <div className="grid grid-cols-2 gap-4 p-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary)/0.2)]">
            <div>
              <label className="text-xs font-semibold mb-1 block">NIFTY Premium Range (₹)</label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="number"
                  step={0.5}
                  placeholder="Min (8)"
                  value={form.gbMinPremiumNifty}
                  onChange={(e) => set("gbMinPremiumNifty", e.target.value)}
                />
                <Input
                  type="number"
                  step={0.5}
                  placeholder="Max (15)"
                  value={form.gbMaxPremiumNifty}
                  onChange={(e) => set("gbMaxPremiumNifty", e.target.value)}
                />
              </div>
              <p className="text-[9px] text-[hsl(var(--muted-foreground))] mt-1">Target range: ₹8.00 – ₹15.00</p>
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block">SENSEX Premium Range (₹)</label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="number"
                  step={0.5}
                  placeholder="Min (12)"
                  value={form.gbMinPremiumSensex}
                  onChange={(e) => set("gbMinPremiumSensex", e.target.value)}
                />
                <Input
                  type="number"
                  step={0.5}
                  placeholder="Max (25)"
                  value={form.gbMaxPremiumSensex}
                  onChange={(e) => set("gbMaxPremiumSensex", e.target.value)}
                />
              </div>
              <p className="text-[9px] text-[hsl(var(--muted-foreground))] mt-1">Target range: ₹12.00 – ₹25.00</p>
            </div>
          </div>

          {/* Time Window */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-[hsl(var(--secondary)/0.3)] border border-[hsl(var(--border))]">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-indigo-500" />
              <div>
                <p className="text-xs font-bold">Execution Window: 01:30 PM – 03:15 PM IST</p>
                <p className="text-[10px] text-[hsl(var(--muted-foreground))]">Mandatory Hard Auto-Exit @ 03:25:00 PM before CAS closing</p>
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium block">Number of Lots</label>
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
                {form.symbol === 'AUTO'
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
