import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BrokerClientFactory } from '../brokers/broker-client.factory';
import { OrderParams } from '../brokers/interfaces/broker-client.interface';
import { EmaVwapCrossoverConfig } from './dto/strategy.dto';
import { autoSelectStock } from './smart-stock-picker';


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
  lastEma: number | null;
  lastVwap: number | null;
  waitingForConfirmation: 'LONG' | 'SHORT' | null;
  confirmationHigh: number | null;
  confirmationLow: number | null;
  entryTriggered: 'LONG' | 'SHORT' | null;
  optionSymbol: string | null;
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
  ) { }

  async start(strategyId: string): Promise<{ executionId: string }> {
    if (this.running.has(strategyId)) return { executionId: this.running.get(strategyId)!.executionId };

    const strategy = await this.prisma.strategy.findUnique({
      where: { id: strategyId },
      include: { brokerAccount: true },
    });
    if (!strategy) throw new Error('Strategy not found');

    const config: EmaVwapCrossoverConfig = JSON.parse(strategy.config);
    const execution = await this.prisma.strategyExecution.create({ data: { strategyId, status: 'RUNNING' } });

    await this.prisma.strategy.update({ where: { id: strategyId }, data: { isActive: true } });

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
      optionSymbol: null,
      tradesPlacedToday: 0,
      logs: [],
    };

    this.running.set(strategyId, state);
    this.log(state, `▶ Strategy started — ${config.symbol}:${config.exchange}`);
    await this.persistLogs(state); // Persist immediately so UI shows "Started"

    const timer = setInterval(() => this.tick(strategyId).catch(e => this.logger.error(e)), 60_000);
    this.timers.set(strategyId, timer);

    this.initialCatchup(strategyId).then(() => {
      this.tick(strategyId).catch(e => this.logger.error(e));
    }).catch(e => this.logger.error(`Catch-up error: ${e.message}`));

    return { executionId: execution.id };
  }

  async stop(strategyId: string): Promise<void> {
    const state = this.running.get(strategyId);
    if (state) {
      clearInterval(this.timers.get(strategyId));
      this.timers.delete(strategyId);
      this.running.delete(strategyId);
      this.log(state, '⏹ Strategy stopped by user');
      await this.prisma.strategyExecution.update({
        where: { id: state.executionId },
        data: { status: 'STOPPED', stoppedAt: new Date(), logs: JSON.stringify(state.logs) },
      });
    }
    await this.prisma.strategy.update({ where: { id: strategyId }, data: { isActive: false } });
  }

  isRunning(strategyId: string): boolean {
    return this.running.has(strategyId);
  }

  getLogs(strategyId: string): string[] {
    return this.running.get(strategyId)?.logs || [];
  }

  getState(strategyId: string) {
    const s = this.running.get(strategyId);
    if (!s) return null;
    return {
      entryTriggered: s.entryTriggered,
      tradesToday: s.tradesPlacedToday,
      optionSymbol: s.optionSymbol,
    };
  }

  private async initialCatchup(strategyId: string) {
    const state = this.running.get(strategyId);
    if (!state) return;
    const now = new Date();
    if (this.getIstHhmm(now) < 9 * 60 + 20) return;

    this.log(state, `🔍 Running catch-up for today's data...`);
    const account = await this.prisma.brokerAccount.findUnique({ where: { id: state.brokerAccountId } });
    if (!account || !account.accessToken) return;

    const client = this.factory.createClient(account);
    const kite = client['kite'];

    try {
      if (state.config.symbol === 'AUTO') {
        const pick = await autoSelectStock(kite, state.config.targetRs, state.config.stopLossRs, this.logger);
        state.config.symbol = pick.symbol;
        state.config.exchange = pick.exchange;
        this.log(state, `🎯 Auto-Selected Stock: ${state.config.symbol} (Catch-up)`);
      }
      const candles = await this.fetchCandles(kite, state.config, '5minute', now);
      if (candles.length < state.config.emaPeriod + 2) return;

      const emas = this.calculateEMA(candles, state.config.emaPeriod);
      const vwaps = this.calculateVWAP(candles);

      for (let i = state.config.emaPeriod; i < candles.length; i++) {
        if (state.entryTriggered) break;

        const currEma = emas[i], prevEma = emas[i - 1];
        const currVwap = vwaps[i], prevVwap = vwaps[i - 1];
        if (!currEma || !prevEma || !currVwap || !prevVwap) continue;

        const crossoverLong = prevEma <= prevVwap && currEma > currVwap;
        const crossoverShort = prevEma >= prevVwap && currEma < currVwap;

        if (crossoverLong) {
          this.log(state, `🚀 (Catch-up) Found past LONG Crossover at ${this.formatTime(new Date(candles[i].date))}!`);
          await this.placeTrade(state, client, account, 'BUY', candles[i].close);
        } else if (crossoverShort) {
          this.log(state, `🚀 (Catch-up) Found past SHORT Crossover at ${this.formatTime(new Date(candles[i].date))}!`);
          await this.placeTrade(state, client, account, 'SELL', candles[i].close);
        }
      }
      if (!state.entryTriggered) this.log(state, `✅ Catch-up complete. No past signals found.`);
      await this.persistLogs(state);
    } catch (err) {
      this.log(state, `⚠ Catch-up failed: ${err.message}`);
      await this.persistLogs(state);
    }
  }

  private async tick(strategyId: string) {
    const state = this.running.get(strategyId);
    if (!state) return;
    const now = new Date();
    const hhmm = this.getIstHhmm(now);
    if (hhmm < 9 * 60 + 15 || hhmm >= 15 * 60 + 30) return;

    const account = await this.prisma.brokerAccount.findUnique({ where: { id: state.brokerAccountId } });
    if (!account || !account.accessToken) return;

    const client = this.factory.createClient(account);
    const { config } = state;
    const kite = client['kite'];

    try {
      if (config.symbol === 'AUTO') {
        const pick = await autoSelectStock(kite, config.targetRs, config.stopLossRs, this.logger);
        config.symbol = pick.symbol;
        config.exchange = pick.exchange;
        this.log(state, `🎯 Auto-Selected Stock: ${config.exchange}:${config.symbol}`);
      }
      const candles = await this.fetchCandles(kite, config, '5minute', now);
      if (candles.length < 2) return;

      const emas = this.calculateEMA(candles, config.emaPeriod || 15);
      const vwaps = this.calculateVWAP(candles);

      const lastIdx = candles.length - 1, prevIdx = candles.length - 2;
      const currEma = emas[lastIdx], prevEma = emas[prevIdx];
      const currVwap = vwaps[lastIdx], prevVwap = vwaps[prevIdx];

      if (currEma === null || prevEma === null || currVwap === null || prevVwap === null) return;

      if (state.waitingForConfirmation) {
        const ltpData = await kite.getLTP([`${config.exchange}:${config.symbol}`]);
        const ltp = ltpData[`${config.exchange}:${config.symbol}`]?.last_price;
        if (ltp) {
          if (state.waitingForConfirmation === 'LONG' && ltp > state.confirmationHigh!) {
            this.log(state, `🚀 LONG Trigger! LTP ₹${ltp} > ₹${state.confirmationHigh}`);
            await this.placeTrade(state, client, account, 'BUY', ltp);
            state.waitingForConfirmation = null;
          } else if (state.waitingForConfirmation === 'SHORT' && ltp < state.confirmationLow!) {
            this.log(state, `🚀 SHORT Trigger! LTP ₹${ltp} < ₹${state.confirmationLow}`);
            await this.placeTrade(state, client, account, 'SELL', ltp);
            state.waitingForConfirmation = null;
          }
        }
      }

      const crossoverLong = prevEma <= prevVwap && currEma > currVwap;
      const crossoverShort = prevEma >= prevVwap && currEma < currVwap;

      if (crossoverLong && !state.entryTriggered) {
        state.waitingForConfirmation = 'LONG';
        state.confirmationHigh = candles[lastIdx].high;
        this.log(state, `🔔 Signal: BULLISH crossover. Waiting for break of ₹${state.confirmationHigh}`);
      } else if (crossoverShort && !state.entryTriggered) {
        state.waitingForConfirmation = 'SHORT';
        state.confirmationLow = candles[lastIdx].low;
        this.log(state, `🔔 Signal: BEARISH crossover. Waiting for break of ₹${state.confirmationLow}`);
      }
    } catch (err) { this.log(state, `❌ Tick error: ${err.message}`); }
    await this.persistLogs(state);
  }

  private async placeTrade(state: StrategyState, client: any, account: any, side: 'BUY' | 'SELL', triggerPrice: number) {
    const { config } = state;
    const kite = client['kite'];
    let symbol = config.symbol, exchange = config.exchange, finalSide: 'BUY' | 'SELL' = side;
    const product = (config as any).product ?? 'MIS';

    if (config.isOptionBuyingOnly) {
      const type = side === 'BUY' ? 'CE' : 'PE';
      const optSym = await this.findOptionSymbol(kite, state, triggerPrice, type);
      if (optSym) {
        symbol = optSym; exchange = 'NFO'; finalSide = 'BUY';
        const q = await kite.getLTP([`NFO:${symbol}`]);
        if (q[`NFO:${symbol}`]?.last_price) triggerPrice = q[`NFO:${symbol}`].last_price;
      } else {
        this.log(state, `⚠ No option found. Trading equity directly.`);
      }
    } else {
      this.log(state, `📈 Equity mode — trading ${exchange}:${symbol} directly`);
    }

    const entry = this.roundTick(triggerPrice);
    const sl = finalSide === 'BUY' ? this.roundTick(entry - (config.stopLossRs / config.qty)) : this.roundTick(entry + (config.stopLossRs / config.qty));
    const tgt = finalSide === 'BUY' ? this.roundTick(entry + (config.targetRs / config.qty)) : this.roundTick(entry - (config.targetRs / config.qty));

    this.log(state, `📋 Placing: ${symbol} — Entry: ₹${entry.toFixed(2)} | SL: ₹${sl.toFixed(2)} | Target: ₹${tgt.toFixed(2)}`);
    try {
      const entryId = state.isPaperTrade
        ? `PAPER_${Math.random().toString(36).substring(7).toUpperCase()}`
        : await client.placeOrder({ symbol, exchange, product, qty: config.qty, side: finalSide, orderType: 'LIMIT', price: entry });
      this.log(state, `✅ Entry: ${entryId}`);
      const exitSide = finalSide === 'BUY' ? 'SELL' : 'BUY';
      if (!state.isPaperTrade) {
        await client.placeOrder({ symbol, exchange, product, qty: config.qty, side: exitSide, orderType: 'SL', price: sl, triggerPrice: sl }).catch(e => this.log(state, `❌ SL Failed: ${e.message}`));
        await client.placeOrder({ symbol, exchange, product, qty: config.qty, side: exitSide, orderType: 'LIMIT', price: tgt }).catch(e => this.log(state, `❌ Target Failed: ${e.message}`));
      }
      state.entryTriggered = side === 'BUY' ? 'LONG' : 'SHORT';
      state.optionSymbol = symbol;
      state.tradesPlacedToday++;
    } catch (err) { this.log(state, `❌ Placement failed: ${err.message}`); }
  }

  private calculateEMA(candles: Candle[], period: number) {
    const emas: (number | null)[] = new Array(candles.length).fill(null);
    if (candles.length < period) return emas;
    let sum = 0;
    for (let i = 0; i < period; i++) sum += candles[i].close;
    let prev = sum / period; emas[period - 1] = prev;
    const mult = 2 / (period + 1);
    for (let i = period; i < candles.length; i++) {
      const ema = (candles[i].close - prev) * mult + prev;
      emas[i] = ema; prev = ema;
    }
    return emas;
  }

  private calculateVWAP(candles: Candle[]) {
    const vwaps: (number | null)[] = new Array(candles.length).fill(null);
    let cpv = 0, cv = 0;
    for (let i = 0; i < candles.length; i++) {
      cpv += ((candles[i].high + candles[i].low + candles[i].close) / 3) * candles[i].volume;
      cv += candles[i].volume; vwaps[i] = cpv / cv;
    }
    return vwaps;
  }

  private async fetchCandles(kite: any, config: any, interval: string, now: Date): Promise<Candle[]> {
    const istDateStr = now.toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata' });
    const from = new Date(`${istDateStr} 09:15:00 GMT+0530`);
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
    const data = await kite.getHistoricalData(token, interval, from, now, false);
    return (data || []).map((c: any) => ({ date: new Date(c.date), open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume }));
  }

  private async findOptionSymbol(kite: any, state: StrategyState, spotPrice: number, type: 'CE' | 'PE'): Promise<string | null> {
    const { config } = state;
    const upper = config.symbol.toUpperCase().trim();
    const isIndex = upper.includes('NIFTY') || upper.includes('BANKNIFTY') || upper.includes('FINNIFTY') || upper.includes('MIDCPNIFTY') || upper.includes('SENSEX');
    
    if (!isIndex) return null; // No options for stocks in EMA-VWAP

    let underlying: string;
    if (upper.includes('BANKNIFTY') || upper === 'BANKNIFTY') underlying = 'BANKNIFTY';
    else if (upper === 'NIFTY 50' || upper === 'NIFTY') underlying = 'NIFTY';
    else if (upper.includes('FINNIFTY')) underlying = 'FINNIFTY';
    else if (upper.includes('MIDCPNIFTY')) underlying = 'MIDCPNIFTY';
    else if (upper.includes('SENSEX')) underlying = 'SENSEX';
    else underlying = upper;

    const exchange = underlying === 'SENSEX' ? 'BFO' : 'NFO';
    const segment = underlying === 'SENSEX' ? 'BFO-OPT' : 'NFO-OPT';

    const instruments = await kite.getInstruments(exchange);
    const options = instruments.filter((i: any) => i.name === underlying && i.instrument_type === type && i.segment === segment);
    if (options.length === 0) {
      this.log(state, `⚠ No ${type} options found for ${underlying}`);
      return null;
    }

    const nearestExpiry = Array.from(new Set(options.map((i: any) => i.expiry))).sort()[0];
    const filteredOptions = options.filter((i: any) => i.expiry === nearestExpiry);

    // ── Option 1: Premium range (batched LTP in chunks of 200) ────────────────────
    if (config.minPremium && config.maxPremium) {
      this.log(state, `🔍 Searching ${type} in premium range ₹${config.minPremium}-₹${config.maxPremium}...`);
      const allSymbols = filteredOptions.map((i: any) => `${exchange}:${i.tradingsymbol}`);
      const quotes: Record<string, any> = {};
      for (let i = 0; i < allSymbols.length; i += 200) {
        try { Object.assign(quotes, await kite.getLTP(allSymbols.slice(i, i + 200))); }
        catch (e) { this.log(state, `⚠ LTP batch failed: ${e.message}`); }
      }
      const mid = (config.minPremium + config.maxPremium) / 2;
      let best: string | null = null, bestDiff = Infinity;
      for (const opt of filteredOptions) {
        const ltp = quotes[`${exchange}:${opt.tradingsymbol}`]?.last_price;
        if (ltp && ltp >= config.minPremium && ltp <= config.maxPremium) {
          const d = Math.abs(ltp - mid);
          if (d < bestDiff) { bestDiff = d; best = opt.tradingsymbol; }
        }
      }
      if (best) { this.log(state, `🎯 Found ${best} in premium range`); return best; }
      this.log(state, `⚠ No option in range. Falling back to ATM.`);
    }

    // ── Option 2: ATM strike ─────────────────────────────────────────
    const step = (underlying === 'NIFTY' || underlying === 'FINNIFTY') ? 50 : underlying === 'MIDCPNIFTY' ? 25 : 100;
    const atm = Math.round(spotPrice / step) * step;
    const match = filteredOptions.find((i: any) => Number(i.strike) === atm);
    if (match) { this.log(state, `🎯 ATM Strike: ${match.tradingsymbol}`); return match.tradingsymbol; }

    // ── Option 3: Closest available strike (handles stocks & odd steps) ──────
    let closest: any = null, closestD = Infinity;
    for (const opt of filteredOptions) {
      const d = Math.abs(Number(opt.strike) - spotPrice);
      if (d < closestD) { closestD = d; closest = opt; }
    }
    if (closest) { this.log(state, `🎯 Closest strike: ${closest.tradingsymbol}`); return closest.tradingsymbol; }
    return null;
  }

  private getIstHhmm(date: Date): number {
    const istStr = date.toLocaleString('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: 'numeric', hour12: false });
    const parts = istStr.split(':').map(Number);
    return parts[0] * 60 + (parts[1] || 0);
  }

  private roundTick(p: number) { return Math.round(p / 0.05) * 0.05; }
  private formatTime(d: Date) { return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }); }
  private log(state: StrategyState, msg: string) { const ts = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }); state.logs.push(`[${ts}] ${msg}`); this.logger.log(`[${state.executionId}] ${msg}`); }
  private async persistLogs(state: StrategyState) { await this.prisma.strategyExecution.update({ where: { id: state.executionId }, data: { logs: JSON.stringify(state.logs.slice(-200)) } }); }
  private resetDailyState(state: StrategyState) { state.entryTriggered = null; state.optionSymbol = null; state.tradesPlacedToday = 0; state.waitingForConfirmation = null; }
}
