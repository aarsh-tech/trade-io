import type { StrategyFormState } from "./types";
import { getLotSize } from "./types";


/** Turns the wizard's string-typed form into the JSON config object the engines and the API expect. */
export function buildStrategyConfig(form: StrategyFormState): Record<string, any> {
  const lotSize = form.lotSize || getLotSize(form.symbol, form.lotSize);
  const qty = Number(form.lots || 1) * lotSize;

  let config: any;
  if (form.type === "STOCKS_IN_PLAY") {
    const fade = form.sipSetup === "FADE";
    const trend = form.sipSetup === "TREND";
    const oi = form.sipSetup === "OI";
    // "0" is a real choice (no target / no breakeven); only a blank field takes the backtested default.
    const orZero = (v: string, d: number) => (v === "" || !(Number(v) >= 0) ? d : Number(v));
    config = {
      symbol: "AUTO",
      exchange: "NSE",
      instrumentType: "STOCK",
      product: "MIS",
      setup: fade ? "FADE" : trend ? "TREND" : oi ? "OI" : "ORB",
      ...(trend && {
        watchCount: Number(form.sipWatchCount || 1),
        withGapOnly: form.sipWithGapOnly !== false,
      }),
      ...(fade && {
        stopPct: Number(form.sipStopPct || 1.2),
        targetR: orZero(form.sipTargetR, 3),
        breakevenAtR: orZero(form.sipBreakevenAtR, 1),
        breakevenLockR: orZero(form.sipBreakevenLockR, 0.2),
        skipNearPdlR: orZero(form.sipSkipNearPdlR, 0),
        profitLock: form.sipProfitLock !== false,
        fadeLongs: form.sipFadeLongs === true,
      }),
      // OI: 1 trade a day (the top pick), short only, fixed % stop and R target.
      ...(oi && {
        stopPct: Number(form.sipStopPct || 1),
        targetR: orZero(form.sipTargetR, 3),
      }),
      stopLossRs: Number(form.stopLossRs),
      maxPositions: oi ? 1 : Number(form.maxTradesPerDay || (fade || trend ? 1 : 2)),
      maxTradesPerDay: oi ? 1 : Number(form.maxTradesPerDay || (fade || trend ? 1 : 2)),
      minRvol: Number(form.sipMinRvol || 10),
      stopAtrFraction: Number(form.sipStopAtr || 0.2),
      minAvgValueCr: Number(form.sipMinAvgValueCr || (fade || trend ? 10 : 25)),
      minPrice: 50,
      allowShorts: true,
      allowLongs: trend || (!fade && !oi && form.sipAllowLongs === true),
      leverage: Number(form.sipLeverage || 4),
      entryCutoffTime: form.sipEntryCutoffTime || "15:00",
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
    // EMA-VWAP Crossover trades stocks only ; the switch still applies to legacy types.
    const optionMode = form.type !== "EMA_VWAP_CROSSOVER" && form.isOptionBuyingOnly;
    config = {
      symbol: form.symbol.trim(),
      exchange: form.exchange,
      instrumentType: form.instrumentType,
      emaPeriod: Number(form.emaPeriod),
      vwapSource: form.vwapSource || 'close',
      // 1m entries are equity-only; the engine keeps 5m for option mode either way.
      entryTimeframe: !optionMode && form.entryTimeframe === "1min" ? "1min" : "5min",
      ...(form.type === "EMA_VWAP_CROSSOVER" && { scanDepth: Number(form.scanDepth || 20), maxArmedSetups: Number(form.maxArmedSetups || 1), stagnationMinutes: Number(form.stagnationMinutes || 0), maxStopPct: Number(form.maxStopPct || 1.2), minDayMovePct: Number(form.minDayMovePct ?? 1.5), profitLock: form.profitLock !== false, slowTrail: form.slowTrail !== false }),
      isOptionBuyingOnly: optionMode,
      qty,
      lots: Number(form.lots),
      product: form.product,
      stopLossRs: Number(form.stopLossRs),
      targetRs: Number(form.targetRs),
      exitExactAtTarget: !!form.exitExactAtTarget,
      maxTradesPerDay: Number(form.maxTradesPerDay),
      enableProfitFloor: form.enableProfitFloor,
      // Only the stock picker lets the user pick; the legacy types sharing its engine always ran FULL.
      targetMode: form.type === "EMA_VWAP_CROSSOVER" ? form.targetMode || "EMA" : "FULL",
      // Volume confirmation (dynamic, per stock). Strictness maps to the z-score tested in the 2-year backtest.
      enableRvolVolumeFilter: form.volumeFilter !== false,
      enableDynamicVolume: true,
      minVolumeZ: form.volumeStrictness === "STRICT" ? 2 : form.volumeStrictness === "RELAXED" ? 1 : 1.5,
      minRvolFloor: 1.5,
      profitFloorBufferRs: Number(form.profitFloorBufferRs || 100),
      ...(optionMode && {
        minPremium: Number(form.minPremium),
        maxPremium: Number(form.maxPremium),
      }),
    };
  }

  return config;
}
