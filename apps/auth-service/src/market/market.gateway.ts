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
import { JwtService } from '@nestjs/jwt';
import { socketOriginCheck } from '../common/utils/socket-cors';
import { authenticateSocket } from '../common/utils/socket-auth';

const MAX_SYMBOLS_PER_CLIENT = 200;

@WebSocketGateway({
  cors: {
    origin: socketOriginCheck,
    credentials: true,
  },
  namespace: 'market',
})
export class MarketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(MarketGateway.name);

  // Map of symbol -> Set of socket IDs
  private subscriptions = new Map<string, Set<string>>();

  // socketId -> raw symbols this client subscribed to (for the per-client cap)
  private clientSymbols = new Map<string, Set<string>>();

  constructor(private readonly jwtService: JwtService) {}

  handleConnection(client: Socket) {
    const userId = authenticateSocket(client, this.jwtService);
    if (!userId) {
      this.logger.warn(`Rejected unauthenticated market socket: ${client.id}`);
      client.disconnect(true);
      return;
    }
    client.data.userId = userId;
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    this.clientSymbols.delete(client.id);
    // Cleanup subscriptions
    this.subscriptions.forEach((clients, symbol) => {
      clients.delete(client.id);
      if (clients.size === 0) {
        this.subscriptions.delete(symbol);
      }
    });
  }

  // Buffered ticks for high-performance batched broadcasting
  private tickBuffer: Record<string, number> = {};
  private flushTimer: NodeJS.Timeout | null = null;

  getSubscribedSymbols(): string[] {
    return Array.from(this.subscriptions.keys());
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { symbols: string[] },
  ) {
    if (!client.data?.userId) return { status: 'error', message: 'unauthorized' };
    if (!data?.symbols || !Array.isArray(data.symbols)) {
      return { status: 'error', message: 'symbols array required' };
    }

    // Cap distinct underlying symbols per client (clients send several prefixed variants per symbol)
    const owned = this.clientSymbols.get(client.id) ?? new Set<string>();
    const accepted: string[] = [];
    for (const symbol of data.symbols) {
      if (typeof symbol !== 'string' || !symbol) continue;
      const raw = symbol.includes(':') ? symbol.split(':')[1] : symbol;
      if (!owned.has(raw) && owned.size >= MAX_SYMBOLS_PER_CLIENT) continue;
      owned.add(raw);
      accepted.push(symbol);
    }
    this.clientSymbols.set(client.id, owned);
    const truncated = accepted.length < data.symbols.length;
    data = { symbols: accepted };

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

    return {
      status: 'ok',
      subscribed: data.symbols,
      ...(truncated ? { truncated: true, limit: MAX_SYMBOLS_PER_CLIENT } : {}),
    };
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
   * Broadcast LTP update to subscribed clients (subscriber-aware, zero wasted emits)
   */
  broadcastLTP(symbol: string, ltp: number) {
    const rawSym = symbol.includes(':') ? symbol.split(':')[1] : symbol;

    // Check if any client is actually subscribed before serializing/emitting
    const hasSubscribers =
      this.subscriptions.has(rawSym) ||
      this.subscriptions.has(symbol) ||
      this.subscriptions.has(`NSE:${rawSym}`) ||
      this.subscriptions.has(`BSE:${rawSym}`) ||
      this.subscriptions.has(`NFO:${rawSym}`);

    if (!hasSubscribers) return;

    const payload = { symbol: rawSym, ltp, timestamp: new Date().toISOString() };

    // Emit to normalized room (all clients subscribed to this symbol joined symbol:rawSym)
    this.server.to(`symbol:${rawSym}`).emit('ltp', payload);
    if (symbol !== rawSym) {
      this.server.to(`symbol:${symbol}`).emit('ltp', payload);
    }
  }

  /**
   * High-performance batched tick broadcasting
   * Merges high-frequency ticks into a 75ms window to eliminate CPU spikes and redundant packet serialization
   */
  broadcastTicks(ticks: Record<string, number>) {
    Object.assign(this.tickBuffer, ticks);

    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        const pending = { ...this.tickBuffer };
        this.tickBuffer = {};
        this.flushTimer = null;

        Object.entries(pending).forEach(([symbol, ltp]) => {
          this.broadcastLTP(symbol, ltp);
        });
      }, 75);
    }
  }
}
