export interface StrategyFormState {
  name: string;
  type: "BREAKOUT_15MIN" | "EMA_VWAP_CROSSOVER" | "EMA_RSI_OPTIONS" | "DAILY_SCALPER" | "STOCK_OPTIONS_BUYING" | "NIFTY_OPTIONS_SCALPER" | "GAMMA_BLAST_EXPIRY" | "";
  // Common
  symbol: string;
  exchange: string;
  instrumentType: "INDEX" | "STOCK" | "OPTION" | "FUTURE";
  lots: string;
  product: "MIS" | "NRML";
  stopLossRs: string;
  targetRs: string;
  maxTradesPerDay: string;
  minPremium: string;
  maxPremium: string;
  enableProfitFloor: boolean;
  profitFloorBufferRs: string;
  // EMA-VWAP crossover
  emaPeriod: string;
  vwapSource: "close" | "hlc3";
  isOptionBuyingOnly: boolean;
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
  // Daily Scalper
  dsCapital: string;
  dsDailyTargetRs: string;
  dsDailyMaxLossRs: string;
  dsTargetPoints: string;
  dsStopLossPoints: string;
  dsMaxTradesPerDay: string;
  // Stock Options Buying
  sTimeframe: string;
  sEmaPeriod: string;
  sRiskRewardRatio: string;
  sMaxCapital: string;
  sTriggerOffset: string;
  sProtectionBufferPct: string;
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
  // Gamma Blast Expiry Special
  gbIndex: "AUTO" | "NIFTY" | "SENSEX";
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
};

export function getLotSize(symbol: string) {
  const s = symbol.toUpperCase();
  if (s.includes("BANKNIFTY")) return 30;
  if (s.includes("NIFTY")) return 65;
  if (s.includes("SENSEX")) return 20;
  for (const key in LOT_SIZES) {
    if (s.includes(key)) return LOT_SIZES[key];
  }
  return 1;
}
