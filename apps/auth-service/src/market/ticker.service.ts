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
    if (!this.tickers.has(accountId)) return;
    const tickerData = this.tickers.get(accountId);
    let token = tickerData.symbolToToken.get(symbol);
    if (!token) {
      // Dynamic fallback instrument lookup for newly generated options contracts
      try {
        const account = await this.prisma.brokerAccount.findUnique({ where: { id: accountId } });
        if (account?.accessToken) {
          const client = this.brokerFactory.createClient(account);
          const exchange = symbol.includes('-') || symbol.startsWith('NIFTY') || symbol.startsWith('BANKNIFTY') ? 'NFO' : 'NSE';
          const instruments = await client.getInstruments(exchange).catch(() => []);
          const match = instruments.find((i: any) => i.tradingsymbol === symbol);
          if (match?.instrument_token) {
            token = match.instrument_token;
            tickerData.symbolToToken.set(symbol, token);
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
    this.tickers.forEach((ticker) => ticker.disconnect());
  }

  /**
   * Sync tickers based on active strategies and connected brokers
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
          if (config.futureSymbol) { // Also subscribe to resolved futures if present
             symbolsByAccount.get(s.brokerAccountId).add(config.futureSymbol);
          }
        } catch (e) {
          this.logger.error(`Error parsing strategy config for ticker: ${e.message}`);
        }
      });

      // Add symbols subscribed by dashboard clients
      const dashboardSymbols = this.marketGateway.getSubscribedSymbols();
      
      // If no active strategies, we still want to provide dashboard ticks for the first available account
      let defaultAccount = activeStrategies[0]?.brokerAccountId;
      if (!defaultAccount && dashboardSymbols.length > 0) {
        const firstActive = await this.prisma.brokerAccount.findFirst({ where: { isActive: true, accessToken: { not: null } }});
        if (firstActive) defaultAccount = firstActive.id;
      }

      if (defaultAccount && dashboardSymbols.length > 0) {
        if (!symbolsByAccount.has(defaultAccount)) symbolsByAccount.set(defaultAccount, new Set());
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
      } else if (Date.now() - failedInfo.timestamp < 300000) {
        // Cooldown for 5 minutes before re-attempting connection for failed account
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
        const currentTokens = new Set(tickerData.tokens || []);
        const newTokens = symbols.map(s => tickerData.symbolToToken.get(s)).filter(Boolean) as number[];
        
        const tokensToSubscribe = newTokens.filter(t => !currentTokens.has(t));
        if (tokensToSubscribe.length > 0 && tickerData.instance) {
          this.logger.log(`Subscribing to ${tokensToSubscribe.length} new tokens for account ${accountId}`);
          tickerData.instance.subscribe(tokensToSubscribe);
          tickerData.instance.setMode(tickerData.instance.modeFull, tokensToSubscribe);
          tickerData.tokens = newTokens;
        }
        return;
      }
    }

    if (account.broker === BrokerType.ZERODHA) {
      await this.setupZerodhaTicker(account, symbols);
    }
    // Add other brokers here...
  }

  private async setupZerodhaTicker(account: any, symbols: string[]) {
    try {
      const { KiteTicker } = require('kiteconnect');
      const apiKey = require('../common/utils/crypto').decrypt(account.apiKeyEnc);

      const client = this.brokerFactory.createClient(account);
      const kite = (client as any)['kite'];
      
      // Fetch instruments in parallel to map symbol <-> token faster
      const [instruments, bseInstruments, nfoInstruments] = await Promise.all([
        client.getInstruments('NSE').catch(() => []),
        client.getInstruments('BSE').catch(() => []),
        client.getInstruments('NFO').catch(() => []),
      ]);
      
      const allInst = [...instruments, ...bseInstruments, ...nfoInstruments];
      const tokenToSymbol = new Map<number, string>();
      const symbolToToken = new Map<string, number>();
      
      // Add standard index tokens manually since they might be missing in some listings
      const indexMap: Record<string, number> = { 'NIFTY 50': 256265, 'BANKNIFTY': 260105, 'SENSEX': 265 };
      Object.entries(indexMap).forEach(([sym, tok]) => {
         tokenToSymbol.set(tok, sym);
         symbolToToken.set(sym, tok);
      });

      allInst.forEach((i: any) => {
        tokenToSymbol.set(i.instrument_token, i.tradingsymbol);
        symbolToToken.set(i.tradingsymbol, i.instrument_token);
      });

      const tokensToSubscribe = symbols.map(s => symbolToToken.get(s)).filter(Boolean) as number[];

      if (tokensToSubscribe.length === 0) return;

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
        ticker.subscribe(tokensToSubscribe);
        ticker.setMode(ticker.modeFull, tokensToSubscribe);
      });

      ticker.on('error', (err: any) => {
        const errMsg = err?.message || String(err || '');
        this.logger.error(`Zerodha Ticker error for account ${account.clientId}: ${errMsg}`);
        if (errMsg.includes('403') || errMsg.includes('Forbidden') || errMsg.includes('TokenException')) {
          this.logger.warn(`Zerodha session/token for account ${account.clientId} is invalid or expired (403 Forbidden). Stopping auto-reconnect.`);
          this.failedAccounts.set(account.id, { timestamp: Date.now(), accessToken: account.accessToken });
          try { ticker.disconnect(); } catch (_) {}
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
        accessToken: account.accessToken,
      });
    } catch (err) {
      this.logger.error(`Failed to setup Zerodha Ticker for ${account.id}: ${err.message}`);
      this.failedAccounts.set(account.id, { timestamp: Date.now(), accessToken: account.accessToken });
      this.tickers.delete(account.id);
    }
  }
}
