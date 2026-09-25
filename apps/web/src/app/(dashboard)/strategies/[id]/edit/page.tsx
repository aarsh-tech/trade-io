"use client";

export const runtime = "edge";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ChevronLeft, Check, Loader2, Shield, Target, Zap, Info, ArrowLeft, RefreshCw, BarChart2, TrendingUp, Lock,
  ArrowUpRight, ArrowDownRight, Shuffle, Sparkles, Clock
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { strategyApi, brokerApi, marketApi } from "@/lib/api";
import Link from "next/link";
import { apiErrorMessage } from "@/lib/api-error";
import { validateStrategyConfig } from "@/lib/strategy-config";

const LOT_SIZES: Record<string, number> = {
  "NIFTY": 65,
  "BANKNIFTY": 30,
  "SENSEX": 20,
  "FINNIFTY": 60,
  "MIDCPNIFTY": 120,
};

function getLotSize(symbol: string, dynamicLot?: number) {
  if (dynamicLot && dynamicLot > 0) return dynamicLot;
  const s = (symbol || "").toUpperCase().trim();
  if (s.includes("BANK")) return LOT_SIZES["BANKNIFTY"];
  if (s.includes("SENSEX")) return LOT_SIZES["SENSEX"];
  if (s.includes("FIN")) return LOT_SIZES["FINNIFTY"];
  if (s.includes("MID")) return LOT_SIZES["MIDCPNIFTY"];
  if (s.includes("NIFTY")) return LOT_SIZES["NIFTY"];
  return LOT_SIZES[s] || 1;
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
    type: "" as "BREAKOUT_15MIN" | "EMA_VWAP_CROSSOVER" | "STOCK_OPTIONS_BUYING" | "GAMMA_BLAST_EXPIRY" | "",
    symbol: "",
    exchange: "NSE",
    instrumentType: "INDEX" as "INDEX" | "STOCK" | "OPTION" | "FUTURE",
    lots: "1",
    product: "MIS" as "MIS" | "NRML",
    stopLossRs: "500",
    targetRs: "500",
    exitExactAtTarget: false,
    enableHybridTrailing: true,
    minStockPrice: "300",
    maxTradesPerDay: "2",
    minPremium: "100",
    maxPremium: "300",
    enableProfitFloor: true,
    profitFloorBufferRs: "100",
    // Daily Index Scalper (SENSEX & NIFTY)
    gbTradingMode: "FULL_DAY" as "FULL_DAY" | "AFTERNOON_ONLY",
    gbStartTime: "09:20",
    gbEndTime: "15:25",
    gbEnableOrbMorningTrigger: true,
    gbEnableMiddayBreakout: true,
    gbEnableOiFilter: true,
    gbEnableVolumeSurge: true,
    gbEnableRatchetTrailing: true,
    gbEnableHighConvictionBoost: true,
    gbMaxConvictionLots: "3",
    gbEnablePartialProfitBooking: true,
    gbInitialSlPct: "50",
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
    sMinRvol: "1.25",
    sMoneyness: "ITM",
    sTarget1RR: "1.5",
    sTarget2RR: "3.0",
    sEnableTrailingSl: true,
    sTrailingStepPct: "20",
    sEnableHtfFilter: true,
    sDirectionBias: "BOTH" as "BOTH" | "CALL_ONLY" | "PUT_ONLY",
    sSetupType: "BOTH" as "BOTH" | "INSIDE_CANDLE" | "PULLBACK_REJECTION",
    sIsAutoStockSelect: true,
    // Breakout 15-Min Dynamic Upgrades
    b15EnableDynamicAtr: true,
    b15RiskRewardRatio: "2.0",
    b15EnableFakeoutReversal: true,
    b15EnableVwapFilter: true,
    b15EnableBreakevenTrail: true,
    b15Moneyness: "ITM" as "ITM" | "ATM",
    b15EntryTimeframe: "3min" as "1min" | "3min" | "5min",
    b15EnableEmaVwapTrailing: true,
    b15TrailingEmaPeriod: "9",
    b15TrailingVwapSource: "both" as "both" | "ema" | "vwap",
    b15MaxLossesPerDay: "1",
    b15EnableMiddayChopFilter: true,
    b15MiddayDeadZoneStart: "11:45",
    b15MiddayDeadZoneEnd: "13:00",
    b15EnablePartialBooking: true,
    b15PartialBookingPct: "50",
    b15PartialBookingR: "1.8",
    b15EnableCprSupportResistance: true,
    // Broker
    brokerAccountId: "",
    lotSize: 0,
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

        const initialLotSize = config.lotSize || getLotSize(config.symbol);

        setForm({
          name: strategy.name,
          type: strategy.type,
          symbol: config.symbol || (strategy.type === "GAMMA_BLAST_EXPIRY" ? "AUTO" : ""),
          exchange: config.exchange || (config.symbol === "SENSEX" ? "BFO" : "NSE"),
          instrumentType: config.instrumentType || (strategy.type === "GAMMA_BLAST_EXPIRY" ? "OPTION" : "INDEX"),
          lots: String(config.lots || (config.qty ? Math.round(config.qty / initialLotSize) : 1)),
          product: config.product || (strategy.type === "GAMMA_BLAST_EXPIRY" ? "NRML" : "MIS"),
          stopLossRs: String(config.stopLossRs || "500"),
          targetRs: String(config.targetRs || (strategy.type === "GAMMA_BLAST_EXPIRY" ? "1500" : "500")),
          exitExactAtTarget: !!config.exitExactAtTarget,
          enableHybridTrailing: config.enableHybridTrailing !== false,
          minStockPrice: String(config.minStockPrice || "300"),
          maxTradesPerDay: String(config.maxTradesPerDay || "2"),
          minPremium: String(config.minPremium || "100"),
          maxPremium: String(config.maxPremium || "300"),
          enableProfitFloor: config.enableProfitFloor !== false,
          profitFloorBufferRs: String(config.profitFloorBufferRs || "100"),
          // Daily Index Scalper (SENSEX & NIFTY)
          gbTradingMode: (config.tradingMode || (config.startTime === "13:00" ? "AFTERNOON_ONLY" : "FULL_DAY")),
          gbStartTime: config.startTime || "09:20",
          gbEndTime: config.endTime || "15:25",
          gbEnableOrbMorningTrigger: config.enableOrbMorningTrigger !== false,
          gbEnableMiddayBreakout: config.enableMiddayBreakout !== false,
          gbEnableOiFilter: config.enableOiFilter !== false,
          gbEnableVolumeSurge: config.enableVolumeSurge !== false,
          gbEnableRatchetTrailing: config.enableRatchetTrailing !== false,
          gbEnableHighConvictionBoost: config.enableHighConvictionBoost !== false,
          gbMaxConvictionLots: String(config.maxConvictionLots || 3),
          gbEnablePartialProfitBooking: config.enablePartialProfitBooking !== false,
          gbInitialSlPct: String(config.initialSlPct || 50),
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
          sTriggerOffset: String(config.triggerOffset ?? "0.50"),
          sProtectionBufferPct: String(config.protectionBufferPct ?? "10"),
          sMinRvol: String(config.minRvol ?? "1.5"),
          sMoneyness: (config.moneyness as "ITM" | "ATM") || "ITM",
          sTarget1RR: String(config.target1RR ?? "1.5"),
          sTarget2RR: String(config.target2RR ?? "3.0"),
          sEnableTrailingSl: config.enableTrailingSl !== false,
          sTrailingStepPct: String(config.trailingStepPct ?? "20"),
          sEnableHtfFilter: config.enableHtfFilter !== false,
          sDirectionBias: config.directionBias || "BOTH",
          sSetupType: config.setupType || "BOTH",
          sIsAutoStockSelect: config.isAutoStockSelect !== false && (config.symbol === "AUTO" || config.isAutoStockSelect === true),
          // Breakout 15-Min Dynamic Upgrades
          b15EnableDynamicAtr: config.enableDynamicAtr !== false,
          b15RiskRewardRatio: String(config.riskRewardRatio || "2.0"),
          b15EnableFakeoutReversal: config.enableFakeoutReversal !== false,
          b15EnableVwapFilter: config.enableVwapFilter !== false,
          b15EnableBreakevenTrail: config.enableBreakevenTrail !== false,
          b15Moneyness: (config.moneyness as "ITM" | "ATM") || "ITM",
          b15EntryTimeframe: config.entryTimeframe || "3min",
          b15EnableEmaVwapTrailing: config.enableEmaVwapTrailing !== false,
          b15TrailingEmaPeriod: String(config.trailingEmaPeriod || "9"),
          b15TrailingVwapSource: config.trailingVwapSource || "both",
          b15MaxLossesPerDay: String(config.maxLossesPerDay ?? "1"),
          b15EnableMiddayChopFilter: config.enableMiddayChopFilter !== false,
          b15MiddayDeadZoneStart: config.middayDeadZoneStart || "11:45",
          b15MiddayDeadZoneEnd: config.middayDeadZoneEnd || "13:00",
          b15EnablePartialBooking: config.enablePartialBooking !== false,
          b15PartialBookingPct: String(config.partialBookingPct || "50"),
          b15PartialBookingR: String(config.partialBookingR || "1.8"),
          b15EnableCprSupportResistance: config.enableCprSupportResistance !== false,
          brokerAccountId: strategy.brokerAccountId || "",
          lotSize: initialLotSize,
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

  useEffect(() => {
    if (!form.symbol || form.symbol === "AUTO") return;
    let isMounted = true;
    marketApi.getLotSize(form.symbol, form.brokerAccountId)
      .then((res: any) => {
        if (isMounted && res.data?.lotSize) {
          setForm((f) => ({ ...f, lotSize: res.data.lotSize }));
        }
      })
      .catch(() => { });
    return () => { isMounted = false; };
  }, [form.symbol, form.brokerAccountId]);

  function set(k: string, v: any) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const lotSize = form.lotSize || getLotSize(form.symbol, form.lotSize);
      const qty = Number(form.lots) * lotSize;

      let config: any;
      if (form.type === "GAMMA_BLAST_EXPIRY") {
        const symbol = form.symbol.trim() === "SENSEX" ? "SENSEX" : (form.symbol.trim() === "NIFTY" ? "NIFTY" : "AUTO");
        const exchange = symbol === "SENSEX" ? "BFO" : "NFO";
        config = {
          tradingMode: form.gbTradingMode,
          enableOrbMorningTrigger: form.gbEnableOrbMorningTrigger,
          enableMiddayBreakout: form.gbEnableMiddayBreakout,
          symbol,
          exchange,
          lots: Number(form.lots || 1),
          lotSize,
          qty,
          product: form.product || "NRML",
          maxTradesPerDay: Number(form.maxTradesPerDay || 2),
          maxWinsPerDay: 1,
          autoSelectStrike: true,
          startTime: form.gbTradingMode === "AFTERNOON_ONLY" ? "13:00" : (form.gbStartTime || "09:20"),
          endTime: form.gbEndTime || "15:25",
          enableOiFilter: form.gbEnableOiFilter,
          enableVolumeSurge: form.gbEnableVolumeSurge,
          enableRatchetTrailing: form.gbEnableRatchetTrailing,
          enableHighConvictionBoost: form.gbEnableHighConvictionBoost,
          maxConvictionLots: Number(form.gbMaxConvictionLots || 3),
          enablePartialProfitBooking: form.gbEnablePartialProfitBooking,
          initialSlPct: Number(form.gbInitialSlPct || 50),
          targetRs: Number(form.targetRs || 1000),
          stopLossRs: Number(form.stopLossRs || 500),
          targetPoints: Math.round(Number(form.targetRs || 1000) / (lotSize || 20)),
          stopLossPoints: Math.round(Number(form.stopLossRs || 500) / (lotSize || 20)),
          exitExactAtTarget: !!form.exitExactAtTarget,
        };
      } else if (form.type === "STOCK_OPTIONS_BUYING") {
        const isAuto = form.sIsAutoStockSelect || form.symbol === "AUTO";
        config = {
          symbol: isAuto ? "AUTO" : form.symbol.trim(),
          isAutoStockSelect: isAuto,
          autoScanUniverse: "FNO_ALL",
          directionBias: form.sDirectionBias || "BOTH",
          setupType: form.sSetupType || "BOTH",
          exchange: "NSE",
          timeframe: form.sTimeframe,
          emaPeriod: Number(form.sEmaPeriod),
          riskRewardRatio: Number(form.sRiskRewardRatio),
          maxCapital: Number(form.sMaxCapital),
          lots: Number(form.lots),
          lotSize,
          qty,
          maxTradesPerDay: Number(form.maxTradesPerDay),
          product: form.product,
          startAfterMin: Number(form.startAfterMin || 25),
          triggerOffset: Number(form.sTriggerOffset),
          protectionBufferPct: Number(form.sProtectionBufferPct),
          minRvol: Number(form.sMinRvol || 1.25),
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
          exitExactAtTarget: !!form.exitExactAtTarget,
          enableHybridTrailing: form.enableHybridTrailing !== false,
          maxTradesPerDay: Number(form.maxTradesPerDay),
          enableDynamicAtr: form.b15EnableDynamicAtr,
          riskRewardRatio: Number(form.b15RiskRewardRatio),
          enableFakeoutReversal: form.b15EnableFakeoutReversal,
          enableVwapFilter: form.b15EnableVwapFilter,
          enableBreakevenTrail: form.b15EnableBreakevenTrail,
          moneyness: form.b15Moneyness,
          entryTimeframe: form.b15EntryTimeframe || "3min",
          enableEmaVwapTrailing: form.b15EnableEmaVwapTrailing,
          trailingEmaPeriod: Number(form.b15TrailingEmaPeriod || 9),
          trailingVwapSource: form.b15TrailingVwapSource || "both",
          maxLossesPerDay: Number(form.b15MaxLossesPerDay || 1),
          enableMiddayChopFilter: form.b15EnableMiddayChopFilter,
          middayDeadZoneStart: form.b15MiddayDeadZoneStart || "11:45",
          middayDeadZoneEnd: form.b15MiddayDeadZoneEnd || "13:00",
          enablePartialBooking: form.b15EnablePartialBooking,
          partialBookingPct: Number(form.b15PartialBookingPct || 50),
          partialBookingR: Number(form.b15PartialBookingR || 1.8),
          enableCprSupportResistance: form.b15EnableCprSupportResistance,
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
          exitExactAtTarget: !!form.exitExactAtTarget,
          enableHybridTrailing: form.enableHybridTrailing !== false,
          minStockPrice: Number(form.minStockPrice || 300),
          maxTradesPerDay: Number(form.maxTradesPerDay),
          enableProfitFloor: form.enableProfitFloor,
          profitFloorBufferRs: Number(form.profitFloorBufferRs || 100),
          ...(form.isOptionBuyingOnly && {
            minPremium: Number(form.minPremium), maxPremium: Number(form.maxPremium),
          }),
        };
      }

      const problems = validateStrategyConfig(form.type, config);
      if (problems.length > 0) {
        toast.error(problems.join(" · "));
        return;
      }

      await strategyApi.update(id, {
        name: form.name,
        type: form.type as any,
        brokerAccountId: form.brokerAccountId || undefined,
        config: JSON.stringify(config),
      });

      toast.success("Strategy updated successfully!");
      router.push(`/strategies/${id}`);
    } catch (err: any) {
      toast.error(apiErrorMessage(err, "Failed to update strategy"));
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
  const isGammaBlast = form.type === "GAMMA_BLAST_EXPIRY";

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
            <label className="text-sm font-semibold mb-2 block">Strategy Type / Architecture</label>
            <select
              value={form.type}
              onChange={(e) => set("type", e.target.value)}
              className="flex h-10 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--input))] px-3 py-2 text-sm font-bold text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.5)]"
            >
              <option value="EMA_VWAP_CROSSOVER">15-EMA &amp; VWAP Crossover (Intraday Stocks &amp; Options)</option>
              <option value="BREAKOUT_15MIN">15-Min Opening Range Breakout (ORB)</option>
              <option value="STOCK_OPTIONS_BUYING">Stock Options Buying (Auto F&amp;O Momentum Leaders)</option>
              <option value="GAMMA_BLAST_EXPIRY">⚡ Daily Index Scalper (SENSEX &amp; NIFTY — All Days)</option>
            </select>
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
          {isGammaBlast && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-amber-500/10 border-2 border-amber-500/30">
                <div className="flex items-center gap-2 mb-1.5">
                  <Sparkles className="h-4 w-4 text-amber-500" />
                  <p className="text-sm font-bold text-amber-600 dark:text-amber-400">
                    ⚡ Daily Index Scalper (SENSEX &amp; NIFTY — Full-Day Price Action)
                  </p>
                </div>
                <p className="text-xs text-[hsl(var(--muted-foreground))] leading-relaxed">
                  Full-day systematic price action scalper for SENSEX &amp; NIFTY across all trading days (Mon–Fri). Operates across 3 market phases: Morning ORB (09:20–11:30), Midday Compression (11:30–13:30), and Afternoon Momentum (13:30–15:25). Selects high-delta ATM contracts directly from running Future prices.
                </p>
              </div>

              {/* Expiry Index Selection */}
              <div>
                <label className="text-sm font-semibold mb-2 block">Index Underlier &amp; Contract</label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "AUTO (Smart Expiry)", val: "AUTO", desc: "Tue: NIFTY, Thu: SENSEX", lotSize: 20 },
                    { label: "BSE SENSEX", val: "SENSEX", desc: "Thursday Expiry (20 Lot)", lotSize: 20 },
                    { label: "NIFTY 50", val: "NIFTY", desc: "Tuesday Expiry (65 Lot)", lotSize: 65 },
                  ].map((item) => {
                    const isSelected = form.symbol === item.val || (item.val === "AUTO" && (!form.symbol || form.symbol === "AUTO"));
                    return (
                      <button
                        key={item.val}
                        type="button"
                        onClick={() => {
                          set("symbol", item.val);
                          set("exchange", item.val === "SENSEX" ? "BFO" : (item.val === "NIFTY" ? "NFO" : "BFO"));
                          set("lotSize", item.lotSize);
                        }}
                        className={cn(
                          "text-left p-3 rounded-xl border text-xs transition-all",
                          isSelected
                            ? "border-amber-500 bg-amber-50/70 dark:bg-amber-950/30 font-bold shadow-xs text-amber-700 dark:text-amber-300"
                            : "border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:border-amber-400/40"
                        )}
                      >
                        <p className="font-bold">{item.label}</p>
                        <p className="text-[10px] opacity-80 mt-1">{item.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Execution Window Mode */}
              <div>
                <label className="text-sm font-semibold mb-2 block">Execution Window &amp; Daypart Trading Mode</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      set("gbTradingMode", "FULL_DAY");
                      set("gbStartTime", "09:20");
                      set("gbEndTime", "15:25");
                    }}
                    className={cn(
                      "p-3.5 rounded-xl border text-left transition-all",
                      form.gbTradingMode === "FULL_DAY"
                        ? "border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/30 font-bold shadow-xs text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/40"
                        : "border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:border-emerald-400/40"
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold">🚀 Full Day Scalper</span>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-600">
                        RECOMMENDED
                      </span>
                    </div>
                    <p className="text-[11px] font-medium">09:20 AM – 03:25 PM IST</p>
                    <p className="text-[10px] opacity-80 mt-1 leading-snug">
                      Trades Morning ORB (09:20–11:30), Midday Flags (11:30–13:30), &amp; Afternoon Gamma Spikes (13:30–15:25).
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
                      "p-3.5 rounded-xl border text-left transition-all",
                      form.gbTradingMode === "AFTERNOON_ONLY"
                        ? "border-amber-500 bg-amber-50/70 dark:bg-amber-950/30 font-bold shadow-xs text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/40"
                        : "border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:border-amber-400/40"
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold">⏰ Afternoon Only</span>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-600">
                        AFTERNOON TREND
                      </span>
                    </div>
                    <p className="text-[11px] font-medium">01:00 PM – 03:25 PM IST</p>
                    <p className="text-[10px] opacity-80 mt-1 leading-snug">
                      Trades only during the afternoon high-volatility window using high-delta ATM contracts.
                    </p>
                  </button>
                </div>
              </div>

              {/* Start Time and End Time */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold mb-1 block">Execution Start Time</label>
                  <Input
                    value={form.gbStartTime}
                    onChange={(e) => set("gbStartTime", e.target.value)}
                    placeholder="09:20"
                    className="font-semibold text-xs"
                  />
                  <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1">Default 09:20 AM after opening 5m bar</p>
                </div>
                <div>
                  <label className="text-xs font-semibold mb-1 block">Execution End Time</label>
                  <Input
                    value={form.gbEndTime}
                    onChange={(e) => set("gbEndTime", e.target.value)}
                    placeholder="15:25"
                    className="font-semibold text-xs"
                  />
                  <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1">Hard square-off @ 15:29:30 PM</p>
                </div>
              </div>

              {/* Multi-Phase Triggers Toggles */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[hsl(var(--border))]">
                <label className="flex items-center gap-2 p-2.5 rounded-lg bg-[hsl(var(--card))] border border-[hsl(var(--border))] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.gbEnableOrbMorningTrigger}
                    onChange={(e) => set("gbEnableOrbMorningTrigger", e.target.checked)}
                    className="rounded text-amber-600 focus:ring-amber-500"
                  />
                  <div>
                    <span className="text-xs font-bold text-[hsl(var(--foreground))] block">Morning ORB Trigger</span>
                    <span className="text-[10px] text-[hsl(var(--muted-foreground))]">09:20–11:30 Opening Range breakouts</span>
                  </div>
                </label>

                <label className="flex items-center gap-2 p-2.5 rounded-lg bg-[hsl(var(--card))] border border-[hsl(var(--border))] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.gbEnableMiddayBreakout}
                    onChange={(e) => set("gbEnableMiddayBreakout", e.target.checked)}
                    className="rounded text-amber-600 focus:ring-amber-500"
                  />
                  <div>
                    <span className="text-xs font-bold text-[hsl(var(--foreground))] block">Midday Breakout</span>
                    <span className="text-[10px] text-[hsl(var(--muted-foreground))]">11:30–13:30 25-min channel breakthrough</span>
                  </div>
                </label>

                <label className="flex items-center gap-2 p-2.5 rounded-lg bg-[hsl(var(--card))] border border-[hsl(var(--border))] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.gbEnableOiFilter}
                    onChange={(e) => set("gbEnableOiFilter", e.target.checked)}
                    className="rounded text-amber-600 focus:ring-amber-500"
                  />
                  <div>
                    <span className="text-xs font-bold text-[hsl(var(--foreground))] block">Live OI Unwinding Filter</span>
                    <span className="text-[10px] text-[hsl(var(--muted-foreground))]">Confirms short-covering &amp; writer panic</span>
                  </div>
                </label>

                <label className="flex items-center gap-2 p-2.5 rounded-lg bg-[hsl(var(--card))] border border-[hsl(var(--border))] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.gbEnableRatchetTrailing}
                    onChange={(e) => set("gbEnableRatchetTrailing", e.target.checked)}
                    className="rounded text-amber-600 focus:ring-amber-500"
                  />
                  <div>
                    <span className="text-xs font-bold text-[hsl(var(--foreground))] block">Ratchet Zero-Decay Trailing</span>
                    <span className="text-[10px] text-[hsl(var(--muted-foreground))]">Locks gains at 1.5x, 2.0x, 3.0x milestones</span>
                  </div>
                </label>

                <label className="flex items-center gap-2 p-2.5 rounded-lg bg-[hsl(var(--card))] border border-[hsl(var(--border))] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.gbEnableHighConvictionBoost}
                    onChange={(e) => set("gbEnableHighConvictionBoost", e.target.checked)}
                    className="rounded text-amber-600 focus:ring-amber-500"
                  />
                  <div>
                    <span className="text-xs font-bold text-[hsl(var(--foreground))] block">A+ Conviction Lot Boost</span>
                    <span className="text-[10px] text-[hsl(var(--muted-foreground))]">Boosts lots to {form.gbMaxConvictionLots} on high conviction</span>
                  </div>
                </label>

                <label className="flex items-center gap-2 p-2.5 rounded-lg bg-[hsl(var(--card))] border border-[hsl(var(--border))] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.gbEnablePartialProfitBooking}
                    onChange={(e) => set("gbEnablePartialProfitBooking", e.target.checked)}
                    className="rounded text-amber-600 focus:ring-amber-500"
                  />
                  <div>
                    <span className="text-xs font-bold text-[hsl(var(--foreground))] block">2.0x Partial Profit Booking</span>
                    <span className="text-[10px] text-[hsl(var(--muted-foreground))]">Banks 50% lots @ 2x; trails runner</span>
                  </div>
                </label>
              </div>
            </div>
          )}

          {isStockOptionsBuying && (
            <div className="space-y-2">
              <label className="text-sm font-semibold block">Stock Selection Mode</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    set("sIsAutoStockSelect", true);
                    set("symbol", "AUTO");
                  }}
                  className={cn(
                    "p-3 rounded-xl border text-left transition-all",
                    form.sIsAutoStockSelect || form.symbol === "AUTO"
                      ? "border-blue-500 bg-blue-50/70 dark:bg-blue-950/30 shadow-xs font-bold text-blue-700 dark:text-blue-300"
                      : "border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:border-blue-400/40"
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                    <span className="text-xs">🎯 Auto F&O Scanner</span>
                  </div>
                  <p className="text-[10px] font-normal opacity-80 mt-1">
                    Scans 180+ F&O stocks for 5%–10% intraday momentum leaders
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    set("sIsAutoStockSelect", false);
                    if (form.symbol === "AUTO") set("symbol", "APOLLOHOSP");
                  }}
                  className={cn(
                    "p-3 rounded-xl border text-left transition-all",
                    !form.sIsAutoStockSelect && form.symbol !== "AUTO"
                      ? "border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/30 shadow-xs font-bold text-indigo-700 dark:text-indigo-300"
                      : "border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:border-indigo-400/40"
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <Target className="h-3.5 w-3.5 text-indigo-600" />
                    <span className="text-xs">📌 Manual Stock</span>
                  </div>
                  <p className="text-[10px] font-normal opacity-80 mt-1">
                    Select a specific stock (e.g. APOLLOHOSP, RELIANCE)
                  </p>
                </button>
              </div>
            </div>
          )}

          {!isGammaBlast && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Symbol</label>
                <Input
                  value={form.symbol}
                  onChange={(e) => set("symbol", e.target.value.toUpperCase())}
                  disabled={isStockOptionsBuying && (form.sIsAutoStockSelect || form.symbol === "AUTO")}
                  className={isStockOptionsBuying && (form.sIsAutoStockSelect || form.symbol === "AUTO") ? "bg-blue-50/50 dark:bg-blue-950/20 font-bold text-blue-600" : ""}
                />
                {isStockOptionsBuying && (form.sIsAutoStockSelect || form.symbol === "AUTO") && (
                  <p className="text-[10px] text-blue-600 font-semibold mt-1">
                    ✨ Dynamic: Auto-resolves top F&O breakout symbol in real-time
                  </p>
                )}
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
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium block">Lots</label>
                <span className="text-[10px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-400 px-2 py-0.5 rounded-full">
                  1 Lot = {form.lotSize || getLotSize(form.symbol, form.lotSize)} Qty
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

              {/* Trade Directional Bias */}
              <div className="mb-4">
                <label className="text-xs font-semibold mb-1.5 block">Trade Directional Bias</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "Both (Auto)", val: "BOTH", desc: "Long on Call, Short on Put", icon: Shuffle },
                    { label: "Bullish (CE Only)", val: "CALL_ONLY", desc: "Buy Calls on Breakouts", icon: ArrowUpRight },
                    { label: "Bearish (PE Only)", val: "PUT_ONLY", desc: "Buy Puts on Breakdowns", icon: ArrowDownRight },
                  ].map((item) => {
                    const Icon = item.icon;
                    const isSelected = form.sDirectionBias === item.val;
                    return (
                      <button
                        key={item.val}
                        type="button"
                        onClick={() => set("sDirectionBias", item.val)}
                        className={cn(
                          "text-left p-2.5 rounded-xl border text-xs transition-all",
                          isSelected
                            ? "border-blue-500 bg-blue-50/70 dark:bg-blue-950/30 font-bold shadow-xs"
                            : "border-[hsl(var(--border))] hover:border-blue-400/40"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span>{item.label}</span>
                          <Icon className={cn("h-3.5 w-3.5", isSelected ? "text-blue-600" : "text-slate-400")} />
                        </div>
                        <p className="text-[9px] text-[hsl(var(--muted-foreground))] mt-0.5">{item.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Trigger Setup Mode */}
              <div className="mb-4">
                <label className="text-xs font-semibold mb-1.5 block">Trigger Setup Mode</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "Dual Setup (Dual)", val: "BOTH", desc: "Inside Candle + 15-EMA Pullback" },
                    { label: "Inside Candle Only", val: "INSIDE_CANDLE", desc: "Pure Range Breakout" },
                    { label: "Pullback Rejection", val: "PULLBACK_REJECTION", desc: "EMA/VWAP Re-test" },
                  ].map((item) => (
                    <button
                      key={item.val}
                      type="button"
                      onClick={() => set("sSetupType", item.val)}
                      className={cn(
                        "text-left p-2.5 rounded-xl border text-xs transition-all",
                        form.sSetupType === item.val
                          ? "border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/30 font-bold shadow-xs"
                          : "border-[hsl(var(--border))] hover:border-indigo-400/40"
                      )}
                    >
                      <p>{item.label}</p>
                      <p className="text-[9px] text-[hsl(var(--muted-foreground))] mt-0.5">{item.desc}</p>
                    </button>
                  ))}
                </div>
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
              {is15Min && (
                <div className="p-4 rounded-xl border border-indigo-100 bg-indigo-50/40 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-indigo-600" />
                      <span className="text-sm font-bold text-indigo-950">Dynamic Volatility & Trap Reversal</span>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                      High Accuracy Mode
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-1">
                    <div>
                      <label className="text-xs font-semibold mb-1.5 flex items-center gap-1 text-foreground/75">
                        <Target className="h-3.5 w-3.5 text-green-600" />
                        Risk : Reward Ratio
                      </label>
                      <Input
                        type="number"
                        step={0.5}
                        min={1}
                        max={5}
                        value={form.b15RiskRewardRatio}
                        onChange={(e) => set("b15RiskRewardRatio", e.target.value)}
                        className="bg-card border-indigo-200 font-semibold text-xs"
                      />
                      <p className="text-[10px] text-slate-500 mt-1">Default 1:2.0 RR (Target = 2x ATR Risk)</p>
                    </div>

                    <div>
                      <label className="text-xs font-semibold mb-1.5 flex items-center gap-1 text-foreground/75">
                        <TrendingUp className="h-3.5 w-3.5 text-blue-600" />
                        Strike Moneyness
                      </label>
                      <select
                        value={form.b15Moneyness}
                        onChange={(e) => set("b15Moneyness", e.target.value)}
                        className="w-full h-9 rounded-md border border-indigo-200 bg-card px-3 py-1 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="ITM">1-Strike ITM (Recommended - High Delta)</option>
                        <option value="ATM">ATM (At-The-Money)</option>
                      </select>
                      <p className="text-[10px] text-slate-500 mt-1">ITM options reduce theta decay drag</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-indigo-100">
                    <label className="flex items-center gap-2 p-2 rounded-lg bg-card/80 border border-indigo-100/60 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.b15EnableDynamicAtr}
                        onChange={(e) => set("b15EnableDynamicAtr", e.target.checked)}
                        className="rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <div>
                        <span className="text-xs font-bold text-foreground block">Dynamic ATR Scaling</span>
                        <span className="text-[9px] text-slate-500">Auto-calibrates buffer & SL to volatility</span>
                      </div>
                    </label>

                    <label className="flex items-center gap-2 p-2 rounded-lg bg-card/80 border border-indigo-100/60 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.b15EnableFakeoutReversal}
                        onChange={(e) => set("b15EnableFakeoutReversal", e.target.checked)}
                        className="rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <div>
                        <span className="text-xs font-bold text-foreground block">⚡ Fakeout Trap Reversal</span>
                        <span className="text-[9px] text-slate-500">Auto-flips trade on failed breakout traps</span>
                      </div>
                    </label>

                    <label className="flex items-center gap-2 p-2 rounded-lg bg-card/80 border border-indigo-100/60 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.b15EnableBreakevenTrail}
                        onChange={(e) => set("b15EnableBreakevenTrail", e.target.checked)}
                        className="rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <div>
                        <span className="text-xs font-bold text-foreground block">🛡 Breakeven Lock (+1R)</span>
                        <span className="text-[9px] text-slate-500">Trails SL to Cost once in profit</span>
                      </div>
                    </label>

                    <label className="flex items-center gap-2 p-2 rounded-lg bg-card/80 border border-indigo-100/60 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.b15EnableVwapFilter}
                        onChange={(e) => set("b15EnableVwapFilter", e.target.checked)}
                        className="rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <div>
                        <span className="text-xs font-bold text-foreground block">VWAP / EMA Filter</span>
                        <span className="text-[9px] text-slate-500">Only trades with macro trend</span>
                      </div>
                    </label>
                  </div>
                </div>
              )}

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

              {isEmaVwap && form.instrumentType !== "OPTION" && (
                <div>
                  <label className="text-sm font-semibold mb-2 block flex items-center justify-between">
                    <span>Min Stock Price (₹)</span>
                    <span className="text-xs text-[hsl(var(--muted-foreground))] font-normal">
                      Excludes slow-moving stocks below ₹300
                    </span>
                  </label>
                  <Input
                    type="number"
                    value={form.minStockPrice}
                    onChange={(e) => set("minStockPrice", e.target.value)}
                    placeholder="300"
                  />
                </div>
              )}

              {/* Exit Exact at Target */}
              {!isGammaBlast && (
                <div className="p-4 rounded-xl bg-[hsl(var(--card))] border border-[hsl(var(--border))] space-y-3 mt-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Target className="h-4 w-4 text-emerald-500 shrink-0" />
                      <span className="text-sm font-bold text-[hsl(var(--foreground))]">Exit Exact at Target (Fixed Profit Target)</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.exitExactAtTarget || false}
                        onChange={(e) => set("exitExactAtTarget", e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-gray-300 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-card after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                    </label>
                  </div>
                  <p className="text-xs text-[hsl(var(--muted-foreground))] leading-relaxed">
                    When enabled, immediately squares off the position the moment your exact target profit (<strong>₹{form.targetRs || "500"}</strong>) or stop loss (<strong>₹{form.stopLossRs || "500"}</strong>) is hit.
                  </p>

                  {form.exitExactAtTarget && (
                    <div className="pt-3 mt-2 border-t border-[hsl(var(--border))] flex items-center justify-between">
                      <div className="space-y-0.5 pr-4">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-emerald-500">Option B: Hybrid 15-EMA & VWAP Trailing</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 font-medium">Recommended</span>
                        </div>
                        <p className="text-[11px] text-[hsl(var(--muted-foreground))] leading-relaxed">
                          Locks Break-Even at 50% target (+₹{Math.round(Number(form.targetRs || 500) / 2)}). As the trade approaches target, dynamically trails broker SL behind 15-EMA & VWAP with a 0.30% noise buffer to lock in intermediate gains if a reversal occurs.
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer shrink-0">
                        <input
                          type="checkbox"
                          checked={form.enableHybridTrailing !== false}
                          onChange={(e) => set("enableHybridTrailing", e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-8 h-4 bg-gray-300 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[1px] after:left-[1px] after:bg-card after:border-gray-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-emerald-500"></div>
                      </label>
                    </div>
                  )}
                </div>
              )}

              {isEmaVwap && !isGammaBlast && (
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
                      <div className="w-9 h-5 bg-gray-300 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-card after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
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

