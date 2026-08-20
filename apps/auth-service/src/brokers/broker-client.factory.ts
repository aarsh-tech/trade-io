import { Injectable } from '@nestjs/common';
import { BrokerType, BrokerAccount } from '@prisma/client';
import { IBrokerClient, OrderParams, Holding, Position, Order as IOrder } from './interfaces/broker-client.interface';
import { decrypt } from '../common/utils/crypto';
import * as https from 'https';
import * as http from 'http';

import axios from 'axios';

// Persistent HTTP/HTTPS connection agents to reuse open sockets and eliminate TCP/TLS latency
export const keepAliveHttpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 10000,
  maxSockets: 100,
  maxFreeSockets: 25,
  timeout: 5000,
});
export const keepAliveHttpAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 10000,
  maxSockets: 100,
  maxFreeSockets: 25,
  timeout: 5000,
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
    const accessToken = account.accessToken;

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

// Shared cache mapping exchange to instruments array
const instrumentsCache = new Map<string, { data: any[]; timestamp: number }>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

class ZerodhaClient implements IBrokerClient {
  private kite: any;
  private apiKey: string;
  private accessToken: string | null;

  constructor(apiKey: string, accessToken: string | null) {
    this.apiKey = apiKey;
    this.accessToken = accessToken;
    const { KiteConnect } = require('kiteconnect');
    this.kite = new KiteConnect({ api_key: apiKey, timeout: 5000 });
    if (this.kite.requestInstance?.defaults) {
      this.kite.requestInstance.defaults.httpsAgent = keepAliveHttpsAgent;
      this.kite.requestInstance.defaults.httpAgent = keepAliveHttpAgent;
    }
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
      return holdings.map((h: any) => ({
        symbol: h.tradingsymbol,
        qty: h.quantity,
        avgPrice: h.average_price,
        ltp: h.last_price,
        pnl: h.pnl,
        pnlPct: parseFloat(((h.pnl / (h.average_price * h.quantity)) * 100).toFixed(2)),
      }));
    } catch (err) {
      console.error('Zerodha Holdings Error:', err);
      return [];
    }
  }

  async getPositions(): Promise<Position[]> {
    try {
      const positions = await this.kite.getPositions();
      return positions.net.map((p: any) => ({
        symbol: p.tradingsymbol,
        qty: p.quantity,
        avgPrice: p.average_price,
        ltp: p.last_price,
        pnl: p.pnl,
        side: p.quantity >= 0 ? 'BUY' : 'SELL',
        product: p.product,
      }));
    } catch (err) {
      console.error('Zerodha Positions Error:', err);
      return [];
    }
  }

  async getOrders(): Promise<IOrder[]> {
    try {
      const orders = await this.kite.getOrders();
      return orders.map((o: any) => ({
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
      }));
    } catch (err) {
      console.error('Zerodha Orders Error:', err);
      return [];
    }
  }

  async placeOrder(params: OrderParams): Promise<string> {
    try {
      const variety = (params.variety || "regular").toLowerCase();
      console.log('Placing Zerodha Order:', {
        variety,
        exchange: params.exchange,
        symbol: params.symbol,
        side: params.side,
        qty: params.qty,
        product: params.product,
        orderType: params.orderType,
        price: params.price
      });

      const response = await this.kite.placeOrder(variety, {
        exchange: params.exchange,
        tradingsymbol: params.symbol,
        transaction_type: params.side,
        quantity: Number(params.qty),
        product: params.product,
        order_type: params.orderType,
        price: params.price ? Number(params.price) : undefined,
        trigger_price: params.triggerPrice ? Number(params.triggerPrice) : undefined,
        validity: params.validity,
        disclosed_quantity: params.disclosedQty ? Number(params.disclosedQty) : undefined,
        tag: params.tag,
      });

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
      console.error('Zerodha getLTP Error:', err);
      return {};
    }
  }

  async getMargins(): Promise<any> {
    try {
      return await this.kite.getMargins();
    } catch (err) {
      console.error('Zerodha getMargins Error:', err);
      return null;
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

  async getInstruments(exchange: string): Promise<any[]> {
    const now = Date.now();
    const cached = instrumentsCache.get(exchange);
    if (cached && (now - cached.timestamp) < CACHE_TTL_MS) {
      return cached.data;
    }

    console.log(`Fetching ${exchange} instruments list from Zerodha...`);
    const data = await this.kite.getInstruments(exchange);
    instrumentsCache.set(exchange, { data, timestamp: now });
    console.log(`Cached ${data.length} instruments for ${exchange}.`);
    return data;
  }

  async searchInstruments(query: string): Promise<{ symbol: string; name: string; exchange: string }[]> {
    try {
      const upperQuery = query.toUpperCase().trim();
      const [nse, nfo] = await Promise.all([
        this.getInstruments('NSE'),
        this.getInstruments('NFO'),
      ]);
      const combined = [...nse, ...nfo];

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

      return sorted.slice(0, 15).map((item: any) => ({
        symbol: item.tradingsymbol,
        name: item.name || item.tradingsymbol,
        exchange: item.exchange,
      }));
    } catch (err) {
      console.error('Zerodha searchInstruments Error:', err);
      return [];
    }
  }

  async getHistoricalData(symbol: string, exchange: string, interval: string, from: Date, to: Date): Promise<any[]> {
    try {
      const upperSymbol = symbol.toUpperCase().trim();
      let token: number | null = null;

      // Common index tokens
      const indexTokens: Record<string, number> = {
        'NIFTY 50': 256265, 'NIFTY50': 256265,
        'BANKNIFTY': 260105, 'BANK NIFTY': 260105,
        'SENSEX': 265, 'NIFTY MIDCAP 50': 288009,
      };

      if (indexTokens[upperSymbol]) {
        token = indexTokens[upperSymbol];
      } else {
        const instruments = await this.getInstruments(exchange);
        const found = instruments.find(i => i.tradingsymbol === upperSymbol && i.exchange === exchange);
        if (found) token = found.instrument_token;
      }

      if (!token) throw new Error(`Instrument token not found for ${symbol}`);

      const data = await this.kite.getHistoricalData(token, interval, from, to, false);
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



