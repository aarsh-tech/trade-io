export interface StrategyFormState {
  name: string;
  type: "BREAKOUT_15MIN" | "EMA_VWAP_CROSSOVER" | "EMA_VWAP_OPTIONS" | "STOCKS_IN_PLAY" | "EMA_RSI_OPTIONS" | "DAILY_SCALPER" | "STOCK_OPTIONS_BUYING" | "NIFTY_OPTIONS_SCALPER" | "GAMMA_BLAST_EXPIRY" | "";
  // Common
  symbol: string;
  exchange: string;
  instrumentType: "INDEX" | "STOCK" | "OPTION" | "FUTURE";
  lots: string;
  product: "MIS" | "NRML";
  stopLossRs: string;
  targetRs: string;
  exitExactAtTarget?: boolean;
  /** EMA-VWAP stock exits: FULL = one volatility target | PARTIAL = book half at the target, rest trails | QUICK = book half at ~0.5R, rest trails | EMA = no target, all of it trails */
  targetMode?: "FULL" | "PARTIAL" | "QUICK" | "EMA";
  /** EMA-VWAP stocks: close a trade still within 0.25% of entry after this many minutes ("0" = off, default "35"). */
  stagnationMinutes?: string;
  /** EMA-VWAP stocks: widest structural stop-loss, % of entry (default "2.2"). */
  maxStopPct?: string;
  /** EMA-VWAP stocks, EMA target mode: at +1.5R move the stop to +0.5R, at +3R to +2R (default on). */
  profitLock?: boolean;
  /** EMA-VWAP stocks: require a volume spike on the signal candle, judged against the stock's own history. */
  volumeFilter?: boolean;
  volumeStrictness?: "RELAXED" | "BALANCED" | "STRICT";
  maxTradesPerDay: string;
  minPremium: string;
  maxPremium: string;
  enableProfitFloor: boolean;
  profitFloorBufferRs: string;
  // EMA-VWAP crossover
  emaPeriod: string;
  vwapSource: "close" | "hlc3";
  /** EMA-VWAP stocks: candles that find entries. 1min starts at 09:16; the stop-loss and trend exit stay on 5m. */
  entryTimeframe?: "1min" | "5min";
  /** EMA-VWAP stocks, AUTO mode: top-ranked stocks checked for a setup on every scan (1-25, default 20). */
  scanDepth?: string;
  isOptionBuyingOnly: boolean;
  // EMA-VWAP Options (NIFTY / BANKNIFTY / SENSEX; `symbol` holds the index, `stopLossRs` the max loss per trade)
  evoMaxLots: string;
  evoSlBufferPct: string;
  evoMinSlBufferRs: string;
  evoPartialTargetR: string;
  /** EMA: whole position exits on a 5m close below the option's 15-EMA. PARTIAL: half at evoPartialTargetR first. */
  evoTargetMode: "EMA" | "PARTIAL";
  /** Also trade inside candles; off = EMA/VWAP crossover only. */
  evoInsideCandle: boolean;
  /** Crossover candle volume vs the previous 10 candles' average (0 = off). */
  evoMinVolumeMultiple: string;
  evoUseSameDayExpiry: boolean;
  evoEntryCutoffTime: string;
  // Stocks-in-Play ORB (`stopLossRs` = max loss per trade, `maxTradesPerDay` = max positions)
  sipMinRvol: string;
  sipStopAtr: string;
  sipMinAvgValueCr: string;
  sipAllowLongs: boolean;
  sipLeverage: string;
  sipMaxCapital: string;
  sipEntryCutoffTime: string;
  // EMA-RSI Options
  emaFast: string;
  emaSlow: string;
  rsiPeriod: string;
  rsiEntryMin: string;
  rsiEntryMax: string;
  optionLots: string;
  targetPct: string;
  slPct: string;
  startAfterMin: string;
  // Daily Scalper & Nifty Options Scalper
  dsCapital: string;
  dsDailyTargetRs: string;
  dsDailyMaxLossRs: string;
  dsTargetPoints: string;
  dsStopLossPoints: string;
  dsMaxTradesPerDay: string;
  dsTrailCostAtPoints?: string;
  dsMaxLossesPerDay?: string;
  dsEnablePartialBooking?: boolean;
  dsPartialBookingPct?: string;
  dsEnableVolumeSurge?: boolean;
  dsEnableTrendBiasFilter?: boolean;
  dsEnableMacroDayBias?: boolean;
  dsTimeframe?: "3minute" | "5minute";
  dsEnableDynamicSizing?: boolean;
  dsMaxCapital?: string;
  dsMaxLots?: string;
  dsEnableTrapSniper?: boolean;
  dsTrapSweepBufferPts?: string;
  dsEnablePcrConfluence?: boolean;
  // Stock Options Buying
  sTimeframe: string;
  sEmaPeriod: string;
  sRiskRewardRatio: string;
  sMaxCapital: string;
  sTriggerOffset: string;
  sProtectionBufferPct: string;
  sDirectionBias: "BOTH" | "CALL_ONLY" | "PUT_ONLY";
  sSetupType: "INSIDE_CANDLE" | "PULLBACK_REJECTION" | "BOTH";
  sMoneyness: "ITM" | "ATM";
  sIsAutoStockSelect: boolean;
  sMinRvol: string;
  sEnableMarketTrendFilter: boolean;
  sEnableMiddayChopFilter: boolean;
  sEnablePartialBooking: boolean;
  sPartialBookingPct: string;
  sMaxStagnantTimeMin: string;
  sMaxWinsPerDay: string;
  sMaxLossesPerDay: string;
  sEnableHtfFilter: boolean;
  sEnableTrailingSl: boolean;
  sTarget1RR: string;
  sTarget2RR: string;
  sEnableDynamicSizing: boolean;
  // Breakout 15-Min Dynamic Upgrades
  b15EnableDynamicAtr: boolean;
  b15RiskRewardRatio: string;
  b15EnableFakeoutReversal: boolean;
  b15EnableVwapFilter: boolean;
  b15EnableBreakevenTrail: boolean;
  b15Moneyness: "ITM" | "ATM";
  b15UseStructuralCandleSl: boolean;
  b15MaxOpeningRangePts: string;
  b15PrimeWindowEndTime: string;
  b15EnableRsiFilter: boolean;
  b15BreakevenTriggerR: string;
  b15EnableTrapReversal: boolean;
  b15EnableRetestConfirmation: boolean;
  b15EnableCprFilter: boolean;
  b15CprNarrowThresholdPct: string;
  b15TrapSlBufferPts: string;
  b15EntryTimeframe: "1min" | "3min" | "5min";
  b15EnableEmaVwapTrailing: boolean;
  b15TrailingEmaPeriod: string;
  b15TrailingVwapSource: "both" | "ema" | "vwap";
  b15MaxLossesPerDay: string;
  b15EnableMiddayChopFilter: boolean;
  b15MiddayDeadZoneStart: string;
  b15MiddayDeadZoneEnd: string;
  b15EnablePartialBooking: boolean;
  b15PartialBookingPct: string;
  b15PartialBookingR: string;
  b15EnableCprSupportResistance: boolean;
  // Daily Index Scalper (SENSEX & NIFTY)
  gbIndex: "AUTO" | "NIFTY" | "SENSEX";
  gbTradingMode?: "FULL_DAY" | "AFTERNOON_ONLY";
  gbEnableOrbMorningTrigger?: boolean;
  gbEnableMiddayBreakout?: boolean;
  gbMinPremiumNifty: string;
  gbMaxPremiumNifty: string;
  gbMinPremiumSensex: string;
  gbMaxPremiumSensex: string;
  gbStartTime: string;
  gbEndTime: string;
  gbEnableOiFilter: boolean;
  gbEnableVolumeSurge: boolean;
  gbEnableRatchetTrailing: boolean;
  gbEnableHighConvictionBoost: boolean;
  gbMaxConvictionLots: string;
  gbEnablePartialProfitBooking: boolean;
  gbInitialSlPct: string;
  // Broker
  brokerAccountId: string;
  isPaperTrade: boolean;
  lotSize?: number;
}

export interface BrokerAccount {
  id: string;
  broker: string;
  clientId: string | null;
  isActive: boolean;
  tokenExpiry: string | null;
}

export const LOT_SIZES: Record<string, number> = {
  "NIFTY": 65,
  "BANKNIFTY": 30,
  "SENSEX": 20,
  "FINNIFTY": 60,
  "MIDCPNIFTY": 120,
};

export function getLotSize(symbol: string, dynamicLot?: number) {
  if (dynamicLot && dynamicLot > 0) return dynamicLot;
  const s = (symbol || "").toUpperCase().trim();
  if (s.includes("HYBRID")) return 65;
  if (s.includes("BANKNIFTY")) return 30;
  if (s.includes("NIFTY")) return 65;
  if (s.includes("SENSEX")) return 20;
  if (s.includes("FINNIFTY")) return 60;
  if (s.includes("MIDCPNIFTY")) return 120;
  return LOT_SIZES[s] || 1;
}
