import { IsString, IsEnum, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum StrategyTypeEnum {
  BREAKOUT_15MIN = 'BREAKOUT_15MIN',
  EMA_VWAP_CROSSOVER = 'EMA_VWAP_CROSSOVER',
  EMA_VWAP_OPTIONS = 'EMA_VWAP_OPTIONS',
  STOCKS_IN_PLAY = 'STOCKS_IN_PLAY',
  EMA_RSI_OPTIONS = 'EMA_RSI_OPTIONS',
  DAILY_SCALPER = 'DAILY_SCALPER',
  STOCK_OPTIONS_BUYING = 'STOCK_OPTIONS_BUYING',
  NIFTY_OPTIONS_SCALPER = 'NIFTY_OPTIONS_SCALPER',
  GAMMA_BLAST_EXPIRY = 'GAMMA_BLAST_EXPIRY',
  CUSTOM = 'CUSTOM',
}

// ─── Gamma Blast Expiry Config ───────────────────────────────────────────────
export interface GammaBlastExpiryConfig {
  symbol: 'AUTO' | 'NIFTY' | 'SENSEX'; // 'AUTO' detects Tuesday NIFTY / Thursday SENSEX
  exchange: 'NFO' | 'BFO' | 'NSE';
  lots: number;                        // default 1 lot
  qty?: number;                        // Resolved dynamically (65 for Nifty, 20 for Sensex)
  product: 'MIS' | 'NRML';             // default 'NRML' / 'MIS'
  maxTradesPerDay: number;             // default 2
  maxWinsPerDay?: number;              // default 1
  autoSelectStrike?: boolean;          // Auto-select explosive gamma strike with high liquidity (default: true)
  minPremiumNifty?: number;            // Optional override
  maxPremiumNifty?: number;            // Optional override
  minPremiumSensex?: number;           // Optional override
  maxPremiumSensex?: number;           // Optional override
  startTime: string;                   // default '09:20' (09:20 AM - Full Day Scalper)
  endTime: string;                     // default '15:25' (3:25 PM - Hold/Trail through closing candle)
  tradingMode?: 'FULL_DAY_SCALPER' | 'AFTERNOON_GAMMA_ONLY'; // default: 'FULL_DAY_SCALPER'
  enableOrbMorningTrigger?: boolean;   // Capture 09:20-11:30 Opening Range (ORH/ORL) momentum breakouts (default: true)
  enableMiddayBreakout?: boolean;      // Capture 11:30-13:30 compression channel breakouts (default: true)
  enableOiFilter?: boolean;            // Confirm with live Call/Put OI unwinding & PCR (default: true)
  enableVolumeSurge?: boolean;         // Require >= 2.5x volume surge on breakout (default: true)
  enableRatchetTrailing?: boolean;     // Sub-second 1.4x Cost lock, 2x +50% lock, 3x+ Peak trail (default: true)
  enablePeakTrailing?: boolean;        // High-water mark dynamic peak trailing (default: true)
  peakTrailingPct?: number;            // Peak pullback buffer % (default: 25%)
  enableEmaExit?: boolean;             // Exit when option candle closes below EMA (default: true)
  emaPeriod?: number;                  // EMA period for trend trailing (default: 15)
  costLockMultiple?: number;           // Multiplier to move SL to Cost (default: 1.4)
  profitLock2xMultiple?: number;       // Multiplier to lock +50% profit (default: 2.0)
  enableHighConvictionBoost?: boolean;// Boost lots on A+ 4/4 confluence (default: false, opt-in)
  maxConvictionLots?: number;          // Max lots to trade on A+ high-conviction setup (e.g. 3 to 5 lots, default: 3)
  enablePartialProfitBooking?: boolean;// Book 50% lots at 2.0x milestone, trailing remainder (default: true)
  initialSlPct?: number;               // Initial SL % from entry premium (default: 50%)
  stopLossRs?: number;                 // Max daily loss in INR
  targetRs?: number;                   // Target profit in INR
  stopLossPoints?: number;             // Target SL in option points (e.g. 25 pts)
  targetPoints?: number;               // Target profit in option points (e.g. 45 to 50 pts)
  costLockPoints?: number;             // Quick risk-free cost lock trigger in option points (e.g. 15 pts Sensex, 6 pts Nifty)
  exitExactAtTarget?: boolean;         // Exit immediately at exact target profit (e.g. ₹1,000) and stop loss (e.g. ₹500) without trailing
}

// ─── Breakout 15-Min Config ────────────────────────────────────────────────────
export interface Breakout15MinConfig {
  symbol: string;
  exchange: string;
  instrumentType: 'INDEX' | 'STOCK' | 'OPTION';
  qty: number;
  product: 'MIS' | 'NRML';
  stopLossRs: number;
  targetRs: number;
  exitExactAtTarget?: boolean;      // Exit immediately at exact target profit (e.g. ₹500) and stop loss (e.g. ₹500) without trailing
  maxTradesPerDay: number;
  minPremium?: number;
  maxPremium?: number;

  // Dynamic & High-Accuracy Volatility Upgrades
  enableDynamicAtr?: boolean;       // Enable live ATR(14) scaling (default: true)
  atrPeriod?: number;              // ATR calculation period (default: 14)
  atrBufferMultiplier?: number;    // Breakout buffer threshold = ATR * multiplier (default: 0.15)
  atrSlMultiplier?: number;        // Stop loss distance = ATR * multiplier (default: 1.0)
  riskRewardRatio?: number;        // Dynamic Risk:Reward target (default: 2.0)
  enableVwapFilter?: boolean;      // Confirm breakout direction with VWAP & 9/21 EMA (default: true)
  enableVolumeFilter?: boolean;    // Require volume confirmation (default: true)
  minRvol?: number;                // Relative volume threshold (default: 1.2)
  enableFakeoutReversal?: boolean; // Capitalize on failed breakouts / liquidity traps (default: true)
  enableBreakevenTrail?: boolean;  // Trail SL to cost upon reaching +0.7R profit (default: true)
  breakevenTriggerR?: number;      // R-multiple to trigger breakeven (default: 0.7)
  enableTrailingSl?: boolean;      // Dynamic candle-by-candle trailing (default: true)
  moneyness?: 'ATM' | 'ITM';       // Option strike moneyness (default: 'ITM')

  // Enterprise Dynamic Sizing, Server SL & Uncapped Trailing Upgrades
  maxCapital?: number;             // Dynamic capital allocation in INR (default: account margin or 15,000)
  lots?: number;                   // Lots for index options (default: 1)
  enableServerSl?: boolean;        // Arm server-side Stop Loss directly on Zerodha exchange (default: true)
  enableUncappedMomentum?: boolean;// Ride momentum runners past Target 1 milestone with dynamic trailing (default: true)
  enableMarketTrendFilter?: boolean;// Align stock breakouts with broader NIFTY 50 trend (default: true)
  enableDailyPnLLock?: boolean;    // Lock trading for the day upon achieving target or max loss (default: true)

  // Institutional Edge & Stop-Loss Elimination Upgrades
  useStructuralCandleSl?: boolean;  // Set SL to breakout candle extreme (45-80 pts) instead of wide 15m range (default: true)
  maxOpeningRangePts?: number;      // Skip days where 15m opening range is overstretched (>300 Bank Nifty, >120 Nifty) (default: 300)
  primeWindowEndTime?: string;      // Restrict breakout entries to morning momentum window (default: '11:30')
  enableRsiFilter?: boolean;        // Momentum trend alignment: RSI(14) > 55 for Long, < 45 for Short (default: true)

  // Dual-Edge Institutional Upgrade: Breakout Retest + Liquidity Sweep Trap Engine
  enableTrapReversal?: boolean;       // Capitalize on failed breakouts / liquidity sweep traps (Turtle Soup / 2B) (default: true)
  enableRetestConfirmation?: boolean; // Require retest bounce or follow-through before entering trend breakout (default: true)
  enableCprFilter?: boolean;          // Central Pivot Range (CPR) trend/range candidate filter (default: true)
  cprNarrowThresholdPct?: number;     // Narrow CPR threshold % for trend day eligibility (default: 0.18)
  trapSlBufferPts?: number;           // Stop loss buffer points beyond sweep extreme (default: 10)

  // Institutional Timeframe & EMA/VWAP Trailing Upgrades
  entryTimeframe?: '1min' | '3min' | '5min';   // Lower timeframe for trap/breakout entries (default: '3min')
  enableEmaVwapTrailing?: boolean;            // Ride trend dynamically along EMA & VWAP (default: true)
  trailingEmaPeriod?: number;                 // Trailing EMA period, e.g. 9 or 15 (default: 9)
  trailingVwapSource?: 'both' | 'ema' | 'vwap'; // Trailing support baseline (default: 'both')

  // Systematic Profitability & Capital Preservation Pillars
  maxLossesPerDay?: number;                   // '1 Loss & Done' shield: Halt on 1 SL hit to prevent chop drawdowns (default: 1)
  enableMiddayChopFilter?: boolean;          // Skip new entries during 11:45-13:00 European transition chop (default: true)
  middayDeadZoneStart?: string;              // Dead zone start time IST (default: '11:45')
  middayDeadZoneEnd?: string;                // Dead zone end time IST (default: '13:00')
  enablePartialBooking?: boolean;            // The Banker & The Runner: Book 50% at 1.8R, trail remainder on EMA/VWAP (default: true)
  partialBookingPct?: number;                // Percentage of position to book (default: 50)
  partialBookingR?: number;                  // R-multiple trigger for partial booking (default: 1.8)
  enableCprSupportResistance?: boolean;      // Live Zerodha CPR Support/Resistance hurdle & regime gate (default: true)
  enableParabolicVwapLock?: boolean;         // Lock profits using VWAP when trade goes parabolic (>2.5% gain or +2R) (default: true)
  enableTwoCandleEmaConfirmation?: boolean;  // Require 2nd candle confirmation before exiting on EMA to prevent shakeouts (default: true)
  enableTrendReEntry?: boolean;              // Allow 1 trend continuation re-entry if price reclaims EMA with volume (default: true)
}

export interface EmaVwapCrossoverConfig {
  symbol: string;
  exchange: string;
  emaPeriod: number;
  vwapSource?: 'close' | 'hlc3';
  entryTimeframe?: '1min' | '5min'; // Candles used to FIND entries (default '5min'). 1min is equity-only and starts at 09:16; the stop-loss and the 15-EMA trend exit always use 5m structure.
  isOptionBuyingOnly: boolean;
  qty: number;
  lots: number;
  product: 'MIS' | 'NRML';
  maxTradesPerDay: number;
  stopLossRs: number;
  targetRs: number;
  exitExactAtTarget?: boolean;      // Exit immediately at exact target profit (e.g. ₹500) and stop loss (e.g. ₹500) without trailing
  minPremium?: number;
  maxPremium?: number;
  enableProfitFloor?: boolean;
  profitFloorBufferRs?: number;
  enableOpenLowHighTrigger?: boolean; // Enable Open = Low (Buy) & Open = High (Sell) Opening Drive (default: true)
  enableMarketTrendFilter?: boolean;  // Optional: block trades against NIFTY 50 direction (default: OFF — stocks often move independently)
  enableRvolVolumeFilter?: boolean;   // Volume confirmation on every setup's signal candle (time-of-day RVOL) (default: true)
  enableDynamicVolume?: boolean;      // Judge volume against each stock's OWN same-time history (10 sessions) instead of one flat multiple (default: true)
  minVolumeZ?: number;                // Dynamic gate: min z-score of the signal candle's volume vs own history (default: 1.5)
  minRvolFloor?: number;              // Dynamic gate: also require at least this multiple of the stock's own average (default: 1.5)
  minRvol?: number;                   // Fallback flat multiple vs. other days' same-time-slot volume, when a stock has no 10-session history yet (default: 2.5)
  trailingRvolFloor?: number;         // Last-resort flat multiple vs. today's own preceding candles, used only when no cross-day baseline exists at all (default: 1.3, kept low because the baseline is already inflated by the same trend it's checking)
  targetMode?: 'FULL' | 'PARTIAL' | 'QUICK'; // Exit target (default FULL): FULL = one volatility target, no trailing | PARTIAL = book part at the volatility target, rest rides the 15-EMA candle-close exit | QUICK = book part at a small ~0.5R target, rest rides. Ignored when exitExactAtTarget (₹ target) is on.
  targetAtrMultiple?: number;         // FULL/PARTIAL first target = this x the stock's daily ATR% (default 0.5)
  quickTargetR?: number;              // QUICK first target in R multiples of the structural stop (default 0.5)
  partialBookFraction?: number;       // PARTIAL/QUICK: fraction of the position sold at the first target (default 0.5)
  partialMoveSlToBreakeven?: boolean; // PARTIAL/QUICK: move the runner's stop to break-even after booking (default true)
  enableTickTrailExit?: boolean;      // Intra-candle EMA/VWAP trailing exits (default: OFF). OFF = exit only on a 5m candle CLOSE across the 15-EMA + structural SL
  enableDailyPnLLock?: boolean;       // One-and-Done rule: lock day on hitting profit target or max loss (default: true)
  enableParabolicVwapLock?: boolean;  // Lock profits using VWAP when trade goes parabolic (>2.5% gain or +2R) (default: true)
  enableTwoCandleEmaConfirmation?: boolean; // Require 2nd candle confirmation before exiting on EMA to prevent shakeouts (default: true)
  enableEmaCandleExit?: boolean;      // Exit immediately when a confirmed 5m candle closes against trend across 15-EMA (default: true)
  enableTrendReEntry?: boolean;       // Allow 1 trend continuation re-entry if price reclaims EMA with volume (default: true)
  minStockPrice?: number;             // Minimum stock price floor for auto scanner (default: ₹300)
  scanDepth?: number;                 // Auto mode: top-ranked stocks checked for a setup on every scan; the best-scoring setup is traded (default: 20, max 25)
  enableHybridTrailing?: boolean;     // Hybrid mode: In Exact Target mode, trail SL to 15-EMA & VWAP with 0.30% noise buffer once Break-Even is locked (default: true)
  entryCutoffTime?: string;           // Optional user-set entry cutoff, IST (default: none; hard stop at 15:00 because of the 15:05 square-off)
  disabledSetupTypes?: string[];      // Setup types to skip (default: ['TREND_BREAKOUT'] — negative expectancy in backtest)
}

// ─── EMA-VWAP Options Config ─────────────────────────────────────────────────
// NIFTY / BANKNIFTY / SENSEX options. Setups are read on the option's own 5m chart (15-EMA + VWAP of the premium);
// the engine watches one CE and one PE at the money and only ever buys.
export interface EmaVwapOptionsConfig {
  symbol: 'NIFTY' | 'BANKNIFTY' | 'SENSEX';
  stopLossRs: number;                  // Max loss per trade (₹): lots are sized so (entry − SL) × qty stays within it; skipped if 1 lot exceeds it
  emaPeriod?: number;                  // default 15
  vwapSource?: 'close' | 'hlc3';       // default 'close'
  product?: 'MIS' | 'NRML';            // default 'MIS'
  maxTradesPerDay?: number;            // default 2
  maxLots?: number;                    // hard cap on lots per trade (default 10)
  maxCapital?: number;                 // paper only: capital for the affordability check (live uses the Zerodha margin)
  slBufferPct?: number;                // SL buffer below the setup low, % of that low (default 2)
  minSlBufferRs?: number;              // minimum SL buffer in ₹ (default 1)
  partialTargetR?: number;             // book part of the position at this many R (default 2)
  partialBookFraction?: number;        // fraction of the lots booked there (default 0.5)
  useSameDayExpiry?: boolean;          // trade the contract expiring today (default false: on expiry day use the next expiry)
  entryCutoffTime?: string;            // no new entries from this IST time (default '15:00'; square-off is 15:05)
}

export interface StocksInPlayConfig {
  stopLossRs: number;                  // Max loss per trade (₹): qty = stopLossRs / stop distance, capped by capital
  maxPositions?: number;               // positions open together and trades per day (default 2, max 5)
  minRvol?: number;                    // first 5m candle volume vs its 10-session average (default 10)
  stopAtrFraction?: number;            // stop distance as a fraction of the 14-day ATR (default 0.2)
  minAvgValueCr?: number;              // min average daily traded value over 14 sessions, ₹ crore (default 25)
  minPrice?: number;                   // min stock price (default ₹50)
  allowShorts?: boolean;               // trade red first candles short (default true)
  allowLongs?: boolean;                // trade green first candles long (default false: no edge in the backtest)
  leverage?: number;                   // intraday leverage used for sizing (default 4, max 5)
  maxCapital?: number;                 // live: cap on capital used; paper: capital (default ₹15,000)
  entryCutoffTime?: string;            // no new entries from this IST time (default '15:00'; square-off is 15:05)
}

export interface NiftyOptionsScalperConfig {
  symbol: string;
  exchange: string;
  emaPeriod: number;
  vwapSource?: 'close' | 'hlc3';
  isOptionBuyingOnly: true;
  qty: number;
  lots: number;
  product: 'MIS' | 'NRML';
  maxTradesPerDay: number;
  maxWinsPerDay?: number;          // "1 Win & Done" daily goal discipline: Stop after 1 winning 10-pt scalp (default: 1)
  stopLossPoints: number;          // Default: 6.0 pts
  targetPoints: number;            // Default: 10.0 pts (Daily high-probability 10-pt scalp)
  trailCostAtPoints?: number;      // Trail SL to cost + 0.50 cushion at +5.0 pts (default: 5.0)
  stopLossRs: number;
  targetRs: number;
  minPremium?: number;
  maxPremium?: number;
  enableOrbTrigger?: boolean;
  enablePullbackTrigger?: boolean;
  enableCrossoverTrigger?: boolean; // EMA-VWAP Crossover trigger (default: false to focus exclusively on high-winrate Pullbacks)
  enableRsiFilter?: boolean;       // Require 5m Stochastic RSI confirmation (default: false)
  enableRangeFilter?: boolean;     // Skip candles with small range < 8 pts to avoid choppiness (default: true)
  enableStagnancyExit?: boolean;   // Auto-exit if trade stays flat for 15+ mins without momentum (default: true)
  stagnancyMinutes?: number;       // Max minutes to hold stagnant trade (default: 15)
  moneyness?: 'ATM' | 'ITM';       // Option strike moneyness ('ITM' gives Delta >= 0.54 for fastest 10-pt target) (default: 'ITM')

  // ── Profitability, Risk Shield & Execution Upgrades ──
  maxLossesPerDay?: number;        // 'Two-Loss & Done' shield: Halt on 2 SL hits to cap daily risk (default: 2)
  enablePartialBooking?: boolean;  // 'The Banker & The Runner': Book 50% lots at Target 1 (+10 pts), trail runner (default: false for 100% exit at +10 pts)
  partialBookingPct?: number;      // % of position to book at Target 1 (default: 50%)
  enableMiddayChopFilter?: boolean;// Skip new entries during 12:15-13:15 European transition chop (default: true)
  middayDeadZoneStart?: string;    // Dead zone start time IST (default: '12:15')
  middayDeadZoneEnd?: string;      // Dead zone end time IST (default: '13:15')
  enableVolumeSurge?: boolean;     // Require trigger candle RVOL >= 0.9x or higher than prev volume (default: false)
  minRvol?: number;                // Relative volume threshold multiplier (default: 0.9)
  enableTrendBiasFilter?: boolean; // Align scalp direction with Day VWAP (CE above VWAP, PE below VWAP) (default: true)
  enableMacroDayBias?: boolean;    // In Bull Day, suppress counter-trend PE pullbacks; in Bear Day, suppress counter-trend CE pullbacks (default: false)
  entryStartTime?: string;        // Earliest entry time IST (default: '09:20' — acts from the first closed candles after the open)
  entryCutoffTime?: string;        // No new entries after this time IST (default: '14:15')
  minRejectionWickPct?: number;    // Minimum 15-EMA rejection wick ratio (default: 0.0)
  timeframe?: '3minute' | '5minute'; // Scalping candle timeframe (default: '5minute')
  enableAutoHybrid?: boolean;      // Auto-Hybrid Engine: Trades NIFTY 50 Mon-Thu, auto-switches to BSE SENSEX on Friday Expiry (default: false)
  enableDynamicSizing?: boolean;   // Dynamic Compounding Lot Sizing: Deploys 85% tradeable margin from live Zerodha balance (default: true)
  maxCapital?: number;             // Optional capital cap for position sizing (default: undefined -> uses live Kite margin)
  maxLots?: number;                // Maximum safety lot cap to prevent oversized orders (default: 25)

  // ── Smart Money Concepts (SMC): Institutional Liquidity Trap Sniper ──
  enableTrapSniper?: boolean;      // Fade false breakouts: price sweeps above/below ORH/ORL & PDH/PDL to trap retail
                                   // breakout traders, rejects with a strong wick, and displaces back through VWAP —
                                   // ported from the Gamma Blast engine's SMC setup (default: false, opt-in; live-tick only,
                                   // does not fire during historical catch-up replay)
  trapSweepBufferPts?: number;     // Structural invalidation buffer beyond the sweep extreme (default: index-adaptive,
                                   // see getIndexScalpParams — 6 pts NIFTY / 20 pts SENSEX / 15 pts BANKNIFTY)
  enablePcrConfluence?: boolean;   // Tag a firing signal with the live ATM option-chain Put/Call OI ratio when it agrees
                                   // with the trade direction ("High-Conviction A+"). Informational only — never blocks
                                   // or filters an entry (default: false; costs one extra instruments+quote lookup per signal)
}

// ─── Stock Options Buying Config ───────────────────────────────────────────────
export interface StockOptionsBuyingConfig {
  symbol: string;               // Stock symbol, e.g., 'BPCL'
  exchange: string;             // 'NSE'
  timeframe: '5min' | '15min';  // Candle timeframe
  emaPeriod: number;            // default 15
  riskRewardRatio: number;      // default 2 (1:2 RR ratio)
  maxCapital: number;           // default 25000 (INR)
  lots: number;                 // default 1
  maxTradesPerDay: number;      // default 2
  product: 'MIS' | 'NRML';      // default 'MIS'
  startAfterMin: number;        // default 25
  triggerOffset: number;        // default 0.50 (points above option mother high)
  protectionBufferPct: number;  // default 10 (%)
  stopLossRs?: number;          // Maximum allowed loss in rupees (default: 500)

  // High Accuracy & 100% ROI Upgrades
  minRvol?: number;             // Relative Volume multiplier (default: 1.5)
  moneyness?: 'ATM' | 'ITM';    // Option Strike type (default: 'ATM')
  maxBidAskSpreadPct?: number;  // Max allowed bid-ask spread % (default: 1.5)
  minOptionVolumeLots?: number; // Minimum required option traded lots (default: 500)
  orderTimeoutSec?: number;     // Order execution timeout seconds (default: 5)
  maxStagnantTimeMin?: number;  // Max stagnant position holding time in min (default: 45)
  enableTrailingSl?: boolean;   // Trailing SL to cost after 50% target (default: true)
  target1RR?: number;           // Target 1 RR ratio (default: 1.5 / +50% gain)
  target2RR?: number;           // Target 2 RR ratio (default: 3.0 / +100% gain)
  trailingStepPct?: number;     // Trailing SL distance % behind peak once T1 hit (default: 20%)
  enableHtfFilter?: boolean;   // Enable 15-min HTF trend filter (default: true)
  htfTimeframe?: '15min' | '60min'; // HTF trend timeframe (default: '15min')
  htfEmaPeriod?: number;        // HTF EMA period (default: 50)
  spotStopLossPct?: number;     // Optional underlying spot-based stop loss %

  // Systematic 80% Profitability Pillars
  directionBias?: 'BOTH' | 'CALL_ONLY' | 'PUT_ONLY'; // Directional Bias (default: 'BOTH')
  setupType?: 'INSIDE_CANDLE' | 'PULLBACK_REJECTION' | 'BOTH'; // Trigger setup (default: 'BOTH')
  enableMarketTrendFilter?: boolean; // Align trade with NIFTY 50 VWAP (default: true)
  enableMiddayChopFilter?: boolean; // Block entries during 11:30-13:00 European transition (default: true)
  middayDeadZoneStart?: string;     // Dead zone start time IST (default: '11:30')
  middayDeadZoneEnd?: string;       // Dead zone end time IST (default: '13:00')
  enablePartialBooking?: boolean;   // The Banker & The Runner: Book 50% at T1, trail SL to cost (default: true)
  partialBookingPct?: number;       // % of position to book at T1 (default: 50)
  maxWinsPerDay?: number;           // '1 Win & Done' discipline (default: 1)
  maxLossesPerDay?: number;         // '1 Loss & Done' capital shield (default: 1)
  enableDynamicSizing?: boolean;    // Deploys 85% tradeable margin from live Kite balance (default: true)
  isAutoStockSelect?: boolean;      // Auto-scan 180+ liquid F&O stocks for institutional 5%-10% momentum movers (default: true if symbol === 'AUTO')
  autoScanUniverse?: 'FNO_ALL' | 'TOP_GAINERS_LOSERS'; // Universe filter (default: 'FNO_ALL')
}


export class CreateStrategyDto {
  @ApiProperty({ example: 'Nifty 15-Min Breakout' })
  @IsString()
  name: string;

  @ApiProperty({ enum: StrategyTypeEnum })
  @IsEnum(StrategyTypeEnum)
  type: StrategyTypeEnum;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  brokerAccountId?: string;

  @ApiProperty({ description: 'JSON-serialised strategy config' })
  @IsString()
  config: string;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isPaperTrade?: boolean;
}

export class UpdateStrategyDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ enum: StrategyTypeEnum })
  @IsEnum(StrategyTypeEnum)
  @IsOptional()
  type?: StrategyTypeEnum;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  config?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  brokerAccountId?: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isPaperTrade?: boolean;
}
