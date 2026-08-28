import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BrokerClientFactory } from '../brokers/broker-client.factory';
import { FO_STOCKS_LIST } from './market.service';
import axios from 'axios';

export interface OhlStockResult {
  symbol: string;
  name: string;
  exchange: string;
  category: string;
  lotSize: number;
  isFnO: boolean;
  ltp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change: number;
  changePct: number;
  changeFromOpen: number;
  changeFromOpenPct: number;
  diffOpenLow: number;
  diffOpenLowPct: number;
  diffOpenHigh: number;
  diffOpenHighPct: number;
  signal: 'OPEN_LOW' | 'OPEN_HIGH' | 'NEAR_OPEN_LOW' | 'NEAR_OPEN_HIGH' | 'NEUTRAL';
  signalType: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  signalStrength: 'STRONG' | 'MODERATE' | 'WEAK';
  suggestedAction: 'BUY' | 'SELL' | 'WATCH';
  suggestedSL: number;
  suggestedTarget1: number;
  suggestedTarget2: number;
  riskReward: string;
  riskPerShare: number;
  lastUpdated: string;
}

export interface OhlScannerResponse {
  success: boolean;
  timestamp: string;
  totalScanned: number;
  summary: {
    openLowCount: number;
    openHighCount: number;
    nearOpenLowCount: number;
    nearOpenHighCount: number;
    advances: number;
    declines: number;
    unchanged: number;
  };
  universe: string;
  tolerance: number;
  stocks: OhlStockResult[];
}

const NIFTY_50_SYMBOLS = [
  'ADANIENT', 'ADANIPORTS', 'APOLLOHOSP', 'ASIANPAINT', 'AXISBANK',
  'BAJAJ-AUTO', 'BAJAJFINSV', 'BAJFINANCE', 'BEL', 'BHARTIARTL',
  'BPCL', 'BRITANNIA', 'CIPLA', 'COALINDIA', 'DRREDDY',
  'EICHERMOT', 'GRASIM', 'HCLTECH', 'HDFCBANK', 'HDFCLIFE',
  'HEROMOTOCO', 'HINDALCO', 'HINDUNILVR', 'ICICIBANK', 'INDUSINDBK',
  'INFY', 'ITC', 'JSWSTEEL', 'KOTAKBANK', 'LT',
  'M&M', 'MARUTI', 'NESTLEIND', 'NTPC', 'ONGC',
  'POWERGRID', 'RELIANCE', 'SBILIFE', 'SBIN', 'SHRIRAMFIN',
  'SUNPHARMA', 'TATACONSUM', 'TATAMOTORS', 'TATASTEEL', 'TCS',
  'TECHM', 'TITAN', 'TRENT', 'ULTRACEMCO', 'WIPRO'
];

@Injectable()
export class OhlScannerService {
  private readonly logger = new Logger(OhlScannerService.name);

  // Cache scan results for 3 seconds to avoid hammering broker rate limits on multi-client requests
  private cache = new Map<string, { timestamp: number; data: OhlScannerResponse }>();
  private CACHE_TTL_MS = 3000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly factory: BrokerClientFactory,
  ) {}

  /**
   * Scan market stocks for Open = High and Open = Low setups
   * @param userId User requesting the scan
   * @param universe 'fno' | 'nifty50' | 'all'
   * @param tolerance Max % difference between Open and Low/High (e.g. 0.05% or 0.00%)
   * @param filter 'all' | 'open_low' | 'open_high' | 'near'
   */
  async scan(
    userId?: string,
    universe: string = 'fno',
    tolerance: number = 0.05,
    filter: string = 'all',
  ): Promise<OhlScannerResponse> {
    const cacheKey = `${universe}_${tolerance}_${filter}_${userId || 'anon'}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.data;
    }

    // Determine universe list
    let targetList = [...FO_STOCKS_LIST];
    if (universe === 'nifty50') {
      targetList = FO_STOCKS_LIST.filter(s => NIFTY_50_SYMBOLS.includes(s.symbol));
    }

    // Attempt to fetch live OHLC from active broker account
    let account = null;
    if (userId) {
      account = await this.prisma.brokerAccount.findFirst({
        where: { userId, isActive: true, accessToken: { not: null } },
      });
    }
    if (!account || !account.accessToken) {
      account = await this.prisma.brokerAccount.findFirst({
        where: { isActive: true, accessToken: { not: null } },
      });
    }

    let ohlcMap = new Map<string, { open: number; high: number; low: number; close: number; ltp: number; volume: number }>();

    if (account?.accessToken) {
      try {
        const client = this.factory.createClient(account);
        const kite = (client as any)['kite'];

        // Kite OHLC accepts up to 200 keys per request
        const chunkSize = 150;
        for (let i = 0; i < targetList.length; i += chunkSize) {
          const chunk = targetList.slice(i, i + chunkSize);
          const keys = chunk.map(s => `NSE:${s.symbol}`);
          const quotes = await kite.getOHLC(keys).catch(() => ({}));

          for (const s of chunk) {
            const q = quotes[`NSE:${s.symbol}`] || quotes[s.symbol];
            if (q) {
              const ltp = q.last_price || q.ohlc?.close || 0;
              const open = q.ohlc?.open || ltp;
              const high = q.ohlc?.high || ltp;
              const low = q.ohlc?.low || ltp;
              const close = q.ohlc?.close || ltp;
              const volume = q.volume || 0;
              ohlcMap.set(s.symbol, { open, high, low, close, ltp, volume });
            }
          }
        }
      } catch (err: any) {
        this.logger.warn(`Kite OHLC fetch error: ${err?.message || err}`);
      }
    }

    // Fallback if broker data is incomplete or unavailable (e.g. during weekend / testing)
    if (ohlcMap.size < 5) {
      await this.fallbackFetchQuotes(targetList.slice(0, 60), ohlcMap);
    }

    // Process & Classify each stock
    const results: OhlStockResult[] = [];
    let openLowCount = 0;
    let openHighCount = 0;
    let nearOpenLowCount = 0;
    let nearOpenHighCount = 0;
    let advances = 0;
    let declines = 0;
    let unchanged = 0;

    for (const item of targetList) {
      const data = ohlcMap.get(item.symbol);
      const open = data?.open || 0;
      const high = data?.high || 0;
      const low = data?.low || 0;
      const close = data?.close || open || 1;
      const ltp = data?.ltp || open || close;
      const volume = data?.volume || 0;

      if (open <= 0) continue;

      const change = Number((ltp - close).toFixed(2));
      const changePct = close > 0 ? Number((((ltp - close) / close) * 100).toFixed(2)) : 0;
      const changeFromOpen = Number((ltp - open).toFixed(2));
      const changeFromOpenPct = Number((((ltp - open) / open) * 100).toFixed(2));

      const diffOpenLow = Math.max(0, Number((open - low).toFixed(2)));
      const diffOpenLowPct = Number(((diffOpenLow / open) * 100).toFixed(3));

      const diffOpenHigh = Math.max(0, Number((high - open).toFixed(2)));
      const diffOpenHighPct = Number(((diffOpenHigh / open) * 100).toFixed(3));

      // Advance / Decline
      if (change > 0) advances++;
      else if (change < 0) declines++;
      else unchanged++;

      // Signal Classification
      let signal: OhlStockResult['signal'] = 'NEUTRAL';
      let signalType: OhlStockResult['signalType'] = 'NEUTRAL';
      let signalStrength: OhlStockResult['signalStrength'] = 'WEAK';
      let suggestedAction: OhlStockResult['suggestedAction'] = 'WATCH';

      // 1. Exact Open = Low (difference is 0.00 or <= 0.01%)
      const isExactOpenLow = diffOpenLowPct <= 0.01;
      // 2. Exact Open = High (difference is 0.00 or <= 0.01%)
      const isExactOpenHigh = diffOpenHighPct <= 0.01;

      // 3. Near Open = Low (diff <= tolerance)
      const isNearOpenLow = !isExactOpenLow && diffOpenLowPct <= tolerance;
      // 4. Near Open = High (diff <= tolerance)
      const isNearOpenHigh = !isExactOpenHigh && diffOpenHighPct <= tolerance;

      if (isExactOpenLow) {
        signal = 'OPEN_LOW';
        signalType = 'BULLISH';
        signalStrength = changeFromOpenPct >= 1.0 ? 'STRONG' : 'MODERATE';
        suggestedAction = 'BUY';
        openLowCount++;
      } else if (isExactOpenHigh) {
        signal = 'OPEN_HIGH';
        signalType = 'BEARISH';
        signalStrength = changeFromOpenPct <= -1.0 ? 'STRONG' : 'MODERATE';
        suggestedAction = 'SELL';
        openHighCount++;
      } else if (isNearOpenLow) {
        signal = 'NEAR_OPEN_LOW';
        signalType = 'BULLISH';
        signalStrength = 'MODERATE';
        suggestedAction = 'BUY';
        nearOpenLowCount++;
      } else if (isNearOpenHigh) {
        signal = 'NEAR_OPEN_HIGH';
        signalType = 'BEARISH';
        signalStrength = 'MODERATE';
        suggestedAction = 'SELL';
        nearOpenHighCount++;
      }

      // Calculations for Risk / Reward and Suggested Levels
      let suggestedSL = 0;
      let suggestedTarget1 = 0;
      let suggestedTarget2 = 0;
      let riskPerShare = 0;

      if (signalType === 'BULLISH') {
        // SL is at Open / Low (whichever is lower) with tiny 0.05% buffer
        suggestedSL = Number((low * 0.9995).toFixed(2));
        riskPerShare = Number(Math.max(0.5, ltp - suggestedSL).toFixed(2));
        suggestedTarget1 = Number((ltp + riskPerShare * 1.5).toFixed(2));
        suggestedTarget2 = Number((ltp + riskPerShare * 2.5).toFixed(2));
      } else if (signalType === 'BEARISH') {
        // SL is at Open / High (whichever is higher) with tiny 0.05% buffer
        suggestedSL = Number((high * 1.0005).toFixed(2));
        riskPerShare = Number(Math.max(0.5, suggestedSL - ltp).toFixed(2));
        suggestedTarget1 = Number((ltp - riskPerShare * 1.5).toFixed(2));
        suggestedTarget2 = Number((ltp - riskPerShare * 2.5).toFixed(2));
      } else {
        suggestedSL = Number(low.toFixed(2));
        suggestedTarget1 = Number(high.toFixed(2));
        suggestedTarget2 = Number((high * 1.01).toFixed(2));
        riskPerShare = Number(Math.max(0.5, Math.abs(ltp - low)).toFixed(2));
      }

      const stockRes: OhlStockResult = {
        symbol: item.symbol,
        name: item.name,
        exchange: item.exchange || 'NSE',
        category: item.category || 'General',
        lotSize: item.lotSize || 1,
        isFnO: true,
        ltp,
        open,
        high,
        low,
        close,
        volume,
        change,
        changePct,
        changeFromOpen,
        changeFromOpenPct,
        diffOpenLow,
        diffOpenLowPct,
        diffOpenHigh,
        diffOpenHighPct,
        signal,
        signalType,
        signalStrength,
        suggestedAction,
        suggestedSL,
        suggestedTarget1,
        suggestedTarget2,
        riskReward: '1:2',
        riskPerShare,
        lastUpdated: new Date().toISOString(),
      };

      // Filter check
      if (filter === 'open_low' && signal !== 'OPEN_LOW' && signal !== 'NEAR_OPEN_LOW') {
        continue;
      }
      if (filter === 'open_high' && signal !== 'OPEN_HIGH' && signal !== 'NEAR_OPEN_HIGH') {
        continue;
      }
      if (filter === 'exact_open_low' && signal !== 'OPEN_LOW') {
        continue;
      }
      if (filter === 'exact_open_high' && signal !== 'OPEN_HIGH') {
        continue;
      }

      results.push(stockRes);
    }

    // Sort intelligently: Open=Low and Open=High stocks at top, sorted by signal strength & % change
    results.sort((a, b) => {
      const priorityOrder = { OPEN_LOW: 1, OPEN_HIGH: 1, NEAR_OPEN_LOW: 2, NEAR_OPEN_HIGH: 2, NEUTRAL: 3 };
      const rankDiff = priorityOrder[a.signal] - priorityOrder[b.signal];
      if (rankDiff !== 0) return rankDiff;
      return Math.abs(b.changeFromOpenPct) - Math.abs(a.changeFromOpenPct);
    });

    const response: OhlScannerResponse = {
      success: true,
      timestamp: new Date().toISOString(),
      totalScanned: results.length,
      summary: {
        openLowCount,
        openHighCount,
        nearOpenLowCount,
        nearOpenHighCount,
        advances,
        declines,
        unchanged,
      },
      universe,
      tolerance,
      stocks: results,
    };

    this.cache.set(cacheKey, { timestamp: Date.now(), data: response });
    return response;
  }

  /**
   * Helper fallback to fetch quotes via Yahoo Finance when broker session is offline
   */
  private async fallbackFetchQuotes(
    items: typeof FO_STOCKS_LIST,
    ohlcMap: Map<string, { open: number; high: number; low: number; close: number; ltp: number; volume: number }>
  ) {
    const promises = items.map(async (item) => {
      if (ohlcMap.has(item.symbol)) return;
      try {
        const url = `https://query2.finance.yahoo.com/v8/finance/chart/${item.symbol}.NS?interval=1d`;
        const res = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 3500 });
        const meta = res.data?.chart?.result?.[0]?.meta;
        const indicators = res.data?.chart?.result?.[0]?.indicators?.quote?.[0];
        if (meta) {
          const ltp = meta.regularMarketPrice || 0;
          const open = indicators?.open?.[indicators.open.length - 1] || meta.regularMarketOpen || ltp;
          const high = indicators?.high?.[indicators.high.length - 1] || meta.regularMarketDayHigh || ltp;
          const low = indicators?.low?.[indicators.low.length - 1] || meta.regularMarketDayLow || ltp;
          const close = meta.chartPreviousClose || meta.previousClose || ltp;
          const volume = meta.regularMarketVolume || 0;
          ohlcMap.set(item.symbol, { open, high, low, close, ltp, volume });
        }
      } catch {}
    });

    await Promise.allSettled(promises);
  }
}
