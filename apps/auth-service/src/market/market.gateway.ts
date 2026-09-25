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
import { CLOSED_FEED, FeedStatus, MarketTick, OrderUpdateEvent } from './market-tick';

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

  // subscribed key -> socket ids. Keys are stored as the client sent them: `EXCH:SYMBOL` (exact) or a bare symbol.
  private subscriptions = new Map<string, Set<string>>();

  // socketId -> raw symbols this client subscribed to (for the per-client cap)
  private clientSymbols = new Map<string, Set<string>>();

  // socketId -> exact keys subscribed (source for per-viewer ticker binding)
  private clientKeys = new Map<string, Set<string>>();

  private socketUsers = new Map<string, string>();

  private feedByUser = new Map<string, FeedStatus>();

  // Latest tick per instrument, per owning user, flushed as one `ticks` message per socket
  private tickBuffer = new Map<string, Map<string, MarketTick>>();
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(private readonly jwtService: JwtService) {}

  handleConnection(client: Socket) {
    const userId = authenticateSocket(client, this.jwtService);
    if (!userId) {
      this.logger.warn(`Rejected unauthenticated market socket: ${client.id}`);
      client.disconnect(true);
      return;
    }
    client.data.userId = userId;
    this.socketUsers.set(client.id, userId);
    client.join(`user:${userId}`);
    client.emit('feed:status', this.feedByUser.get(userId) ?? CLOSED_FEED);
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    this.clientSymbols.delete(client.id);
    this.clientKeys.delete(client.id);
    this.socketUsers.delete(client.id);
    this.subscriptions.forEach((clients, key) => {
      clients.delete(client.id);
      if (clients.size === 0) this.subscriptions.delete(key);
    });
  }

  /** Symbols each connected viewer is watching, so the ticker can stream them on that viewer's own account. */
  getSubscribedSymbolsByUser(): Map<string, string[]> {
    const byUser = new Map<string, Set<string>>();
    this.clientKeys.forEach((keys, socketId) => {
      const userId = this.socketUsers.get(socketId);
      if (!userId) return;
      const set = byUser.get(userId) ?? new Set<string>();
      keys.forEach((k) => set.add(k));
      byUser.set(userId, set);
    });
    return new Map(Array.from(byUser, ([userId, set]) => [userId, Array.from(set)]));
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

    // Cap distinct underlying symbols per client
    const owned = this.clientSymbols.get(client.id) ?? new Set<string>();
    const keys = this.clientKeys.get(client.id) ?? new Set<string>();
    const accepted: string[] = [];
    for (const symbol of data.symbols) {
      if (typeof symbol !== 'string' || !symbol.trim()) continue;
      const key = symbol.trim();
      const raw = key.includes(':') ? key.split(':')[1] : key;
      if (!owned.has(raw) && owned.size >= MAX_SYMBOLS_PER_CLIENT) continue;
      owned.add(raw);
      keys.add(key);
      accepted.push(key);
    }
    this.clientSymbols.set(client.id, owned);
    this.clientKeys.set(client.id, keys);
    const truncated = accepted.length < data.symbols.length;

    this.logger.log(`Client ${client.id} subscribing to ${accepted.length} symbols`);

    accepted.forEach((key) => {
      if (!this.subscriptions.has(key)) this.subscriptions.set(key, new Set());
      this.subscriptions.get(key).add(client.id);
    });

    return {
      status: 'ok',
      subscribed: accepted,
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

    const owned = this.clientSymbols.get(client.id);
    const keys = this.clientKeys.get(client.id);
    data.symbols.forEach((symbol) => {
      if (typeof symbol !== 'string') return;
      const key = symbol.trim();
      const subs = this.subscriptions.get(key);
      if (subs) {
        subs.delete(client.id);
        if (subs.size === 0) this.subscriptions.delete(key);
      }
      keys?.delete(key);
      owned?.delete(key.includes(':') ? key.split(':')[1] : key);
    });

    return { status: 'ok', unsubscribed: data.symbols };
  }

  /**
   * Queue ticks from `userId`'s market-data feed. Only that user's sockets receive them (a viewer never
   * streams on someone else's Kite session). Ticks for the same instrument coalesce within a 75 ms window
   * and go out as one `ticks` array per socket.
   */
  broadcastTicks(userId: string, ticks: MarketTick[]) {
    if (!this.server || ticks.length === 0) return;
    const buffer = this.tickBuffer.get(userId) ?? new Map<string, MarketTick>();
    ticks.forEach((t) => buffer.set(t.key, t));
    this.tickBuffer.set(userId, buffer);

    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), 75);
    }
  }

  private flush() {
    const pending = this.tickBuffer;
    this.tickBuffer = new Map();
    this.flushTimer = null;

    pending.forEach((buffer, userId) => {
      const perSocket = new Map<string, MarketTick[]>();
      buffer.forEach((tick) => {
        // A socket may have subscribed to the exact key and/or the bare symbol: one delivery either way.
        const sockets = new Set<string>([
          ...(this.subscriptions.get(tick.key) ?? []),
          ...(this.subscriptions.get(tick.symbol) ?? []),
        ]);
        sockets.forEach((socketId) => {
          if (this.socketUsers.get(socketId) !== userId) return;
          const list = perSocket.get(socketId) ?? [];
          list.push(tick);
          perSocket.set(socketId, list);
        });
      });
      perSocket.forEach((list, socketId) => this.server.to(socketId).emit('ticks', list));
    });
  }

  /** Publish a user's feed health; new sockets get the latest value on connect. */
  emitFeedStatus(userId: string, status: FeedStatus) {
    this.feedByUser.set(userId, status);
    this.server?.to(`user:${userId}`).emit('feed:status', status);
  }

  emitOrderUpdate(userId: string, update: OrderUpdateEvent) {
    this.server?.to(`user:${userId}`).emit('order_update', update);
  }
}
