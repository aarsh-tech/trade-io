"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ChevronRight,
  ChevronLeft,
  Check,
  Loader2,
  ArrowLeft,
  Layers,
  Sliders,
  Shield,
  Zap,
  Flame,
  TrendingUp,
  Target,
  BarChart2,
  CheckCircle2,
  Sparkles,
  Activity,
  Clock,
  Bot,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { strategyApi, brokerApi } from "@/lib/api";
import { StrategyFormState, BrokerAccount, getLotSize } from "./types";
import { Step1StrategyType } from "./components/Step1StrategyType";
import { Step2InstrumentConfig } from "./components/Step2InstrumentConfig";
import { Step3RiskManagement } from "./components/Step3RiskManagement";
import { Step4BrokerReview } from "./components/Step4BrokerReview";
import { Badge } from "@/components/ui/badge";

const STEPS = [
  { id: "type", title: "Strategy Type", subtitle: "Select algorithm", icon: Layers },
  { id: "instrument", title: "Instrument & Config", subtitle: "Symbols, strike & lots", icon: Sliders },
  { id: "risk", title: "Risk Management", subtitle: "SL, target & profit shields", icon: Shield },
  { id: "review", title: "Broker & Review", subtitle: "Live Zerodha & deploy", icon: Zap },
];

const getStrategyMeta = (type: string) => {
  switch (type) {
    case "STOCK_OPTIONS_BUYING":
      return {
        label: "Stock Option Auto-Hunter",
        badge: "🔥 80% WIN-RATE",
        badgeClass: "bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-extrabold shadow-2xs",
        icon: Flame,
        iconColor: "text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/20",
        desc: "Scans 180+ F&O stocks for 5%–10% momentum. Buys ITM options, books 50% at T1 (+50% ROI), trails SL to cost, and rides T2 (+100% ROI).",
        features: [
          "180+ F&O Momentum Scanner",
          "50% Cash Lock @ T1 (+50% ROI)",
          "Zero-Risk Breakeven Trail",
          "NIFTY 50 Macro Trend Gate",
        ],
        tip: "Takes quick profits on The Banker and lets The Runner capture massive moves risk-free.",
      };
    case "EMA_VWAP_CROSSOVER":
      return {
        label: "Intraday Auto Stock Picker",
        badge: "⭐ 5x MIS SCALPER",
        badgeClass: "bg-emerald-600 text-white font-extrabold shadow-2xs",
        icon: TrendingUp,
        iconColor: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
        desc: "Scans 180+ F&O stocks for highest-momentum mover with 15-EMA + VWAP confirmation. Trades MIS with dynamic ₹500 target & ₹500 SL.",
        features: [
          "Auto 09:15 AM Stock Picker",
          "Strict Risk Sizing (Max 25% Capital)",
          "Structural SL below Candle Low",
          "15-EMA Live Trailing on Zerodha",
        ],
        tip: "Ideal for steady daily compounding on high-probability momentum stocks without overnight risk.",
      };
    case "GAMMA_BLAST_EXPIRY":
      return {
        label: "Gamma Blast (CAS Expiry)",
        badge: "⚡ 01:30 PM EXPIRY",
        badgeClass: "bg-amber-600 text-white font-extrabold shadow-2xs",
        icon: Zap,
        iconColor: "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20",
        desc: "Trades explosive 01:30 PM – 03:25 PM Gamma spikes on NIFTY (Tue) & SENSEX (Thu). Buys cheap ₹8–₹15 options with Live OI confirmation.",
        features: [
          "NIFTY (Tue) & SENSEX (Thu)",
          "Cheap ₹8–₹15 Strike Hunter",
          "Zero-Latency Ratchet Trailing",
          "15:05 Sharp Auto Square-Off",
        ],
        tip: "Designed to capture 2x–5x explosive expiry afternoon gamma spikes with capped risk.",
      };
    case "NIFTY_OPTIONS_SCALPER":
      return {
        label: "Nifty Options Scalper",
        badge: "RAPID SCALPER",
        badgeClass: "bg-purple-600 text-white font-extrabold shadow-2xs",
        icon: Target,
        iconColor: "text-purple-600 dark:text-purple-400 bg-purple-500/10 border-purple-500/20",
        desc: "Captures rapid Nifty impulses using 3 confluence triggers. Auto-sizes lots dynamically from live Zerodha margin and arms exchange SL.",
        features: [
          "Dynamic Margin Lots",
          "Exchange Server SL Armed",
          "Breakeven Trail at +5 pts",
          "Two-Loss Circuit Breaker",
        ],
        tip: "Strict 1-Win or 2-Losses rule prevents overtrading and locks in disciplined scalping profits.",
      };
    case "BREAKOUT_15MIN":
      return {
        label: "15-Min Breakout",
        badge: "OPENING RANGE",
        badgeClass: "bg-cyan-600 text-white font-extrabold shadow-2xs",
        icon: BarChart2,
        iconColor: "text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
        desc: "Trades 15-Min Opening Range Breakouts & Breakdowns with false-breakout trap reversal and server SL-L at Zerodha.",
        features: [
          "False Breakout Trap Reversal",
          "Server SL-L Placed on Kite",
          "Early Breakeven at +0.7R",
          "1-Loss & Done Shield",
        ],
        tip: "Captures strong morning trends while protecting capital against sudden mean-reversion chop.",
      };
    default:
      return {
        label: "Custom Algo Strategy",
        badge: "CONFIGURING",
        badgeClass: "bg-secondary text-foreground font-bold",
        icon: Sparkles,
        iconColor: "text-primary bg-primary/10 border border-primary/20",
        desc: "Select a strategy algorithm below to automatically load institutional risk and execution parameters.",
        features: [
          "Choose strategy type on Step 1",
          "Configures automated entry & exit",
          "Applies server-side risk protection",
        ],
        tip: "Select a strategy algorithm on Step 1 to load pre-configured institutional parameters.",
      };
  }
};

export default function NewStrategyPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [brokers, setBrokers] = useState<BrokerAccount[]>([]);

  const [form, setForm] = useState<StrategyFormState>({
    name: "",
    type: "",
    symbol: "NIFTY 50",
    exchange: "NSE",
    instrumentType: "INDEX",
    lots: "1",
    product: "MIS",
    stopLossRs: "500",
    targetRs: "500",
    exitExactAtTarget: false,
    maxTradesPerDay: "2",
    minPremium: "100",
    maxPremium: "300",
    enableProfitFloor: true,
    profitFloorBufferRs: "100",
    emaPeriod: "15",
    vwapSource: "close",
    isOptionBuyingOnly: true,
    emaFast: "9",
    emaSlow: "21",
    rsiPeriod: "14",
    rsiEntryMin: "45",
    rsiEntryMax: "65",
    optionLots: "1",
    targetPct: "45",
    slPct: "25",
    startAfterMin: "25",
    dsCapital: "20000",
    dsDailyTargetRs: "500",
    dsDailyMaxLossRs: "800",
    dsTargetPoints: "10",
    dsStopLossPoints: "6",
    dsMaxTradesPerDay: "2",
    dsTrailCostAtPoints: "5",
    dsMaxLossesPerDay: "2",
    dsEnablePartialBooking: false,
    dsPartialBookingPct: "50",
    dsEnableMiddayChopFilter: true,
    dsEnableVolumeSurge: false,
    dsEnableTrendBiasFilter: true,
    dsEnableMacroDayBias: false,
    dsEntryCutoffTime: "14:45",
    dsTimeframe: "5minute",
    sTimeframe: "15min",
    sEmaPeriod: "15",
    sRiskRewardRatio: "2",
    sMaxCapital: "25000",
    sTriggerOffset: "0.50",
    sProtectionBufferPct: "10",
    sDirectionBias: "BOTH",
    sSetupType: "BOTH",
    sMoneyness: "ITM",
    sIsAutoStockSelect: true,
    sMinRvol: "1.25",
    sEnableMarketTrendFilter: true,
    sEnableMiddayChopFilter: true,
    sEnablePartialBooking: true,
    sPartialBookingPct: "50",
    sMaxStagnantTimeMin: "25",
    sMaxWinsPerDay: "1",
    sMaxLossesPerDay: "1",
    sEnableHtfFilter: true,
    sEnableTrailingSl: true,
    sTarget1RR: "1.5",
    sTarget2RR: "3.0",
    sEnableDynamicSizing: true,
    b15EnableDynamicAtr: true,
    b15RiskRewardRatio: "2.0",
    b15EnableFakeoutReversal: true,
    b15EnableVwapFilter: true,
    b15EnableBreakevenTrail: true,
    b15Moneyness: "ITM",
    b15UseStructuralCandleSl: true,
    b15MaxOpeningRangePts: "300",
    b15PrimeWindowEndTime: "15:00",
    b15EnableRsiFilter: true,
    b15BreakevenTriggerR: "0.7",
    b15EnableTrapReversal: true,
    b15EnableRetestConfirmation: true,
    b15EnableCprFilter: true,
    b15CprNarrowThresholdPct: "0.18",
    b15TrapSlBufferPts: "10",
    b15EntryTimeframe: "3min",
    b15EnableEmaVwapTrailing: true,
    b15TrailingEmaPeriod: "9",
    b15TrailingVwapSource: "both",
    b15MaxLossesPerDay: "1",
    b15EnableMiddayChopFilter: true,
    b15MiddayDeadZoneStart: "11:45",
    b15MiddayDeadZoneEnd: "13:00",
    b15EnablePartialBooking: true,
    b15PartialBookingPct: "50",
    b15PartialBookingR: "1.8",
    b15EnableCprSupportResistance: true,
    gbIndex: "AUTO",
    gbMinPremiumNifty: "8",
    gbMaxPremiumNifty: "15",
    gbMinPremiumSensex: "12",
    gbMaxPremiumSensex: "25",
    gbStartTime: "13:00",
    gbEndTime: "15:25",
    gbEnableOiFilter: true,
    gbEnableVolumeSurge: true,
    gbEnableRatchetTrailing: true,
    gbEnableHighConvictionBoost: true,
    gbMaxConvictionLots: "3",
    gbEnablePartialProfitBooking: true,
    gbInitialSlPct: "50",
    brokerAccountId: "",
    isPaperTrade: true,
  });

  const set = (k: keyof StrategyFormState, v: any) => {
    setForm((f) => ({ ...f, [k]: v }));
  };

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
      if (form.type === "GAMMA_BLAST_EXPIRY" || form.type === "NIFTY_OPTIONS_SCALPER") return true;
      if (form.type === "BREAKOUT_15MIN" || form.type === "EMA_VWAP_CROSSOVER" || form.type === "EMA_RSI_OPTIONS") {
        return Number(form.stopLossRs) > 0 && Number(form.targetRs) > 0;
      }
      if (form.type === "STOCK_OPTIONS_BUYING") {
        return Number(form.sMaxCapital) > 0 && Number(form.sRiskRewardRatio) > 0;
      }
      return true;
    }
    return form.isPaperTrade || !!form.brokerAccountId;
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const lotSize = form.lotSize || getLotSize(form.symbol, form.lotSize);
      const qty = Number(form.lots || 1) * lotSize;

      let config: any;
      if (form.type === "GAMMA_BLAST_EXPIRY") {
        config = {
          symbol: form.symbol.trim() === "SENSEX" ? "SENSEX" : (form.symbol.trim() === "AUTO" ? "AUTO" : "NIFTY"),
          exchange: form.symbol.trim() === "SENSEX" ? "BFO" : "NFO",
          lots: Number(form.lots || 1),
          product: form.product || "NRML",
          maxTradesPerDay: Number(form.maxTradesPerDay || 2),
          maxWinsPerDay: 1,
          autoSelectStrike: true,
          startTime: form.gbStartTime || "13:00",
          endTime: form.gbEndTime || "15:25",
          enableOiFilter: form.gbEnableOiFilter,
          enableVolumeSurge: form.gbEnableVolumeSurge,
          enableRatchetTrailing: form.gbEnableRatchetTrailing,
          enableHighConvictionBoost: form.gbEnableHighConvictionBoost,
          maxConvictionLots: Number(form.gbMaxConvictionLots || 3),
          enablePartialProfitBooking: form.gbEnablePartialProfitBooking,
          initialSlPct: Number(form.gbInitialSlPct || 50),
          targetRs: Number(form.targetRs || 1500),
          stopLossRs: Number(form.stopLossRs || 500),
        };
      } else if (form.type === "NIFTY_OPTIONS_SCALPER") {
        config = {
          symbol: form.symbol.trim(),
          exchange: form.exchange,
          lots: Number(form.lots),
          qty,
          product: form.product,
          emaPeriod: 15,
          isOptionBuyingOnly: true,
          targetPoints: Number(form.dsTargetPoints || 10),
          stopLossPoints: Number(form.dsStopLossPoints || 7),
          trailCostAtPoints: Number(form.dsTrailCostAtPoints || 6),
          stopLossRs: Number(form.dsStopLossPoints || 7) * qty,
          targetRs: Number(form.dsTargetPoints || 10) * qty,
          maxTradesPerDay: Number(form.maxTradesPerDay || 2),
          maxWinsPerDay: 1,
          maxLossesPerDay: Number(form.dsMaxLossesPerDay || 2),
          enablePartialBooking: form.dsEnablePartialBooking !== false,
          partialBookingPct: Number(form.dsPartialBookingPct || 50),
          enableMiddayChopFilter: form.dsEnableMiddayChopFilter !== false,
          middayDeadZoneStart: "12:15",
          middayDeadZoneEnd: "13:15",
          enableVolumeSurge: form.dsEnableVolumeSurge !== false,
          enableTrendBiasFilter: form.dsEnableTrendBiasFilter !== false,
          enableMacroDayBias: form.dsEnableMacroDayBias !== false,
          entryCutoffTime: form.dsEntryCutoffTime || "14:15",
          timeframe: form.dsTimeframe || "5minute",
          enableOrbTrigger: false,
          enablePullbackTrigger: true,
          enableRsiFilter: false,
          enableRangeFilter: true,
          enableStagnancyExit: true,
          moneyness: "ITM",
          enableAutoHybrid: form.symbol.toUpperCase().includes("HYBRID"),
          enableDynamicSizing: form.dsEnableDynamicSizing !== false,
          maxCapital: form.dsMaxCapital ? Number(form.dsMaxCapital) : undefined,
          maxLots: form.dsMaxLots ? Number(form.dsMaxLots) : 25,
        };
      } else if (form.type === "STOCK_OPTIONS_BUYING") {
        const isAuto = form.sIsAutoStockSelect || form.symbol === "AUTO";
        config = {
          symbol: isAuto ? "AUTO" : form.symbol.trim(),
          exchange: "NSE",
          timeframe: form.sTimeframe,
          isAutoStockSelect: isAuto,
          emaPeriod: Number(form.sEmaPeriod),
          riskRewardRatio: Number(form.sRiskRewardRatio),
          maxCapital: Number(form.sMaxCapital),
          lots: Number(form.lots),
          lotSize,
          qty,
          maxTradesPerDay: Number(form.maxTradesPerDay),
          product: form.product,
          startAfterMin: Number(form.startAfterMin),
          triggerOffset: Number(form.sTriggerOffset),
          protectionBufferPct: Number(form.sProtectionBufferPct),
          directionBias: form.sDirectionBias,
          setupType: form.sSetupType,
          moneyness: form.sMoneyness,
          minRvol: Number(form.sMinRvol || 1.25),
          enableMarketTrendFilter: form.sEnableMarketTrendFilter !== false,
          enableMiddayChopFilter: form.sEnableMiddayChopFilter !== false,
          middayDeadZoneStart: "11:30",
          middayDeadZoneEnd: "13:00",
          enablePartialBooking: form.sEnablePartialBooking !== false,
          partialBookingPct: Number(form.sPartialBookingPct || 50),
          maxStagnantTimeMin: Number(form.sMaxStagnantTimeMin || 25),
          maxWinsPerDay: Number(form.sMaxWinsPerDay || 1),
          maxLossesPerDay: Number(form.sMaxLossesPerDay || 1),
          enableHtfFilter: form.sEnableHtfFilter !== false,
          enableTrailingSl: form.sEnableTrailingSl !== false,
          target1RR: Number(form.sTarget1RR || 1.5),
          target2RR: Number(form.sTarget2RR || 3.0),
          enableDynamicSizing: form.sEnableDynamicSizing !== false,
        };
      } else if (form.type === "BREAKOUT_15MIN") {
        config = {
          symbol: form.symbol.trim(),
          exchange: form.exchange,
          instrumentType: form.instrumentType,
          qty,
          lots: Number(form.lots),
          product: form.product,
          stopLossRs: Number(form.stopLossRs),
          targetRs: Number(form.targetRs),
          exitExactAtTarget: !!form.exitExactAtTarget,
          maxTradesPerDay: Number(form.maxTradesPerDay),
          enableDynamicAtr: form.b15EnableDynamicAtr,
          riskRewardRatio: Number(form.b15RiskRewardRatio),
          enableFakeoutReversal: form.b15EnableFakeoutReversal,
          enableVwapFilter: form.b15EnableVwapFilter,
          enableBreakevenTrail: form.b15EnableBreakevenTrail,
          moneyness: form.b15Moneyness,
          useStructuralCandleSl: form.b15UseStructuralCandleSl,
          maxOpeningRangePts: Number(form.b15MaxOpeningRangePts || 300),
          primeWindowEndTime: form.b15PrimeWindowEndTime || "15:00",
          enableRsiFilter: form.b15EnableRsiFilter,
          breakevenTriggerR: Number(form.b15BreakevenTriggerR || 0.7),
          enableTrapReversal: form.b15EnableTrapReversal,
          enableRetestConfirmation: form.b15EnableRetestConfirmation,
          enableCprFilter: form.b15EnableCprFilter,
          cprNarrowThresholdPct: Number(form.b15CprNarrowThresholdPct || 0.18),
          trapSlBufferPts: Number(form.b15TrapSlBufferPts || 10),
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
            minPremium: Number(form.minPremium),
            maxPremium: Number(form.maxPremium),
          }),
        };
      } else {
        config = {
          symbol: form.symbol.trim(),
          exchange: form.exchange,
          instrumentType: form.instrumentType,
          emaPeriod: Number(form.emaPeriod),
          vwapSource: form.vwapSource || 'close',
          isOptionBuyingOnly: form.isOptionBuyingOnly,
          qty,
          lots: Number(form.lots),
          product: form.product,
          stopLossRs: Number(form.stopLossRs),
          targetRs: Number(form.targetRs),
          exitExactAtTarget: !!form.exitExactAtTarget,
          maxTradesPerDay: Number(form.maxTradesPerDay),
          enableProfitFloor: form.enableProfitFloor,
          profitFloorBufferRs: Number(form.profitFloorBufferRs || 100),
          ...(form.isOptionBuyingOnly && {
            minPremium: Number(form.minPremium),
            maxPremium: Number(form.maxPremium),
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
      toast.error(err?.response?.data?.message ?? "Failed to create strategy");
    } finally {
      setSubmitting(false);
    }
  };

  const meta = getStrategyMeta(form.type);
  const MetaIcon = meta.icon;

  return (
    <div className="w-full space-y-6 pb-16 animate-[fade-up_0.4s_ease_both]">
      {/* ─── Top Command Header ─── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/50 pb-5">
        <div className="flex items-center gap-3">
          <Link href="/strategies">
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 rounded-xl border-border/80 bg-card hover:bg-accent/60 shadow-2xs shrink-0"
              title="Return to Strategies"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-black tracking-tight text-foreground">Create Strategy</h1>
              <Badge variant="secondary" className="text-[10px] font-bold px-2 py-0.5 uppercase tracking-wider bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20">
                Step {step + 1} of {STEPS.length}
              </Badge>
              <Badge variant="outline" className="text-[10px] font-semibold text-muted-foreground hidden md:inline-flex">
                DEPLOYMENT WIZARD
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Build, calibrate, and deploy institutional-grade algorithmic strategies in 4 simple steps
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 self-stretch sm:self-auto justify-end">
          <Link href="/strategies">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground hover:text-foreground h-9 px-3"
            >
              Cancel &amp; Exit
            </Button>
          </Link>
        </div>
      </div>

      {/* ─── Full-Width Stepper Ribbon ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {STEPS.map((s, i) => {
          const isDone = i < step;
          const isCurrent = i === step;

          return (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                if (i < step) setStep(i);
              }}
              disabled={i > step}
              className={cn(
                "relative rounded-2xl border p-3.5 text-left transition-all duration-200 overflow-hidden flex items-center justify-between gap-3 bg-card",
                isCurrent
                  ? "border-blue-500/50 shadow-xs ring-1 ring-blue-500/20"
                  : isDone
                    ? "border-border/70 hover:border-border cursor-pointer shadow-2xs"
                    : "border-border/40 opacity-50 cursor-not-allowed"
              )}
            >
              {isCurrent && (
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-600 via-indigo-500 to-cyan-400" />
              )}
              {isDone && (
                <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />
              )}

              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={cn(
                    "h-8 w-8 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 transition-all",
                    isDone && "bg-emerald-500/15 text-emerald-600 border border-emerald-500/30",
                    isCurrent && "bg-blue-600 text-white shadow-2xs shadow-blue-600/30",
                    !isDone && !isCurrent && "bg-secondary text-muted-foreground border border-border/50"
                  )}
                >
                  {isDone ? <Check className="h-4 w-4 stroke-[3]" /> : i + 1}
                </div>
                <div className="min-w-0">
                  <p
                    className={cn(
                      "text-xs font-bold truncate leading-tight",
                      isCurrent ? "text-foreground" : isDone ? "text-foreground/90" : "text-muted-foreground"
                    )}
                  >
                    {s.title}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate hidden sm:block mt-0.5">
                    {s.subtitle}
                  </p>
                </div>
              </div>

              <span
                className={cn(
                  "text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded shrink-0",
                  isCurrent
                    ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                    : isDone
                      ? "bg-emerald-500/10 text-emerald-600"
                      : "text-muted-foreground/50"
                )}
              >
                {isDone ? "Done" : isCurrent ? "Active" : `Step ${i + 1}`}
              </span>
            </button>
          );
        })}
      </div>

      {/* ─── Main Grid: Left Wizard Step (8 Cols) + Right Blueprint Inspector (4 Cols) ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Active Wizard Step Card & Nav Buttons */}
        <div className="lg:col-span-8 xl:col-span-8 2xl:col-span-9 space-y-6">
          <Card className="relative rounded-2xl overflow-hidden border border-border/70 bg-card p-5 sm:p-6 shadow-xs space-y-6">
            {step === 0 && <Step1StrategyType form={form} set={set} />}
            {step === 1 && <Step2InstrumentConfig form={form} set={set} />}
            {step === 2 && <Step3RiskManagement form={form} set={set} />}
            {step === 3 && <Step4BrokerReview form={form} set={set} brokers={brokers} />}

            {/* Bottom Navigation Controls inside card */}
            <div className="flex items-center justify-between pt-4 border-t border-border/50">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                disabled={step === 0 || submitting}
                className="h-9.5 px-4 rounded-xl border-border/70 bg-card hover:bg-accent font-semibold text-xs transition-all"
              >
                <ChevronLeft className="h-4 w-4 mr-1" /> Previous Step
              </Button>

              <div className="flex items-center gap-2.5">
                {step < STEPS.length - 1 ? (
                  <Button
                    type="button"
                    onClick={() => setStep((s) => s + 1)}
                    disabled={!canNext()}
                    className="h-9.5 px-5 rounded-xl font-bold text-xs bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/20 transition-all flex items-center gap-1.5"
                  >
                    Continue to {STEPS[step + 1].title} <ChevronRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting || !canNext()}
                    className="h-9.5 px-6 rounded-xl font-extrabold text-xs bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-md shadow-emerald-600/25 transition-all flex items-center gap-2"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Creating Strategy...
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4 stroke-[3]" />
                        Create &amp; Deploy Strategy
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </Card>
        </div>

        {/* Right: Live Strategy Specification & Blueprint Inspector (Sticky) */}
        <div className="lg:col-span-4 xl:col-span-4 2xl:col-span-3 space-y-4 lg:sticky lg:top-6">
          <Card className="relative rounded-2xl overflow-hidden border border-border/70 bg-card p-4 sm:p-5 shadow-xs space-y-4">
            {/* Top Ambient Accent Bar */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-600 via-indigo-500 to-cyan-400" />

            {/* Top Header */}
            <div className="flex items-center justify-between border-b border-border/50 pb-3 pt-0.5">
              <div className="flex items-center gap-2">
                <div className={cn("p-1.5 rounded-lg shrink-0", meta.iconColor)}>
                  <MetaIcon className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-foreground">
                    Live Configuration
                  </h3>
                  <p className="text-[10px] text-muted-foreground">{meta.label}</p>
                </div>
              </div>
              <Badge className={cn("text-[9px] font-extrabold px-2 py-0 uppercase shadow-2xs", meta.badgeClass)}>
                {meta.badge}
              </Badge>
            </div>

            {/* Strategy Title & Description */}
            <div>
              <p className="text-xs font-bold text-foreground leading-tight truncate">
                {form.name || "Untitled Strategy"}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                {meta.desc}
              </p>
            </div>

            {/* 3-Box Matrix (EXACTLY MATCHING StrategyCard in strategies/page.tsx!) */}
            <div className="grid grid-cols-3 gap-2">
              <div className="p-2 rounded-xl bg-secondary/40 border border-border/50 text-center flex flex-col justify-center">
                <span className="text-[10px] font-medium text-muted-foreground">Sizing</span>
                <span className="text-xs font-bold text-foreground truncate mt-0.5">
                  {form.type === "STOCK_OPTIONS_BUYING"
                    ? `₹${Number(form.sMaxCapital || 25000).toLocaleString("en-IN")}`
                    : `${form.lots || 1} Lot`}
                </span>
              </div>

              <div className="p-2 rounded-xl bg-rose-500/5 border border-rose-500/20 text-center flex flex-col justify-center">
                <span className="text-[10px] font-medium text-rose-500/80">Stop Loss</span>
                <span className="text-xs font-bold text-rose-600 mt-0.5 truncate">
                  {form.type === "STOCK_OPTIONS_BUYING"
                    ? "Breakeven Trail"
                    : form.type === "NIFTY_OPTIONS_SCALPER"
                      ? "-7 Pts (Server SL)"
                      : `₹${form.stopLossRs || 500}`}
                </span>
              </div>

              <div className="p-2 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-center flex flex-col justify-center">
                <span className="text-[10px] font-medium text-emerald-600/80">Target</span>
                <span className="text-xs font-bold text-emerald-600 mt-0.5 truncate">
                  {form.type === "STOCK_OPTIONS_BUYING"
                    ? "T1 (+50%) / T2"
                    : form.type === "NIFTY_OPTIONS_SCALPER"
                      ? "+10 Pts"
                      : `₹${form.targetRs || 500}`}
                </span>
              </div>
            </div>

            {/* Execution & Asset Status Ribbon */}
            <div className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded-lg bg-secondary/30 border border-border/40">
              <div className="flex items-center gap-1.5 text-muted-foreground text-[11px]">
                <Activity className="h-3 w-3 text-muted-foreground/70" />
                <span>Mode:</span>
                <span
                  className={cn(
                    "font-bold uppercase text-[10px] px-1.5 py-0.2 rounded",
                    form.isPaperTrade
                      ? "bg-amber-500/10 text-amber-600"
                      : "bg-emerald-500/10 text-emerald-600"
                  )}
                >
                  {form.isPaperTrade ? "Paper Trade" : "Live Broker"}
                </span>
              </div>
              <span className="text-[10px] font-bold text-foreground">
                {form.symbol === "AUTO" || form.sIsAutoStockSelect
                  ? "180+ F&O Auto"
                  : form.symbol || "AUTO"}
              </span>
            </div>

            {/* Guardrails checklist */}
            <div className="space-y-1.5 pt-1 border-t border-border/40">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Built-In Guardrails
              </p>
              {meta.features.map((feat: string, idx: number) => (
                <div key={idx} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                  <span className="truncate">{feat}</span>
                </div>
              ))}
            </div>

            {/* Pre-Flight Checklist */}
            <div className="space-y-2 pt-1 border-t border-border/40">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Pre-Flight Readiness
              </p>
              <div className="space-y-1 text-xs">
                {[
                  { label: "Algorithm Selected", ready: !!form.type },
                  { label: "Instrument & Sizing", ready: !!form.symbol && Number(form.lots) > 0 },
                  { label: "Risk Guards Defined", ready: Number(form.stopLossRs || form.sMaxCapital || form.dsStopLossPoints) > 0 },
                  { label: "Broker Verification", ready: form.isPaperTrade || !!form.brokerAccountId },
                ].map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between text-[11px] py-1">
                    <span className="flex items-center gap-1.5">
                      {item.ready ? (
                        <Check className="h-3.5 w-3.5 text-emerald-500 stroke-[3]" />
                      ) : (
                        <span className="h-2 w-2 rounded-full bg-muted-foreground/30 inline-block" />
                      )}
                      <span className={cn(item.ready ? "text-foreground font-medium" : "text-muted-foreground")}>
                        {item.label}
                      </span>
                    </span>
                    <span className={cn("text-[9px] font-bold uppercase", item.ready ? "text-emerald-600" : "text-muted-foreground/60")}>
                      {item.ready ? "Ready" : "Pending"}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Trading Edge Note */}
            <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/20 text-blue-700 dark:text-blue-300 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-bold">
                <Sparkles className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                <span>Trading Edge</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {meta.tip}
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
