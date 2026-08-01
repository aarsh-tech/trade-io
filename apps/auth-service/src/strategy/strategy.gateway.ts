import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Logger } from '@nestjs/common';
import { strategyEvents } from '../common/events';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: 'strategy',
})
export class StrategyGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(StrategyGateway.name);

  // Map socketId -> strategyId subscription
  private socketSubscriptions = new Map<string, string>();

  constructor(private readonly jwtService: JwtService) {
    strategyEvents.on('strategy.update', (data: { strategyId: string; logs: string[]; state: any; orders?: any[] }) => {
      this.broadcastStrategyUpdate(data.strategyId, data);
    });
  }

  handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token || client.handshake.query?.token;
      if (!token) {
        this.logger.warn(`No token provided for strategy socket connection: ${client.id}`);
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token);
      if (!payload?.sub) {
        client.disconnect();
        return;
      }

      this.logger.log(`Client ${client.id} authenticated on strategy gateway`);
    } catch (err) {
      this.logger.warn(`Strategy socket auth failed for ${client.id}: ${err.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const strategyId = this.socketSubscriptions.get(client.id);
    if (strategyId) {
      client.leave(strategyId);
      this.socketSubscriptions.delete(client.id);
    }
    this.logger.log(`Client ${client.id} disconnected from strategy gateway`);
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { strategyId: string },
  ) {
    if (data?.strategyId) {
      // Leave previous room if any
      const prev = this.socketSubscriptions.get(client.id);
      if (prev) client.leave(prev);

      client.join(data.strategyId);
      this.socketSubscriptions.set(client.id, data.strategyId);
      this.logger.log(`Client ${client.id} subscribed to strategy room: ${data.strategyId}`);
    }
  }

  broadcastStrategyUpdate(strategyId: string, payload: { logs: string[]; state: any; orders?: any[] }) {
    if (this.server) {
      this.server.to(strategyId).emit('strategy-event', payload);
    }
  }
}
