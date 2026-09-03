import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { MarketGateway } from './market.gateway';
import { BrokerClientFactory } from '../brokers/broker-client.factory';
import { PrismaService } from '../prisma/prisma.service';
import { BrokerType } from '@prisma/client';

@Injectable()
export class TickerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TickerService.name);
  private tickers = new Map<string, any>();
  private failedAccounts = new Map<string, { timestamp: number; accessToken: string }>();
  private refreshInterval: NodeJS.Timeout;
  private listeners = new Set<(ticks: Record<string, number>) => void>();

  registerListener(callback: (ticks: Record<string, number>) => void) {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  async subscribeSymbol(accountId: string, symbol: string) {
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
          let instruments = await client.getInstruments(primaryExchange).catch(() => []);
          let match = instruments.find((i: any) => i.tradingsymbol === symbol);
          if (!match && isBfo) {
            const bseInstruments = await client.getInstruments('BSE').catch(() => []);
            match = bseInstruments.find((i: any) => i.tradingsymbol === symbol);
          } else if (!match && !isOptionOrFuture) {
            const nfoInstruments = await client.getInstruments('NFO').catch(() => []);
            match = nfoInstruments.find((i: any) => i.tradingsymbol === symbol);
          }
          if (match?.instrument_token) {
            token = match.instrument_token;
            tickerData.symbolToToken.set(symbol, token);
            tickerData.symbolToToken.set(`${match.segment || primaryExchange}:${symbol}`, token);
            tickerData.symbolToToken.set(`BFO:${symbol}`, token);
            tickerData.symbolToToken.set(`BSE:${symbol}`, token);
            tickerData.symbolToToken.set(`NSE:${symbol}`, token);
            tickerData.symbolToToken.set(`NFO:${symbol}`, token);
            tickerData.tokenToSymbol.set(token, symbol);
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

  async onModuleInit() {
    this.logger.log('Initializing Ticker Service...');
    await this.syncTickers();

    this.refreshInterval = setInterval(() => this.syncTickers(), 10000);
  }

  onModuleDestroy() {
    if (this.refreshInterval) clearInterval(this.refreshInterval);
    this.tickers.forEach((ticker) => {
      try { ticker.disconnect(); } catch (_) {}
    });
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
        }
      });

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

      // Add symbols subscribed by dashboard clients
      const dashboardSymbols = this.marketGateway.getSubscribedSymbols();
      
      // Default account for dashboard feeds if no strategies
      let defaultAccount = activeStrategies[0]?.brokerAccountId;
      if (!defaultAccount) {
        const firstActive = await this.prisma.brokerAccount.findFirst({
          where: { isActive: true, accessToken: { not: null } }
        });
        if (firstActive) defaultAccount = firstActive.id;
      }

      if (defaultAccount) {
        if (!symbolsByAccount.has(defaultAccount)) {
          symbolsByAccount.set(defaultAccount, new Set());
        }
        dashboardSymbols.forEach(sym => symbolsByAccount.get(defaultAccount).add(sym));
      }

      // For each account, ensure a ticker is running and subscribed
      for (const [accountId, symbols] of symbolsByAccount.entries()) {
        await this.ensureTickerRunning(accountId, Array.from(symbols));
      }
    } catch (err) {
      this.logger.error(`Failed to sync tickers: ${err.message}`);
    }
  }

  private async ensureTickerRunning(accountId: string, symbols: string[]) {
    const account = await this.prisma.brokerAccount.findUnique({ where: { id: accountId } });
    if (!account || !account.isActive || !account.accessToken) {
      if (this.tickers.has(accountId)) {
        this.logger.log(`Cleaning up ticker for account ${accountId} (account inactive or missing access token)`);
        const existing = this.tickers.get(accountId);
        if (existing?.disconnect) {
          try { existing.disconnect(); } catch (_) {}
        }
        this.tickers.delete(accountId);
      }
      this.failedAccounts.delete(accountId);
      return;
    }

    const failedInfo = this.failedAccounts.get(accountId);
    if (failedInfo) {
      if (failedInfo.accessToken !== account.accessToken) {
        this.failedAccounts.delete(accountId);
      } else if (Date.now() - failedInfo.timestamp < 120000) {
        // Cooldown for 2 minutes before re-attempting connection for failed account
        return;
      } else {
        this.failedAccounts.delete(accountId);
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
          .map(s => tickerData.resolveToken(s))
          .filter(Boolean) as number[];
        
        const tokensToSubscribe = requestedTokens.filter(t => !currentTokens.has(t));
        if (tokensToSubscribe.length > 0 && tickerData.instance) {
          this.logger.log(`Subscribing to ${tokensToSubscribe.length} new tokens for account ${account.clientId}`);
          tickerData.instance.subscribe(tokensToSubscribe);
          tickerData.instance.setMode(tickerData.instance.modeFull, tokensToSubscribe);
          tokensToSubscribe.forEach(t => currentTokens.add(t));
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
      const { KiteTicker } = require('kiteconnect');
      const apiKey = require('../common/utils/crypto').decrypt(account.apiKeyEnc);

      const client = this.brokerFactory.createClient(account);

      // Fetch instruments in parallel to map symbol <-> token faster
      const [instruments, bseInstruments, nfoInstruments, bfoInstruments] = await Promise.all([
        client.getInstruments('NSE').catch(() => []),
        client.getInstruments('BSE').catch(() => []),
        client.getInstruments('NFO').catch(() => []),
        client.getInstruments('BFO').catch(() => []),
      ]);
      
      const allInst = [...instruments, ...bseInstruments, ...nfoInstruments, ...bfoInstruments];
      const tokenToSymbol = new Map<number, string>();
      const symbolToToken = new Map<string, number>();
      
      // Standard index tokens
      const indexMap: Record<string, number> = {
        'NIFTY 50': 256265, 'NSE:NIFTY 50': 256265,
        'NIFTY BANK': 260105, 'BANKNIFTY': 260105, 'NSE:BANKNIFTY': 260105,
        'SENSEX': 265, 'BSE:SENSEX': 265,
        'FINNIFTY': 257801, 'NSE:FINNIFTY': 257801,
        'MIDCPNIFTY': 288009, 'NSE:MIDCPNIFTY': 288009,
        'NIFTY IT': 257545, 'NSE:NIFTY IT': 257545,
      };
      Object.entries(indexMap).forEach(([sym, tok]) => {
         tokenToSymbol.set(tok, sym);
         symbolToToken.set(sym, tok);
      });

      allInst.forEach((i: any) => {
        const sym = i.tradingsymbol;
        const tok = i.instrument_token;
        const exch = i.exchange || 'NSE';
        
        tokenToSymbol.set(tok, sym);
        symbolToToken.set(sym, tok);
        symbolToToken.set(`${exch}:${sym}`, tok);
        if (exch === 'NSE') {
          symbolToToken.set(`NSE:${sym}`, tok);
        } else if (exch === 'BSE') {
          symbolToToken.set(`BSE:${sym}`, tok);
        } else if (exch === 'NFO') {
          symbolToToken.set(`NFO:${sym}`, tok);
        } else if (exch === 'BFO') {
          symbolToToken.set(`BFO:${sym}`, tok);
        }
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

      const tokensToSubscribe = symbols.map(s => resolveToken(s)).filter(Boolean) as number[];

      const ticker = new KiteTicker({
        api_key: apiKey,
        access_token: account.accessToken,
      });

      ticker.on('ticks', (ticks: any[]) => {
        const mappedTicks: Record<string, number> = {};
        ticks.forEach((tick) => {
          const sym = tokenToSymbol.get(tick.instrument_token);
          if (sym && tick.last_price) {
            mappedTicks[sym] = tick.last_price;
            mappedTicks[`NSE:${sym}`] = tick.last_price;
            mappedTicks[`NFO:${sym}`] = tick.last_price;
            mappedTicks[`BFO:${sym}`] = tick.last_price;
            mappedTicks[`BSE:${sym}`] = tick.last_price;
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
        const errMsg = err?.message || String(err || '');
        this.logger.error(`Zerodha Ticker error for account ${account.clientId}: ${errMsg}`);
        if (errMsg.includes('403') || errMsg.includes('Forbidden') || errMsg.includes('TokenException')) {
          this.logger.warn(`Zerodha session/token for account ${account.clientId} is invalid or expired (403 Forbidden). Stopping auto-reconnect.`);
          this.failedAccounts.set(account.id, { timestamp: Date.now(), accessToken: account.accessToken });
          try {
            if (typeof ticker.autoReconnect === 'function') {
              ticker.autoReconnect(false);
            }
            ticker.disconnect();
          } catch (_) {}
          this.tickers.delete(account.id);
        }
      });

      ticker.on('disconnect', (error: any) => {
        this.logger.warn(`Zerodha Ticker disconnected for account ${account.clientId}: ${error?.message || error}`);
      });

      ticker.on('reconnect', (reconnectCount: number, reconnectInterval: number) => {
        this.logger.log(`Zerodha Ticker reconnecting for account ${account.clientId}: attempt ${reconnectCount}, interval ${reconnectInterval}ms`);
      });

      ticker.on('noreconnect', () => {
        this.logger.error(`Zerodha Ticker reconnection failed for account ${account.clientId}. Cleaning up ticker instance.`);
        this.failedAccounts.set(account.id, { timestamp: Date.now(), accessToken: account.accessToken });
        this.tickers.delete(account.id);
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
    } catch (err) {
      this.logger.error(`Failed to setup Zerodha Ticker for ${account.id}: ${err.message}`);
      this.failedAccounts.set(account.id, { timestamp: Date.now(), accessToken: account.accessToken });
      this.tickers.delete(account.id);
    }
  }
}
