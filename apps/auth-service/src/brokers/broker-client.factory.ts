import { Injectable } from '@nestjs/common';
import { BrokerType, BrokerAccount } from '@prisma/client';
import { IBrokerClient, OrderParams, Holding, Position, Order as IOrder } from './interfaces/broker-client.interface';
import { decrypt } from '../common/utils/crypto';

@Injectable()
export class BrokerClientFactory {
  createClient(account: BrokerAccount): IBrokerClient {
    const apiKey = decrypt(account.apiKeyEnc);
    const apiSecret = decrypt(account.apiSecretEnc);
    const accessToken = account.accessToken;

    switch (account.broker) {
      case BrokerType.ZERODHA:
        return new ZerodhaClient(apiKey, accessToken);
      case BrokerType.ANGEL:
        return new AngelClient(apiKey, accessToken);
      case BrokerType.UPSTOX:
        return new UpstoxClient(apiKey, accessToken);
      case BrokerType.FIVEPAISA:
        return new FivePaisaClient(apiKey, accessToken);
      case BrokerType.ALICEBLUE:
        return new AliceBlueClient(apiKey, accessToken);
      default:
        throw new Error('Broker not supported yet');
    }
  }
}

// Module-level cache so instrument list is downloaded only once
let nseInstrumentsCache: any[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

class ZerodhaClient implements IBrokerClient {
  private kite: any;

  constructor(apiKey: string, accessToken: string | null) {
    const { KiteConnect } = require('kiteconnect');
    this.kite = new KiteConnect({ api_key: apiKey });
    if (accessToken) {
      this.kite.setAccessToken(accessToken);
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
      console.log('Placing Zerodha Order:', {
        exchange: params.exchange,
        symbol: params.symbol,
        side: params.side,
        qty: params.qty,
        product: params.product,
        orderType: params.orderType,
        price: params.price
      });

      const response = await this.kite.placeOrder(params.variety || "regular", {
        exchange: params.exchange,
        tradingsymbol: params.symbol,
        transaction_type: params.side,
        quantity: Number(params.qty),
        product: params.product,
        order_type: params.orderType,
        price: params.price ? Number(params.price) : undefined,
        trigger_price: params.triggerPrice ? Number(params.triggerPrice) : undefined,
      });

      console.log('Zerodha Order Success:', response.order_id);
      return response.order_id;
    } catch (err: any) {
      if (err.error_type === 'PermissionException' || err.message?.includes('No IPs configured')) {
        throw new Error('IP Access Denied: Please add your IP to the Kite Developer Console.');
      }
      
      if (err.message?.includes('Markets are closed')) {
        throw new Error('Market is currently CLOSED. Please try again during market hours (9:15 AM - 3:30 PM).');
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

  async searchInstruments(query: string): Promise<{ symbol: string; name: string; exchange: string }[]> {
    try {
      const upperQuery = query.toUpperCase().trim();
      const now = Date.now();

      // Refresh cache if expired or empty
      if (!nseInstrumentsCache || (now - cacheTimestamp) > CACHE_TTL_MS) {
        console.log('Fetching NSE instruments list from Zerodha...');
        nseInstrumentsCache = await this.kite.getInstruments('NSE');
        cacheTimestamp = now;
        console.log(`Cached ${nseInstrumentsCache.length} NSE instruments.`);
      }

      // Filter: prefer symbol-starts-with matches, then name-contains
      const symbolMatches = nseInstrumentsCache.filter((item: any) =>
        item.tradingsymbol?.startsWith(upperQuery) && item.instrument_type === 'EQ'
      );
      const nameMatches = nseInstrumentsCache.filter((item: any) =>
        !item.tradingsymbol?.startsWith(upperQuery) &&
        item.name?.toUpperCase().includes(upperQuery) &&
        item.instrument_type === 'EQ'
      );

      return [...symbolMatches, ...nameMatches].slice(0, 12).map((item: any) => ({
        symbol: item.tradingsymbol,
        name: item.name || item.tradingsymbol,
        exchange: item.exchange || 'NSE',
      }));
    } catch (err) {
      console.error('Zerodha searchInstruments Error:', err);
      return [];
    }
  }
}



class AngelClient implements IBrokerClient {
  constructor(private apiKey: string, private accessToken: string | null) {}
  async getHoldings() { return []; }
  async getPositions() { return []; }
  async getOrders() { return []; }
  async placeOrder(params: OrderParams) { return 'MOCK_ID'; }
  async getLTP(symbols: string[]) { return {}; }
  async searchInstruments(query: string) { return []; }
}


class UpstoxClient implements IBrokerClient {
  constructor(private apiKey: string, private accessToken: string | null) {}
  async getHoldings() { return []; }
  async getPositions() { return []; }
  async getOrders() { return []; }
  async placeOrder(params: OrderParams) { return 'MOCK_ID'; }
  async getLTP(symbols: string[]) { return {}; }
  async searchInstruments(query: string) { return []; }
}


class FivePaisaClient implements IBrokerClient {
  constructor(private apiKey: string, private accessToken: string | null) {}
  async getHoldings() { return []; }
  async getPositions() { return []; }
  async getOrders() { return []; }
  async placeOrder(params: OrderParams) { return 'MOCK_ID'; }
  async getLTP(symbols: string[]) { return {}; }
  async searchInstruments(query: string) { return []; }
}


class AliceBlueClient implements IBrokerClient {
  constructor(private apiKey: string, private accessToken: string | null) {}
  async getHoldings() { return []; }
  async getPositions() { return []; }
  async getOrders() { return []; }
  async placeOrder(params: OrderParams) { return 'MOCK_ID'; }
  async getLTP(symbols: string[]) { return {}; }
  async searchInstruments(query: string) { return []; }
}



