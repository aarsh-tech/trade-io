"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronRight, ChevronLeft, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { strategyApi, brokerApi } from "@/lib/api";
import { StrategyFormState, BrokerAccount, getLotSize } from "./types";
import { Step1StrategyType } from "./components/Step1StrategyType";
import { Step2InstrumentConfig } from "./components/Step2InstrumentConfig";
import { Step3RiskManagement } from "./components/Step3RiskManagement";
import { Step4BrokerReview } from "./components/Step4BrokerReview";

const STEPS = ["Strategy Type", "Instrument & Config", "Risk Management", "Broker & Review"];

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
    dsTargetPoints: "",
    dsStopLossPoints: "",
    dsMaxTradesPerDay: "2",
    sTimeframe: "15min",
    sEmaPeriod: "15",
    sRiskRewardRatio: "2",
    sMaxCapital: "25000",
    sTriggerOffset: "0.50",
    sProtectionBufferPct: "10",
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
      const lotSize = getLotSize(form.symbol);
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
          trailCostAtPoints: 5,
          stopLossRs: Number(form.dsStopLossPoints || 7) * qty,
          targetRs: Number(form.dsTargetPoints || 10) * qty,
          maxTradesPerDay: Number(form.maxTradesPerDay || 3),
          maxWinsPerDay: 1,
          enableOrbTrigger: true,
          enablePullbackTrigger: true,
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
          symbol: form.symbol.trim(),
          exchange: form.exchange,
          instrumentType: form.instrumentType,
          qty,
          lots: Number(form.lots),
          product: form.product,
          stopLossRs: Number(form.stopLossRs),
          targetRs: Number(form.targetRs),
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
          {step === 0 && <Step1StrategyType form={form} set={set} />}
          {step === 1 && <Step2InstrumentConfig form={form} set={set} />}
          {step === 2 && <Step3RiskManagement form={form} set={set} />}
          {step === 3 && <Step4BrokerReview form={form} set={set} brokers={brokers} />}
        </CardContent>
      </Card>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0 || submitting}
        >
          <ChevronLeft className="h-4 w-4 mr-1" /> Back
        </Button>

        {step < STEPS.length - 1 ? (
          <Button
            onClick={() => setStep((s) => s + 1)}
            disabled={!canNext()}
          >
            Next <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={submitting || !canNext()}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
          >
            {submitting ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Creating...</>
            ) : (
              <><Check className="h-4 w-4 mr-1" /> Create & Deploy Strategy</>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
