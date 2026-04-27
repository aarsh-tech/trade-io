"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BarChart2, TrendingUp, ChevronRight, ChevronLeft,
  Check, Loader2, Shield, Target, Zap, Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { strategyApi, brokerApi, marketApi } from "@/lib/api";
import { Badge } from "@/components/ui/badge";

// ─── Constants ────────────────────────────────────────────────────────────────

const STEPS = ["Strategy Type", "Instrument & Config", "Risk Management", "Broker & Review"];

const PRESET_INSTRUMENTS = [
  { label: "NIFTY 50", symbol: "NIFTY 50", exchange: "NSE", type: "INDEX" },
  { label: "BANK NIFTY", symbol: "BANKNIFTY", exchange: "NSE", type: "INDEX" },
  { label: "SENSEX", symbol: "SENSEX", exchange: "BSE", type: "INDEX" },
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

// ─── Types ────────────────────────────────────────────────────────────────────

interface BrokerAccount {
  id: string;
  broker: string;
  clientId: string;
  isActive: boolean;
  tokenExpiry: string | null;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NewStrategyPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [brokers, setBrokers] = useState<BrokerAccount[]>([]);

  // ── Form state ──────────────────────────────────────────────────────────────
  const [form, setForm] = useState({
    name: "",
    type: "" as "BREAKOUT_15MIN" | "EMA_VWAP_CROSSOVER" | "",
    // Common
    symbol: "NIFTY 50",
    exchange: "NSE",
    instrumentType: "INDEX" as "INDEX" | "STOCK" | "OPTION" | "FUTURE",
    lots: "1",
    product: "MIS" as "MIS" | "NRML",
    stopLossRs: "500",
    targetRs: "500",
    maxTradesPerDay: "1",
    minPremium: "100",
    maxPremium: "300",
    // EMA-VWAP crossover
    emaPeriod: "15",
    isOptionBuyingOnly: true,
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
    setForm(f => ({
      ...f,
      symbol: item.symbol,
      exchange: item.exchange,
      instrumentType: item.exchange === 'NFO' ? 'OPTION' : (item.symbol.includes('NIFTY') || item.symbol.includes('SENSEX') ? 'INDEX' : 'STOCK'),
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

  // ── Validation ──────────────────────────────────────────────────────────────
  const canNext = () => {
    if (step === 0) return !!form.name && !!form.type;
    if (step === 1) return !!form.symbol && Number(form.lots) > 0;
    if (step === 2) {
      if (form.type === "BREAKOUT_15MIN" || form.type === "EMA_VWAP_CROSSOVER")
        return Number(form.stopLossRs) > 0 && Number(form.targetRs) > 0;
      return true;
    }
    return !!form.brokerAccountId;
  };

  // ── Submit ──────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    setSubmitting(true);
    try {
      const lotSize = getLotSize(form.symbol);
      const qty = Number(form.lots) * lotSize;

      const config =
        form.type === "BREAKOUT_15MIN"
          ? {
            symbol: form.symbol.trim(),
            exchange: form.exchange,
            instrumentType: form.instrumentType,
            qty: qty,
            lots: Number(form.lots),
            product: form.product,
            stopLossRs: Number(form.stopLossRs),
            targetRs: Number(form.targetRs),
            maxTradesPerDay: Number(form.maxTradesPerDay),
            minPremium: Number(form.minPremium),
            maxPremium: Number(form.maxPremium),
          }
          : {
            symbol: form.symbol.trim(),
            exchange: form.exchange,
            emaPeriod: Number(form.emaPeriod),
            isOptionBuyingOnly: form.isOptionBuyingOnly,
            qty: qty,
            lots: Number(form.lots),
            product: form.product,
            stopLossRs: Number(form.stopLossRs),
            targetRs: Number(form.targetRs),
            maxTradesPerDay: Number(form.maxTradesPerDay),
          };

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

          {/* ── Step 0: Type ── */}
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
                      desc: "Enters after 5-min candle closes above/below the first 15-min candle's high/low. Uses fixed ₹ SL & Target.",
                      icon: BarChart2,
                      badge: "Recommended",
                    },
                    {
                      type: "EMA_VWAP_CROSSOVER",
                      label: "15-EMA & VWAP",
                      desc: "Trade when 15-period EMA crosses VWAP. Includes confirmation candle logic. Optimized for Options & Stocks.",
                      icon: TrendingUp,
                      badge: "New",
                    },
                  ].map(({ type, label, desc, icon: Icon, badge }) => (
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
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[hsl(var(--green)/0.15)] text-green-600 font-semibold">
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

          {/* ── Step 1: Instrument ── */}
          {step === 1 && (
            <div className="space-y-5">
              {/* Preset quick-select */}
              {form.type === "BREAKOUT_15MIN" && (
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
                    Total Quantity: {Number(form.lots) * getLotSize(form.symbol)} shares
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
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">EMA Period</label>
                    <Input type="number" value={form.emaPeriod} onChange={(e) => set("emaPeriod", e.target.value)} />
                  </div>
                  <div className="flex items-center gap-3 pt-6">
                    <input 
                      type="checkbox" 
                      id="optBuy" 
                      checked={form.isOptionBuyingOnly} 
                      onChange={(e) => set("isOptionBuyingOnly", e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    <label htmlFor="optBuy" className="text-sm font-medium">Option Buying Only</label>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Step 2: Risk Management ── */}
          {step === 2 && (
            <div className="space-y-5">
              {(form.type === "BREAKOUT_15MIN" || form.type === "EMA_VWAP_CROSSOVER") && (
                <>
                  {/* Info box */}
                  <div className="flex gap-3 p-3 rounded-xl bg-[hsl(var(--primary)/0.06)] border border-[hsl(var(--primary)/0.15)]">
                    <Info className="h-4 w-4 text-[hsl(var(--primary))] mt-0.5 shrink-0" />
                    <p className="text-xs text-[hsl(var(--muted-foreground))] leading-relaxed">
                      Orders are placed as <strong>Limit</strong> orders — Entry, Stop-Loss (SL-Limit), and Target.
                      Fixed ₹ amounts are per trade (not per lot). SL price = Entry ± (₹SL ÷ Qty).
                    </p>
                  </div>

                  {form.type === "BREAKOUT_15MIN" && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                          <TrendingUp className="h-4 w-4 text-blue-500" />
                          Min Premium (₹)
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
                          Max Premium (₹)
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
                          When breakout occurs, the bot will pick an Option contract with premium between ₹{form.minPremium} and ₹{form.maxPremium}.
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                        <Shield className="h-4 w-4 text-red-500" />
                        Stop Loss (₹)
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
                        Fixed loss limit per trade in ₹
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                        <Target className="h-4 w-4 text-green-500" />
                        Target (₹)
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
                        Fixed target profit per trade in ₹
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
                      Safety cap — strategy stops placing new trades after this limit
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
                          −₹{Number(form.stopLossRs).toLocaleString("en-IN")}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-[hsl(var(--muted-foreground))]">Max Profit / Trade</p>
                        <p className="text-base font-bold text-green-600">
                          +₹{Number(form.targetRs).toLocaleString("en-IN")}
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

          {/* ── Step 3: Broker & Review ── */}
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
                          {b.broker} — {b.clientId ?? b.id.slice(0, 8)}
                          {!b.tokenExpiry || new Date(b.tokenExpiry) < new Date() ? " ⚠ Session expired" : ""}
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
                  {[
                    ["Name", form.name],
                    ["Type", form.type === "BREAKOUT_15MIN" ? "15-Min High/Low Breakout" : "EMA-VWAP Crossover"],
                    ["Symbol", `${form.symbol} · ${form.exchange}`],
                    ["Order Size", `${form.lots} Lots (${Number(form.lots) * getLotSize(form.symbol)} Shares)`],
                    ["Product", form.product],
                    ["Stop Loss", `₹${Number(form.stopLossRs).toLocaleString("en-IN")} (fixed)`],
                    ["Target", `₹${Number(form.targetRs).toLocaleString("en-IN")} (fixed)`],
                    ["Max Trades", `${form.maxTradesPerDay} / day`],
                    ...(form.type === "BREAKOUT_15MIN" ? [
                      ["Premium Range", `₹${form.minPremium} — ₹${form.maxPremium}`],
                    ] : [
                      ["EMA Period", form.emaPeriod],
                      ["Option Only", form.isOptionBuyingOnly ? "Yes" : "No"],
                    ]),
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between py-2 border-b border-[hsl(var(--border))] last:border-0 px-1">
                      <span className="text-sm text-[hsl(var(--muted-foreground))]">{label}</span>
                      <span className="text-sm font-semibold">{value}</span>
                    </div>
                  ))}
                </div>

                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-900">
                  <p className="text-sm font-bold text-amber-700 dark:text-amber-400 mb-1">⚠ Risk Reminder</p>
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
              <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</>
            ) : (
              <><Check className="h-4 w-4" /> Create Strategy</>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
