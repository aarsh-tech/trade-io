import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { MarketGateway } from './market.gateway';
import { BrokerClientFactory } from '../brokers/broker-client.factory';
import { PrismaService } from '../prisma/prisma.service';
import { BrokerType } from '@prisma/client';
import { canonicalKey, INDEX_INSTRUMENTS, InstrumentStore } from '../brokers/instrument-store';
import { toKiteError } from '../brokers/kite-errors';
import { clearObservedClosed, isMarketWindow, isTradingDay, istParts, markObservedClosed } from './market-calendar';
import { CLOSED_FEED, FeedState, FeedStatus, MarketTick, OrderUpdateEvent } from './market-tick';

/** Kite allows at most 3000 instruments per websocket connection. */
const MAX_TOKENS_PER_TICKER = 3000;
/** Kite sends a heartbeat about every second; this long with nothing at all means the feed is stale. */
const FEED_STALE_AFTER_MS = 15_000;
const FEED_HEALTH_INTERVAL_MS = 5_000;
/** Re-emit an unchanged feed status this often so clients can show a fresh "last update". */
const FEED_REEMIT_MS = 15_000;
/** While a feed is stale, serve REST quote snapshots at most this often per account, for at most this many symbols. */
const REST_FALLBACK_INTERVAL_MS = 5_000;
const REST_FALLBACK_MAX_SYMBOLS = 200;
/**
 * Always subscribed in `full` mode on every connection: index packets are only 32 bytes and carry the exchange
 * timestamp, which gives the feed status a real exchange clock even though quote-mode stock packets have none.
 */
const CLOCK_INDEX_KEY = 'NSE:NIFTY 50';

@Injectable()
export class TickerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TickerService.name);
  private tickers = new Map<string, any>();
  private failedAccounts = new Map<string, { timestamp: number; accessToken: string }>();
  private refreshInterval: NodeJS.Timeout;
  private warmInterval: NodeJS.Timeout;
  private feedInterval: NodeJS.Timeout;
  private feedPublished = new Map<string, { status: FeedState; at: number }>();
  private listeners = new Set<(ticks: Record<string, number>) => void>();
  private orderListeners = new Set<(accountId: string, update: OrderUpdateEvent) => void>();

  /** Engine-facing tick stream: `{ SYMBOL: ltp, 'EXCH:SYMBOL': ltp }`. Browsers get the normalised `ticks` event instead. */
  registerListener(callback: (ticks: Record<string, number>) => void) {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  /** Order postbacks from the Kite websocket, tagged with the broker account they belong to. */
  registerOrderListener(callback: (accountId: string, update: OrderUpdateEvent) => void) {
    this.orderListeners.add(callback);
    return () => {
      this.orderListeners.delete(callback);
    };
  }

  /** Subscribe tokens in `quote` mode, skipping ones already subscribed and honouring the per-connection cap. */
  private subscribeTokens(tickerData: any, tokens: number[]) {
    const have = new Set<number>(tickerData.tokens || []);
    const fresh = Array.from(new Set(tokens)).filter((t) => !have.has(t));
    const room = MAX_TOKENS_PER_TICKER - have.size;
    if (fresh.length > room) {
      this.logger.warn(`Ticker token cap (${MAX_TOKENS_PER_TICKER}) reached; dropping ${fresh.length - Math.max(room, 0)} subscriptions`);
    }
    const accepted = fresh.slice(0, Math.max(room, 0));
    if (accepted.length === 0) return 0;
    accepted.forEach((t) => have.add(t));
    tickerData.tokens = Array.from(have);
    tickerData.instance.subscribe(accepted);
    tickerData.instance.setMode(tickerData.instance.modeQuote, accepted);
    return accepted.length;
  }

  async subscribeSymbol(accountId: string, symbol: string) {
    if (!this.isIndianMarketOpen()) return;
    if (!this.tickers.has(accountId)) {
      await this.ensureTickerRunning(accountId, [symbol]);
      if (!this.tickers.has(accountId)) return;
    }
    const tickerData = this.tickers.get(accountId);
    let token = tickerData.resolveToken ? tickerData.resolveToken(symbol) : tickerData.symbolToToken.get(symbol);
    
    if (!token) {
      // Dynamic fallback instrument lookup for newly generated options contracts & stocks
      try {
        const account = await this.prisma.brokerAccount.findUnique({ where: { id: accountId } });
        if (account?.accessToken) {
          const client = this.brokerFactory.createClient(account);
          const isBfo = symbol.startsWith('SENSEX') || symbol.includes('BFO') || symbol.startsWith('BSE:SENSEX');
          const isOptionOrFuture = /CE$|PE$|FUT$/.test(symbol) || symbol.includes('-') || symbol.startsWith('NIFTY') || symbol.startsWith('BANKNIFTY');
          const primaryExchange = isBfo ? 'BFO' : (isOptionOrFuture ? 'NFO' : 'NSE');
          // All of these come from the shared daily master (cached), not a REST call per miss.
          let instruments = await client.getInstruments(primaryExchange);
          let match = instruments.find((i: any) => i.tradingsymbol === symbol);
          if (!match && isBfo) {
            const bseInstruments = await client.getInstruments('BSE');
            match = bseInstruments.find((i: any) => i.tradingsymbol === symbol);
          } else if (!match && !isOptionOrFuture) {
            const nfoInstruments = await client.getInstruments('NFO');
            match = nfoInstruments.find((i: any) => i.tradingsymbol === symbol);
          }
          if (match?.instrument_token) {
            token = match.instrument_token;
            const matchExchange = match.exchange || match.segment || primaryExchange;
            tickerData.symbolToToken.set(symbol, token);
            tickerData.symbolToToken.set(`${matchExchange}:${symbol}`, token);
            tickerData.symbolToToken.set(`BFO:${symbol}`, token);
            tickerData.symbolToToken.set(`BSE:${symbol}`, token);
            tickerData.symbolToToken.set(`NSE:${symbol}`, token);
            tickerData.symbolToToken.set(`NFO:${symbol}`, token);
            tickerData.tokenToSymbol.set(token, { symbol, exchange: matchExchange });
          }
        }
      } catch (err: any) {
        this.logger.warn(`Dynamic token resolution failed for ${symbol}: ${err?.message || err}`);
      }
    }

    if (token) {
      if (this.subscribeTokens(tickerData, [token]) > 0) {
        this.logger.log(`Dynamically subscribed to ticker symbol: ${symbol} (token: ${token})`);
      }
    } else {
      this.logger.warn(`Could not resolve token for symbol: ${symbol}`);
    }
  }

  constructor(
    private readonly marketGateway: MarketGateway,
    private readonly brokerFactory: BrokerClientFactory,
    private readonly prisma: PrismaService,
  ) { }

  /** Active window: 15 min pre-open to 5 min after close, on exchange trading days only (holiday-aware). */
  private isIndianMarketOpen(): boolean {
    return isMarketWindow(new Date(), 15, 5);
  }

  async onModuleInit() {
    this.logger.log('Initializing Ticker Service...');
    await this.syncTickers();

    // Check every 30 seconds (reduced from 10s to lower idle load)
    this.refreshInterval = setInterval(() => this.syncTickers(), 30000);

    // Refresh the shared instrument master shortly after Kite publishes it (08:45 IST), so the
    // first request of the day never pays for the download.
    void this.warmInstrumentStore();
    this.warmInterval = setInterval(() => void this.warmInstrumentStore(), 5 * 60_000);

    this.feedInterval = setInterval(() => this.publishFeedStatuses(), FEED_HEALTH_INTERVAL_MS);
  }

  /**
   * Backstop for the static holiday list (unknown year, unlisted closure). Once the market should be
   * open, a connected feed whose exchange clock (NIFTY 50) still carries a previous day's timestamp
   * means the exchange is closed today; flag it so the ticker, scheduler and auto-start stand down.
   * Runs from 09:12 IST, before the 09:15 auto-start; needs a positive stale timestamp, so a silent
   * or timestamp-less feed never triggers it.
   */
  private verifyCalendarAgainstFeed() {
    const { date, minute } = istParts();
    if (!isTradingDay() || minute < 9 * 60 + 12 || minute > 15 * 60 + 30) return;

    let staleEvidence = false;
    this.tickers.forEach((t) => {
      if (!t.connected || !t.lastExchangeTs) return;
      const tsDate = istParts(new Date(t.lastExchangeTs)).date;
      if (tsDate === date) return void clearObservedClosed(date);
      if (tsDate < date) staleEvidence = true;
    });
    if (staleEvidence && isTradingDay()) markObservedClosed(date);
  }

  /** Aggregate each viewer's feed health across their accounts and push it to their sockets on change. */
  private publishFeedStatuses() {
    this.verifyCalendarAgainstFeed();
    const marketOpen = this.isIndianMarketOpen();
    const now = Date.now();
    const byUser = new Map<string, FeedStatus>();
    const rank: Record<FeedState, number> = { closed: 0, stale: 1, connected: 2 };

    this.tickers.forEach((t) => {
      if (!t.userId) return;
      let status: FeedState = 'closed';
      if (marketOpen) {
        status = t.connected && t.lastMessageAt && now - t.lastMessageAt < FEED_STALE_AFTER_MS ? 'connected' : 'stale';
        if (status === 'stale') void this.serveRestSnapshot(t);
      }
      const next: FeedStatus = {
        status,
        lastExchangeTs: t.lastExchangeTs ?? null,
        lastMessageAt: t.lastMessageAt ? new Date(t.lastMessageAt).toISOString() : null,
      };
      const cur = byUser.get(t.userId);
      if (!cur || rank[status] > rank[cur.status]) byUser.set(t.userId, next);
    });

    // Users whose ticker is gone (market closed, expired token, torn down) become `closed`.
    this.feedPublished.forEach((_, userId) => {
      if (!byUser.has(userId)) byUser.set(userId, CLOSED_FEED);
    });

    byUser.forEach((status, userId) => {
      const last = this.feedPublished.get(userId);
      if (last && last.status === status.status && now - last.at < FEED_REEMIT_MS) return;
      if (status.status === 'closed' && !last) return;
      this.marketGateway.emitFeedStatus(userId, status);
      if (status.status === 'closed') this.feedPublished.delete(userId);
      else this.feedPublished.set(userId, { status: status.status, at: now });
    });
  }

  /**
   * The websocket is down or silent: keep the viewer's screen alive with REST quote snapshots (flagged
   * `source: 'rest'`). Engines are NOT fed from this; they must not trade on a degraded feed.
   */
  private async serveRestSnapshot(t: any) {
    const now = Date.now();
    if (t.restBusy || now - (t.lastRestAt || 0) < REST_FALLBACK_INTERVAL_MS) return;
    const wanted = this.marketGateway.getSubscribedSymbolsByUser().get(t.userId);
    if (!wanted?.length) return;

    t.restBusy = true;
    t.lastRestAt = now;
    try {
      const keys = Array.from(
        new Set(wanted.map((s) => canonicalKey(s)).map((k) => (k.includes(':') ? k : `NSE:${k}`))),
      ).slice(0, REST_FALLBACK_MAX_SYMBOLS);
      const account = await this.prisma.brokerAccount.findUnique({ where: { id: t.accountId } });
      if (!account?.accessToken || account.tokenHealth === 'EXPIRED') return;
      const quotes = await this.brokerFactory.createClient(account).getQuotes(keys);

      const ts = new Date().toISOString();
      const ticks: MarketTick[] = Object.entries(quotes).map(([key, q]) => {
        const [exchange, symbol] = key.split(':');
        const change = q.close ? q.ltp - q.close : null;
        return {
          key,
          symbol,
          exchange,
          ltp: q.ltp,
          close: q.close,
          change: change === null ? null : Number(change.toFixed(2)),
          changePct: change === null ? null : Number(((change / q.close) * 100).toFixed(2)),
          volume: q.volume,
          exchangeTs: q.exchangeTs,
          ts,
          source: 'rest' as const,
        };
      });
      this.marketGateway.broadcastTicks(t.userId, ticks);
    } catch (err: any) {
      this.logger.warn(`REST quote fallback failed for user feed ${t.userId}: ${err?.message || err}`);
    } finally {
      t.restBusy = false;
    }
  }

  /** Disconnect and forget one account's ticker; its viewer sees `closed` on the next health pass. */
  private removeTicker(accountId: string) {
    const existing = this.tickers.get(accountId);
    if (existing?.disconnect) {
      try { existing.disconnect(); } catch (_) {}
    }
    this.tickers.delete(accountId);
  }

  /** Loads NSE/NFO/BFO masters once per trading day, from 08:45 IST on. Failures are retried next tick. */
  private async warmInstrumentStore() {
    try {
      const { minute } = istParts();
      const tradingDay = isTradingDay();
      const exchanges = ['NSE', 'NFO', 'BFO'];
      const stale = exchanges.filter((e) => !InstrumentStore.isFresh(e));
      if (stale.length === 0 || !tradingDay || minute < 8 * 60 + 45 || minute > 15 * 60 + 35) return;

      const account = await this.prisma.brokerAccount.findFirst({
        where: { isActive: true, accessToken: { not: null }, tokenHealth: { not: 'EXPIRED' } },
      });
      if (!account) return;
      const client = this.brokerFactory.createClient(account);
      for (const exchange of stale) await client.getInstruments(exchange);
    } catch (err: any) {
      this.logger.warn(`Instrument master warm-up failed, will retry: ${err?.message || err}`);
    }
  }

  onModuleDestroy() {
    if (this.refreshInterval) clearInterval(this.refreshInterval);
    if (this.warmInterval) clearInterval(this.warmInterval);
    if (this.feedInterval) clearInterval(this.feedInterval);
    this.tickers.forEach((ticker) => {
      try { ticker.disconnect(); } catch (_) {}
    });
    this.tickers.clear();
    this.cleanKiteTickerCache();
  }

  private cleanKiteTickerCache() {
    try {
      const tickerPath = require.resolve('kiteconnect/dist/lib/ticker');
      if (require.cache[tickerPath]) delete require.cache[tickerPath];
    } catch (_) {}
    try {
      const kcPath = require.resolve('kiteconnect');
      if (require.cache[kcPath]) delete require.cache[kcPath];
    } catch (_) {}
  }

  /**
   * Sync tickers based on active strategies, connected brokers, and dashboard subscriptions
   */
  async syncTickers() {
    try {
      // Find all active strategies to see which symbols we need to monitor
      const activeStrategies = await this.prisma.strategy.findMany({
        where: { isActive: true },
        select: {
          brokerAccountId: true,
          config: true,
        },
      });

      // Add symbols subscribed by active connected dashboard clients
      const viewerSymbols = this.marketGateway.getSubscribedSymbolsByUser();

      // OPTIMIZATION 1: If NO active strategies AND NO dashboard clients watching, SLEEP.
      if (activeStrategies.length === 0 && viewerSymbols.size === 0) {
        if (this.tickers.size > 0) {
          this.logger.log('TickerService: No active strategies or dashboard clients; entering idle sleep mode.');
          this.tickers.forEach((ticker) => {
            try { ticker.disconnect(); } catch (_) {}
          });
          this.tickers.clear();
        }
        return;
      }

      // OPTIMIZATION 2: Outside Indian market hours (09:00 - 15:35 IST), SLEEP immediately.
      if (!this.isIndianMarketOpen()) {
        if (this.tickers.size > 0) {
          this.logger.log('TickerService: Indian market is closed (outside 09:00 - 15:35 IST); entering sleep mode.');
          this.tickers.forEach((ticker) => {
            try { ticker.disconnect(); } catch (_) {}
          });
          this.tickers.clear();
          this.cleanKiteTickerCache();
        }
        return;
      }

      // Group symbols by broker account
      const symbolsByAccount = new Map<string, Set<string>>();
      activeStrategies.forEach((s) => {
        if (!s.brokerAccountId) return;
        if (!symbolsByAccount.has(s.brokerAccountId)) {
          symbolsByAccount.set(s.brokerAccountId, new Set());
        }

        try {
          const config = JSON.parse(s.config as string);
          if (config.symbol) {
            symbolsByAccount.get(s.brokerAccountId).add(config.symbol);
          }
          if (config.futureSymbol) {
            symbolsByAccount.get(s.brokerAccountId).add(config.futureSymbol);
          }
        } catch (e) {
          this.logger.error(`Error parsing strategy config for ticker: ${e.message}`);
        }
      });

      // Each viewer streams on their OWN broker account; a viewer without a live account gets no ticks
      // (they never borrow another user's Kite session).
      for (const [userId, symbols] of viewerSymbols) {
        const viewerAccount = await this.prisma.brokerAccount.findFirst({
          where: { userId, isActive: true, accessToken: { not: null }, tokenHealth: { not: 'EXPIRED' } },
          select: { id: true },
        });
        if (!viewerAccount) continue;
        if (!symbolsByAccount.has(viewerAccount.id)) symbolsByAccount.set(viewerAccount.id, new Set());
        symbols.forEach((sym) => symbolsByAccount.get(viewerAccount.id).add(sym));
      }

      // For each account with active symbols, ensure a ticker is running
      for (const [accountId, symbols] of symbolsByAccount.entries()) {
        if (symbols.size > 0) {
          await this.ensureTickerRunning(accountId, Array.from(symbols));
        }
      }
    } catch (err) {
      this.logger.error(`Failed to sync tickers: ${err.message}`);
    }
  }

  private async ensureTickerRunning(accountId: string, symbols: string[]) {
    // Never open a websocket if market is closed or 0 symbols to subscribe
    if (!this.isIndianMarketOpen() || !symbols || symbols.length === 0) {
      return;
    }

    const account = await this.prisma.brokerAccount.findUnique({ where: { id: accountId } });
    if (!account || !account.isActive || !account.accessToken || account.tokenHealth === 'EXPIRED') {
      if (this.tickers.has(accountId)) {
        this.logger.log(`Cleaning up ticker for account ${accountId} (account inactive, expired, or missing access token)`);
        const existing = this.tickers.get(accountId);
        if (existing?.disconnect) {
          try { existing.disconnect(); } catch (_) {}
        }
        this.tickers.delete(accountId);
        this.cleanKiteTickerCache();
      }
      return;
    }

    // Check tokenExpiry. If token is expired, do not hammer broker API!
    if (account.tokenExpiry && new Date(account.tokenExpiry) < new Date()) {
      if (!this.failedAccounts.has(accountId)) {
        this.logger.warn(`Broker account ${account.clientId || account.id} session token is expired. Please re-authenticate on the Brokers page.`);
      }
      this.failedAccounts.set(accountId, { timestamp: Date.now(), accessToken: account.accessToken });
      if (this.tickers.has(accountId)) {
        const existing = this.tickers.get(accountId);
        if (existing?.disconnect) {
          try { existing.disconnect(); } catch (_) {}
        }
        this.tickers.delete(accountId);
        this.cleanKiteTickerCache();
      }
      return;
    }

    // If this account failed previously with the same access token, DO NOT retry until user re-authenticates
    const failedInfo = this.failedAccounts.get(accountId);
    if (failedInfo) {
      if (failedInfo.accessToken !== account.accessToken) {
        // Token was refreshed/updated! Clear failed state and reconnect immediately
        this.failedAccounts.delete(accountId);
      } else {
        // Same invalid/failed token: skip retry until user logs in with a fresh token
        return;
      }
    }

    if (this.tickers.has(accountId)) {
      const tickerData = this.tickers.get(accountId);
      // If access token changed, tear down old connection to reconnect with new token
      if (tickerData.accessToken !== account.accessToken) {
        this.logger.log(`Access token changed for account ${account.clientId}, reconnecting ticker...`);
        if (tickerData.disconnect) {
          try { tickerData.disconnect(); } catch (_) {}
        }
        this.tickers.delete(accountId);
      } else {
        const requestedTokens = symbols
          .map((s) => tickerData.resolveToken(s))
          .filter((t): t is number => typeof t === 'number' && !isNaN(t));

        if (requestedTokens.length > 0 && tickerData.instance) {
          const added = this.subscribeTokens(tickerData, requestedTokens);
          if (added > 0) this.logger.log(`Subscribed ${added} new tokens (quote mode) for account ${account.clientId}`);
        }
        return;
      }
    }

    if (account.broker === BrokerType.ZERODHA) {
      await this.setupZerodhaTicker(account, symbols);
    }
  }

  private async setupZerodhaTicker(account: any, symbols: string[]) {
    try {
      this.cleanKiteTickerCache();
      const { KiteTicker } = require('kiteconnect');
      const apiKey = require('../common/utils/crypto').decrypt(account.apiKeyEnc);

      const client = this.brokerFactory.createClient(account);

      // Always fetch core exchanges (NSE for all Equities, NFO for all Nifty/BankNifty/FinNifty/Stock Options)
      // BSE and BFO are fetched on-demand if a symbol specifically requires BSE or Sensex F&O.
      const hasBse = symbols.some(s => s.startsWith('BSE') || s.includes('SENSEX'));
      const hasBfo = symbols.some(s => s.startsWith('BFO') || s.includes('SENSEX'));

      // Shared daily instrument master (fetched once, not per ticker). NSE and NFO are required:
      // a failure here surfaces to the catch below instead of building an empty token map.
      const exchanges = ['NSE', 'NFO'];
      if (hasBse) exchanges.push('BSE');
      if (hasBfo) exchanges.push('BFO');
      const instrumentArrays = await Promise.all(exchanges.map((e) => client.getInstruments(e)));
      const allInst = instrumentArrays.flat();
      const tokenToSymbol = new Map<number, { symbol: string; exchange: string }>();
      const symbolToToken = new Map<string, number>();

      // Index rows: each token maps to ONE canonical {symbol, exchange}. Tokens come from the
      // master; the fixed ones only claim the token first so the instrument dump can't overwrite them.
      const registerIndex = (idx: (typeof INDEX_INSTRUMENTS)[number], token: number) => {
        tokenToSymbol.set(token, { symbol: idx.tradingsymbol, exchange: idx.exchange });
        symbolToToken.set(idx.tradingsymbol, token);
        symbolToToken.set(`${idx.exchange}:${idx.tradingsymbol}`, token);
        idx.aliases.forEach((alias) => {
          symbolToToken.set(alias, token);
          symbolToToken.set(`${idx.exchange}:${alias}`, token);
        });
      };
      INDEX_INSTRUMENTS.forEach((idx) => idx.token && registerIndex(idx, idx.token));

      allInst.forEach((i: any) => {
        const sym = i.tradingsymbol;
        const tok = Number(i.instrument_token);
        if (!tok || isNaN(tok)) return;
        const exch = i.exchange || 'NSE';
        
        // Only set tokenToSymbol if this token is NOT already claimed by an index entry
        // (prevents instrument dump from overwriting hardcoded index tokens like SENSEX=265)
        if (!tokenToSymbol.has(tok)) {
          tokenToSymbol.set(tok, { symbol: sym, exchange: exch });
        }
        symbolToToken.set(sym, tok);
        symbolToToken.set(`${exch}:${sym}`, tok);
      });

      // Indices without a fixed token (FINNIFTY, MIDCPNIFTY, ...) take theirs from the master; a
      // master token that differs from a fixed one wins.
      INDEX_INSTRUMENTS.forEach((idx) => {
        const fromMaster = symbolToToken.get(`${idx.exchange}:${idx.tradingsymbol}`);
        if (fromMaster && fromMaster !== idx.token) registerIndex(idx, fromMaster);
      });

      const resolveToken = (sym: string): number | undefined => {
        if (symbolToToken.has(sym)) return symbolToToken.get(sym);
        const withoutPrefix = sym.includes(':') ? sym.split(':')[1] : sym;
        if (symbolToToken.has(withoutPrefix)) return symbolToToken.get(withoutPrefix);
        const withNse = `NSE:${withoutPrefix}`;
        if (symbolToToken.has(withNse)) return symbolToToken.get(withNse);
        const withNfo = `NFO:${withoutPrefix}`;
        if (symbolToToken.has(withNfo)) return symbolToToken.get(withNfo);
        const withBse = `BSE:${withoutPrefix}`;
        if (symbolToToken.has(withBse)) return symbolToToken.get(withBse);
        const withBfo = `BFO:${withoutPrefix}`;
        if (symbolToToken.has(withBfo)) return symbolToToken.get(withBfo);
        return undefined;
      };

      const tokensToSubscribe = symbols
        .map(s => resolveToken(s))
        .filter((t): t is number => typeof t === 'number' && !isNaN(t));

      const ticker = new KiteTicker({
        api_key: apiKey,
        access_token: require('../common/utils/crypto').decrypt(account.accessToken),
      });

      // Enable native auto-reconnection: up to 100 retries with 3s backoff
      if (typeof ticker.autoReconnect === 'function') {
        ticker.autoReconnect(true, 100, 3);
      }

      // Per-connection state, shared with the event handlers below. `tokens` also drives re-subscribe
      // after a reconnect, so tokens added later (subscribeTokens) survive it.
      const state: any = {
        disconnect: () => {
          try { ticker.disconnect(); } catch (_) {}
        },
        instance: ticker,
        tokens: [] as number[],
        symbolToToken,
        tokenToSymbol,
        resolveToken,
        accessToken: account.accessToken,
        userId: account.userId as string,
        accountId: account.id as string,
        clockToken: symbolToToken.get(CLOCK_INDEX_KEY),
        restBusy: false,
        lastRestAt: 0,
        connected: false,
        lastMessageAt: 0,
        lastExchangeTs: null as string | null,
      };

      ticker.on('ticks', (ticks: any[]) => {
        const now = Date.now();
        state.lastMessageAt = now;
        const legacy: Record<string, number> = {};
        const quotes: MarketTick[] = [];
        ticks.forEach((tick) => {
          const info = tokenToSymbol.get(tick.instrument_token);
          if (!info || !tick.last_price) return;

          // Engine stream: raw symbol AND its exchange-prefixed form (never other exchanges' aliases,
          // so BSE:SENSEX the index cannot pollute NFO:SENSEX options).
          legacy[info.symbol] = tick.last_price;
          legacy[`${info.exchange}:${info.symbol}`] = tick.last_price;

          // Browser stream. Change is measured against the previous close Kite sends (ohlc.close); with
          // no close we send null rather than a fake 0%.
          const close = tick.ohlc?.close > 0 ? Number(tick.ohlc.close) : null;
          const change = close ? tick.last_price - close : null;
          const exchangeTs = tick.exchange_timestamp instanceof Date ? tick.exchange_timestamp.toISOString() : null;
          if (exchangeTs) state.lastExchangeTs = exchangeTs;
          quotes.push({
            key: `${info.exchange}:${info.symbol}`,
            symbol: info.symbol,
            exchange: info.exchange,
            ltp: tick.last_price,
            close,
            change: change === null ? null : Number(change.toFixed(2)),
            changePct: change === null ? null : Number(((change / close) * 100).toFixed(2)),
            volume: typeof tick.volume_traded === 'number' ? tick.volume_traded : null,
            exchangeTs,
            ts: new Date(now).toISOString(),
            source: 'ws',
          });
        });
        if (quotes.length > 0) {
          this.marketGateway.broadcastTicks(state.userId, quotes);
          this.listeners.forEach((cb) => {
            try { cb(legacy); } catch (e) { this.logger.error(e); }
          });
        }
      });

      // Any frame from Kite (ticks and the ~1 s heartbeat) proves the feed is alive.
      ticker.on('message', () => {
        state.lastMessageAt = Date.now();
      });

      ticker.on('order_update', (order: any) => {
        if (!order?.order_id) return;
        const update: OrderUpdateEvent = {
          orderId: String(order.order_id),
          status: order.status,
          exchange: order.exchange,
          tradingsymbol: order.tradingsymbol,
          transactionType: order.transaction_type,
          orderType: order.order_type,
          product: order.product,
          variety: order.variety,
          quantity: order.quantity,
          filledQuantity: order.filled_quantity,
          pendingQuantity: order.pending_quantity,
          price: order.price,
          triggerPrice: order.trigger_price,
          averagePrice: order.average_price,
          statusMessage: order.status_message ?? null,
          tag: order.tag ?? null,
          exchangeTs: order.exchange_timestamp ? new Date(order.exchange_timestamp).toISOString() : null,
        };
        this.marketGateway.emitOrderUpdate(state.userId, update);
        this.orderListeners.forEach((cb) => {
          try { cb(account.id, update); } catch (e) { this.logger.error(e); }
        });
      });

      ticker.on('connect', () => {
        this.logger.log(`Zerodha Ticker connected for account ${account.clientId}`);
        this.failedAccounts.delete(account.id);
        state.connected = true;
        state.lastMessageAt = Date.now();
        if (state.tokens.length > 0) {
          const quoteTokens = state.tokens.filter((t: number) => t !== state.clockToken);
          ticker.subscribe(state.tokens);
          if (quoteTokens.length > 0) ticker.setMode(ticker.modeQuote, quoteTokens);
          if (state.clockToken) ticker.setMode(ticker.modeFull, [state.clockToken]);
        }
      });

      ticker.on('error', (err: any) => {
        const errMsg =
          err?.message ||
          err?.error_type ||
          (typeof err === 'object' && Object.keys(err).length > 0
            ? JSON.stringify(err)
            : String(err || 'Unknown connection error'));

        const isAuthError =
          errMsg.includes('403') ||
          errMsg.includes('TokenException') ||
          errMsg.includes('Session') ||
          errMsg.includes('expired') ||
          errMsg.includes('invalid');

        if (isAuthError) {
          // Log only once per failed token to eliminate log spam
          if (!this.failedAccounts.has(account.id)) {
            this.logger.error(`Zerodha Ticker authentication error for account ${account.clientId}: ${errMsg}. Token is invalid/expired — halting auto-reconnect.`);
          }
          this.failedAccounts.set(account.id, { timestamp: Date.now(), accessToken: account.accessToken });
          try {
            if (typeof ticker.autoReconnect === 'function') {
              ticker.autoReconnect(false);
            }
            ticker.disconnect();
          } catch (_) {}
          this.tickers.delete(account.id);
          this.cleanKiteTickerCache();
          this.prisma.brokerAccount
            .update({ where: { id: account.id }, data: { tokenHealth: 'EXPIRED' } })
            .catch(() => {});
        } else {
          this.logger.error(`Zerodha Ticker error for account ${account.clientId}: ${errMsg}`);
        }
      });

      ticker.on('disconnect', (error: any) => {
        state.connected = false;
        // If this ticker was torn down due to auth error, suppress noisy disconnect log
        if (this.failedAccounts.has(account.id)) {
          return;
        }
        let errDetail = 'Connection closed / Stream interrupted';
        if (typeof error === 'string') {
          errDetail = error;
        } else if (error?.message) {
          errDetail = error.message;
        } else if (error?.reason) {
          errDetail = error.reason;
        } else if (error?.code) {
          errDetail = `Code: ${error.code}`;
        }
        this.logger.warn(`Zerodha Ticker disconnected for account ${account.clientId}: ${errDetail}. Auto-reconnecting in background...`);
      });

      ticker.on('reconnect', (reconnectCount: number, reconnectInterval: number) => {
        if (this.failedAccounts.has(account.id)) {
          try {
            if (typeof ticker.autoReconnect === 'function') ticker.autoReconnect(false);
            ticker.disconnect();
          } catch (_) {}
          return;
        }
        this.logger.log(`Zerodha Ticker reconnecting for account ${account.clientId}: attempt #${reconnectCount} (${reconnectInterval}ms interval)`);
      });

      ticker.on('noreconnect', () => {
        this.logger.error(`Zerodha Ticker reconnection attempts exhausted for account ${account.clientId}. Cleaning up ticker instance.`);
        this.failedAccounts.set(account.id, { timestamp: Date.now(), accessToken: account.accessToken });
        this.tickers.delete(account.id);
        this.cleanKiteTickerCache();
      });

      // The clock index goes first so the token cap can never squeeze it out; being in `tokens` also makes
      // subscribeTokens skip it (it must stay in full mode).
      state.tokens = Array.from(new Set([...(state.clockToken ? [state.clockToken] : []), ...tokensToSubscribe])).slice(
        0,
        MAX_TOKENS_PER_TICKER,
      );
      ticker.connect();
      this.tickers.set(account.id, state);
    } catch (err: any) {
      const msg = err?.message || String(err || '');
      this.logger.error(`Failed to setup Zerodha Ticker for ${account.clientId || account.id}: ${msg}`);
      // A transient failure (network, 429, 5xx while loading the instrument master) is retried on the
      // next sync; only a hard failure (bad token etc.) blocks the account until re-authentication.
      if (!toKiteError(err).retryable) {
        this.failedAccounts.set(account.id, { timestamp: Date.now(), accessToken: account.accessToken });
      }
      this.tickers.delete(account.id);
    }
  }
}
