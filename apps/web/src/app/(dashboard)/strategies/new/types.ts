export interface StrategyFormState {
  name: string;
  type: "BREAKOUT_15MIN" | "EMA_VWAP_CROSSOVER" | "STOCKS_IN_PLAY" | "EMA_RSI_OPTIONS" | "DAILY_SCALPER" | "";
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
  /** EMA-VWAP stocks: close a trade still within 0.25% of entry after this many minutes ("0" = off, default "0"). */
  stagnationMinutes?: string;
  /** EMA-VWAP stocks: widest structural stop-loss, % of entry (default "1.2"). */
  maxStopPct?: string;
  /** EMA-VWAP stocks: skip entries less than this % past the previous close in the trade's direction ("0" = off, default 1.5). */
  minDayMovePct?: string;
  /** EMA-VWAP stocks, EMA target mode: at +1.5R move the stop to +0.5R, at +3R to +2R (default on). */
  profitLock?: boolean;
  /** EMA-VWAP stocks, EMA target mode: once the trade is +1.5R, exit on a 5m close across the 40-EMA instead of the 15-EMA (default on). */
  slowTrail?: boolean;
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
  /** EMA-VWAP stocks, AUTO mode: setups watched at once, tracked one included; the first to trigger is entered (1-5, default 1). */
  maxArmedSetups?: string;
  isOptionBuyingOnly: boolean;
  // Stocks-in-Play (`stopLossRs` = max loss per trade, `maxTradesPerDay` = max positions)
  /** FADE = short the overbought rollover of a gap-up stock in play (09:20-09:45); ORB = break of the first candle;
   *  TREND = first 15/40 EMA crossover of the top-RVOL stock(s), with the gap. */
  sipSetup: "FADE" | "ORB" | "TREND" | "OI";
  /** TREND: stocks watched from 09:20 (highest first-candle RVOL first). */
  sipWatchCount: string;
  /** TREND: never short a gap-up stock or buy a gap-down one. */
  sipWithGapOnly: boolean;
  /** FADE: stop as % of the fill, target in multiples of the stop, stop to entry at this multiple ("0" = off). */
  sipStopPct: string;
  sipTargetR: string;
  sipBreakevenAtR: string;
  /** FADE: profit locked by that first stop move, in x stop (0 = the entry). */
  sipBreakevenLockR: string;
  /** FADE: skip when yesterday's low (short) / high (long) is closer than this, in x stop ("0" = off). */
  sipSkipNearPdlR: string;
  /** FADE: lock +0.5R at +1.5R and +1.5R at +2.5R after breakeven. */
  sipProfitLock: boolean;
  /** FADE: also trade the long mirror on gap-down stocks (trades per day then count per side). */
  sipFadeLongs: boolean;
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
