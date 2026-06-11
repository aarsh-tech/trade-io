"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ChevronLeft, Check, Loader2, Shield, Target, Zap, Info, ArrowLeft, RefreshCw, BarChart2, TrendingUp
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { strategyApi, brokerApi } from "@/lib/api";
import Link from "next/link";

const LOT_SIZES: Record<string, number> = {
  "NIFTY": 65,
  "BANKNIFTY": 30,
  "SENSEX": 20,
  "FINNIFTY": 60,
  "MIDCPNIFTY": 120,
};

function getLotSize(symbol: string) {
  const s = (symbol || "").toUpperCase();
  if (s.includes("BANKNIFTY")) return 30;
  if (s.includes("NIFTY")) return 65;
  if (s.includes("SENSEX")) return 20;
  for (const key in LOT_SIZES) {
    if (s.includes(key)) return LOT_SIZES[key];
  }
  return 1;
}

interface BrokerAccount {
  id: string;
  broker: string;
  clientId: string;
}

export default function EditStrategyPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [brokers, setBrokers] = useState<BrokerAccount[]>([]);
  
  const [form, setForm] = useState({
    name: "",
    type: "" as "BREAKOUT_15MIN" | "EMA_VWAP_CROSSOVER" | "EMA_RSI_OPTIONS" | "DAILY_SCALPER" | "",
    symbol: "",
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
    // Broker
    brokerAccountId: "",
  });

  useEffect(() => {
    async function loadData() {
      try {
        const [stratRes, brokerRes] = await Promise.all([
          strategyApi.get(id),
          brokerApi.list()
        ]);
        
        const strategy = stratRes.data.data;
        const config = strategy.config || {};
        const brokerList = brokerRes.data?.data ?? [];
        
        setBrokers(brokerList);
        
        setForm({
          name: strategy.name,
          type: strategy.type,
          symbol: config.symbol || "",
          exchange: config.exchange || "NSE",
          instrumentType: config.instrumentType || "INDEX",
          lots: String(config.lots || (config.qty ? Math.round(config.qty / getLotSize(config.symbol)) : 1)),
          product: config.product || "MIS",
          stopLossRs: String(config.stopLossRs || "500"),
          targetRs: String(config.targetRs || "500"),
          maxTradesPerDay: String(config.maxTradesPerDay || "2"),
          minPremium: String(config.minPremium || "100"),
          maxPremium: String(config.maxPremium || "300"),
          // EMA-VWAP crossover
          emaPeriod: String(config.emaPeriod || "15"),
          isOptionBuyingOnly: config.isOptionBuyingOnly !== false,
          // EMA-RSI Options
          emaFast: String(config.emaFast || "9"),
          emaSlow: String(config.emaSlow || "21"),
          rsiPeriod: String(config.rsiPeriod || "14"),
          rsiEntryMin: String(config.rsiEntryMin || "45"),
          rsiEntryMax: String(config.rsiEntryMax || "65"),
          optionLots: String(config.lots || "1"),
          targetPct: String(config.targetPct || "45"),
          slPct: String(config.slPct || "25"),
          startAfterMin: String(config.startAfterMin || "25"),
          // Daily Scalper
          dsCapital: String(config.capital || "20000"),
          dsDailyTargetRs: String(config.dailyTargetRs || "500"),
          dsDailyMaxLossRs: String(config.dailyMaxLossRs || "800"),
          dsTargetPoints: String(config.targetPoints || ""),
          dsStopLossPoints: String(config.stopLossPoints || ""),
          dsMaxTradesPerDay: String(config.maxTradesPerDay || "2"),
          brokerAccountId: strategy.brokerAccountId || "",
        });
      } catch (err) {
        toast.error("Failed to load strategy details");
        router.push("/strategies");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [id, router]);

  function set(k: string, v: any) {
    setForm((f) => ({ ...f, [k]: v }));
  }

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

      await strategyApi.update(id, {
        name: form.name,
        brokerAccountId: form.brokerAccountId || undefined,
        config: JSON.stringify(config),
      });

      toast.success("Strategy updated successfully!");
      router.push(`/strategies/${id}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Failed to update strategy");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--primary))]" />
      </div>
    );
  }

  const is15Min = form.type === "BREAKOUT_15MIN";
  const isDailyScalper = form.type === "DAILY_SCALPER";
  const isEmaRsi = form.type === "EMA_RSI_OPTIONS";
  const isEmaVwap = form.type === "EMA_VWAP_CROSSOVER";

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-[fade-up_0.4s_ease_both]">
      <div className="flex items-center gap-3">
        <Link href={`/strategies/${id}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Edit Strategy</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">
            Modify configuration for {form.name}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Basic Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-semibold mb-2 block">Strategy Name</label>
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm font-semibold mb-2 block">Broker Account</label>
            <select
              value={form.brokerAccountId}
              onChange={(e) => set("brokerAccountId", e.target.value)}
              className="flex h-10 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--input))] px-3 py-2 text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.5)]"
            >
              <option value="">Select broker account</option>
              {brokers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.broker} — {b.clientId}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Instrument & Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Symbol</label>
              <Input
                value={form.symbol}
                onChange={(e) => set("symbol", e.target.value.toUpperCase())}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Exchange</label>
              <select
                value={form.exchange}
                onChange={(e) => set("exchange", e.target.value)}
                className="flex h-10 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--input))] px-3 py-2 text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.5)]"
              >
                <option value="NSE">NSE</option>
                <option value="BSE">BSE</option>
                <option value="NFO">NFO (F&O)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium block">Lots</label>
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

          {isEmaVwap && (
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
                      "py-2 rounded-lg text-xs font-semibold transition-all",
                      !form.isOptionBuyingOnly ? "bg-[hsl(var(--background))] border shadow-sm text-[hsl(var(--primary))]" : "text-[hsl(var(--muted-foreground))]"
                    )}
                  >
                    Equity / Stock
                  </button>
                  <button
                    type="button"
                    onClick={() => set("isOptionBuyingOnly", true)}
                    className={cn(
                      "py-2 rounded-lg text-xs font-semibold transition-all",
                      form.isOptionBuyingOnly ? "bg-[hsl(var(--background))] border shadow-sm text-[hsl(var(--primary))]" : "text-[hsl(var(--muted-foreground))]"
                    )}
                  >
                    Options (CE/PE)
                  </button>
                </div>
              </div>
            </div>
          )}

          {isEmaRsi && (
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
          )}

          {isDailyScalper && (
            <div>
              <label className="text-sm font-semibold mb-2 block">Available Capital (₹)</label>
              <Input
                type="number"
                min={5000}
                value={form.dsCapital}
                onChange={(e) => set("dsCapital", e.target.value)}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Risk & Execution</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isDailyScalper ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                    <Target className="h-4 w-4 text-emerald-500" />
                    Daily Target Profit (₹)
                  </label>
                  <Input
                    type="number"
                    value={form.dsDailyTargetRs}
                    onChange={(e) => set("dsDailyTargetRs", e.target.value)}
                    className="border-emerald-200 focus:ring-emerald-300 font-semibold"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                    <Shield className="h-4 w-4 text-red-500" />
                    Daily Max Loss (₹)
                  </label>
                  <Input
                    type="number"
                    value={form.dsDailyMaxLossRs}
                    onChange={(e) => set("dsDailyMaxLossRs", e.target.value)}
                    className="border-red-200 focus:ring-red-300 font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-semibold mb-2 block">Override Target Points</label>
                  <Input
                    type="number"
                    placeholder="Default"
                    value={form.dsTargetPoints}
                    onChange={(e) => set("dsTargetPoints", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold mb-2 block">Override Stop Loss Points</label>
                  <Input
                    type="number"
                    placeholder="Default"
                    value={form.dsStopLossPoints}
                    onChange={(e) => set("dsStopLossPoints", e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold mb-2 block">Max Trades / Day</label>
                <Input
                  type="number"
                  value={form.dsMaxTradesPerDay}
                  onChange={(e) => set("dsMaxTradesPerDay", e.target.value)}
                />
              </div>
            </>
          ) : (
            <>
              {((is15Min && (form.instrumentType === "INDEX" || form.instrumentType === "OPTION")) || (isEmaVwap && form.isOptionBuyingOnly)) && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-semibold mb-2 block">Min Premium</label>
                    <Input
                      type="number"
                      value={form.minPremium}
                      onChange={(e) => set("minPremium", e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-semibold mb-2 block">Max Premium</label>
                    <Input
                      type="number"
                      value={form.maxPremium}
                      onChange={(e) => set("maxPremium", e.target.value)}
                    />
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
                    type="number"
                    value={form.stopLossRs}
                    onChange={(e) => set("stopLossRs", e.target.value)}
                    className="border-red-200"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                    <Target className="h-4 w-4 text-green-500" />
                    Target (₹)
                  </label>
                  <Input
                    type="number"
                    value={form.targetRs}
                    onChange={(e) => set("targetRs", e.target.value)}
                    className="border-green-200"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold mb-2 block">Max Trades Per Day</label>
                <Input
                  type="number"
                  value={form.maxTradesPerDay}
                  onChange={(e) => set("maxTradesPerDay", e.target.value)}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Link href={`/strategies/${id}`}>
          <Button variant="outline">Cancel</Button>
        </Link>
        <Button 
          variant="success" 
          onClick={handleSubmit} 
          disabled={submitting}
        >
          {submitting ? (
            <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving...</>
          ) : (
            <><Check className="h-4 w-4 mr-2" /> Update Strategy</>
          )}
        </Button>
      </div>
    </div>
  );
}

