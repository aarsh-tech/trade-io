import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BrokerClientFactory } from '../brokers/broker-client.factory';
import { TICKER_SYMBOLS, NIFTY_500_UNIVERSE, FO_STOCKS_LIST } from './market.constants';

export { TICKER_SYMBOLS, NIFTY_500_UNIVERSE, FO_STOCKS_LIST };

@Injectable()
export class MarketService {
  private readonly logger = new Logger(MarketService.name);

  constructor(
    private prisma: PrismaService,
    private factory: BrokerClientFactory,
  ) { }

  async search(query: string, userId?: string, accountId?: string) {
    let account = null;
    if (accountId && accountId !== 'null' && accountId !== 'undefined') {
      account = await this.prisma.brokerAccount.findUnique({ where: { id: accountId } });
    }
    if (!account || !account.accessToken) {
      if (userId) {
        account = await this.prisma.brokerAccount.findFirst({
          where: { userId, accessToken: { not: null } },
        });
      }
    }
    // Fallback to any active broker account with accessToken in system
    if (!account || !account.accessToken) {
      account = await this.prisma.brokerAccount.findFirst({
        where: { accessToken: { not: null }, isActive: true },
      });
    }

    if (!account || !account.accessToken) return [];

    let client: any;
    try { client = this.factory.createClient(account); }
    catch (e) { return []; }

    const instruments = await client.searchInstruments(query);
    if (!instruments || instruments.length === 0) return [];

    try {
      const symbols = instruments.map((s: any) => `${s.exchange}:${s.symbol}`);
      const quotes = await client.getLTP(symbols);
      const hasQ = Object.keys(quotes).length > 0;
      return instruments.map((s: any) => {
        const exactKey = `${s.exchange}:${s.symbol}`;
        const ltpVal = quotes[exactKey] ?? quotes[`NSE:${s.symbol}`] ?? quotes[`NFO:${s.symbol}`] ?? quotes[`BSE:${s.symbol}`] ?? null;
        return {
          ...s,
          ltp: ltpVal,
          ltpNSE: quotes[`NSE:${s.symbol}`] || null,
          ltpBSE: quotes[`BSE:${s.symbol}`] || null,
          price: ltpVal || 0,
        };
      });
    } catch {
      return instruments.map((s: any) => ({ ...s, ltp: null, ltpNSE: null, ltpBSE: null, price: 0 }));
    }
  }

  // ── Live prices for the ticker banner ─────────────────────────────────────

  async getLivePrices(userId: string): Promise<{
    connected: boolean;
    tickers: Array<{ symbol: string; exchange: string; price: number; change: number; changePct: number }>;
  }> {
    const account = await this.prisma.brokerAccount.findFirst({
      where: { userId, isActive: true, accessToken: { not: null } },
    });

    if (!account?.accessToken) {
      return { connected: false, tickers: [] };
    }

    try {
      const client = this.factory.createClient(account);
      const kite = (client as any)['kite'];

      const keys = TICKER_SYMBOLS.map(s => s.key);
      const quotes = await kite.getLTP(keys);

      const tickers = TICKER_SYMBOLS.map(s => {
        const q = quotes[s.key];
        if (!q) return null;
        return {
          symbol: s.symbol,
          exchange: s.exchange,
          price: q.last_price ?? 0,
          change: (q.last_price ?? 0) - (q.close_price ?? q.last_price ?? 0),
          changePct: q.close_price
            ? (((q.last_price - q.close_price) / q.close_price) * 100)
            : 0,
        };
      }).filter(Boolean);

      return { connected: true, tickers: tickers as any };
    } catch (e) {
      this.logger.warn(`getLivePrices failed: ${e.message}`);
      return { connected: false, tickers: [] };
    }
  }

  // ── Dashboard Overview (Indices + Persistent Watchlist) ─────────────────────

  async getOverview(userId: string) {
    const account = await this.prisma.brokerAccount.findFirst({
      where: { userId, isActive: true, accessToken: { not: null } },
    });

    const defaultIndices = [
      { symbol: 'NIFTY 50', change: 0, changeAbs: 0, price: 0 },
      { symbol: 'SENSEX', change: 0, changeAbs: 0, price: 0 },
      { symbol: 'BANKNIFTY', change: 0, changeAbs: 0, price: 0 },
    ];

    let indices = defaultIndices;
    if (account?.accessToken) {
      try {
        const client = this.factory.createClient(account);
        const kite = (client as any)['kite'];
        const indexKeys = ['NSE:NIFTY 50', 'BSE:SENSEX', 'NSE:BANKNIFTY'];
        const quotes = await kite.getLTP(indexKeys).catch(() => ({}));

        indices = indexKeys.map(key => {
          const symbol = key.split(':')[1];
          const q = quotes[key];
          const price = q?.last_price ?? 0;
          const prev = q?.close_price ?? price;
          const changeAbs = price - prev;
          const change = prev ? (changeAbs / prev) * 100 : 0;
          return { symbol, price, change, changeAbs };
        });
      } catch (e) {
        this.logger.warn(`Failed to fetch indices: ${e.message}`);
      }
    }

    // Fetch user's persistent watchlist
    const watchlist = await this.prisma.watchlist.findFirst({
      where: { userId, name: 'Default' },
    });

    let watchSymbols = watchlist?.symbols || [];

    // Fallback if empty
    if (watchSymbols.length === 0) {
      watchSymbols = ['NSE:RELIANCE', 'NSE:TCS', 'NSE:HDFCBANK', 'NSE:INFY', 'NSE:ICICIBANK'];
      // Initialize if doesn't exist
      if (!watchlist) {
        await this.prisma.watchlist.create({
          data: { userId, name: 'Default', symbols: watchSymbols },
        });
      }
    }

    const stocks = watchSymbols.map(s => {
      const [exchange, symbol] = s.includes(':') ? s.split(':') : ['NSE', s];
      return { symbol, exchange, price: 0, change: 0 };
    });

    // Fetch initial LTP for stocks if possible
    if (account?.accessToken && stocks.length > 0) {
      try {
        const client = this.factory.createClient(account);
        const kite = (client as any)['kite'];
        const quotes = await kite.getLTP(watchSymbols).catch(() => ({}));

        stocks.forEach(stock => {
          const key = `${stock.exchange}:${stock.symbol}`;
          const q = quotes[key];
          if (q) {
            stock.price = q.last_price;
            const prev = q.close_price || q.last_price;
            stock.change = prev ? ((q.last_price - prev) / prev) * 100 : 0;
          }
        });
      } catch (e) {
        this.logger.warn(`Failed to fetch initial stock prices: ${e.message}`);
      }
    }

    return {
      indices,
      stocks,
    };
  }

  async addToWatchlist(userId: string, symbol: string, exchange: string = 'NSE') {
    const key = `${exchange}:${symbol}`;
    let watchlist = await this.prisma.watchlist.findFirst({
      where: { userId, name: 'Default' },
    });

    if (!watchlist) {
      return this.prisma.watchlist.create({
        data: { userId, name: 'Default', symbols: [key] },
      });
    }

    if (watchlist.symbols.includes(key)) return watchlist;

    return this.prisma.watchlist.update({
      where: { id: watchlist.id },
      data: { symbols: { push: key } },
    });
  }

  async removeFromWatchlist(userId: string, symbol: string, exchange: string = 'NSE') {
    const key = `${exchange}:${symbol}`;
    const watchlist = await this.prisma.watchlist.findFirst({
      where: { userId, name: 'Default' },
    });

    if (!watchlist) return null;

    return this.prisma.watchlist.update({
      where: { id: watchlist.id },
      data: {
        symbols: {
          set: watchlist.symbols.filter(s => s !== key),
        },
      },
    });
  }

  // ── F&O Stocks List with Official Lot Sizes & Prices ──────────────────────

  async getFoStocks(userId?: string) {
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

    const foStocks = FO_STOCKS_LIST.map(s => ({
      ...s,
      ltp: 0,
      open: 0,
      high: 0,
      low: 0,
      close: 0,
      change: 0,
      changePercent: 0,
      volume: 0,
    }));

    if (account?.accessToken) {
      try {
        const client = this.factory.createClient(account);
        const kite = (client as any)['kite'];
        
        // Chunk keys into batches of 100 for Kite API
        const chunkSize = 100;
        for (let i = 0; i < FO_STOCKS_LIST.length; i += chunkSize) {
          const chunk = FO_STOCKS_LIST.slice(i, i + chunkSize);
          const keys = chunk.map(s => `${s.exchange || 'NSE'}:${s.symbol}`);
          const quotes = await kite.getOHLC(keys).catch(() => kite.getLTP(keys).catch(() => ({})));

          chunk.forEach(s => {
            const stock = foStocks.find(st => st.symbol === s.symbol);
            if (!stock) return;
            const q = quotes[`${s.exchange || 'NSE'}:${s.symbol}`] || quotes[`NSE:${s.symbol}`] || quotes[s.symbol];
            if (q) {
              stock.ltp = q.last_price || 0;
              const close = q.ohlc?.close || q.close_price || stock.ltp;
              stock.close = close;
              stock.open = q.ohlc?.open || stock.ltp;
              stock.high = q.ohlc?.high || stock.ltp;
              stock.low = q.ohlc?.low || stock.ltp;
              stock.change = Number((stock.ltp - close).toFixed(2));
              stock.changePercent = close > 0 ? Number((((stock.ltp - close) / close) * 100).toFixed(2)) : 0;
            }
          });
        }

        try {
          const nfoInstruments = await kite.getInstruments(['NFO']).catch(() => []);
          if (nfoInstruments.length > 0) {
            foStocks.forEach(stock => {
              const match = nfoInstruments.find((inst: any) => inst.name === stock.symbol || inst.tradingsymbol === stock.symbol);
              if (match && match.lot_size > 0) {
                stock.lotSize = match.lot_size;
              }
            });
          }
        } catch {}
      } catch (e: any) {
        this.logger.warn(`Failed to fetch live quotes for F&O stocks: ${e.message}`);
      }
    }

    return foStocks;
  }

  // ── Top Gainers & Top Losers ────────────────────────────────────────────────

  private moversCache: { data: { topGainers: any[]; topLosers: any[] }; timestamp: number } | null = null;

  async getMovers(userId: string) {
    if (this.moversCache && (Date.now() - this.moversCache.timestamp < 60_000)) {
      return this.moversCache.data;
    }

    const nseSymbols = NIFTY_500_UNIVERSE;

    let results: Array<{
      symbol: string;
      exchange: string;
      ltp: number;
      close?: number;
      prevClose?: number;
      change: number;
      changePercent: number;
    }> = [];

    const account = await this.prisma.brokerAccount.findFirst({
      where: { userId, isActive: true, accessToken: { not: null } },
    }) || await this.prisma.brokerAccount.findFirst({
      where: { isActive: true, accessToken: { not: null } },
    });

    if (account?.accessToken) {
      try {
        const client = this.factory.createClient(account);
        const kite = (client as any)['kite'];

        const chunkSize = 150;
        for (let i = 0; i < nseSymbols.length; i += chunkSize) {
          const chunk = nseSymbols.slice(i, i + chunkSize);
          const keys = chunk.map(s => `NSE:${s}`);
          const quotes = await kite.getOHLC(keys).catch(() => kite.getLTP(keys).catch(() => ({})));

          for (const sym of chunk) {
            const key = `NSE:${sym}`;
            const q = quotes[key] || quotes[sym];
            if (q) {
              const ltp = q.last_price || q.ohlc?.close || 0;
              const close = q.ohlc?.close || q.close_price || ltp;
              if (ltp > 0 && close > 0) {
                const change = ltp - close;
                const changePercent = ((ltp - close) / close) * 100;
                results.push({
                  symbol: sym,
                  exchange: 'NSE',
                  ltp: Number(ltp.toFixed(2)),
                  close: Number(close.toFixed(2)),
                  prevClose: Number(close.toFixed(2)),
                  change: Number(change.toFixed(2)),
                  changePercent: Number(changePercent.toFixed(2)),
                });
              }
            }
          }
        }
      } catch (e) {
        this.logger.warn(`Zerodha getOHLC failed: ${e.message}`);
      }
    }


    const topGainers = [...results].sort((a, b) => b.changePercent - a.changePercent).slice(0, 8);
    const topLosers = [...results].sort((a, b) => a.changePercent - b.changePercent).slice(0, 8);

    const payload = { topGainers, topLosers };
    if (results.length > 0) {
      this.moversCache = { data: payload, timestamp: Date.now() };
    }

    return payload;
  }
}



