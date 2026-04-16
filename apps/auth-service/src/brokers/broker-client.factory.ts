import { Injectable } from '@nestjs/common';
import { BrokerType, BrokerAccount } from '@prisma/client';
import { IBrokerClient } from './interfaces/broker-client.interface';
import { decrypt } from '../common/utils/crypto';
// import { KiteConnect } from 'kiteconnect'; // Need to wait for install

@Injectable()
export class BrokerClientFactory {
  createClient(account: BrokerAccount): IBrokerClient {
    const apiKey = decrypt(account.apiKeyEnc);
    const apiSecret = decrypt(account.apiSecretEnc);
    const accessToken = account.accessToken;

    switch (account.broker) {
      case BrokerType.ZERODHA:
        return new ZerodhaClient(apiKey, accessToken);
      // case BrokerType.ANGEL: ...
      default:
        throw new Error('Broker not supported yet');
    }
  }
}

class ZerodhaClient implements IBrokerClient {
  private kite: any;

  constructor(apiKey: string, accessToken: string | null) {
    // Dynamically require to avoid crash if not installed yet
    const { KiteConnect } = require('kiteconnect');
    this.kite = new KiteConnect({ api_key: apiKey });
    if (accessToken) {
      this.kite.setAccessToken(accessToken);
    }
  }

  async getHoldings() {
    try {
      const holdings = await this.kite.getHoldings();
      return holdings.map((h: any) => ({
        symbol: h.tradingsymbol,
        qty: h.quantity,
        avgPrice: h.average_price,
        ltp: h.last_price,
        pnl: h.pnl,
        pnlPct: ((h.pnl / (h.average_price * h.quantity)) * 100).toFixed(2),
      }));
    } catch (err) {
      console.error('Zerodha Holdings Error:', err);
      // Return mock for testing if explicitly requested or if auth fails for now
      return [];
    }
  }

  async getPositions() {
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
}
