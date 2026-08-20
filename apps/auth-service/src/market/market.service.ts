import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BrokerClientFactory } from '../brokers/broker-client.factory';
import axios from 'axios';

// Symbols to show in the ticker banner
const TICKER_SYMBOLS = [
  { key: 'NSE:NIFTY 50', symbol: 'NIFTY 50', exchange: 'NSE' },
  { key: 'BSE:SENSEX', symbol: 'SENSEX', exchange: 'BSE' },
  { key: 'NSE:BANKNIFTY', symbol: 'BANKNIFTY', exchange: 'NSE' },
  { key: 'NSE:RELIANCE', symbol: 'RELIANCE', exchange: 'NSE' },
  { key: 'NSE:TCS', symbol: 'TCS', exchange: 'NSE' },
  { key: 'NSE:HDFCBANK', symbol: 'HDFCBANK', exchange: 'NSE' },
  { key: 'NSE:INFY', symbol: 'INFY', exchange: 'NSE' },
  { key: 'NSE:ICICIBANK', symbol: 'ICICIBANK', exchange: 'NSE' },
  { key: 'NSE:SBIN', symbol: 'SBIN', exchange: 'NSE' },
  { key: 'NSE:BAJFINANCE', symbol: 'BAJFINANCE', exchange: 'NSE' },
  { key: 'NSE:ITC', symbol: 'ITC', exchange: 'NSE' },
  { key: 'NSE:MARUTI', symbol: 'MARUTI', exchange: 'NSE' },
];

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

    const nseSymbols = [
      'BAJFINANCE', 'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'SBIN', 'BHARTIARTL', 'LT', 'ITC',
      'AXISBANK', 'KOTAKBANK', 'TATAMOTORS', 'M&M', 'SUNPHARMA', 'TITAN', 'ULTRACEMCO', 'NTPC', 'POWERGRID', 'MARUTI',
      'ADANIPORTS', 'ASIANPAINT', 'BAJAJFINSV', 'BPCL', 'CIPLA', 'COALINDIA', 'DRREDDY', 'EICHERMOT', 'GRASIM', 'HCLTECH',
      'HEROMOTOCO', 'HINDALCO', 'HINDUNILVR', 'INDUSINDBK', 'JSWSTEEL', 'LTIM', 'NESTLEIND', 'ONGC', 'TATACONSUM', 'TATASTEEL',
      'TECHM', 'WIPRO', 'ADANIENT', 'BEL', 'HAL', 'DIVISLAB', 'APOLLOHOSP', 'DLF', 'SHRIRAMFIN', 'TRENT'
    ];

    let results: Array<{ symbol: string; exchange: string; ltp: number; change: number; changePercent: number }> = [];

    const account = await this.prisma.brokerAccount.findFirst({
      where: { userId, isActive: true, accessToken: { not: null } },
    });

    if (account?.accessToken) {
      try {
        const client = this.factory.createClient(account);
        const kite = (client as any)['kite'];

        const chunkSize = 25;
        for (let i = 0; i < nseSymbols.length; i += chunkSize) {
          const chunk = nseSymbols.slice(i, i + chunkSize);
          const keys = chunk.map(s => `NSE:${s}`);
          const quotes = await kite.getOHLC(keys).catch(() => kite.getLTP(keys).catch(() => ({})));

          for (const sym of chunk) {
            const key = `NSE:${sym}`;
            const q = quotes[key];
            if (q) {
              const ltp = q.last_price || 0;
              const close = q.ohlc?.close || q.close_price || ltp;
              if (ltp > 0) {
                const change = ltp - close;
                const changePercent = close > 0 ? ((ltp - close) / close) * 100 : 0;
                results.push({
                  symbol: sym,
                  exchange: 'NSE',
                  ltp: Number(ltp.toFixed(2)),
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

    if (results.length < 10) {
      results = [];
      const fetchQuotes = nseSymbols.map(async (sym) => {
        try {
          const url = `https://query2.finance.yahoo.com/v8/finance/chart/${sym}.NS?interval=1d`;
          const res = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 4000 });
          const meta = res.data?.chart?.result?.[0]?.meta;
          if (meta && meta.regularMarketPrice) {
            const ltp = meta.regularMarketPrice;
            const prev = meta.chartPreviousClose || meta.previousClose || ltp;
            const change = ltp - prev;
            const changePercent = prev > 0 ? (change / prev) * 100 : 0;
            return {
              symbol: sym,
              exchange: 'NSE',
              ltp: Number(ltp.toFixed(2)),
              change: Number(change.toFixed(2)),
              changePercent: Number(changePercent.toFixed(2)),
            };
          }
        } catch {}
        return null;
      });

      const fetched = await Promise.all(fetchQuotes);
      results = fetched.filter(Boolean) as any[];
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

export const FO_STOCKS_LIST = [
  // Indices
  { symbol: 'NIFTY 50', name: 'Nifty 50 Index', exchange: 'NSE', category: 'Indices', lotSize: 25 },
  { symbol: 'BANKNIFTY', name: 'Nifty Bank Index', exchange: 'NSE', category: 'Indices', lotSize: 15 },
  { symbol: 'FINNIFTY', name: 'Nifty Financial Services Index', exchange: 'NSE', category: 'Indices', lotSize: 25 },
  { symbol: 'MIDCPNIFTY', name: 'Nifty Midcap Select Index', exchange: 'NSE', category: 'Indices', lotSize: 50 },
  { symbol: 'NIFTY IT', name: 'Nifty IT Index', exchange: 'NSE', category: 'Indices', lotSize: 25 },

  // A
  { symbol: 'AARTIIND', name: 'Aarti Industries Ltd', exchange: 'NSE', category: 'Chemicals', lotSize: 1000 },
  { symbol: 'ABB', name: 'ABB India Ltd', exchange: 'NSE', category: 'Capital Goods', lotSize: 125 },
  { symbol: 'ABBOTINDIA', name: 'Abbott India Ltd', exchange: 'NSE', category: 'Pharma', lotSize: 25 },
  { symbol: 'ABCAPITAL', name: 'Aditya Birla Capital Ltd', exchange: 'NSE', category: 'Banking', lotSize: 3100 },
  { symbol: 'ABFRL', name: 'Aditya Birla Fashion & Retail', exchange: 'NSE', category: 'Consumer Goods', lotSize: 2600 },
  { symbol: 'ACC', name: 'ACC Ltd', exchange: 'NSE', category: 'Construction', lotSize: 300 },
  { symbol: 'ADANIENT', name: 'Adani Enterprises Ltd', exchange: 'NSE', category: 'Energy & Metals', lotSize: 300 },
  { symbol: 'ADANIPORTS', name: 'Adani Ports & SEZ Ltd', exchange: 'NSE', category: 'Infrastructure', lotSize: 400 },
  { symbol: 'ALKEM', name: 'Alkem Laboratories Ltd', exchange: 'NSE', category: 'Pharma', lotSize: 100 },
  { symbol: 'AMBUJACEM', name: 'Ambuja Cements Ltd', exchange: 'NSE', category: 'Construction', lotSize: 900 },
  { symbol: 'APOLLOHOSP', name: 'Apollo Hospitals Enterprise', exchange: 'NSE', category: 'Pharma', lotSize: 125 },
  { symbol: 'APOLLOTYRE', name: 'Apollo Tyres Ltd', exchange: 'NSE', category: 'Auto', lotSize: 1750 },
  { symbol: 'ASHOKLEY', name: 'Ashok Leyland Ltd', exchange: 'NSE', category: 'Auto', lotSize: 5000 },
  { symbol: 'ASIANPAINT', name: 'Asian Paints Ltd', exchange: 'NSE', category: 'Consumer Goods', lotSize: 200 },
  { symbol: 'ASTRAL', name: 'Astral Ltd', exchange: 'NSE', category: 'Building Materials', lotSize: 375 },
  { symbol: 'ATUL', name: 'Atul Ltd', exchange: 'NSE', category: 'Chemicals', lotSize: 75 },
  { symbol: 'AUBANK', name: 'AU Small Finance Bank Ltd', exchange: 'NSE', category: 'Banking', lotSize: 1000 },
  { symbol: 'AUROPHARMA', name: 'Aurobindo Pharma Ltd', exchange: 'NSE', category: 'Pharma', lotSize: 550 },
  { symbol: 'AXISBANK', name: 'Axis Bank Ltd', exchange: 'NSE', category: 'Banking', lotSize: 625 },

  // B
  { symbol: 'BAJAJ-AUTO', name: 'Bajaj Auto Ltd', exchange: 'NSE', category: 'Auto', lotSize: 75 },
  { symbol: 'BAJAJFINSV', name: 'Bajaj Finserv Ltd', exchange: 'NSE', category: 'Banking', lotSize: 500 },
  { symbol: 'BAJFINANCE', name: 'Bajaj Finance Ltd', exchange: 'NSE', category: 'Banking', lotSize: 125 },
  { symbol: 'BALKRISIND', name: 'Balkrishna Industries Ltd', exchange: 'NSE', category: 'Auto', lotSize: 300 },
  { symbol: 'BALRAMCHIN', name: 'Balrampur Chini Mills Ltd', exchange: 'NSE', category: 'Agri', lotSize: 1600 },
  { symbol: 'BANDHANBNK', name: 'Bandhan Bank Ltd', exchange: 'NSE', category: 'Banking', lotSize: 2500 },
  { symbol: 'BANKBARODA', name: 'Bank of Baroda', exchange: 'NSE', category: 'Banking', lotSize: 2925 },
  { symbol: 'BATAINDIA', name: 'Bata India Ltd', exchange: 'NSE', category: 'Consumer Goods', lotSize: 375 },
  { symbol: 'BEL', name: 'Bharat Electronics Ltd', exchange: 'NSE', category: 'Defence', lotSize: 2850 },
  { symbol: 'BERGEPAINT', name: 'Berger Paints India Ltd', exchange: 'NSE', category: 'Consumer Goods', lotSize: 1100 },
  { symbol: 'BHARATFORG', name: 'Bharat Forge Ltd', exchange: 'NSE', category: 'Capital Goods', lotSize: 500 },
  { symbol: 'BHARTIARTL', name: 'Bharti Airtel Ltd', exchange: 'NSE', category: 'Telecommunication', lotSize: 475 },
  { symbol: 'BHEL', name: 'Bharat Heavy Electricals Ltd', exchange: 'NSE', category: 'Capital Goods', lotSize: 2625 },
  { symbol: 'BIOCON', name: 'Biocon Ltd', exchange: 'NSE', category: 'Pharma', lotSize: 2500 },
  { symbol: 'BOSCHLTD', name: 'Bosch Ltd', exchange: 'NSE', category: 'Auto', lotSize: 25 },
  { symbol: 'BPCL', name: 'Bharat Petroleum Corp Ltd', exchange: 'NSE', category: 'Energy & Metals', lotSize: 1975 },
  { symbol: 'BRITANNIA', name: 'Britannia Industries Ltd', exchange: 'NSE', category: 'FMCG', lotSize: 200 },
  { symbol: 'BSOFT', name: 'Birlasoft Ltd', exchange: 'NSE', category: 'IT', lotSize: 1000 },

  // C
  { symbol: 'CANBK', name: 'Canara Bank', exchange: 'NSE', category: 'Banking', lotSize: 6750 },
  { symbol: 'CANFINHOME', name: 'Can Fin Homes Ltd', exchange: 'NSE', category: 'Banking', lotSize: 650 },
  { symbol: 'CHAMBLFERT', name: 'Chambal Fertilisers & Chem', exchange: 'NSE', category: 'Chemicals', lotSize: 1500 },
  { symbol: 'CHOLAFIN', name: 'Cholamandalam Investment', exchange: 'NSE', category: 'Banking', lotSize: 625 },
  { symbol: 'CIPLA', name: 'Cipla Ltd', exchange: 'NSE', category: 'Pharma', lotSize: 650 },
  { symbol: 'COALINDIA', name: 'Coal India Ltd', exchange: 'NSE', category: 'Energy & Metals', lotSize: 2100 },
  { symbol: 'COFORGE', name: 'Coforge Ltd', exchange: 'NSE', category: 'IT', lotSize: 150 },
  { symbol: 'COLPAL', name: 'Colgate-Palmolive India Ltd', exchange: 'NSE', category: 'FMCG', lotSize: 350 },
  { symbol: 'CONCOR', name: 'Container Corp of India', exchange: 'NSE', category: 'Infrastructure', lotSize: 1000 },
  { symbol: 'COROMANDEL', name: 'Coromandel International', exchange: 'NSE', category: 'Chemicals', lotSize: 700 },
  { symbol: 'CROMPTON', name: 'Crompton Greaves Consumer', exchange: 'NSE', category: 'Consumer Goods', lotSize: 1800 },
  { symbol: 'CUMMINSIND', name: 'Cummins India Ltd', exchange: 'NSE', category: 'Capital Goods', lotSize: 300 },

  // D
  { symbol: 'DABUR', name: 'Dabur India Ltd', exchange: 'NSE', category: 'FMCG', lotSize: 1250 },
  { symbol: 'DALBHARAT', name: 'Dalmia Bharat Ltd', exchange: 'NSE', category: 'Construction', lotSize: 250 },
  { symbol: 'DEEPAKNTR', name: 'Deepak Nitrite Ltd', exchange: 'NSE', category: 'Chemicals', lotSize: 300 },
  { symbol: 'DIVISLAB', name: 'Divis Laboratories Ltd', exchange: 'NSE', category: 'Pharma', lotSize: 150 },
  { symbol: 'DIXON', name: 'Dixon Technologies Ltd', exchange: 'NSE', category: 'Consumer Goods', lotSize: 100 },
  { symbol: 'DLF', name: 'DLF Ltd', exchange: 'NSE', category: 'Real Estate', lotSize: 825 },
  { symbol: 'DRREDDY', name: 'Dr Reddys Laboratories Ltd', exchange: 'NSE', category: 'Pharma', lotSize: 125 },

  // E
  { symbol: 'EICHERMOT', name: 'Eicher Motors Ltd', exchange: 'NSE', category: 'Auto', lotSize: 175 },
  { symbol: 'ESCORTS', name: 'Escorts Kubota Ltd', exchange: 'NSE', category: 'Auto', lotSize: 275 },
  { symbol: 'EXIDEIND', name: 'Exide Industries Ltd', exchange: 'NSE', category: 'Auto', lotSize: 1800 },

  // F
  { symbol: 'FEDERALBNK', name: 'Federal Bank Ltd', exchange: 'NSE', category: 'Banking', lotSize: 5000 },

  // G
  { symbol: 'GAIL', name: 'GAIL (India) Ltd', exchange: 'NSE', category: 'Energy & Metals', lotSize: 2675 },
  { symbol: 'GLENMARK', name: 'Glenmark Pharmaceuticals', exchange: 'NSE', category: 'Pharma', lotSize: 725 },
  { symbol: 'GMRAIRPORT', name: 'GMR Airports Infrastructure', exchange: 'NSE', category: 'Infrastructure', lotSize: 11250 },
  { symbol: 'GNFC', name: 'Gujarat Narmada Valley Fert', exchange: 'NSE', category: 'Chemicals', lotSize: 1300 },
  { symbol: 'GODREJCP', name: 'Godrej Consumer Products', exchange: 'NSE', category: 'FMCG', lotSize: 500 },
  { symbol: 'GODREJPROP', name: 'Godrej Properties Ltd', exchange: 'NSE', category: 'Real Estate', lotSize: 475 },
  { symbol: 'GRANULES', name: 'Granules India Ltd', exchange: 'NSE', category: 'Pharma', lotSize: 2000 },
  { symbol: 'GRASIM', name: 'Grasim Industries Ltd', exchange: 'NSE', category: 'Construction', lotSize: 250 },
  { symbol: 'GUJGASLTD', name: 'Gujarat Gas Ltd', exchange: 'NSE', category: 'Energy & Metals', lotSize: 1250 },

  // H
  { symbol: 'HAL', name: 'Hindustan Aeronautics Ltd', exchange: 'NSE', category: 'Defence', lotSize: 300 },
  { symbol: 'HAVELLS', name: 'Havells India Ltd', exchange: 'NSE', category: 'Consumer Goods', lotSize: 500 },
  { symbol: 'HCLTECH', name: 'HCL Technologies Ltd', exchange: 'NSE', category: 'IT', lotSize: 350 },
  { symbol: 'HDFCBANK', name: 'HDFC Bank Ltd', exchange: 'NSE', category: 'Banking', lotSize: 550 },
  { symbol: 'HDFCLIFE', name: 'HDFC Life Insurance Co', exchange: 'NSE', category: 'Banking', lotSize: 1100 },
  { symbol: 'HEROMOTOCO', name: 'Hero MotoCorp Ltd', exchange: 'NSE', category: 'Auto', lotSize: 150 },
  { symbol: 'HINDALCO', name: 'Hindalco Industries Ltd', exchange: 'NSE', category: 'Energy & Metals', lotSize: 1400 },
  { symbol: 'HINDPETRO', name: 'Hindustan Petroleum Corp', exchange: 'NSE', category: 'Energy & Metals', lotSize: 2700 },
  { symbol: 'HINDUNILVR', name: 'Hindustan Unilever Ltd', exchange: 'NSE', category: 'FMCG', lotSize: 300 },
  { symbol: 'ICICIBANK', name: 'ICICI Bank Ltd', exchange: 'NSE', category: 'Banking', lotSize: 700 },
  { symbol: 'ICICIGI', name: 'ICICI Lombard General Ins', exchange: 'NSE', category: 'Banking', lotSize: 500 },
  { symbol: 'ICICIPRULI', name: 'ICICI Prudential Life Ins', exchange: 'NSE', category: 'Banking', lotSize: 1500 },
  { symbol: 'IDEA', name: 'Vodafone Idea Ltd', exchange: 'NSE', category: 'Telecommunication', lotSize: 80000 },
  { symbol: 'IDFCFIRSTB', name: 'IDFC First Bank Ltd', exchange: 'NSE', category: 'Banking', lotSize: 7500 },
  { symbol: 'IEX', name: 'Indian Energy Exchange Ltd', exchange: 'NSE', category: 'Capital Goods', lotSize: 3750 },
  { symbol: 'IGL', name: 'Indraprastha Gas Ltd', exchange: 'NSE', category: 'Energy & Metals', lotSize: 1375 },
  { symbol: 'INDHOTEL', name: 'Indian Hotels Co Ltd', exchange: 'NSE', category: 'Consumer Goods', lotSize: 2000 },
  { symbol: 'INDIAMART', name: 'IndiaMART InterMESH Ltd', exchange: 'NSE', category: 'IT', lotSize: 300 },
  { symbol: 'INDIGO', name: 'InterGlobe Aviation Ltd', exchange: 'NSE', category: 'Infrastructure', lotSize: 300 },
  { symbol: 'INDUSINDBK', name: 'IndusInd Bank Ltd', exchange: 'NSE', category: 'Banking', lotSize: 500 },
  { symbol: 'INDUSTOWER', name: 'Indus Towers Ltd', exchange: 'NSE', category: 'Telecommunication', lotSize: 3400 },
  { symbol: 'INFY', name: 'Infosys Ltd', exchange: 'NSE', category: 'IT', lotSize: 400 },
  { symbol: 'IOC', name: 'Indian Oil Corp Ltd', exchange: 'NSE', category: 'Energy & Metals', lotSize: 4875 },
  { symbol: 'IPCALAB', name: 'Ipca Laboratories Ltd', exchange: 'NSE', category: 'Pharma', lotSize: 650 },
  { symbol: 'IRCTC', name: 'IRCTC Ltd', exchange: 'NSE', category: 'Infrastructure', lotSize: 875 },
  { symbol: 'ITC', name: 'ITC Ltd', exchange: 'NSE', category: 'FMCG', lotSize: 1600 },

  // J
  { symbol: 'JINDALSTEL', name: 'Jindal Steel & Power Ltd', exchange: 'NSE', category: 'Energy & Metals', lotSize: 625 },
  { symbol: 'JKCEMENT', name: 'JK Cement Ltd', exchange: 'NSE', category: 'Construction', lotSize: 250 },
  { symbol: 'JSWSTEEL', name: 'JSW Steel Ltd', exchange: 'NSE', category: 'Energy & Metals', lotSize: 675 },
  { symbol: 'JUBLFOOD', name: 'Jubilant FoodWorks Ltd', exchange: 'NSE', category: 'FMCG', lotSize: 1250 },

  // K
  { symbol: 'KALYANKJIL', name: 'Kalyan Jewellers India', exchange: 'NSE', category: 'Consumer Goods', lotSize: 1500 },
  { symbol: 'KEI', name: 'KEI Industries Ltd', exchange: 'NSE', category: 'Capital Goods', lotSize: 150 },
  { symbol: 'KOTAKBANK', name: 'Kotak Mahindra Bank Ltd', exchange: 'NSE', category: 'Banking', lotSize: 400 },
  { symbol: 'KPITTECH', name: 'KPIT Technologies Ltd', exchange: 'NSE', category: 'IT', lotSize: 400 },

  // L
  { symbol: 'L&TFH', name: 'L&T Finance Holdings Ltd', exchange: 'NSE', category: 'Banking', lotSize: 4476 },
  { symbol: 'LT', name: 'Larsen & Toubro Ltd', exchange: 'NSE', category: 'Capital Goods', lotSize: 300 },
  { symbol: 'LTIM', name: 'LTIMindtree Ltd', exchange: 'NSE', category: 'IT', lotSize: 150 },
  { symbol: 'LTTS', name: 'L&T Technology Services', exchange: 'NSE', category: 'IT', lotSize: 200 },
  { symbol: 'LUPIN', name: 'Lupin Ltd', exchange: 'NSE', category: 'Pharma', lotSize: 425 },

  // M
  { symbol: 'M&M', name: 'Mahindra & Mahindra Ltd', exchange: 'NSE', category: 'Auto', lotSize: 350 },
  { symbol: 'M&MFIN', name: 'Mahindra & Mahindra Fin', exchange: 'NSE', category: 'Banking', lotSize: 2000 },
  { symbol: 'MANAPPURAM', name: 'Manappuram Finance Ltd', exchange: 'NSE', category: 'Banking', lotSize: 3000 },
  { symbol: 'MARICO', name: 'Marico Ltd', exchange: 'NSE', category: 'FMCG', lotSize: 1200 },
  { symbol: 'MARUTI', name: 'Maruti Suzuki India Ltd', exchange: 'NSE', category: 'Auto', lotSize: 100 },
  { symbol: 'MCDOWELL-N', name: 'United Spirits Ltd', exchange: 'NSE', category: 'FMCG', lotSize: 700 },
  { symbol: 'MCX', name: 'Multi Commodity Exchange', exchange: 'NSE', category: 'Capital Goods', lotSize: 250 },
  { symbol: 'METROPOLIS', name: 'Metropolis Healthcare Ltd', exchange: 'NSE', category: 'Pharma', lotSize: 300 },
  { symbol: 'MFSL', name: 'Max Financial Services', exchange: 'NSE', category: 'Banking', lotSize: 800 },
  { symbol: 'MGL', name: 'Mahanagar Gas Ltd', exchange: 'NSE', category: 'Energy & Metals', lotSize: 400 },
  { symbol: 'MOTHERSON', name: 'Samvardhana Motherson Int', exchange: 'NSE', category: 'Auto', lotSize: 6150 },
  { symbol: 'MPHASIS', name: 'Mphasis Ltd', exchange: 'NSE', category: 'IT', lotSize: 275 },
  { symbol: 'MRF', name: 'MRF Ltd', exchange: 'NSE', category: 'Auto', lotSize: 5 },
  { symbol: 'MUTHOOTFIN', name: 'Muthoot Finance Ltd', exchange: 'NSE', category: 'Banking', lotSize: 550 },

  // N
  { symbol: 'NATIONALUM', name: 'National Aluminium Co', exchange: 'NSE', category: 'Energy & Metals', lotSize: 3750 },
  { symbol: 'NAVINFLUOR', name: 'Navin Fluorine Intl Ltd', exchange: 'NSE', category: 'Chemicals', lotSize: 175 },
  { symbol: 'NESTLEIND', name: 'Nestle India Ltd', exchange: 'NSE', category: 'FMCG', lotSize: 250 },
  { symbol: 'NMDC', name: 'NMDC Ltd', exchange: 'NSE', category: 'Energy & Metals', lotSize: 4500 },
  { symbol: 'NTPC', name: 'NTPC Ltd', exchange: 'NSE', category: 'Energy & Metals', lotSize: 2250 },

  // O
  { symbol: 'OBEROIRLTY', name: 'Oberoi Realty Ltd', exchange: 'NSE', category: 'Real Estate', lotSize: 700 },
  { symbol: 'OFSS', name: 'Oracle Financial Services', exchange: 'NSE', category: 'IT', lotSize: 100 },
  { symbol: 'OIL', name: 'Oil India Ltd', exchange: 'NSE', category: 'Energy & Metals', lotSize: 1600 },
  { symbol: 'ONGC', name: 'Oil & Natural Gas Corp', exchange: 'NSE', category: 'Energy & Metals', lotSize: 3850 },

  // P
  { symbol: 'PAGEIND', name: 'Page Industries Ltd', exchange: 'NSE', category: 'Consumer Goods', lotSize: 15 },
  { symbol: 'PERSISTENT', name: 'Persistent Systems Ltd', exchange: 'NSE', category: 'IT', lotSize: 100 },
  { symbol: 'PETRONET', name: 'Petronet LNG Ltd', exchange: 'NSE', category: 'Energy & Metals', lotSize: 3000 },
  { symbol: 'PFC', name: 'Power Finance Corp Ltd', exchange: 'NSE', category: 'Banking', lotSize: 1900 },
  { symbol: 'PIDILITIND', name: 'Pidilite Industries Ltd', exchange: 'NSE', category: 'Chemicals', lotSize: 250 },
  { symbol: 'PIIND', name: 'PI Industries Ltd', exchange: 'NSE', category: 'Chemicals', lotSize: 250 },
  { symbol: 'PNB', name: 'Punjab National Bank', exchange: 'NSE', category: 'Banking', lotSize: 8000 },
  { symbol: 'POLYCAB', name: 'Polycab India Ltd', exchange: 'NSE', category: 'Capital Goods', lotSize: 125 },
  { symbol: 'POWERGRID', name: 'Power Grid Corp of India', exchange: 'NSE', category: 'Energy & Metals', lotSize: 2700 },
  { symbol: 'PVRINOX', name: 'PVR INOX Ltd', exchange: 'NSE', category: 'Consumer Goods', lotSize: 407 },

  // R
  { symbol: 'RAMCOCEM', name: 'Ramco Cements Ltd', exchange: 'NSE', category: 'Construction', lotSize: 850 },
  { symbol: 'RBLBANK', name: 'RBL Bank Ltd', exchange: 'NSE', category: 'Banking', lotSize: 2500 },
  { symbol: 'RECLTD', name: 'REC Ltd', exchange: 'NSE', category: 'Banking', lotSize: 1500 },
  { symbol: 'RELIANCE', name: 'Reliance Industries Ltd', exchange: 'NSE', category: 'Energy & Metals', lotSize: 250 },

  // S
  { symbol: 'SAIL', name: 'Steel Authority of India', exchange: 'NSE', category: 'Energy & Metals', lotSize: 8000 },
  { symbol: 'SBICARD', name: 'SBI Cards & Payment Serv', exchange: 'NSE', category: 'Banking', lotSize: 800 },
  { symbol: 'SBILIFE', name: 'SBI Life Insurance Co', exchange: 'NSE', category: 'Banking', lotSize: 375 },
  { symbol: 'SBIN', name: 'State Bank of India', exchange: 'NSE', category: 'Banking', lotSize: 750 },
  { symbol: 'SHREECEM', name: 'Shree Cement Ltd', exchange: 'NSE', category: 'Construction', lotSize: 25 },
  { symbol: 'SHRIRAMFIN', name: 'Shriram Finance Ltd', exchange: 'NSE', category: 'Banking', lotSize: 300 },
  { symbol: 'SIEMENS', name: 'Siemens Ltd', exchange: 'NSE', category: 'Capital Goods', lotSize: 150 },
  { symbol: 'SRF', name: 'SRF Ltd', exchange: 'NSE', category: 'Chemicals', lotSize: 375 },
  { symbol: 'SUNPHARMA', name: 'Sun Pharmaceutical Ind', exchange: 'NSE', category: 'Pharma', lotSize: 350 },
  { symbol: 'SUNTV', name: 'Sun TV Network Ltd', exchange: 'NSE', category: 'Media', lotSize: 1500 },
  { symbol: 'SYNGENE', name: 'Syngene International Ltd', exchange: 'NSE', category: 'Pharma', lotSize: 1000 },

  // T
  { symbol: 'TATACOMM', name: 'Tata Communications Ltd', exchange: 'NSE', category: 'Telecommunication', lotSize: 500 },
  { symbol: 'TATACONSUM', name: 'Tata Consumer Products', exchange: 'NSE', category: 'FMCG', lotSize: 900 },
  { symbol: 'TATAMOTORS', name: 'Tata Motors Ltd', exchange: 'NSE', category: 'Auto', lotSize: 550 },
  { symbol: 'TATAPOWER', name: 'Tata Power Co Ltd', exchange: 'NSE', category: 'Energy & Metals', lotSize: 1687 },
  { symbol: 'TATASTEEL', name: 'Tata Steel Ltd', exchange: 'NSE', category: 'Energy & Metals', lotSize: 5500 },
  { symbol: 'TCS', name: 'Tata Consultancy Services', exchange: 'NSE', category: 'IT', lotSize: 175 },
  { symbol: 'TECHM', name: 'Tech Mahindra Ltd', exchange: 'NSE', category: 'IT', lotSize: 600 },
  { symbol: 'TITAN', name: 'Titan Company Ltd', exchange: 'NSE', category: 'Consumer Goods', lotSize: 175 },
  { symbol: 'TORNTPHARM', name: 'Torrent Pharmaceuticals', exchange: 'NSE', category: 'Pharma', lotSize: 250 },
  { symbol: 'TORNTPOWER', name: 'Torrent Power Ltd', exchange: 'NSE', category: 'Energy & Metals', lotSize: 750 },
  { symbol: 'TRENT', name: 'Trent Ltd', exchange: 'NSE', category: 'Consumer Goods', lotSize: 100 },
  { symbol: 'TVSMOTOR', name: 'TVS Motor Co Ltd', exchange: 'NSE', category: 'Auto', lotSize: 350 },

  // U
  { symbol: 'ULTRACEMCO', name: 'UltraTech Cement Ltd', exchange: 'NSE', category: 'Construction', lotSize: 100 },
  { symbol: 'UPL', name: 'UPL Ltd', exchange: 'NSE', category: 'Chemicals', lotSize: 1300 },

  // V
  { symbol: 'VBL', name: 'Varun Beverages Ltd', exchange: 'NSE', category: 'FMCG', lotSize: 750 },
  { symbol: 'VEDL', name: 'Vedanta Ltd', exchange: 'NSE', category: 'Energy & Metals', lotSize: 2300 },
  { symbol: 'VOLTAS', name: 'Voltas Ltd', exchange: 'NSE', category: 'Consumer Goods', lotSize: 600 },

  // W
  { symbol: 'WIPRO', name: 'Wipro Ltd', exchange: 'NSE', category: 'IT', lotSize: 1500 },

  // Z
  { symbol: 'ZEEL', name: 'Zee Entertainment Ent', exchange: 'NSE', category: 'Media', lotSize: 3000 },
  { symbol: 'ZYDUSLIFE', name: 'Zydus Lifesciences Ltd', exchange: 'NSE', category: 'Pharma', lotSize: 900 },
];


