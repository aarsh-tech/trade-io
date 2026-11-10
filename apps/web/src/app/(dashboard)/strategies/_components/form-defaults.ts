import type { StrategyFormState } from "../new/types";
import { getLotSize } from "../new/types";

/** Every field the wizard can edit, with the values a brand-new strategy starts from. */
export function createDefaultForm(): StrategyFormState {
  return {
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
    // Intraday Stock Picker defaults = the backtested rule set (engine STOCK_PICKER_RULES); every one stays editable.
    targetMode: "EMA",
    stagnationMinutes: "0",
    maxStopPct: "1.2",
    minDayMovePct: "1.5",
    profitLock: true,
    slowTrail: true,
    volumeFilter: true,
    volumeStrictness: "BALANCED",
    maxTradesPerDay: "2",
    minPremium: "100",
    maxPremium: "300",
    enableProfitFloor: true,
    profitFloorBufferRs: "100",
    emaPeriod: "15",
    vwapSource: "close",
    entryTimeframe: "5min",
    scanDepth: "20",
    maxArmedSetups: "1",
    isOptionBuyingOnly: true,
    sipSetup: "FADE",
    sipWatchCount: "1",
    sipWithGapOnly: true,
    sipStopPct: "1.2",
    sipTargetR: "3",
    sipBreakevenAtR: "1",
    sipBreakevenLockR: "0.2",
    sipSkipNearPdlR: "0",
    sipProfitLock: true,
    sipFadeLongs: false,
    sipMinRvol: "10",
    sipStopAtr: "0.2",
    sipMinAvgValueCr: "10",
    sipAllowLongs: false,
    sipLeverage: "4",
    sipEntryCutoffTime: "15:00",
    emaFast: "9",
    emaSlow: "21",
    rsiPeriod: "14",
    rsiEntryMin: "45",
    rsiEntryMax: "65",
    optionLots: "1",
    targetPct: "45",
    slPct: "25",
    startAfterMin: "25",
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
    brokerAccountId: "",
    isPaperTrade: true,
  };
}

type Cfg = Record<string, any>;
const has = (v: unknown) => v !== undefined && v !== null && v !== "";
const str = (v: unknown, d: string | undefined) => (has(v) ? String(v) : d ?? "");
const bool = (v: unknown, d: boolean) => (v === undefined || v === null ? d : !!v);

interface StrategyLike {
  name: string;
  type: string;
  config?: Cfg | null;
  brokerAccountId?: string | null;
  isPaperTrade?: boolean;
}

/**
 * Inverse of buildStrategyConfig: turns a saved strategy back into the wizard's string-typed form.
 * Anything the saved config does not mention keeps the create-time default.
 */
export function strategyToForm(strategy: StrategyLike): StrategyFormState {
  const c: Cfg = strategy.config ?? {};
  const base = createDefaultForm();
  const type = strategy.type as StrategyFormState["type"];
  const lotSize = Number(c.lotSize) > 0 ? Number(c.lotSize) : getLotSize(c.symbol || "");
  const lots = has(c.lots) ? String(c.lots) : has(c.qty) && lotSize > 0 ? String(Math.max(1, Math.round(Number(c.qty) / lotSize))) : "1";

  const form: StrategyFormState = {
    ...base,
    name: strategy.name,
    type,
    symbol: str(c.symbol, base.symbol),
    exchange: str(c.exchange, c.symbol === "SENSEX" ? "BFO" : base.exchange),
    instrumentType: (c.instrumentType as StrategyFormState["instrumentType"]) || base.instrumentType,
    lots,
    lotSize: Number(c.lotSize) > 0 ? Number(c.lotSize) : undefined,
    product: (c.product as StrategyFormState["product"]) || base.product,
    stopLossRs: str(c.stopLossRs, base.stopLossRs),
    targetRs: str(c.targetRs, base.targetRs),
    exitExactAtTarget: !!c.exitExactAtTarget,
    // An unset value shows what the engine runs for it (the stock picker fills unset keys with the backtested rules).
    targetMode: c.targetMode === "PARTIAL" || c.targetMode === "QUICK" || c.targetMode === "EMA" || c.targetMode === "FULL" ? c.targetMode : base.targetMode,
    stagnationMinutes: str(c.stagnationMinutes, base.stagnationMinutes),
    maxStopPct: str(c.maxStopPct, base.maxStopPct),
    minDayMovePct: str(c.minDayMovePct, base.minDayMovePct),
    profitLock: c.profitLock !== false,
    slowTrail: c.slowTrail !== false,
    volumeFilter: c.enableRvolVolumeFilter !== false,
    volumeStrictness: Number(c.minVolumeZ) >= 2 ? "STRICT" : Number(c.minVolumeZ) > 0 && Number(c.minVolumeZ) <= 1.1 ? "RELAXED" : "BALANCED",
    maxTradesPerDay: str(c.maxTradesPerDay, base.maxTradesPerDay),
    minPremium: str(c.minPremium, base.minPremium),
    maxPremium: str(c.maxPremium, base.maxPremium),
    enableProfitFloor: bool(c.enableProfitFloor, true),
    profitFloorBufferRs: str(c.profitFloorBufferRs, base.profitFloorBufferRs),
    emaPeriod: str(c.emaPeriod, base.emaPeriod),
    vwapSource: c.vwapSource === "hlc3" ? "hlc3" : "close",
    entryTimeframe: type === "EMA_VWAP_CROSSOVER" && c.entryTimeframe === "1min" ? "1min" : "5min",
    scanDepth: str(c.scanDepth, base.scanDepth),
    maxArmedSetups: str(c.maxArmedSetups, base.maxArmedSetups),
    isOptionBuyingOnly: bool(c.isOptionBuyingOnly, true),
    startAfterMin: str(c.startAfterMin, base.startAfterMin),

    // Stocks-in-Play ORB (max positions live in maxPositions; the form edits them as maxTradesPerDay)
    ...(type === "STOCKS_IN_PLAY" && { maxTradesPerDay: str(c.maxPositions, base.maxTradesPerDay) }),
    // A saved Stocks-in-Play strategy without a setup is the original ORB one.
    sipSetup: c.setup === "FADE" || c.setup === "TREND" || c.setup === "OI" ? c.setup : type === "STOCKS_IN_PLAY" ? "ORB" : base.sipSetup,
    sipWatchCount: str(c.watchCount, base.sipWatchCount),
    sipWithGapOnly: c.withGapOnly !== false,
    sipStopPct: str(c.stopPct, c.setup === "OI" ? "1" : base.sipStopPct),
    sipTargetR: str(c.targetR, base.sipTargetR),
    sipBreakevenAtR: str(c.breakevenAtR, base.sipBreakevenAtR),
    sipBreakevenLockR: str(c.breakevenLockR, base.sipBreakevenLockR),
    sipSkipNearPdlR: str(c.skipNearPdlR, base.sipSkipNearPdlR),
    sipProfitLock: c.profitLock !== false,
    sipFadeLongs: c.fadeLongs === true,
    sipMinRvol: str(c.minRvol, base.sipMinRvol),
    sipStopAtr: str(c.stopAtrFraction, base.sipStopAtr),
    sipMinAvgValueCr: str(c.minAvgValueCr, type === "STOCKS_IN_PLAY" && c.setup !== "FADE" && c.setup !== "TREND" && c.setup !== "OI" ? "25" : base.sipMinAvgValueCr),
    sipAllowLongs: c.allowLongs === true,
    sipLeverage: str(c.leverage, base.sipLeverage),
    sipEntryCutoffTime: str(c.entryCutoffTime, base.sipEntryCutoffTime),

    // 15-min breakout
    b15EnableDynamicAtr: bool(c.enableDynamicAtr, true),
    b15RiskRewardRatio: str(c.riskRewardRatio, base.b15RiskRewardRatio),
    b15EnableFakeoutReversal: bool(c.enableFakeoutReversal, true),
    b15EnableVwapFilter: bool(c.enableVwapFilter, true),
    b15EnableBreakevenTrail: bool(c.enableBreakevenTrail, true),
    b15Moneyness: c.moneyness === "ATM" ? "ATM" : "ITM",
    b15UseStructuralCandleSl: bool(c.useStructuralCandleSl, true),
    b15MaxOpeningRangePts: str(c.maxOpeningRangePts, base.b15MaxOpeningRangePts),
    b15PrimeWindowEndTime: str(c.primeWindowEndTime, base.b15PrimeWindowEndTime),
    b15EnableRsiFilter: bool(c.enableRsiFilter, true),
    b15BreakevenTriggerR: str(c.breakevenTriggerR, base.b15BreakevenTriggerR),
    b15EnableTrapReversal: bool(c.enableTrapReversal, true),
    b15EnableRetestConfirmation: bool(c.enableRetestConfirmation, true),
    b15EnableCprFilter: bool(c.enableCprFilter, true),
    b15CprNarrowThresholdPct: str(c.cprNarrowThresholdPct, base.b15CprNarrowThresholdPct),
    b15TrapSlBufferPts: str(c.trapSlBufferPts, base.b15TrapSlBufferPts),
    b15EntryTimeframe: (c.entryTimeframe as StrategyFormState["b15EntryTimeframe"]) || base.b15EntryTimeframe,
    b15EnableEmaVwapTrailing: bool(c.enableEmaVwapTrailing, true),
    b15TrailingEmaPeriod: str(c.trailingEmaPeriod, base.b15TrailingEmaPeriod),
    b15TrailingVwapSource: (c.trailingVwapSource as StrategyFormState["b15TrailingVwapSource"]) || base.b15TrailingVwapSource,
    b15MaxLossesPerDay: str(c.maxLossesPerDay, base.b15MaxLossesPerDay),
    b15EnableMiddayChopFilter: bool(c.enableMiddayChopFilter, true),
    b15MiddayDeadZoneStart: str(c.middayDeadZoneStart, base.b15MiddayDeadZoneStart),
    b15MiddayDeadZoneEnd: str(c.middayDeadZoneEnd, base.b15MiddayDeadZoneEnd),
    b15EnablePartialBooking: bool(c.enablePartialBooking, true),
    b15PartialBookingPct: str(c.partialBookingPct, base.b15PartialBookingPct),
    b15PartialBookingR: str(c.partialBookingR, base.b15PartialBookingR),
    b15EnableCprSupportResistance: bool(c.enableCprSupportResistance, true),

    brokerAccountId: strategy.brokerAccountId || "",
    isPaperTrade: strategy.isPaperTrade !== false,
  };

  return form;
}
