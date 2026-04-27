import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BrokerClientFactory } from '../brokers/broker-client.factory';
import { OrderParams } from '../brokers/interfaces/broker-client.interface';

export interface EmaVwapCrossoverConfig {
  symbol: string;
  exchange: string;
  emaPeriod: number;
  isOptionBuyingOnly: boolean;
  qty: number;
  lots: number;
  product: 'MIS' | 'NRML';
  maxTradesPerDay: number;
  stopLossRs: number;
  targetRs: number;
  isPaperTrade?: boolean;
}

interface Candle {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface StrategyState {
  executionId: string;
  config: EmaVwapCrossoverConfig;
  brokerAccountId: string;
  isPaperTrade: boolean;
  // State for crossover
  lastEma: number | null;
  lastVwap: number | null;
  waitingForConfirmation: 'LONG' | 'SHORT' | null;
  confirmationHigh: number | null;
  confirmationLow: number | null;
  // Entry tracking
  entryTriggered: 'LONG' | 'SHORT' | null;
  tradesPlacedToday: number;
  logs: string[];
}

@Injectable()
export class EmaVwapCrossoverEngine {
  private readonly logger = new Logger(EmaVwapCrossoverEngine.name);
  private readonly running = new Map<string, StrategyState>();
  private readonly timers = new Map<string, ReturnType<typeof setInterval>>();

  constructor(
    private prisma: PrismaService,
    private factory: BrokerClientFactory,
  ) {}

  async start(strategyId: string): Promise<{ executionId: string }> {
    if (this.running.has(strategyId)) {
      return { executionId: this.running.get(strategyId)!.executionId };
    }

    const strategy = await this.prisma.strategy.findUnique({
      where: { id: strategyId },
      include: { brokerAccount: true },
    });

    if (!strategy || !strategy.brokerAccount) {
      throw new Error('Strategy or broker account not found');
    }

    const config: EmaVwapCrossoverConfig = JSON.parse(strategy.config);

    const execution = await this.prisma.strategyExecution.create({
      data: { strategyId, status: 'RUNNING' },
    });

    await this.prisma.strategy.update({
      where: { id: strategyId },
      data: { isActive: true },
    });

    const state: StrategyState = {
      executionId: execution.id,
      config,
      brokerAccountId: strategy.brokerAccountId!,
      isPaperTrade: strategy.isPaperTrade,
      lastEma: null,
      lastVwap: null,
      waitingForConfirmation: null,
      confirmationHigh: null,
      confirmationLow: null,
      entryTriggered: null,
      tradesPlacedToday: 0,
      logs: [],
    };

    this.running.set(strategyId, state);
    this.log(state, `▶ EMA-VWAP Strategy started — ${config.symbol}:${config.exchange}`);

    const timer = setInterval(
      () => this.tick(strategyId).catch((err) => this.logger.error(err)),
      60_000,
    );
    this.timers.set(strategyId, timer);

    this.tick(strategyId).catch((err) => this.logger.error(err));

    return { executionId: execution.id };
  }

  async stop(strategyId: string): Promise<void> {
    const state = this.running.get(strategyId);
    if (!state) return;

    clearInterval(this.timers.get(strategyId));
    this.timers.delete(strategyId);
    this.running.delete(strategyId);

    this.log(state, '⏹ Strategy stopped by user');

    await this.prisma.strategyExecution.update({
      where: { id: state.executionId },
      data: {
        status: 'STOPPED',
        stoppedAt: new Date(),
        logs: JSON.stringify(state.logs),
      },
    });

    await this.prisma.strategy.update({
      where: { id: strategyId },
      data: { isActive: false },
    });
  }

  isRunning(strategyId: string): boolean {
    return this.running.has(strategyId);
  }

  getLogs(strategyId: string): string[] {
    return this.running.get(strategyId)?.logs || [];
  }

  private async tick(strategyId: string) {
    const state = this.running.get(strategyId);
    if (!state) return;

    const now = new Date();
    const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const hhmm = ist.getHours() * 60 + ist.getMinutes();

    // Market closed — skip
    if (hhmm < 9 * 60 + 15 || hhmm >= 15 * 60 + 30) {
      if (hhmm < 9 * 60 + 15) this.resetDailyState(state);
      return;
    }

    const account = await this.prisma.brokerAccount.findUnique({
      where: { id: state.brokerAccountId },
    });
    if (!account || !account.accessToken) {
      this.log(state, '⚠ No active broker session');
      return;
    }

    const client = this.factory.createClient(account);
    const { config } = state;
    const kite = client['kite'];

    try {
      // 1. Fetch 5-min candles for today
      const candles = await this.fetchCandles(kite, config, '5minute', ist);
      if (candles.length < 2) return;

      // Calculate indicators
      const emaPeriod = config.emaPeriod || 15;
      const emas = this.calculateEMA(candles, emaPeriod);
      const vwaps = this.calculateVWAP(candles);

      const lastIdx = candles.length - 1;
      const prevIdx = candles.length - 2;

      const currentEma = emas[lastIdx];
      const prevEma = emas[prevIdx];
      const currentVwap = vwaps[lastIdx];
      const prevVwap = vwaps[prevIdx];

      if (currentEma === null || prevEma === null || currentVwap === null || prevVwap === null) return;

      // 2. Check for entry trigger (if already in confirmation phase)
      if (state.waitingForConfirmation) {
        const ltpData = await kite.getLTP([`${config.exchange}:${config.symbol}`]);
        const ltp = ltpData[`${config.exchange}:${config.symbol}`]?.last_price;

        if (ltp) {
          if (state.waitingForConfirmation === 'LONG' && ltp > state.confirmationHigh!) {
            this.log(state, `🚀 LONG Confirmation! LTP ₹${ltp} broke high ₹${state.confirmationHigh}`);
            await this.placeTrade(state, client, account, 'BUY', ltp);
            state.waitingForConfirmation = null;
          } else if (state.waitingForConfirmation === 'SHORT' && ltp < state.confirmationLow!) {
            this.log(state, `🚀 SHORT Confirmation! LTP ₹${ltp} broke low ₹${state.confirmationLow}`);
            await this.placeTrade(state, client, account, 'SELL', ltp);
            state.waitingForConfirmation = null;
          }
        }
      }

      // 3. Check for Crossover on CLOSED candle (prevIdx)
      // Actually we check crossover on the candle that just closed (lastIdx is forming, so we use candles up to lastIdx-1 for indicators if we want confirmed crossover)
      // But typically we check the most recent completed indicators.
      
      const crossoverLong = prevEma <= prevVwap && currentEma > currentVwap;
      const crossoverShort = prevEma >= prevVwap && currentEma < currentVwap;

      if (crossoverLong && !state.entryTriggered) {
        state.waitingForConfirmation = 'LONG';
        state.confirmationHigh = candles[lastIdx].high;
        this.log(state, `🔔 BULLISH Crossover (EMA > VWAP). Waiting for break of high ₹${state.confirmationHigh}`);
      } else if (crossoverShort && !state.entryTriggered) {
        // Only if not option buying only, or if we handle PE buying later
        state.waitingForConfirmation = 'SHORT';
        state.confirmationLow = candles[lastIdx].low;
        this.log(state, `🔔 BEARISH Crossover (EMA < VWAP). Waiting for break of low ₹${state.confirmationLow}`);
      }

    } catch (err) {
      this.log(state, `❌ Tick error: ${err.message}`);
    }

    await this.persistLogs(state);
  }

  private async placeTrade(
    state: StrategyState,
    client: any,
    account: any,
    side: 'BUY' | 'SELL',
    triggerPrice: number,
  ) {
    const { config } = state;
    const kite = client['kite'];

    let tradingSymbol = config.symbol;
    let tradingExchange = config.exchange;
    let finalSide: 'BUY' | 'SELL' = side;

    // Handle Option Buying Only
    if (config.isOptionBuyingOnly) {
      this.log(state, `🔍 Selecting option for ${side === 'BUY' ? 'Bullish' : 'Bearish'} move...`);
      const optionType = side === 'BUY' ? 'CE' : 'PE';
      const optionSymbol = await this.findOptionSymbol(kite, config.symbol, triggerPrice, optionType);
      
      if (optionSymbol) {
        tradingSymbol = optionSymbol;
        tradingExchange = 'NFO';
        finalSide = 'BUY'; // Always buy for option buying
        this.log(state, `🎯 Selected Option: ${tradingSymbol}`);
        
        const quotes = await kite.getLTP([`NFO:${tradingSymbol}`]);
        const ltp = quotes[`NFO:${tradingSymbol}`]?.last_price;
        if (ltp) {
          triggerPrice = ltp;
        }
      } else {
        this.log(state, `❌ No option found. Skipping trade.`);
        return;
      }
    }

    const entryPrice = this.roundTick(triggerPrice);
    const slPrice = finalSide === 'BUY' 
      ? this.roundTick(entryPrice - (config.stopLossRs / config.qty))
      : this.roundTick(entryPrice + (config.stopLossRs / config.qty));
    const targetPrice = finalSide === 'BUY'
      ? this.roundTick(entryPrice + (config.targetRs / config.qty))
      : this.roundTick(entryPrice - (config.targetRs / config.qty));

    this.log(state, `📋 Placing orders: Entry ₹${entryPrice} | SL ₹${slPrice} | Target ₹${targetPrice}`);

    const common = {
      symbol: tradingSymbol,
      exchange: tradingExchange,
      product: 'MIS' as any,
      qty: config.qty,
    };

    try {
      const entryId = state.isPaperTrade 
        ? `PAPER_${Math.random().toString(36).substring(7).toUpperCase()}`
        : await client.placeOrder({ ...common, side: finalSide, orderType: 'LIMIT', price: entryPrice });
      
      this.log(state, `✅ Entry placed: ${entryId}`);

      const exitSide = finalSide === 'BUY' ? 'SELL' : 'BUY';
      
      // SL
      await client.placeOrder({ ...common, side: exitSide, orderType: 'SL', price: slPrice, triggerPrice: slPrice })
        .catch(e => this.log(state, `❌ SL Failed: ${e.message}`));
      
      // Target
      await client.placeOrder({ ...common, side: exitSide, orderType: 'LIMIT', price: targetPrice })
        .catch(e => this.log(state, `❌ Target Failed: ${e.message}`));

      state.entryTriggered = side === 'BUY' ? 'LONG' : 'SHORT';
      state.tradesPlacedToday++;
    } catch (err) {
      this.log(state, `❌ Trade placement failed: ${err.message}`);
    }
  }

  private calculateEMA(candles: Candle[], period: number): (number | null)[] {
    const emas: (number | null)[] = new Array(candles.length).fill(null);
    if (candles.length < period) return emas;

    let sum = 0;
    for (let i = 0; i < period; i++) sum += candles[i].close;
    let prevEma = sum / period;
    emas[period - 1] = prevEma;

    const multiplier = 2 / (period + 1);
    for (let i = period; i < candles.length; i++) {
      const ema = (candles[i].close - prevEma) * multiplier + prevEma;
      emas[i] = ema;
      prevEma = ema;
    }
    return emas;
  }

  private calculateVWAP(candles: Candle[]): (number | null)[] {
    const vwaps: (number | null)[] = new Array(candles.length).fill(null);
    let cumulativePV = 0;
    let cumulativeV = 0;

    for (let i = 0; i < candles.length; i++) {
      const typicalPrice = (candles[i].high + candles[i].low + candles[i].close) / 3;
      cumulativePV += typicalPrice * candles[i].volume;
      cumulativeV += candles[i].volume;
      vwaps[i] = cumulativePV / cumulativeV;
    }
    return vwaps;
  }

  private async fetchCandles(kite: any, config: any, interval: string, ist: Date): Promise<Candle[]> {
    const from = new Date(ist); from.setHours(9, 15, 0, 0);
    const to = new Date(ist);
    
    // Resolve token
    let token = 0;
    const indexTokens: Record<string, number> = { 'NIFTY 50': 256265, 'BANKNIFTY': 260105, 'SENSEX': 265 };
    if (indexTokens[config.symbol.toUpperCase()]) {
      token = indexTokens[config.symbol.toUpperCase()];
    } else {
      const instruments = await kite.getInstruments(config.exchange);
      const found = instruments.find(i => i.tradingsymbol === config.symbol.toUpperCase());
      if (!found) throw new Error(`Instrument ${config.symbol} not found`);
      token = found.instrument_token;
    }

    const data = await kite.getHistoricalData(token, interval, from, to, false);
    return (data || []).map((c: any) => ({
      date: new Date(c.date), open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume
    }));
  }

  private async findOptionSymbol(kite: any, baseSymbol: string, spotPrice: number, type: 'CE' | 'PE'): Promise<string | null> {
    const instruments = await kite.getInstruments('NFO');
    const underlying = baseSymbol.includes('NIFTY 50') ? 'NIFTY' : baseSymbol.includes('BANK') ? 'BANKNIFTY' : baseSymbol.toUpperCase();
    const options = instruments.filter(i => i.name === underlying && i.instrument_type === type && i.segment === 'NFO-OPT');
    if (options.length === 0) return null;
    const nearestExpiry = Array.from(new Set(options.map(i => i.expiry))).sort()[0];
    const step = underlying === 'NIFTY' ? 50 : 100;
    const atmStrike = Math.round(spotPrice / step) * step;
    const match = options.find(i => i.expiry === nearestExpiry && Number(i.strike) === atmStrike);
    return match ? match.tradingsymbol : null;
  }

  private roundTick(price: number): number { return Math.round(price / 0.05) * 0.05; }

  private log(state: StrategyState, msg: string) {
    const ts = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    state.logs.push(`[${ts}] ${msg}`);
    this.logger.log(`[${state.executionId}] ${msg}`);
  }

  private async persistLogs(state: StrategyState) {
    await this.prisma.strategyExecution.update({
      where: { id: state.executionId },
      data: { logs: JSON.stringify(state.logs.slice(-200)) },
    });
  }

  private resetDailyState(state: StrategyState) {
    state.entryTriggered = null;
    state.tradesPlacedToday = 0;
    state.waitingForConfirmation = null;
  }
}
