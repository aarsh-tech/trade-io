import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BrokerClientFactory } from '../brokers/broker-client.factory';

// Symbols to show in the ticker banner
const TICKER_SYMBOLS = [
  { key: 'NSE:NIFTY 50',   symbol: 'NIFTY 50',  exchange: 'NSE' },
  { key: 'BSE:SENSEX',     symbol: 'SENSEX',     exchange: 'BSE' },
  { key: 'NSE:BANKNIFTY',  symbol: 'BANKNIFTY',  exchange: 'NSE' },
  { key: 'NSE:RELIANCE',   symbol: 'RELIANCE',   exchange: 'NSE' },
  { key: 'NSE:TCS',        symbol: 'TCS',        exchange: 'NSE' },
  { key: 'NSE:HDFCBANK',   symbol: 'HDFCBANK',   exchange: 'NSE' },
  { key: 'NSE:INFY',       symbol: 'INFY',       exchange: 'NSE' },
  { key: 'NSE:ICICIBANK',  symbol: 'ICICIBANK',  exchange: 'NSE' },
  { key: 'NSE:SBIN',       symbol: 'SBIN',       exchange: 'NSE' },
  { key: 'NSE:BAJFINANCE', symbol: 'BAJFINANCE', exchange: 'NSE' },
  { key: 'NSE:ITC',        symbol: 'ITC',        exchange: 'NSE' },
  { key: 'NSE:MARUTI',     symbol: 'MARUTI',     exchange: 'NSE' },
];

@Injectable()
export class MarketService {
  private readonly logger = new Logger(MarketService.name);

  constructor(
    private prisma: PrismaService,
    private factory: BrokerClientFactory,
  ) { }

  async search(query: string, userId: string, accountId?: string) {
    let account = null;
    if (accountId && accountId !== 'null' && accountId !== 'undefined') {
      account = await this.prisma.brokerAccount.findUnique({ where: { id: accountId } });
    } else {
      account = await this.prisma.brokerAccount.findFirst({
        where: { userId, accessToken: { not: null } },
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
      const quotes  = await client.getLTP(symbols);
      const hasQ    = Object.keys(quotes).length > 0;
      return instruments.map((s: any) => ({
        ...s,
        ltpNSE: hasQ ? (quotes[`NSE:${s.symbol}`] || null) : null,
        ltpBSE: hasQ ? (quotes[`BSE:${s.symbol}`] || null) : null,
      }));
    } catch {
      return instruments.map((s: any) => ({ ...s, ltpNSE: null, ltpBSE: null }));
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
      const kite   = (client as any)['kite'];

      const keys = TICKER_SYMBOLS.map(s => s.key);
      const quotes = await kite.getLTP(keys);

      const tickers = TICKER_SYMBOLS.map(s => {
        const q = quotes[s.key];
        if (!q) return null;
        return {
          symbol:    s.symbol,
          exchange:  s.exchange,
          price:     q.last_price ?? 0,
          change:    (q.last_price ?? 0) - (q.close_price ?? q.last_price ?? 0),
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
}
