"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BarChart2, TrendingUp, ChevronRight, ChevronLeft,
  Check, Loader2, Shield, Target, Zap, Info, Flame,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { strategyApi, brokerApi, marketApi } from "@/lib/api";
import { Badge } from "@/components/ui/badge";


const STEPS = ["Strategy Type", "Instrument & Config", "Risk Management", "Broker & Review"];

const PRESET_INSTRUMENTS = [
  { label: "NIFTY 50", symbol: "NIFTY 50", exchange: "NSE", type: "INDEX" },
  { label: "BANK NIFTY", symbol: "BANKNIFTY", exchange: "NSE", type: "INDEX" },
  { label: "SENSEX", symbol: "SENSEX", exchange: "BSE", type: "INDEX" },
  { label: "Auto (Smart Pick)", symbol: "AUTO", exchange: "NSE", type: "STOCK" },
] as const;

const LOT_SIZES: Record<string, number> = {
  "NIFTY": 65,
  "BANKNIFTY": 30,
  "SENSEX": 20,
  "FINNIFTY": 60,
  "MIDCPNIFTY": 120,
};

function getLotSize(symbol: string) {
  const s = symbol.toUpperCase();
  if (s.includes("BANKNIFTY")) return 30;
  if (s.includes("NIFTY")) return 65;
  if (s.includes("SENSEX")) return 20;
  for (const key in LOT_SIZES) {
    if (s.includes(key)) return LOT_SIZES[key];
  }
  return 1; // Default for stocks
}

interface BrokerAccount {
  id: string;
  broker: string;
  clientId: string;
  isActive: boolean;
  tokenExpiry: string | null;
}


export default function NewStrategyPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [brokers, setBrokers] = useState<BrokerAccount[]>([]);

  const [form, setForm] = useState({
    name: "",
    type: "" as "BREAKOUT_15MIN" | "EMA_VWAP_CROSSOVER" | "EMA_RSI_OPTIONS" | "DAILY_SCALPER" | "STOCK_OPTIONS_BUYING" | "",
    // Common
    symbol: "NIFTY 50",
    exchange: "NSE",
    instrumentType: "INDEX" as "INDEX" | "STOCK" | "OPTION" | "FUTURE",
    lots: "1",
    product: "MIS" as "MIS" | "NRML",
    stopLossRs: "500",
    targetRs: "500",
    maxTradesPerDay: "2",
    minPremium: "100",
    maxPremium: "300",
    // EMA-VWAP crossover
    emaPeriod: "15",
    isOptionBuyingOnly: true,
    // EMA-RSI Options
    emaFast: "9",
    emaSlow: "21",
    rsiPeriod: "14",
    rsiEntryMin: "45",
    rsiEntryMax: "65",
    optionLots: "1",
    targetPct: "45",
    slPct: "25",
    startAfterMin: "25",
    // Daily Scalper
    dsCapital: "20000",
    dsDailyTargetRs: "500",
    dsDailyMaxLossRs: "800",
    dsTargetPoints: "",
    dsStopLossPoints: "",
    dsMaxTradesPerDay: "2",
    // Stock Options Buying
    sTimeframe: "15min",
    sEmaPeriod: "15",
    sRiskRewardRatio: "2",
    sMaxCapital: "25000",
    sTriggerOffset: "0.50",
    sProtectionBufferPct: "10",
    // Broker
    brokerAccountId: "",
    isPaperTrade: true,
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  async function handleSymbolSearch(q: string) {
    setSearchQuery(q);
  }

  // Debounced search logic
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.length < 2) {
        setSearchResults([]);
        return;
      }
      setIsSearching(true);
      try {
        const res = await marketApi.search(searchQuery, form.brokerAccountId);
        setSearchResults(res.data?.data ?? []);
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery, form.brokerAccountId]);

  function selectInstrument(item: any) {
    const sym = (item.symbol || '').toUpperCase();
    const isIndex = sym.includes('NIFTY') || sym.includes('SENSEX');
    const instrType: "INDEX" | "STOCK" | "OPTION" | "FUTURE" =
      item.exchange === 'NFO' || item.exchange === 'BFO' ? 'OPTION'
        : isIndex ? 'INDEX'
          : 'STOCK';
    setForm(f => ({
      ...f,
      symbol: item.symbol,
      exchange: item.exchange,
      instrumentType: instrType,
    }));
    setSearchQuery("");
    setSearchResults([]);
  }

  function set(k: string, v: any) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  // Load broker accounts
  useEffect(() => {
    brokerApi.list().then((r) => {
      const list = r.data?.data ?? [];
      setBrokers(list);
      if (list.length > 0) set("brokerAccountId", list[0].id);
    }).catch(() => { });
  }, []);

  const canNext = () => {
    if (step === 0) return !!form.name && !!form.type;
    if (step === 1) return !!form.symbol && Number(form.lots) > 0;
    if (step === 2) {
      if (form.type === "BREAKOUT_15MIN" || form.type === "EMA_VWAP_CROSSOVER" || form.type === "EMA_RSI_OPTIONS")
        return Number(form.stopLossRs) > 0 && Number(form.targetRs) > 0;
      if (form.type === "STOCK_OPTIONS_BUYING")
        return Number(form.sMaxCapital) > 0 && Number(form.sRiskRewardRatio) > 0;
      if (form.type === "DAILY_SCALPER")
        return Number(form.dsCapital) > 0 && Number(form.dsDailyTargetRs) > 0 && Number(form.dsDailyMaxLossRs) > 0;
      return true;
    }
    return !!form.brokerAccountId;
  };

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const lotSize = getLotSize(form.symbol);
      const qty = Number(form.lots) * lotSize;

      let config: any;
      if (form.type === "DAILY_SCALPER") {
        config = {
          symbol: form.symbol.trim(), exchange: form.exchange,
          lots: Number(form.lots),
          product: form.product,
          capital: Number(form.dsCapital),
          dailyTargetRs: Number(form.dsDailyTargetRs),
          dailyMaxLossRs: Number(form.dsDailyMaxLossRs),
          ...(form.dsTargetPoints && { targetPoints: Number(form.dsTargetPoints) }),
          ...(form.dsStopLossPoints && { stopLossPoints: Number(form.dsStopLossPoints) }),
          maxTradesPerDay: Number(form.dsMaxTradesPerDay),
        };
      } else if (form.type === "STOCK_OPTIONS_BUYING") {
        config = {
          symbol: form.symbol.trim(),
          exchange: "NSE",
          timeframe: form.sTimeframe,
          emaPeriod: Number(form.sEmaPeriod),
          riskRewardRatio: Number(form.sRiskRewardRatio),
          maxCapital: Number(form.sMaxCapital),
          lots: Number(form.lots),
          maxTradesPerDay: Number(form.maxTradesPerDay),
          product: form.product,
          startAfterMin: Number(form.startAfterMin),
          triggerOffset: Number(form.sTriggerOffset),
          protectionBufferPct: Number(form.sProtectionBufferPct),
        };
      } else if (form.type === "BREAKOUT_15MIN") {
        config = {
          symbol: form.symbol.trim(), exchange: form.exchange,
          instrumentType: form.instrumentType, qty,
          lots: Number(form.lots), product: form.product,
          stopLossRs: Number(form.stopLossRs), targetRs: Number(form.targetRs),
          maxTradesPerDay: Number(form.maxTradesPerDay),
          ...((form.instrumentType === 'INDEX' || form.instrumentType === 'OPTION') && {
            minPremium: Number(form.minPremium), maxPremium: Number(form.maxPremium),
          }),
        };
      } else if (form.type === "EMA_RSI_OPTIONS") {
        config = {
          symbol: form.symbol.trim(), exchange: form.exchange,
          instrumentType: form.instrumentType,
          emaFast: Number(form.emaFast), emaSlow: Number(form.emaSlow),
          rsiPeriod: Number(form.rsiPeriod),
          rsiEntryMin: Number(form.rsiEntryMin), rsiEntryMax: Number(form.rsiEntryMax),
          lots: Number(form.lots), qty,
          stopLossRs: Number(form.stopLossRs), targetRs: Number(form.targetRs),
          maxTradesPerDay: Number(form.maxTradesPerDay),
          product: form.product, startAfterMin: Number(form.startAfterMin),
        };
      } else {
        config = {
          symbol: form.symbol.trim(), exchange: form.exchange,
          instrumentType: form.instrumentType,
          emaPeriod: Number(form.emaPeriod), isOptionBuyingOnly: form.isOptionBuyingOnly,
          qty, lots: Number(form.lots), product: form.product,
          stopLossRs: Number(form.stopLossRs), targetRs: Number(form.targetRs),
          maxTradesPerDay: Number(form.maxTradesPerDay),
          ...(form.isOptionBuyingOnly && {
            minPremium: Number(form.minPremium), maxPremium: Number(form.maxPremium),
          }),
        };
      }

      const payload = {
        name: form.name,
        type: form.type,
        brokerAccountId: form.brokerAccountId || undefined,
        config: JSON.stringify(config),
        isPaperTrade: form.isPaperTrade,
      };

      await strategyApi.create(payload);

      toast.success("Strategy created!", {
        description: `${form.name} is ready. Start it from the Strategies page.`,
      });
      router.push("/strategies");
    } catch (err: any) {
      console.error("❌ Create strategy error:", err);
      if (err.response) {
        console.error("❌ Response data:", err.response.data);
      }
      toast.error(err?.response?.data?.message ?? "Failed to create strategy");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-[fade-up_0.4s_ease_both]">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold">Create Strategy</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">
          Build and deploy your algo trading strategy in 4 steps
        </p>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-0">
        {STEPS.map((label, i) => (
          <div key={i} className="flex items-center flex-1">
            <div className="flex flex-col items-center gap-1 min-w-0">
              <div
                className={cn(
                  "h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-all",
                  i < step
                    ? "bg-[hsl(var(--green))] border-[hsl(var(--green))] text-white"
                    : i === step
                      ? "border-[hsl(var(--primary))] text-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.08)]"
                      : "border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] bg-[hsl(var(--background))]"
                )}
              >
                {i < step ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              <span
                className={cn(
                  "text-[10px] font-medium text-center leading-tight hidden sm:block",
                  i === step
                    ? "text-[hsl(var(--foreground))] font-bold"
                    : "text-[hsl(var(--muted-foreground))]"
                )}
              >
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  "flex-1 h-0.5 mx-2 mt-[-16px] rounded transition-all",
                  i < step
                    ? "bg-[hsl(var(--green))]"
                    : "bg-[hsl(var(--border))]"
                )}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step card */}
      <Card>
        <CardHeader>
          <CardTitle>{STEPS[step]}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">

          {step === 0 && (
            <div className="space-y-5">
              <div>
                <label className="text-sm font-semibold mb-2 block">Strategy Name</label>
                <Input
                  id="strategy-name"
                  placeholder="e.g. Nifty 15-Min Breakout"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-semibold mb-2 block">Strategy Type</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    {
                      type: "BREAKOUT_15MIN",
                      label: "15-Min Breakout",
                      desc: "Enters after 5-min candle closes above/below the first 15-min range. Fixed SL & Target.",
                      icon: BarChart2,
                      badge: null,
                      badgeColor: "",
                    },
                    {
                      type: "EMA_RSI_OPTIONS",
                      label: "EMA + RSI + VWAP",
                      desc: "Best for 500-700 daily. Fires ONLY when EMA cross + RSI in safe zone + price on right side of VWAP. Supports Equity & Options.",
                      icon: Zap,
                      badgeColor: "bg-indigo-100 text-indigo-700",
                    },
                    {
                      type: "EMA_VWAP_CROSSOVER",
                      label: "15-EMA & VWAP",
                      desc: "Trade when 15-period EMA crosses VWAP. Confirmation candle logic. Optimized for Options & Stocks.",
                      icon: TrendingUp,
                      badge: null,
                      badgeColor: "",
                    },
                    {
                      type: "DAILY_SCALPER",
                      label: "Daily Target Scalper",
                      desc: "Aims to earn 400-600 Rs daily with 20k capital. Trades ATM options on index using 3-min charts with 9-EMA + VWAP + RSI momentum crossover. Stops for the day once target is achieved.",
                      icon: Target,
                      badge: "Best for 20k Capital",
                      badgeColor: "bg-emerald-100 text-emerald-700",
                    },
                    {
                      type: "STOCK_OPTIONS_BUYING",
                      label: "Stock Options Buying",
                      desc: "Best for 20k-25k capital. Trades ATM stock options using 15-EMA & VWAP crossover on 5/15-min stock charts, waiting for Inside Candle confirmation, with dynamic SL (Mother Low) & RR Target.",
                      icon: Flame,
                      badge: "F&O Stocks",
                      badgeColor: "bg-blue-100 text-blue-700",
                    },
                  ].map(({ type, label, desc, icon: Icon, badge, badgeColor }) => (
                    <button
                      key={type}
                      id={`type-${type}`}
                      onClick={() => set("type", type)}
                      className={cn(
                        "text-left p-4 rounded-xl border-2 transition-all",
                        form.type === type
                          ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.06)] shadow-sm"
                          : "border-[hsl(var(--border))] hover:border-[hsl(var(--primary)/0.4)] hover:bg-[hsl(var(--secondary)/0.5)]"
                      )}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <div className={cn(
                          "h-10 w-10 rounded-lg flex items-center justify-center",
                          form.type === type ? "bg-[hsl(var(--primary)/0.15)]" : "bg-[hsl(var(--secondary))]"
                        )}>
                          <Icon className={cn("h-5 w-5", form.type === type ? "text-[hsl(var(--primary))]" : "text-[hsl(var(--muted-foreground))]")} />
                        </div>
                        <div>
                          <p className="font-bold text-sm">{label}</p>
                          {badge && (
                            <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-semibold", badgeColor || "bg-[hsl(var(--green)/0.15)] text-green-600")}>
                              {badge}
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-[hsl(var(--muted-foreground))] leading-relaxed">{desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              {/* Preset quick-select */}
              {(form.type === "BREAKOUT_15MIN" || form.type === "EMA_RSI_OPTIONS" || form.type === "EMA_VWAP_CROSSOVER" || form.type === "DAILY_SCALPER") && (
                <div>
                  <label className="text-sm font-semibold mb-2 block">Quick Select Instrument</label>
                  <div className="flex flex-wrap gap-2">
                    {PRESET_INSTRUMENTS.map((p) => (
                      <button
                        key={p.label}
                        onClick={() => {
                          set("symbol", p.symbol);
                          set("exchange", p.exchange);
                          set("instrumentType", p.type);
                        }}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-sm font-medium border transition-all",
                          form.symbol === p.symbol
                            ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))]"
                            : "border-[hsl(var(--border))] hover:border-[hsl(var(--primary)/0.4)]"
                        )}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

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
                  <div className="absolute z-50 w-full mt-1 bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-xl shadow-xl max-h-60 overflow-y-auto animate-[fade-up_0.2s_ease_both]">
                    {searchResults.map((item) => (
                      <button
                        key={`${item.exchange}:${item.symbol}`}
                        onClick={() => selectInstrument(item)}
                        className="w-full flex items-center justify-between p-3 hover:bg-[hsl(var(--secondary)/0.5)] transition-colors border-b last:border-0"
                      >
                        <div className="text-left">
                          <p className="text-sm font-bold">{item.symbol}</p>
                          <p className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase">{item.name}</p>
                        </div>
                        <Badge className="text-[10px]">{item.exchange}</Badge>
                      </button>
                    ))}
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

              {form.type === "EMA_VWAP_CROSSOVER" && (
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">EMA Period</label>
                    <Input type="number" value={form.emaPeriod} onChange={(e) => set("emaPeriod", e.target.value)} />
                  </div>
                  {/* Trading Mode: Equity vs Options */}
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

              {form.type === "EMA_RSI_OPTIONS" && (
                <div className="space-y-4">
                  <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-100">
                    <p className="text-xs font-semibold text-indigo-700">EMA + RSI + VWAP Triple Confirmation</p>
                    <p className="text-[11px] text-indigo-600 mt-1">Enters ONLY when EMA crossover + RSI in range + price is on right side of VWAP.</p>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-semibold mb-1 block">EMA Fast</label>
                      <Input type="number" value={form.emaFast} onChange={e => set("emaFast", e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold mb-1 block">EMA Slow</label>
                      <Input type="number" value={form.emaSlow} onChange={e => set("emaSlow", e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold mb-1 block">RSI Period</label>
                      <Input type="number" value={form.rsiPeriod} onChange={e => set("rsiPeriod", e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold mb-1 block">RSI Min (Long)</label>
                      <Input type="number" value={form.rsiEntryMin} onChange={e => set("rsiEntryMin", e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold mb-1 block">RSI Max (Long)</label>
                      <Input type="number" value={form.rsiEntryMax} onChange={e => set("rsiEntryMax", e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold mb-1 block">Skip first (min)</label>
                      <Input type="number" value={form.startAfterMin} onChange={e => set("startAfterMin", e.target.value)} />
                    </div>
                  </div>
                </div>
              )}

              {form.type === "STOCK_OPTIONS_BUYING" && (
                <div className="space-y-4">
                  <div className="p-3 rounded-xl bg-blue-50 border border-blue-100">
                    <p className="text-xs font-semibold text-blue-700">🔥 Stock Options Buying (EMA + VWAP Crossover + Inside Candle)</p>
                    <p className="text-[11px] text-blue-600 mt-1">Triggers when the 15-EMA crosses VWAP on the stock, followed by an Inside Candle (Mother & Baby candle) setup. Places trigger entry orders on dynamic ATM CE/PE contracts.</p>
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

              {form.type === "DAILY_SCALPER" && (
                <div className="space-y-4">
                  <div className="p-3 rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200">
                    <p className="text-xs font-semibold text-emerald-700">⚡ Daily Target Scalper</p>
                    <p className="text-[11px] text-emerald-600 mt-1">Trades ATM index options on 3-minute chart based on 9-EMA + VWAP + RSI crossover. Automatically halts trading once your daily profit target is met.</p>
                  </div>

                  {/* Index Selector */}
                  <div>
                    <label className="text-sm font-semibold mb-2 block">Select Index</label>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: "NIFTY 50", symbol: "NIFTY 50", exchange: "NSE" },
                        { label: "BANK NIFTY", symbol: "BANKNIFTY", exchange: "NSE" },
                        { label: "SENSEX", symbol: "SENSEX", exchange: "BSE" },
                      ].map(idx => (
                        <button
                          key={idx.symbol}
                          onClick={() => {
                            set("symbol", idx.symbol);
                            set("exchange", idx.exchange);
                            set("instrumentType", "INDEX");
                          }}
                          className={cn(
                            "text-left p-3.5 rounded-xl border-2 transition-all",
                            form.symbol === idx.symbol
                              ? "border-emerald-400 bg-emerald-50 shadow-sm"
                              : "border-[hsl(var(--border))] hover:border-emerald-300"
                          )}
                        >
                          <p className="font-bold text-sm">{idx.label}</p>
                          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full mt-2 inline-block">
                            1 Lot = {getLotSize(idx.symbol)} Qty
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Capital size */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-semibold mb-2 block">Available Capital (₹)</label>
                      <Input
                        type="number"
                        min={5000}
                        value={form.dsCapital}
                        onChange={(e) => set("dsCapital", e.target.value)}
                      />
                      <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1">
                        Ensures trade cost does not exceed your budget (default ₹20,000)
                      </p>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-semibold">Number of Lots</label>
                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                          Lot Size: {getLotSize(form.symbol)} Qty
                        </span>
                      </div>
                      <Input
                        type="number"
                        min={1}
                        value={form.lots}
                        onChange={(e) => set("lots", e.target.value)}
                      />
                      <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1">
                        Total Quantity: {Number(form.lots) * getLotSize(form.symbol)} Qty
                      </p>
                    </div>
                  </div>
                </div>
              )}

            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              {form.type === "DAILY_SCALPER" && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                        <Target className="h-4 w-4 text-emerald-500" />
                        Daily Target Profit (₹)
                      </label>
                      <Input
                        type="number"
                        min={100}
                        value={form.dsDailyTargetRs}
                        onChange={(e) => set("dsDailyTargetRs", e.target.value)}
                        className="border-emerald-200 focus:ring-emerald-300 font-semibold"
                      />
                      <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                        Halt strategy once net P&L reaches this target (default ₹500)
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                        <Shield className="h-4 w-4 text-red-500" />
                        Daily Max Loss (₹)
                      </label>
                      <Input
                        type="number"
                        min={100}
                        value={form.dsDailyMaxLossRs}
                        onChange={(e) => set("dsDailyMaxLossRs", e.target.value)}
                        className="border-red-200 focus:ring-red-300 font-semibold"
                      />
                      <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                        Halt strategy if daily losses touch this limit (default ₹800)
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div>
                      <label className="text-sm font-semibold mb-2 block">Override Target Points</label>
                      <Input
                        type="number"
                        placeholder="Default (10 Nifty, 20 Banknifty, 30 Sensex)"
                        value={form.dsTargetPoints}
                        onChange={(e) => set("dsTargetPoints", e.target.value)}
                      />
                      <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1">
                        Optional: Set custom target points in option premium
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-semibold mb-2 block">Override Stop Loss Points</label>
                      <Input
                        type="number"
                        placeholder="Default (7 Nifty, 15 Banknifty, 20 Sensex)"
                        value={form.dsStopLossPoints}
                        onChange={(e) => set("dsStopLossPoints", e.target.value)}
                      />
                      <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1">
                        Optional: Set custom SL points in option premium
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                      <Zap className="h-4 w-4 text-amber-500" />
                      Max Trades / Day
                    </label>
                    <Input
                      type="number"
                      min={1}
                      max={10}
                      value={form.dsMaxTradesPerDay}
                      onChange={(e) => set("dsMaxTradesPerDay", e.target.value)}
                    />
                    <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                      Max number of option trades to initiate in a day
                    </p>
                  </div>
                </>
              )}

              {(form.type === "BREAKOUT_15MIN" || form.type === "EMA_VWAP_CROSSOVER" || form.type === "EMA_RSI_OPTIONS") && (
                <>
                  {/* Info box */}
                  <div className="flex gap-3 p-3 rounded-xl bg-[hsl(var(--primary)/0.06)] border border-[hsl(var(--primary)/0.15)]">
                    <Info className="h-4 w-4 text-[hsl(var(--primary))] mt-0.5 shrink-0" />
                    <p className="text-xs text-[hsl(var(--muted-foreground))] leading-relaxed">
                      Orders are placed as <strong>Limit</strong> orders Entry, Stop-Loss (SL-Limit), and Target.
                      Fixed amounts are per trade (not per lot). SL price = Entry Qty).
                    </p>
                  </div>
                </>
              )}

              {form.type === "STOCK_OPTIONS_BUYING" && (
                <>
                  {/* Info box */}
                  <div className="flex gap-3 p-3 rounded-xl bg-blue-50 border border-blue-100">
                    <Info className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-blue-600 leading-relaxed font-semibold">
                      Risk Management: Stop Loss is dynamically set to the Option's Mother Candle Low. Target is determined using the Risk-Reward Ratio.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                        <Shield className="h-4 w-4 text-red-500" />
                        Max Capital Budget (₹)
                      </label>
                      <Input
                        type="number"
                        min={1000}
                        value={form.sMaxCapital}
                        onChange={(e) => set("sMaxCapital", e.target.value)}
                        className="border-red-200 focus:ring-red-300 font-semibold"
                      />
                      <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1">
                        Failsafe: Skips trade if 1 lot exceeds this capital (e.g. 25000).
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                        <Target className="h-4 w-4 text-green-500" />
                        Risk-Reward Ratio (e.g. 2 for 1:2)
                      </label>
                      <Input
                        type="number"
                        min={0.5}
                        step={0.5}
                        value={form.sRiskRewardRatio}
                        onChange={(e) => set("sRiskRewardRatio", e.target.value)}
                        className="border-green-200 focus:ring-green-300 font-semibold"
                      />
                      <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1">
                        If risk is ₹1.50 and RR is 2, Target is ₹3.00 profit.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-semibold mb-1 block">Trigger Offset (points)</label>
                      <Input
                        type="number"
                        step={0.05}
                        value={form.sTriggerOffset}
                        onChange={(e) => set("sTriggerOffset", e.target.value)}
                      />
                      <p className="text-[9px] text-[hsl(var(--muted-foreground))] mt-1">Points above mother high to entry (e.g. 0.50)</p>
                    </div>
                    <div>
                      <label className="text-xs font-semibold mb-1 block">Slippage Buffer %</label>
                      <Input
                        type="number"
                        value={form.sProtectionBufferPct}
                        onChange={(e) => set("sProtectionBufferPct", e.target.value)}
                      />
                      <p className="text-[9px] text-[hsl(var(--muted-foreground))] mt-1">Max execution slippage allowed (default 10%)</p>
                    </div>
                    <div>
                      <label className="text-xs font-semibold mb-1 block">Max Trades / Day</label>
                      <Input
                        type="number"
                        min={1}
                        value={form.maxTradesPerDay}
                        onChange={(e) => set("maxTradesPerDay", e.target.value)}
                      />
                      <p className="text-[9px] text-[hsl(var(--muted-foreground))] mt-1">Stops trading after this count</p>
                    </div>
                  </div>
                </>
              )}

              {(form.type === "BREAKOUT_15MIN" || form.type === "EMA_VWAP_CROSSOVER" || form.type === "EMA_RSI_OPTIONS") && (
                <>
                  {((form.type === "BREAKOUT_15MIN" && (form.instrumentType === "INDEX" || form.instrumentType === "OPTION")) ||
                    (form.type === "EMA_VWAP_CROSSOVER" && form.isOptionBuyingOnly)) && (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                            <TrendingUp className="h-4 w-4 text-blue-500" />
                            Min Premium
                          </label>
                          <Input
                            type="number"
                            value={form.minPremium}
                            onChange={(e) => set("minPremium", e.target.value)}
                            className="focus:ring-blue-300"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                            <TrendingUp className="h-4 w-4 text-blue-600" />
                            Max Premium
                          </label>
                          <Input
                            type="number"
                            value={form.maxPremium}
                            onChange={(e) => set("maxPremium", e.target.value)}
                            className="focus:ring-blue-300"
                          />
                        </div>
                        <div className="col-span-2">
                          <p className="text-[10px] text-[hsl(var(--muted-foreground))] italic px-1">
                            When breakout occurs, the bot will pick an Option contract with premium between {form.minPremium} and {form.maxPremium}.
                          </p>
                        </div>
                      </div>
                    )}

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                        <Shield className="h-4 w-4 text-red-500" />
                        Stop Loss
                      </label>
                      <Input
                        id="stopLossRs"
                        type="number"
                        min={1}
                        value={form.stopLossRs}
                        onChange={(e) => set("stopLossRs", e.target.value)}
                        className="border-red-200 focus:ring-red-300"
                      />
                      <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                        Fixed loss limit per trade in
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                        <Target className="h-4 w-4 text-green-500" />
                        Target
                      </label>
                      <Input
                        id="targetRs"
                        type="number"
                        min={1}
                        value={form.targetRs}
                        onChange={(e) => set("targetRs", e.target.value)}
                        className="border-green-200 focus:ring-green-300"
                      />
                      <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                        Fixed target profit per trade in
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                      <Zap className="h-4 w-4 text-amber-500" />
                      Max Trades Per Day
                    </label>
                    <Input
                      id="maxTradesPerDay"
                      type="number"
                      min={1}
                      max={10}
                      value={form.maxTradesPerDay}
                      onChange={(e) => set("maxTradesPerDay", e.target.value)}
                    />
                    <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                      Safety cap strategy stops placing new trades after this limit
                    </p>
                  </div>

                  {/* Live preview */}
                  <div className="p-4 rounded-xl bg-[hsl(var(--secondary)/0.5)] border border-[hsl(var(--border))] space-y-2">
                    <p className="text-xs font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">
                      Risk/Reward Preview
                    </p>
                    <div className="flex gap-6">
                      <div>
                        <p className="text-[10px] text-[hsl(var(--muted-foreground))]">Max Loss / Trade</p>
                        <p className="text-base font-bold text-red-500">
                          {Number(form.stopLossRs).toLocaleString("en-IN")}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-[hsl(var(--muted-foreground))]">Max Profit / Trade</p>
                        <p className="text-base font-bold text-green-600">
                          + {Number(form.targetRs).toLocaleString("en-IN")}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-[hsl(var(--muted-foreground))]">R:R Ratio</p>
                        <p className="text-base font-bold">
                          1 : {(Number(form.targetRs) / Math.max(Number(form.stopLossRs), 1)).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              {/* Trading Mode Card */}
              <div className="p-1 rounded-2xl bg-[hsl(var(--secondary)/0.3)] border border-[hsl(var(--border))]">
                <div className="grid grid-cols-2 gap-1">
                  <button
                    onClick={() => set("isPaperTrade", true)}
                    className={cn(
                      "flex flex-col items-center gap-2 py-4 rounded-xl transition-all",
                      form.isPaperTrade
                        ? "bg-[hsl(var(--background))] border border-[hsl(var(--border))] shadow-sm text-[hsl(var(--primary))]"
                        : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                    )}
                  >
                    <div className={cn(
                      "p-2 rounded-lg",
                      form.isPaperTrade ? "bg-amber-100 text-amber-600" : "bg-[hsl(var(--secondary)/0.5)]"
                    )}>
                      <Zap className="h-5 w-5" />
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-bold uppercase tracking-wider">Paper Trading</p>
                      <p className="text-[10px] opacity-70">Virtual money, no risk</p>
                    </div>
                  </button>
                  <button
                    onClick={() => set("isPaperTrade", false)}
                    className={cn(
                      "flex flex-col items-center gap-2 py-4 rounded-xl transition-all",
                      !form.isPaperTrade
                        ? "bg-[hsl(var(--background))] border border-[hsl(var(--border))] shadow-sm text-[hsl(var(--primary))]"
                        : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                    )}
                  >
                    <div className={cn(
                      "p-2 rounded-lg",
                      !form.isPaperTrade ? "bg-red-100 text-red-600" : "bg-[hsl(var(--secondary)/0.5)]"
                    )}>
                      <TrendingUp className="h-5 w-5" />
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-bold uppercase tracking-wider">Live Trading</p>
                      <p className="text-[10px] opacity-70">Real capital execution</p>
                    </div>
                  </button>
                </div>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="text-sm font-semibold mb-2 block">Broker Account</label>
                  {brokers.length === 0 ? (
                    <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
                      <p className="text-sm text-amber-700 font-medium">No broker connected</p>
                      <p className="text-xs text-amber-600 mt-1">
                        Please connect a broker account first from the Brokers page.
                      </p>
                    </div>
                  ) : (
                    <select
                      id="brokerAccountId"
                      value={form.brokerAccountId}
                      onChange={(e) => set("brokerAccountId", e.target.value)}
                      className="flex h-10 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--input))] px-3 py-2 text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.5)]"
                    >
                      <option value="">Select broker account</option>
                      {brokers.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.broker} - {b.clientId ?? b.id.slice(0, 8)}
                          {!b.tokenExpiry || new Date(b.tokenExpiry) < new Date() ? " Session expired" : ""}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Summary */}
                <div className="space-y-2">
                  <p className="text-sm font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wide text-xs">
                    Configuration Summary
                  </p>
                  {(() => {
                    const items: [string, any][] = [
                      ["Name", form.name],
                    ];

                    let typeLabel = "";
                    if (form.type === "BREAKOUT_15MIN") typeLabel = "15-Min High/Low Breakout";
                    else if (form.type === "EMA_VWAP_CROSSOVER") typeLabel = "EMA-VWAP Crossover";
                    else if (form.type === "EMA_RSI_OPTIONS") typeLabel = "EMA + RSI + VWAP";
                    else if (form.type === "DAILY_SCALPER") typeLabel = "Daily Target Scalper";
                    else if (form.type === "STOCK_OPTIONS_BUYING") typeLabel = "Stock Options Buying";

                    items.push(["Type", typeLabel]);
                    items.push(["Symbol", `${form.symbol}  ${form.exchange}`]);
                    items.push(["Order Size", `${form.lots} Lots`]);
                    items.push(["Product", form.product]);

                    if (form.type === "DAILY_SCALPER") {
                      items.push(["Capital Budget", `₹${Number(form.dsCapital).toLocaleString("en-IN")}`]);
                      items.push(["Daily Profit Target", `₹${Number(form.dsDailyTargetRs).toLocaleString("en-IN")}`]);
                      items.push(["Daily Loss Limit", `₹${Number(form.dsDailyMaxLossRs).toLocaleString("en-IN")}`]);
                      items.push(["Max Trades", `${form.dsMaxTradesPerDay} / day`]);
                      if (form.dsTargetPoints) items.push(["Custom Target Points", `${form.dsTargetPoints} pts`]);
                      if (form.dsStopLossPoints) items.push(["Custom SL Points", `${form.dsStopLossPoints} pts`]);
                    } else if (form.type === "STOCK_OPTIONS_BUYING") {
                      items.push(["Capital Budget", `₹${Number(form.sMaxCapital).toLocaleString("en-IN")}`]);
                      items.push(["Risk-Reward Ratio", `1 : ${form.sRiskRewardRatio}`]);
                      items.push(["EMA Period", form.sEmaPeriod]);
                      items.push(["Timeframe", form.sTimeframe]);
                      items.push(["Trigger Offset", `${form.sTriggerOffset} pts`]);
                      items.push(["Max Trades", `${form.maxTradesPerDay} / day`]);
                    } else {
                      items.push(["Stop Loss", `₹${Number(form.stopLossRs).toLocaleString("en-IN")} (fixed)`]);
                      items.push(["Target", `₹${Number(form.targetRs).toLocaleString("en-IN")} (fixed)`]);
                      items.push(["Max Trades", `${form.maxTradesPerDay} / day`]);

                      if (form.type === "BREAKOUT_15MIN") {
                        if (form.instrumentType === "INDEX" || form.instrumentType === "OPTION") {
                          items.push(["Premium Range", `₹${form.minPremium} - ₹${form.maxPremium}`]);
                        }
                      } else if (form.type === "EMA_VWAP_CROSSOVER") {
                        items.push(["EMA Period", form.emaPeriod]);
                        items.push(["Option Only", form.isOptionBuyingOnly ? "Yes" : "No"]);
                      } else if (form.type === "EMA_RSI_OPTIONS") {
                        items.push(["EMA Fast / Slow", `${form.emaFast} / ${form.emaSlow}`]);
                        items.push(["RSI Period", form.rsiPeriod]);
                        items.push(["RSI Entry Range", `${form.rsiEntryMin} - ${form.rsiEntryMax}`]);
                        items.push(["Start Delay", `${form.startAfterMin} mins`]);
                      }
                    }

                    return items.map(([label, value]) => (
                      <div key={label} className="flex justify-between py-2 border-b border-[hsl(var(--border))] last:border-0 px-1">
                        <span className="text-sm text-[hsl(var(--muted-foreground))]">{label}</span>
                        <span className="text-sm font-semibold">{value}</span>
                      </div>
                    ));
                  })()}
                </div>

                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-900">
                  <p className="text-sm font-bold text-amber-700 dark:text-amber-400 mb-1"> Risk Reminder</p>
                  <p className="text-xs text-amber-600 dark:text-amber-500">
                    Ensure your Zerodha API has order placement permissions and your IP is whitelisted.
                    Always test during off-hours or with minimal quantities first.
                  </p>
                </div>
              </div>
            </div>
          )}

        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
        >
          <ChevronLeft className="h-4 w-4" /> Back
        </Button>

        {step < STEPS.length - 1 ? (
          <Button
            id="next-step"
            onClick={() => setStep((s) => s + 1)}
            disabled={!canNext()}
          >
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            id="create-strategy"
            variant="success"
            onClick={handleSubmit}
            disabled={submitting || !form.brokerAccountId}
          >
            {submitting ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Creating</>
            ) : (
              <><Check className="h-4 w-4" /> Create Strategy</>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}







