import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { MarketGateway } from './market.gateway';
import { BrokerClientFactory } from '../brokers/broker-client.factory';
import { PrismaService } from '../prisma/prisma.service';
import { BrokerType } from '@prisma/client';
import { INDEX_INSTRUMENTS, InstrumentStore } from '../brokers/instrument-store';
import { toKiteError } from '../brokers/kite-errors';

@Injectable()
export class TickerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TickerService.name);
  private tickers = new Map<string, any>();
  private failedAccounts = new Map<string, { timestamp: number; accessToken: string }>();
  private refreshInterval: NodeJS.Timeout;
  private warmInterval: NodeJS.Timeout;
  private listeners = new Set<(ticks: Record<string, number>) => void>();

  registerListener(callback: (ticks: Record<string, number>) => void) {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
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
      if (!tickerData.tokens.includes(token)) {
        tickerData.tokens.push(token);
        tickerData.instance.subscribe([token]);
        tickerData.instance.setMode(tickerData.instance.modeFull, [token]);
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

  private isIndianMarketOpen(): boolean {
    const now = new Date();
    // Convert to Indian Standard Time (UTC + 5:30)
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const istTime = new Date(now.getTime() + istOffsetMs);

    const day = istTime.getUTCDay(); // 0 = Sun, 6 = Sat
    if (day === 0 || day === 6) return false;

    const hours = istTime.getUTCHours();
    const minutes = istTime.getUTCMinutes();
    const currentMinute = hours * 60 + minutes;

    // Active market hours window: 09:00 AM (pre-open) to 03:35 PM (closing settlement)
    const openMinute = 9 * 60; // 09:00
    const closeMinute = 15 * 60 + 35; // 15:35

    return currentMinute >= openMinute && currentMinute <= closeMinute;
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
  }

  /** Loads NSE/NFO/BFO masters once per trading day, from 08:45 IST on. Failures are retried next tick. */
  private async warmInstrumentStore() {
    try {
      const ist = new Date(Date.now() + 5.5 * 3600_000);
      const minute = ist.getUTCHours() * 60 + ist.getUTCMinutes();
      const weekday = ist.getUTCDay() >= 1 && ist.getUTCDay() <= 5;
      const exchanges = ['NSE', 'NFO', 'BFO'];
      const stale = exchanges.filter((e) => !InstrumentStore.isFresh(e));
      if (stale.length === 0 || !weekday || minute < 8 * 60 + 45 || minute > 15 * 60 + 35) return;

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
      const dashboardSymbols = this.marketGateway.getSubscribedSymbols();

      // OPTIMIZATION 1: If NO active strategies AND NO dashboard clients watching, SLEEP.
      if (activeStrategies.length === 0 && (!dashboardSymbols || dashboardSymbols.length === 0)) {
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

      // Only assign defaultAccount if dashboard users are actually watching symbols
      if (dashboardSymbols && dashboardSymbols.length > 0) {
        let defaultAccount = activeStrategies[0]?.brokerAccountId;
        if (!defaultAccount) {
          const firstActive = await this.prisma.brokerAccount.findFirst({
            where: { isActive: true, accessToken: { not: null } },
          });
          if (firstActive) defaultAccount = firstActive.id;
        }

        if (defaultAccount) {
          if (!symbolsByAccount.has(defaultAccount)) {
            symbolsByAccount.set(defaultAccount, new Set());
          }
          dashboardSymbols.forEach((sym) => symbolsByAccount.get(defaultAccount).add(sym));
        }
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
        const currentTokens = new Set<number>(tickerData.tokens || []);
        const requestedTokens = symbols
          .map((s) => tickerData.resolveToken(s))
          .filter((t): t is number => typeof t === 'number' && !isNaN(t));

        const tokensToSubscribe = requestedTokens.filter((t) => !currentTokens.has(t));
        if (tokensToSubscribe.length > 0 && tickerData.instance) {
          this.logger.log(`Subscribing to ${tokensToSubscribe.length} new tokens for account ${account.clientId}`);
          tickerData.instance.subscribe(tokensToSubscribe);
          tickerData.instance.setMode(tickerData.instance.modeFull, tokensToSubscribe);
          tokensToSubscribe.forEach((t) => currentTokens.add(t));
          tickerData.tokens = Array.from(currentTokens);
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

      ticker.on('ticks', (ticks: any[]) => {
        const mappedTicks: Record<string, number> = {};
        ticks.forEach((tick) => {
          const info = tokenToSymbol.get(tick.instrument_token);
          if (info && tick.last_price) {
            // Only emit under the raw symbol AND its correct exchange prefix
            // This prevents cross-exchange contamination (e.g. BSE:SENSEX index
            // polluting NFO:SENSEX which could match SENSEX options)
            mappedTicks[info.symbol] = tick.last_price;
            mappedTicks[`${info.exchange}:${info.symbol}`] = tick.last_price;
          }
        });
        if (Object.keys(mappedTicks).length > 0) {
          this.marketGateway.broadcastTicks(mappedTicks);
          this.listeners.forEach((cb) => {
            try { cb(mappedTicks); } catch (e) { this.logger.error(e); }
          });
        }
      });

      ticker.on('connect', () => {
        this.logger.log(`Zerodha Ticker connected for account ${account.clientId}`);
        this.failedAccounts.delete(account.id);
        if (tokensToSubscribe.length > 0) {
          ticker.subscribe(tokensToSubscribe);
          ticker.setMode(ticker.modeFull, tokensToSubscribe);
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

      ticker.connect();
      this.tickers.set(account.id, {
        disconnect: () => {
          try { ticker.disconnect(); } catch (_) {}
        },
        instance: ticker,
        tokens: tokensToSubscribe,
        symbolToToken,
        tokenToSymbol,
        resolveToken,
        accessToken: account.accessToken,
      });
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
