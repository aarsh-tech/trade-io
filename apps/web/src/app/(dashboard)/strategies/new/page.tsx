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
    type: "" as "BREAKOUT_15MIN" | "EMA_VWAP_CROSSOVER" | "EMA_RSI_OPTIONS" | "GAMMA_BLAST" | "",
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
    // Gamma Blast
    gbExpiryMode: "weekly" as "weekly" | "monthly-last",
    gbExpiryDay: "2",
    gbMinPremium: "2",
    gbMaxPremium: "10",
    gbStrikesOTM: "5",
    gbAtrMultiplier: "2.5",
    gbPremiumVelocityX: "2.0",
    gbVixSpikeThreshold: "3.0",
    gbVwapDivergence: "0.3",
    gbMinSignalScore: "70",
    gbTrailTier1: "40",
    gbTrailTier2: "30",
    gbTrailTier3: "25",
    gbTrailTier4: "20",
    gbMaxTradesPerDay: "3",
    gbMaxLossPerDay: "2000",
    gbForceExitMinBefore: "15",
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
      if (form.type === "GAMMA_BLAST")
        return Number(form.gbMaxTradesPerDay) > 0 && Number(form.gbMaxLossPerDay) > 0;
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
      if (form.type === "GAMMA_BLAST") {
        config = {
          symbol: form.symbol.trim(), exchange: form.exchange,
          expiryMode: form.gbExpiryMode, expiryDay: Number(form.gbExpiryDay),
          lots: Number(form.lots),
          minPremium: Number(form.gbMinPremium), maxPremium: Number(form.gbMaxPremium),
          strikesOTM: Number(form.gbStrikesOTM),
          atrMultiplier: Number(form.gbAtrMultiplier),
          premiumVelocityX: Number(form.gbPremiumVelocityX),
          vixSpikeThreshold: Number(form.gbVixSpikeThreshold),
          vwapDivergence: Number(form.gbVwapDivergence),
          minSignalScore: Number(form.gbMinSignalScore),
          trailTier1: Number(form.gbTrailTier1), trailTier2: Number(form.gbTrailTier2),
          trailTier3: Number(form.gbTrailTier3), trailTier4: Number(form.gbTrailTier4),
          maxTradesPerDay: Number(form.gbMaxTradesPerDay),
          maxLossPerDay: Number(form.gbMaxLossPerDay),
          forceExitMinBefore: Number(form.gbForceExitMinBefore),
          product: form.product,
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

      await strategyApi.create({
        name: form.name,
        type: form.type,
        brokerAccountId: form.brokerAccountId || undefined,
        config: JSON.stringify(config),
        isPaperTrade: form.isPaperTrade,
      });

      toast.success("Strategy created!", {
        description: `${form.name} is ready. Start it from the Strategies page.`,
      });
      router.push("/strategies");
    } catch (err: any) {
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
                      type: "GAMMA_BLAST",
                      label: "Gamma Blast (Expiry Day)",
                      desc: "Expiry-day only. Buys ultra-cheap OTM options (₹3–5) and rides gamma explosions to ₹50–100+ using trailing SL. Nifty & BankNifty.",
                      icon: Flame,
                      badge: null,
                      badgeColor: "bg-orange-100 text-orange-700",
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
              {(form.type === "BREAKOUT_15MIN" || form.type === "EMA_RSI_OPTIONS" || form.type === "EMA_VWAP_CROSSOVER") && (
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
                        <span className="text-base">ðŸ“ˆ</span>
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
                        <span className="text-base">ðŸŽ¯</span>
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

              {form.type === "GAMMA_BLAST" && (
                <div className="space-y-4">
                  <div className="p-3 rounded-xl bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200">
                    <p className="text-xs font-semibold text-orange-700">⚡ Gamma Blast — Expiry Day Strategy</p>
                    <p className="text-[11px] text-orange-600 mt-1">Detects sharp moves via 1-min velocity, OTM premium spikes, VIX surges & VWAP divergence. Rides gamma with trailing SL.</p>
                  </div>

                  {/* Index Selector */}
                  <div>
                    <label className="text-sm font-semibold mb-2 block">Select Index</label>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: "NIFTY 50", symbol: "NIFTY 50", mode: "weekly" as const, lotSize: 65 },
                        { label: "BANKNIFTY", symbol: "BANKNIFTY", mode: "monthly-last" as const, lotSize: 30 },
                      ].map(idx => (
                        <button
                          key={idx.symbol}
                          onClick={() => {
                            set("symbol", idx.symbol);
                            set("exchange", "NSE");
                            set("instrumentType", "INDEX");
                            set("gbExpiryMode", idx.mode);
                          }}
                          className={cn(
                            "text-left p-4 rounded-xl border-2 transition-all",
                            form.symbol === idx.symbol
                              ? "border-orange-400 bg-orange-50 shadow-sm"
                              : "border-[hsl(var(--border))] hover:border-orange-300"
                          )}
                        >
                          <p className="font-bold text-sm">{idx.label}</p>
                          <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1">
                            {idx.mode === "weekly" ? "Weekly expiry (every Tuesday)" : "Monthly expiry (last Tuesday)"}
                          </p>
                          <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full mt-2 inline-block">
                            1 Lot = {idx.lotSize} Qty
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Lots & Premium Range */}
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-semibold">Number of Lots</label>
                      </div>
                      <Input type="number" min={1} value={form.lots} onChange={e => set("lots", e.target.value)} />
                      <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1">
                        Total: {Number(form.lots) * getLotSize(form.symbol)} Qty
                      </p>
                    </div>
                    <div>
                      <label className="text-xs font-semibold mb-1 block">Min Premium (₹)</label>
                      <Input type="number" value={form.gbMinPremium} onChange={e => set("gbMinPremium", e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold mb-1 block">Max Premium (₹)</label>
                      <Input type="number" value={form.gbMaxPremium} onChange={e => set("gbMaxPremium", e.target.value)} />
                    </div>
                  </div>

                  {/* Expiry Day Override */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold mb-1 block">Expiry Day</label>
                      <select
                        value={form.gbExpiryDay}
                        onChange={e => set("gbExpiryDay", e.target.value)}
                        className="flex h-10 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--input))] px-3 py-2 text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-orange-300"
                      >
                        <option value="0">Sunday</option>
                        <option value="1">Monday</option>
                        <option value="2">Tuesday (Default)</option>
                        <option value="3">Wednesday</option>
                        <option value="4">Thursday</option>
                        <option value="5">Friday</option>
                        <option value="6">Saturday</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold mb-1 block">Strikes OTM</label>
                      <Input type="number" min={1} max={10} value={form.gbStrikesOTM} onChange={e => set("gbStrikesOTM", e.target.value)} />
                      <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1">How far OTM to search for cheap options</p>
                    </div>
                  </div>
                </div>
              )}

            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              {form.type === "GAMMA_BLAST" && (
                <>
                  {/* Trailing SL Tiers */}
                  <div className="p-4 rounded-xl bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 space-y-3">
                    <p className="text-xs font-bold text-orange-700 uppercase tracking-wide">Trailing Stop-Loss Tiers</p>
                    <p className="text-[10px] text-orange-600">SL tightens as premium rises — letting winners run while protecting profits</p>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { key: "gbTrailTier1", label: "₹5–15 Premium", desc: "Loose — let it run" },
                        { key: "gbTrailTier2", label: "₹15–50 Premium", desc: "Medium" },
                        { key: "gbTrailTier3", label: "₹50–100 Premium", desc: "Tighter" },
                        { key: "gbTrailTier4", label: "₹100+ Premium", desc: "Tight — protect profit" },
                      ].map(tier => (
                        <div key={tier.key} className="bg-white/50 p-2.5 rounded-lg border border-orange-100">
                          <label className="text-[10px] font-bold text-orange-700 block mb-1">{tier.label}</label>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number" min={5} max={80}
                              value={(form as any)[tier.key]}
                              onChange={e => set(tier.key, e.target.value)}
                              className="h-8 text-xs border-orange-200"
                            />
                            <span className="text-xs font-bold text-orange-600">%</span>
                          </div>
                          <p className="text-[9px] text-orange-500 mt-0.5">{tier.desc}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Risk Limits */}
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                        <Zap className="h-4 w-4 text-amber-500" />
                        Max Trades/Day
                      </label>
                      <Input type="number" min={1} max={10} value={form.gbMaxTradesPerDay} onChange={e => set("gbMaxTradesPerDay", e.target.value)} />
                    </div>
                    <div>
                      <label className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                        <Shield className="h-4 w-4 text-red-500" />
                        Max Loss/Day (₹)
                      </label>
                      <Input type="number" min={100} value={form.gbMaxLossPerDay} onChange={e => set("gbMaxLossPerDay", e.target.value)} />
                    </div>
                    <div>
                      <label className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                        <Target className="h-4 w-4 text-blue-500" />
                        Exit Before Close
                      </label>
                      <Input type="number" min={5} max={30} value={form.gbForceExitMinBefore} onChange={e => set("gbForceExitMinBefore", e.target.value)} />
                      <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1">Minutes before market close</p>
                    </div>
                  </div>

                  {/* Signal Thresholds (Advanced) */}
                  <details className="group">
                    <summary className="text-xs font-semibold cursor-pointer text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors">
                      ⚙️ Advanced Signal Thresholds (click to expand)
                    </summary>
                    <div className="mt-3 grid grid-cols-3 gap-3 p-3 rounded-lg bg-[hsl(var(--secondary)/0.3)] border border-[hsl(var(--border))]">
                      <div>
                        <label className="text-[10px] font-semibold mb-1 block">ATR Multiplier</label>
                        <Input type="number" step={0.1} value={form.gbAtrMultiplier} onChange={e => set("gbAtrMultiplier", e.target.value)} className="h-8 text-xs" />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold mb-1 block">Premium Velocity ×</label>
                        <Input type="number" step={0.1} value={form.gbPremiumVelocityX} onChange={e => set("gbPremiumVelocityX", e.target.value)} className="h-8 text-xs" />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold mb-1 block">VIX Spike %</label>
                        <Input type="number" step={0.5} value={form.gbVixSpikeThreshold} onChange={e => set("gbVixSpikeThreshold", e.target.value)} className="h-8 text-xs" />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold mb-1 block">VWAP Divergence %</label>
                        <Input type="number" step={0.1} value={form.gbVwapDivergence} onChange={e => set("gbVwapDivergence", e.target.value)} className="h-8 text-xs" />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold mb-1 block">Min Signal Score</label>
                        <Input type="number" min={50} max={100} value={form.gbMinSignalScore} onChange={e => set("gbMinSignalScore", e.target.value)} className="h-8 text-xs" />
                      </div>
                    </div>
                  </details>

                  {/* Cost Preview */}
                  <div className="p-4 rounded-xl bg-[hsl(var(--secondary)/0.5)] border border-[hsl(var(--border))] space-y-2">
                    <p className="text-xs font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Cost Preview</p>
                    <div className="flex gap-6">
                      <div>
                        <p className="text-[10px] text-[hsl(var(--muted-foreground))]">Max Cost / Trade</p>
                        <p className="text-base font-bold">
                          ₹{(Number(form.lots) * getLotSize(form.symbol) * Number(form.gbMaxPremium)).toLocaleString("en-IN")}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-[hsl(var(--muted-foreground))]">Max Daily Exposure</p>
                        <p className="text-base font-bold text-amber-600">
                          ₹{(Number(form.gbMaxTradesPerDay) * Number(form.lots) * getLotSize(form.symbol) * Number(form.gbMaxPremium)).toLocaleString("en-IN")}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-[hsl(var(--muted-foreground))]">Max Loss Cap</p>
                        <p className="text-base font-bold text-red-500">
                          ₹{Number(form.gbMaxLossPerDay).toLocaleString("en-IN")}
                        </p>
                      </div>
                    </div>
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

                  {((form.type === "BREAKOUT_15MIN" && (form.instrumentType === "INDEX" || form.instrumentType === "OPTION")) || (form.type === "EMA_VWAP_CROSSOVER" && form.isOptionBuyingOnly)) && (

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
                    else if (form.type === "GAMMA_BLAST") typeLabel = "Gamma Blast (Expiry)";
                    
                    items.push(["Type", typeLabel]);
                    items.push(["Symbol", `${form.symbol}  ${form.exchange}`]);
                    items.push(["Order Size", `${form.lots} Lots (${Number(form.lots) * getLotSize(form.symbol)} Shares)`]);
                    items.push(["Product", form.product]);
                    
                    if (form.type === "GAMMA_BLAST") {
                      items.push(["Premium Range", `₹${form.gbMinPremium} - ₹${form.gbMaxPremium}`]);
                      items.push(["OTM Strikes", `${form.gbStrikesOTM} strikes`]);
                      items.push(["Max Trades", `${form.gbMaxTradesPerDay} / day`]);
                      items.push(["Max Loss Limit", `₹${Number(form.gbMaxLossPerDay).toLocaleString("en-IN")} / day`]);
                      items.push(["Exit Before Close", `${form.gbForceExitMinBefore} mins`]);
                      items.push(["Expiry Mode", form.gbExpiryMode === "weekly" ? "Weekly (every Tuesday)" : "Monthly (last Tuesday)"]);
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







