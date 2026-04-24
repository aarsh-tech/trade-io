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

      // We use a shared cache for instruments to avoid heavy API calls
      if (!nseInstrumentsCache || (now - cacheTimestamp) > CACHE_TTL_MS) {
        console.log('Fetching NSE & NFO instruments list from Zerodha...');
        const [nse, nfo] = await Promise.all([
          this.kite.getInstruments('NSE'),
          this.kite.getInstruments('NFO'),
        ]);
        nseInstrumentsCache = [...nse, ...nfo];
        cacheTimestamp = now;
        console.log(`Cached ${nseInstrumentsCache.length} instruments.`);
      }

      // Filter: prefer tradingsymbol matches
      const matches = nseInstrumentsCache.filter((item: any) =>
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
        // Search instruments for token
        if (!nseInstrumentsCache) {
          await this.searchInstruments(symbol); // triggers cache load
        }
        const found = nseInstrumentsCache?.find(i => i.tradingsymbol === upperSymbol && i.exchange === exchange);
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
}



