"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ChevronLeft, Check, Loader2, Shield, Target, Zap, Info, ArrowLeft, RefreshCw, BarChart2, TrendingUp, Lock
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
  if (symbol.includes("BANK")) return LOT_SIZES["BANKNIFTY"];
  if (symbol.includes("SENSEX")) return LOT_SIZES["SENSEX"];
  if (symbol.includes("FIN")) return LOT_SIZES["FINNIFTY"];
  if (symbol.includes("MID")) return LOT_SIZES["MIDCPNIFTY"];
  return LOT_SIZES["NIFTY"];
}

interface BrokerAccount {
  id: string;
  broker: string;
  clientId: string | null;
  isActive: boolean;
  tokenExpiry: string | null;
}

export default function EditStrategyPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [brokers, setBrokers] = useState<BrokerAccount[]>([]);

  const [form, setForm] = useState({
    name: "",
    type: "" as "BREAKOUT_15MIN" | "EMA_VWAP_CROSSOVER" | "STOCK_OPTIONS_BUYING" | "",
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
    enableProfitFloor: true,
    profitFloorBufferRs: "100",
    // EMA-VWAP crossover
    emaPeriod: "15",
    vwapSource: "close" as "close" | "hlc3",
    isOptionBuyingOnly: true,
    startAfterMin: "25",
    // Stock Options Buying
    sTimeframe: "15min",
    sEmaPeriod: "15",
    sRiskRewardRatio: "2",
    sMaxCapital: "25000",
    sTriggerOffset: "0.50",
    sProtectionBufferPct: "10",
    sMinRvol: "1.5",
    sMoneyness: "ITM",
    sTarget1RR: "1.5",
    sTarget2RR: "3.0",
    sEnableTrailingSl: true,
    sTrailingStepPct: "20",
    sEnableHtfFilter: true,
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
          enableProfitFloor: config.enableProfitFloor !== false,
          profitFloorBufferRs: String(config.profitFloorBufferRs || "100"),
          // EMA-VWAP crossover
          emaPeriod: String(config.emaPeriod || "15"),
          vwapSource: config.vwapSource || "close",
          isOptionBuyingOnly: config.isOptionBuyingOnly !== false,
          startAfterMin: String(config.startAfterMin || "25"),
          // Stock Options Buying
          sTimeframe: config.timeframe || "15min",
          sEmaPeriod: String(config.emaPeriod || "15"),
          sRiskRewardRatio: String(config.riskRewardRatio || "2"),
          sMaxCapital: String(config.maxCapital || "25000"),
          sTriggerOffset: String(config.triggerOffset || "0.50"),
          sProtectionBufferPct: String(config.protectionBufferPct || "10"),
          sMinRvol: String(config.minRvol || "1.5"),
          sMoneyness: config.moneyness || "ITM",
          sTarget1RR: String(config.target1RR || "1.5"),
          sTarget2RR: String(config.target2RR || "3.0"),
          sEnableTrailingSl: config.enableTrailingSl !== false,
          sTrailingStepPct: String(config.trailingStepPct || "20"),
          sEnableHtfFilter: config.enableHtfFilter !== false,
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
      if (form.type === "STOCK_OPTIONS_BUYING") {
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
          startAfterMin: Number(form.startAfterMin || 25),
          triggerOffset: Number(form.sTriggerOffset),
          protectionBufferPct: Number(form.sProtectionBufferPct),
          minRvol: Number(form.sMinRvol || 1.5),
          moneyness: form.sMoneyness || "ITM",
          target1RR: Number(form.sTarget1RR || 1.5),
          target2RR: Number(form.sTarget2RR || 3.0),
          enableTrailingSl: form.sEnableTrailingSl,
          trailingStepPct: Number(form.sTrailingStepPct || 20),
          enableHtfFilter: form.sEnableHtfFilter,
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
      } else {
        config = {
          symbol: form.symbol.trim(), exchange: form.exchange,
          instrumentType: form.instrumentType,
          emaPeriod: Number(form.emaPeriod), vwapSource: form.vwapSource || "close", isOptionBuyingOnly: form.isOptionBuyingOnly,
          qty, lots: Number(form.lots), product: form.product,
          stopLossRs: Number(form.stopLossRs), targetRs: Number(form.targetRs),
          maxTradesPerDay: Number(form.maxTradesPerDay),
          enableProfitFloor: form.enableProfitFloor,
          profitFloorBufferRs: Number(form.profitFloorBufferRs || 100),
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
  const isEmaVwap = form.type === "EMA_VWAP_CROSSOVER";
  const isStockOptionsBuying = form.type === "STOCK_OPTIONS_BUYING";

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



          {isStockOptionsBuying && (
            <div className="space-y-4">
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

          {isStockOptionsBuying && (
            <>
              <div className="flex gap-3 p-3 rounded-xl bg-blue-50 border border-blue-100 mb-4">
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
                    Failsafe: Skips trade if 1 lot exceeds this capital (e.g. 20000).
                  </p>
                </div>
                <div>
                  <label className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                    <Target className="h-4 w-4 text-green-500" />
                    Option Strike Type (Moneyness)
                  </label>
                  <select
                    value={form.sMoneyness}
                    onChange={(e) => set("sMoneyness", e.target.value)}
                    className="flex h-10 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--input))] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.5)] font-semibold text-green-700"
                  >
                    <option value="ITM">In The Money (High Delta ~0.60, Lower Decay)</option>
                    <option value="ATM">At The Money (ATM Strike)</option>
                  </select>
                  <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1">
                    ITM provides higher sensitivity to spot price moves.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold mb-1 block">Target 1 RR (+50% ROI Target)</label>
                  <Input
                    type="number"
                    step={0.1}
                    value={form.sTarget1RR}
                    onChange={(e) => set("sTarget1RR", e.target.value)}
                  />
                  <p className="text-[9px] text-[hsl(var(--muted-foreground))] mt-1">1:1.5 RR (Moves SL to Cost for 100% Risk-Free trade)</p>
                </div>
                <div>
                  <label className="text-xs font-semibold mb-1 block">Target 2 RR (+100% ROI Target)</label>
                  <Input
                    type="number"
                    step={0.1}
                    value={form.sTarget2RR}
                    onChange={(e) => set("sTarget2RR", e.target.value)}
                  />
                  <p className="text-[9px] text-[hsl(var(--muted-foreground))] mt-1">1:3.0 RR (Exits 1 lot at 2x option premium gain)</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold mb-1 block">Min Relative Volume (RVOL)</label>
                  <Input
                    type="number"
                    step={0.1}
                    value={form.sMinRvol}
                    onChange={(e) => set("sMinRvol", e.target.value)}
                  />
                  <p className="text-[9px] text-[hsl(var(--muted-foreground))] mt-1">Minimum volume spike (e.g. 1.5x of 20 SMA)</p>
                </div>
                <div>
                  <label className="text-xs font-semibold mb-1 block">15-Min HTF Trend Filter</label>
                  <select
                    value={String(form.sEnableHtfFilter)}
                    onChange={(e) => set("sEnableHtfFilter", e.target.value === "true")}
                    className="flex h-9 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--input))] px-3 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.5)]"
                  >
                    <option value="true">Enabled (15-min 50 EMA)</option>
                    <option value="false">Disabled</option>
                  </select>
                  <p className="text-[9px] text-[hsl(var(--muted-foreground))] mt-1">Confirms 15-min trend before breakout</p>
                </div>
                <div>
                  <label className="text-xs font-semibold mb-1 block">Trailing SL (Cost @ T1)</label>
                  <select
                    value={String(form.sEnableTrailingSl)}
                    onChange={(e) => set("sEnableTrailingSl", e.target.value === "true")}
                    className="flex h-9 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--input))] px-3 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.5)]"
                  >
                    <option value="true">Enabled (Trail 20% behind peak)</option>
                    <option value="false">Disabled</option>
                  </select>
                  <p className="text-[9px] text-[hsl(var(--muted-foreground))] mt-1">Trails SL as option price doubles</p>
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

          {!isStockOptionsBuying && (
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

              {isEmaVwap && (
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-2.5 mt-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Lock className="h-4 w-4 text-emerald-500 shrink-0" />
                      <span className="text-sm font-bold text-[hsl(var(--foreground))]">Profit Floor Locking & Peak Trailing</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.enableProfitFloor}
                        onChange={(e) => set("enableProfitFloor", e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-gray-300 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                    </label>
                  </div>
                  <p className="text-xs text-[hsl(var(--foreground))] opacity-90 leading-relaxed">
                    Once target profit (<strong>₹{form.targetRs}</strong>) is reached, locks in minimum <strong>₹{form.targetRs}</strong> profit and trails <strong>₹{form.profitFloorBufferRs || 100}</strong> behind peak P&L so you can ride big trends!
                  </p>
                </div>
              )}
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

