import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: 'market',
})
export class MarketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(MarketGateway.name);

  // Map of symbol -> Set of socket IDs
  private subscriptions = new Map<string, Set<string>>();

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    // Cleanup subscriptions
    this.subscriptions.forEach((clients, symbol) => {
      clients.delete(client.id);
      if (clients.size === 0) {
        this.subscriptions.delete(symbol);
      }
    });
  }

  getSubscribedSymbols(): string[] {
    return Array.from(this.subscriptions.keys());
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { symbols: string[] },
  ) {
    if (!data?.symbols || !Array.isArray(data.symbols)) {
      return { status: 'error', message: 'symbols array required' };
    }

    this.logger.log(`Client ${client.id} subscribing to ${data.symbols.length} symbols`);
    
    data.symbols.forEach((symbol) => {
      const rawSym = symbol.includes(':') ? symbol.split(':')[1] : symbol;
      const nseSym = `NSE:${rawSym}`;
      const bseSym = `BSE:${rawSym}`;
      const nfoSym = `NFO:${rawSym}`;

      // Register subscriptions for exact key and normalized keys
      [symbol, rawSym, nseSym, bseSym, nfoSym].forEach((s) => {
        if (!this.subscriptions.has(s)) {
          this.subscriptions.set(s, new Set());
        }
        this.subscriptions.get(s).add(client.id);
        client.join(`symbol:${s}`);
      });
    });

    return { status: 'ok', subscribed: data.symbols };
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { symbols: string[] },
  ) {
    if (!data?.symbols || !Array.isArray(data.symbols)) {
      return { status: 'error', message: 'symbols array required' };
    }

    this.logger.log(`Client ${client.id} unsubscribing from ${data.symbols.length} symbols`);
    
    data.symbols.forEach((symbol) => {
      const rawSym = symbol.includes(':') ? symbol.split(':')[1] : symbol;
      const nseSym = `NSE:${rawSym}`;
      const bseSym = `BSE:${rawSym}`;
      const nfoSym = `NFO:${rawSym}`;

      [symbol, rawSym, nseSym, bseSym, nfoSym].forEach((s) => {
        if (this.subscriptions.has(s)) {
          this.subscriptions.get(s).delete(client.id);
          if (this.subscriptions.get(s).size === 0) {
            this.subscriptions.delete(s);
          }
        }
        client.leave(`symbol:${s}`);
      });
    });

    return { status: 'ok', unsubscribed: data.symbols };
  }

  /**
   * Broadcast LTP update to all subscribed clients across all room aliases
   */
  broadcastLTP(symbol: string, ltp: number) {
    const rawSym = symbol.includes(':') ? symbol.split(':')[1] : symbol;
    const nseSym = `NSE:${rawSym}`;
    const bseSym = `BSE:${rawSym}`;
    const nfoSym = `NFO:${rawSym}`;

    const payload = { symbol: rawSym, ltp, timestamp: new Date().toISOString() };

    this.server.to(`symbol:${symbol}`).emit('ltp', payload);
    if (symbol !== rawSym) this.server.to(`symbol:${rawSym}`).emit('ltp', payload);
    if (symbol !== nseSym) this.server.to(`symbol:${nseSym}`).emit('ltp', payload);
    if (symbol !== bseSym) this.server.to(`symbol:${bseSym}`).emit('ltp', payload);
    if (symbol !== nfoSym) this.server.to(`symbol:${nfoSym}`).emit('ltp', payload);
  }

  /**
   * Broadcast multiple LTP updates
   */
  broadcastTicks(ticks: Record<string, number>) {
    Object.entries(ticks).forEach(([symbol, ltp]) => {
      this.broadcastLTP(symbol, ltp);
    });
  }
}
