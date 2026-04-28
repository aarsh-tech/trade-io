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
    this.logger.log(`Client ${client.id} subscribing to: ${data.symbols.join(', ')}`);
    
    data.symbols.forEach((symbol) => {
      if (!this.subscriptions.has(symbol)) {
        this.subscriptions.set(symbol, new Set());
      }
      this.subscriptions.get(symbol).add(client.id);
      
      // Also join a socket.io room for this symbol for easy broadcasting
      client.join(`symbol:${symbol}`);
    });

    return { status: 'ok', subscribed: data.symbols };
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { symbols: string[] },
  ) {
    this.logger.log(`Client ${client.id} unsubscribing from: ${data.symbols.join(', ')}`);
    
    data.symbols.forEach((symbol) => {
      if (this.subscriptions.has(symbol)) {
        this.subscriptions.get(symbol).delete(client.id);
      }
      client.leave(`symbol:${symbol}`);
    });

    return { status: 'ok', unsubscribed: data.symbols };
  }

  /**
   * Broadcast LTP update to all subscribed clients
   */
  broadcastLTP(symbol: string, ltp: number) {
    this.server.to(`symbol:${symbol}`).emit('ltp', { symbol, ltp, timestamp: new Date().toISOString() });
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
