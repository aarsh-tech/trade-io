import { Injectable } from '@nestjs/common';
import { BrokerType, BrokerAccount } from '@prisma/client';
import { IBrokerClient, OrderParams, Holding, Position, Order as IOrder } from './interfaces/broker-client.interface';
import { decrypt } from '../common/utils/crypto';
import * as https from 'https';
import * as http from 'http';

import axios from 'axios';
import { KiteRateLimiter } from './kite-rate-limiter';
import { toKiteError } from './kite-errors';
import { InstrumentStore, resolveIndex } from './instrument-store';

// Persistent HTTP/HTTPS connection agents to reuse open sockets and eliminate TCP/TLS latency
export const keepAliveHttpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 120000,
  maxSockets: 200,
  maxFreeSockets: 50,
  timeout: 10000,
  scheduling: 'fifo',
});
export const keepAliveHttpAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 120000,
  maxSockets: 200,
  maxFreeSockets: 50,
  timeout: 10000,
  scheduling: 'fifo',
});

axios.defaults.httpsAgent = keepAliveHttpsAgent;
axios.defaults.httpAgent = keepAliveHttpAgent;

@Injectable()
export class BrokerClientFactory {
  private clientCache = new Map<string, { client: IBrokerClient; accessToken: string | null; keyEnc: string }>();

  createClient(account: BrokerAccount): IBrokerClient {
    const cacheKey = account.id;
    const cached = this.clientCache.get(cacheKey);

    if (
      cached &&
      cached.accessToken === account.accessToken &&
      cached.keyEnc === account.apiKeyEnc
    ) {
      return cached.client;
    }

    const apiKey = decrypt(account.apiKeyEnc);
    const accessToken = account.accessToken ? decrypt(account.accessToken) : null;

    let client: IBrokerClient;
    switch (account.broker) {
      case BrokerType.ZERODHA:
        client = new ZerodhaClient(apiKey, accessToken);
        break;
      default:
        throw new Error('Broker not supported yet');
    }

    this.clientCache.set(cacheKey, {
      client,
      accessToken,
      keyEnc: account.apiKeyEnc,
    });

    return client;
  }

  invalidateClient(accountId: string) {
    this.clientCache.delete(accountId);
  }
}

class ZerodhaClient implements IBrokerClient {
  private static recentOrderDedup = new Map<string, number>();
  private static orderRateMap = new Map<string, number[]>();

  private kite: any;
  private apiKey: string;
  private accessToken: string | null;
  private limiter: KiteRateLimiter;

  constructor(apiKey: string, accessToken: string | null) {
    this.apiKey = apiKey;
    this.accessToken = accessToken;
    this.limiter = KiteRateLimiter.forKey(apiKey);
    const { KiteConnect } = require('kiteconnect');
    this.kite = new KiteConnect({ api_key: apiKey, timeout: 15000 });
    if (this.kite.requestInstance?.defaults) {
      this.kite.requestInstance.defaults.httpsAgent = keepAliveHttpsAgent;
      this.kite.requestInstance.defaults.httpAgent = keepAliveHttpAgent;
    }
    // Engines and market services reach the raw client via client['kite'], so the limiter is
    // installed on the KiteConnect instance itself rather than on ZerodhaClient's methods.
    this.limiter.instrument(this.kite);
    if (accessToken) {
      this.kite.setAccessToken(accessToken);
    }
  }

  createTicker(): any {
    if (!this.apiKey || !this.accessToken) return null;
    try {
      const { KiteTicker } = require('kiteconnect');
      return new KiteTicker({
        api_key: this.apiKey,
        access_token: this.accessToken,
      });
    } catch (err) {
      console.error('KiteTicker initialization error:', err);
      return null;
    }
  }


  async getHoldings(): Promise<Holding[]> {
    try {
      const holdings = await this.kite.getHoldings();
      return (holdings || []).map((h: any) => ({
        symbol: h.tradingsymbol,
        qty: h.quantity,
        avgPrice: h.average_price,
        ltp: h.last_price,
        pnl: h.pnl,
        pnlPct: parseFloat(((h.pnl / (h.average_price * h.quantity)) * 100).toFixed(2)),
      }));
    } catch (err: any) {
      const isAuth = err?.message?.includes('access_token') || err?.message?.includes('api_key') || err?.status === 403;
      if (isAuth) {
        console.warn(`Zerodha Holdings notice: ${err?.message || 'Token expired or invalid'}`);
      } else {
        console.error('Zerodha Holdings Error:', err?.message || err);
      }
      throw err;
    }
  }

  async getPositions(): Promise<Position[]> {
    try {
      let positions: any = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          positions = await this.kite.getPositions();
          break;
        } catch (err: any) {
          const isTimeout = err?.code === 'ECONNABORTED' || err?.message?.includes('ECONNABORTED') || err?.code === 'ETIMEDOUT' || err?.code === 'ECONNRESET';
          if (isTimeout && attempt === 0) {
            await new Promise(r => setTimeout(r, 600));
            continue;
          }
          throw err;
        }
      }
      return (positions?.net || []).map((p: any) => ({
        symbol: p.tradingsymbol,
        exchange: p.exchange,
        qty: p.quantity,
        avgPrice: p.average_price,
        ltp: p.last_price,
        pnl: p.pnl,
        side: p.quantity >= 0 ? 'BUY' : 'SELL',
        product: p.product,
      }));
    } catch (err: any) {
      const isAuth = err?.message?.includes('access_token') || err?.message?.includes('api_key') || err?.status === 403;
      if (isAuth) {
        console.warn(`Zerodha Positions notice: ${err?.message || 'Token expired or invalid'}`);
      } else {
        console.error('Zerodha Positions Error:', err?.message || err);
      }
      throw err;
    }
  }

  async getOrders(): Promise<IOrder[]> {
    try {
      const orders = await this.kite.getOrders();
      return orders.map((o: any) => ({
        orderId: o.order_id,
        symbol: o.tradingsymbol,
        exchange: o.exchange || 'NSE',
        type: o.order_type,
        side: o.transaction_type,
        product: o.product || 'MIS',
        status: o.status,
        qty: o.quantity,
        filledQty: o.filled_quantity,
        price: o.price,
        triggerPrice: o.trigger_price,
        avgPrice: o.average_price,
        variety: o.variety,
        tag: o.tag,
        orderTime: o.order_timestamp,
        statusMessage: o.status_message,
      }));
    } catch (err) {
      const kerr = toKiteError(err);
      console.error(`Zerodha Orders Error (${kerr.name}):`, kerr.message);
      throw kerr;
    }
  }

  async placeOrder(params: OrderParams): Promise<string> {
    try {
      // ── Safety Guard 1: Quantity & Exchange Freeze Limit Clamp ──
      const upperSym = (params.symbol || '').toUpperCase().trim();
      let freezeLimit = 1800; // default ceiling
      if (upperSym.includes('BANKNIFTY')) freezeLimit = 900;
      else if (upperSym.includes('SENSEX')) freezeLimit = 500;
      else if (upperSym.includes('FINNIFTY')) freezeLimit = 1800;
      else if (upperSym.includes('MIDCPNIFTY')) freezeLimit = 2800;
      else if (upperSym.includes('NIFTY')) freezeLimit = 1800;

      const requestedQty = Number(params.qty);
      if (requestedQty <= 0) {
        throw new Error(`🛑 [SAFETY GUARD] Invalid order quantity: ${requestedQty}`);
      }
      if (requestedQty > freezeLimit) {
        throw new Error(`🛑 [SAFETY GUARD] Order quantity ${requestedQty} exceeds exchange freeze limit of ${freezeLimit} for ${params.symbol}. Order blocked.`);
      }

      // ── Safety Guard 2: Max Order Rupee Value (Fat-Finger Guard) ──
      const estPrice = Number(params.price) || Number(params.triggerPrice) || 0;
      const MAX_ORDER_VALUE_CAP = 250000; // ₹2.5 Lakh hard limit per order
      if (estPrice > 0 && requestedQty * estPrice > MAX_ORDER_VALUE_CAP) {
        throw new Error(`🛑 [FAT-FINGER GUARD] Order value ₹${(requestedQty * estPrice).toLocaleString('en-IN')} exceeds safety cap of ₹${MAX_ORDER_VALUE_CAP.toLocaleString('en-IN')}.`);
      }

      // ── Safety Guard 3: Rate Limiting & Idempotency Dedup (Entries ONLY) ──
      const isExitOrSl = Boolean(
        (params.intent && params.intent !== 'ENTRY') ||
        params.tag?.toUpperCase().includes('EXIT') ||
        params.tag?.toUpperCase().includes('SL') ||
        params.tag?.toUpperCase().includes('TARGET') ||
        params.tag?.toUpperCase().includes('SQUARE') ||
        params.orderType === 'SL' ||
        params.orderType === 'SL-M'
      );

      // Exits and Stop-Loss orders are NEVER rate-limited to guarantee capital safety
      if (!isExitOrSl) {
        const now = Date.now();
        const dedupKey = `${upperSym}:${params.side}:${requestedQty}:${params.orderType}:${params.price || 0}`;
        const lastOrderTime = ZerodhaClient.recentOrderDedup.get(dedupKey) || 0;
        if (now - lastOrderTime < 2000) {
          throw new Error(`🛑 [DEDUP GUARD] Duplicate entry order detected within 2s for ${params.symbol}. Blocked to prevent double execution.`);
        }
        ZerodhaClient.recentOrderDedup.set(dedupKey, now);

        // 60-second sliding rate limiter (max 10 entry orders/min per symbol to prevent runaway loops)
        const rateList = (ZerodhaClient.orderRateMap.get(upperSym) || []).filter(t => now - t < 60000);
        if (rateList.length >= 10) {
          throw new Error(`🛑 [RATE LIMIT GUARD] Too many entry orders placed for ${params.symbol} within 60s (limit: 10/min). Runaway loop blocked.`);
        }
        rateList.push(now);
        ZerodhaClient.orderRateMap.set(upperSym, rateList);

        if (ZerodhaClient.recentOrderDedup.size > 1000) ZerodhaClient.recentOrderDedup.clear();
        if (ZerodhaClient.orderRateMap.size > 500) ZerodhaClient.orderRateMap.clear();
      }

      const variety = (params.variety || "regular").toLowerCase();
      console.log('Placing Zerodha Order:', {
        variety,
        exchange: params.exchange,
        symbol: params.symbol,
        side: params.side,
        qty: params.qty,
        orderType: params.orderType,
        price: params.price,
        triggerPrice: params.triggerPrice,
        marketProtection: params.marketProtection ?? (params.orderType === 'MARKET' || params.orderType === 'SL-M' ? -1 : undefined)
      });

      const orderPayload: any = {
        exchange: params.exchange,
        tradingsymbol: params.symbol,
        transaction_type: params.side,
        quantity: Number(params.qty),
        product: params.product,
        order_type: params.orderType,
        price: params.price ? Number(params.price) : undefined,
        trigger_price: params.triggerPrice ? Number(params.triggerPrice) : undefined,
        validity: params.validity || 'DAY',
        disclosed_quantity: params.disclosedQty ? Number(params.disclosedQty) : undefined,
        tag: params.tag,
      };

      // Apply market_protection for MARKET and SL-M orders (-1 is Auto Protection)
      if (params.orderType === 'MARKET' || params.orderType === 'SL-M') {
        orderPayload.market_protection = params.marketProtection !== undefined ? params.marketProtection : -1;
      }

      if (params.autoslice !== undefined) {
        orderPayload.autoslice = params.autoslice;
      }

      const response = await this.kite.placeOrder(variety, orderPayload);

      console.log('Zerodha Order Success:', response.order_id);
      return response.order_id;
    } catch (err: any) {
      if (err.error_type === 'PermissionException' || err.message?.includes('No IPs configured')) {
        throw new Error('IP Access Denied: Please add your IP to the Kite Developer Console.');
      }
      
      if (err.message?.includes('Markets are closed') || err.message?.includes('Market is closed')) {
        if (params.variety !== 'amo') {
          throw new Error('Market is currently CLOSED. Please select the AMO (After Market Order) tab to place off-market orders.');
        } else {
          throw new Error(`Zerodha AMO Error: ${err.message}`);
        }
      }

      console.error('Zerodha Place Order Detailed Error:', {
        message: err.message,
        type: err.error_type,
        data: err.data
      });
      throw new Error(err.message || 'Failed to place order');
    }


  }

  async getLTP(symbols: string[]): Promise<Record<string, number>> {
    try {
      const quotes = await this.kite.getLTP(symbols);
      const result: Record<string, number> = {};
      Object.keys(quotes).forEach(key => {
        result[key] = quotes[key].last_price;
      });
      return result;
    } catch (err) {
      const kerr = toKiteError(err);
      console.error(`Zerodha getLTP Error (${kerr.name}):`, kerr.message);
      throw kerr;
    }
  }

  /** Full quotes (last price, previous close, volume, exchange time) keyed by `EXCH:SYMBOL`. Batched by the rate limiter. */
  async getQuotes(
    symbols: string[],
  ): Promise<Record<string, { ltp: number; close: number | null; volume: number | null; exchangeTs: string | null }>> {
    try {
      const quotes = await this.kite.getQuote(symbols);
      const result: Record<string, { ltp: number; close: number | null; volume: number | null; exchangeTs: string | null }> = {};
      Object.keys(quotes).forEach((key) => {
        const q = quotes[key];
        if (!q?.last_price) return;
        const ts = q.timestamp ? new Date(q.timestamp) : null;
        result[key] = {
          ltp: q.last_price,
          close: q.ohlc?.close > 0 ? q.ohlc.close : null,
          volume: typeof q.volume === 'number' ? q.volume : null,
          exchangeTs: ts && !isNaN(ts.getTime()) ? ts.toISOString() : null,
        };
      });
      return result;
    } catch (err) {
      const kerr = toKiteError(err);
      console.error(`Zerodha getQuote Error (${kerr.name}):`, kerr.message);
      throw kerr;
    }
  }

  async getMargins(): Promise<any> {
    try {
      return await this.kite.getMargins();
    } catch (err: any) {
      const isAuth = err?.message?.includes('access_token') || err?.message?.includes('api_key') || err?.status === 403;
      if (isAuth) {
        console.warn(`Zerodha getMargins notice: ${err?.message || 'Token expired or invalid'}`);
      } else {
        console.error('Zerodha getMargins Error:', err?.message || err);
      }
      throw err;
    }
  }

  async getProfile(): Promise<any> {
    try {
      return await this.kite.getProfile();
    } catch (err: any) {
      console.error('Zerodha getProfile Error:', err?.message || err);
      throw err;
    }
  }

  async getOrder(orderId: string): Promise<IOrder> {
    const orders = await this.kite.getOrders();
    const o = orders.find((ord: any) => ord.order_id === orderId);
    if (!o) throw new Error(`Order ${orderId} not found`);
    return {
      orderId: o.order_id,
      symbol: o.tradingsymbol,
      type: o.order_type,
      side: o.transaction_type,
      status: o.status,
      qty: o.quantity,
      filledQty: o.filled_quantity,
      price: o.price,
      avgPrice: o.average_price,
      orderTime: o.order_timestamp,
      statusMessage: o.status_message,
    };
  }

  async cancelOrder(orderId: string): Promise<void> {
    await this.kite.cancelOrder("regular", orderId);
  }

  async modifyOrder(orderId: string, params: { price?: number; triggerPrice?: number; trigger_price?: number; quantity?: number; variety?: string }): Promise<void> {
    try {
      const variety = (params.variety || 'regular').toLowerCase();
      const payload: any = {};
      if (params.price !== undefined) payload.price = Number(params.price);
      const trg = params.triggerPrice !== undefined ? params.triggerPrice : params.trigger_price;
      if (trg !== undefined) payload.trigger_price = Number(trg);
      if (params.quantity !== undefined) payload.quantity = Number(params.quantity);
      console.log(`[ZerodhaClient] Modifying order ${orderId}:`, payload);
      await this.kite.modifyOrder(variety, orderId, payload);
    } catch (err: any) {
      console.error(`[ZerodhaClient] modifyOrder failed for ${orderId}:`, err.message);
      throw err;
    }
  }

  async getInstruments(exchange: string): Promise<any[]> {
    return InstrumentStore.get(exchange, async () => {
      const rawData = await this.kite.getInstruments(exchange);
      // Lightweight slim projection: retains all required fields while reducing V8 object overhead by 80%
      return (rawData || []).map((i: any) => ({
        instrument_token: Number(i.instrument_token),
        tradingsymbol: i.tradingsymbol,
        name: i.name,
        exchange: i.exchange,
        segment: i.segment,
        lot_size: i.lot_size ? Number(i.lot_size) : undefined,
        tick_size: i.tick_size ? Number(i.tick_size) : undefined,
        strike: i.strike ? Number(i.strike) : undefined,
        instrument_type: i.instrument_type,
        expiry: i.expiry,
      }));
    });
  }

  async searchInstruments(query: string): Promise<{ symbol: string; name: string; exchange: string; lotSize?: number; segment?: string }[]> {
    try {
      const upperQuery = query.toUpperCase().trim();
      const [nse, nfo] = await Promise.all([
        this.getInstruments('NSE'),
        this.getInstruments('NFO'),
      ]);
      const combined = [...nse, ...nfo];

      // Dynamic F&O Lot Size Dictionary from Zerodha's live NFO master
      const nfoLotMap = new Map<string, number>();
      nfo.forEach((item: any) => {
        if (item.name && item.lot_size && item.lot_size > 0) {
          nfoLotMap.set(item.name.toUpperCase().trim(), item.lot_size);
        }
      });

      // Filter: prefer tradingsymbol matches
      const matches = combined.filter((item: any) =>
        item.tradingsymbol?.toUpperCase().includes(upperQuery) ||
        item.name?.toUpperCase().includes(upperQuery)
      );

      // Sort: Exact symbol match first, then starts with symbol, then includes
      const sorted = matches.sort((a: any, b: any) => {
        const aSym = a.tradingsymbol.toUpperCase();
        const bSym = b.tradingsymbol.toUpperCase();
        if (aSym === upperQuery) return -1;
        if (bSym === upperQuery) return 1;
        if (aSym.startsWith(upperQuery) && !bSym.startsWith(upperQuery)) return -1;
        if (!aSym.startsWith(upperQuery) && bSym.startsWith(upperQuery)) return 1;
        return 0;
      });

      return sorted.slice(0, 15).map((item: any) => {
        const cleanName = (item.name || item.tradingsymbol).toUpperCase().trim();
        const cleanSym = (item.tradingsymbol || '').toUpperCase().trim();
        const dynamicLot = item.lot_size && item.lot_size > 0
          ? item.lot_size
          : (nfoLotMap.get(cleanName) || nfoLotMap.get(cleanSym) || 1);

        return {
          symbol: item.tradingsymbol,
          name: item.name || item.tradingsymbol,
          exchange: item.exchange,
          lotSize: dynamicLot,
          segment: item.segment,
        };
      });
    } catch (err) {
      console.error('Zerodha searchInstruments Error:', err);
      return [];
    }
  }

  async getLotSize(symbol: string): Promise<number> {
    try {
      let clean = (symbol || '').toUpperCase().trim();
      clean = clean.replace(/^(NSE|BSE|NFO|BFO):/, '').replace(/-EQ$/, '').trim();
      if (!clean) return 1;

      // Check NFO contracts (NSE F&O stocks & indices)
      const nfo = await this.getInstruments('NFO');
      const match = nfo.find(
        (i: any) =>
          (i.name && i.name.toUpperCase().trim() === clean) ||
          i.tradingsymbol?.toUpperCase().trim() === clean
      );
      if (match && match.lot_size > 0) {
        return match.lot_size;
      }

      // Starts with clean (e.g. RELIANCE24... option or future contract)
      const prefixMatch = nfo.find(
        (i: any) => i.tradingsymbol?.toUpperCase().startsWith(clean) && i.lot_size > 0
      );
      if (prefixMatch && prefixMatch.lot_size > 0) {
        return prefixMatch.lot_size;
      }

      // Check BFO contracts (BSE F&O e.g. SENSEX)
      if (clean.includes('SENSEX')) {
        return 20;
      }
      try {
        const bfo = await this.getInstruments('BFO');
        const bfoMatch = bfo.find(
          (i: any) =>
            (i.name && i.name.toUpperCase().trim() === clean) ||
            i.tradingsymbol?.toUpperCase().trim() === clean
        );
        if (bfoMatch && bfoMatch.lot_size > 0) {
          return bfoMatch.lot_size;
        }
      } catch {}

      return 1;
    } catch {
      return 1;
    }
  }

  async getHistoricalData(symbol: string, exchange: string, interval: string, from: Date, to: Date): Promise<any[]> {
    try {
      const upperSymbol = symbol.toUpperCase().trim();
      let token: number | null = null;

      // Indices: canonical alias -> master row (fixed token only as a fallback)
      const index = resolveIndex(upperSymbol);
      if (index) {
        await this.getInstruments(index.exchange).catch(() => undefined);
        token = InstrumentStore.find(index.exchange, index.tradingsymbol)?.instrument_token ?? index.token ?? null;
      }
      if (!token) {
        const instruments = await this.getInstruments(exchange);
        const found = instruments.find(i => i.tradingsymbol === upperSymbol && i.exchange === exchange);
        if (found) token = found.instrument_token;
      }

      if (!token) throw new Error(`Instrument token not found for ${symbol}`);

      let data: any[] | null = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          data = await this.kite.getHistoricalData(token, interval, from, to, false);
          break;
        } catch (err: any) {
          const isTimeout = err?.code === 'ECONNABORTED' || err?.message?.includes('ECONNABORTED') || err?.code === 'ETIMEDOUT' || err?.code === 'ECONNRESET';
          if (isTimeout && attempt === 0) {
            await new Promise(r => setTimeout(r, 600));
            continue;
          }
          throw err;
        }
      }
      return data || [];
    } catch (err) {
      console.error('Zerodha getHistoricalData Error:', err);
      throw err;
    }
  }

  async getTickSize(symbol: string, exchange: string): Promise<number> {
    try {
      const upperSymbol = symbol.toUpperCase().trim();
      const upperExchange = exchange.toUpperCase().trim();

      const instruments = await this.getInstruments(upperExchange);
      const found = instruments.find(
        (i: any) => i.tradingsymbol === upperSymbol && i.exchange === upperExchange,
      );

      if (found && found.tick_size) {
        return parseFloat(found.tick_size);
      }

      // Default fallback
      return 0.05;
    } catch (err) {
      console.error('Zerodha getTickSize Error:', err);
      return 0.05;
    }
  }

  async placeGtt(params: import('./interfaces/broker-client.interface').GttParams): Promise<string> {
    try {
      const gttParams = {
        trigger_type: this.kite.GTT_TYPE_OCO,
        tradingsymbol: params.symbol,
        exchange: params.exchange,
        trigger_values: [params.slTriggerPrice, params.targetPrice],
        last_price: params.entryPrice,
        orders: [
          {
            transaction_type: params.side,
            order_type: 'LIMIT',
            product: params.product,
            quantity: Number(params.qty),
            price: params.slLimitPrice,
          },
          {
            transaction_type: params.side,
            order_type: 'LIMIT',
            product: params.product,
            quantity: Number(params.qty),
            price: params.targetPrice,
          },
        ],
      };

      console.log('Placing Zerodha GTT:', gttParams);
      const response = await this.kite.placeGTT(gttParams);
      console.log('Zerodha GTT Success:', response.trigger_id);
      return response.trigger_id.toString();
    } catch (err: any) {
      console.error('Zerodha GTT Error:', {
        message: err.message,
        type: err.error_type,
        data: err.data
      });
      throw new Error(err.message || 'Failed to place GTT order');
    }
  }
}



