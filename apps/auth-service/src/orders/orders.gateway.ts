import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Logger } from '@nestjs/common';
import { orderEvents } from '../common/events';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: 'orders',
})
export class OrdersGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(OrdersGateway.name);

  // Map of userId -> Set of socket IDs
  private userSockets = new Map<string, Set<string>>();
  // Map of socketId -> userId
  private socketUser = new Map<string, string>();

  constructor(private readonly jwtService: JwtService) {
    // Listen to Prisma DB events and broadcast
    orderEvents.on('order.created', (order) => {
      this.sendOrderNotification(order.userId, order, 'created');
    });

    orderEvents.on('order.updated', (order) => {
      this.sendOrderNotification(order.userId, order, 'updated');
    });
  }

  handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token || client.handshake.query?.token;
      if (!token) {
        this.logger.warn(`No token provided for socket connection: ${client.id}`);
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token);
      const userId = payload.sub;

      if (!userId) {
        this.logger.warn(`Invalid JWT token payload: sub (userId) missing`);
        client.disconnect();
        return;
      }

      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId).add(client.id);
      this.socketUser.set(client.id, userId);

      this.logger.log(`User ${userId} authenticated on socket ${client.id}`);
    } catch (err) {
      this.logger.warn(`Socket connection auth failed for ${client.id}: ${err.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = this.socketUser.get(client.id);
    if (userId) {
      this.userSockets.get(userId)?.delete(client.id);
      if (this.userSockets.get(userId)?.size === 0) {
        this.userSockets.delete(userId);
      }
      this.socketUser.delete(client.id);
      this.logger.log(`User ${userId} disconnected from socket ${client.id}`);
    }
  }

  sendOrderNotification(userId: string, order: any, eventType: string) {
    const sockets = this.userSockets.get(userId);
    if (sockets && sockets.size > 0) {
      this.logger.log(
        `Sending order notification to user ${userId} for order ${order.id} (Event: ${eventType})`
      );
      sockets.forEach((socketId) => {
        this.server.to(socketId).emit('order-event', { order, eventType });
      });
    }
  }
}
