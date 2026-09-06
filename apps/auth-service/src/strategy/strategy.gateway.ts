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
import { ModuleRef } from '@nestjs/core';
import { strategyEvents } from '../common/events';
import { PrismaService } from '../prisma/prisma.service';
import { Breakout15MinEngine } from './breakout15min.engine';
import { EmaVwapCrossoverEngine } from './emavwap.engine';
import { StockOptionsBuyingEngine } from './stock-options-buying.engine';
import { NiftyOptionsScalperEngine } from './nifty-options-scalper.engine';
import { GammaBlastExpiryEngine } from './gamma-blast-expiry.engine';
import { StrategyService } from './strategy.service';

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

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
  ) {
    strategyEvents.on('strategy.update', (data: { strategyId: string; logs: string[]; state: any; orders?: any[] }) => {
      this.broadcastStrategyUpdate(data.strategyId, data);
    });
  }

  handleConnection(client: Socket) {
    try {
      let rawToken =
        client.handshake.auth?.token ||
        client.handshake.query?.token ||
        client.handshake.headers?.authorization;

      if (rawToken && typeof rawToken === 'string' && rawToken.startsWith('Bearer ')) {
        rawToken = rawToken.slice(7).trim();
      }

      if (!rawToken) {
        this.logger.warn(`No token provided for strategy socket connection: ${client.id}`);
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(rawToken);
      if (!payload?.sub) {
        client.disconnect();
        return;
      }

      this.logger.log(`Client ${client.id} authenticated on strategy gateway`);
    } catch (err: any) {
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
  async handleSubscribe(
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

      // Instantly emit the current in-memory engine state & logs so the client doesn't wait
      try {
        const strategy = await this.prisma.strategy.findUnique({
          where: { id: data.strategyId },
          select: { type: true, isActive: true },
        });

        if (strategy) {
          const engine = this.getEngine(strategy.type);
          let logs: string[] = [];
          let state: any = null;
          let orders: any[] = [];

          if (engine) {
            logs = engine.getLogs ? engine.getLogs(data.strategyId) : [];
            state = (engine as any).getState ? (engine as any).getState(data.strategyId) : null;
          }

          const strategyService = this.moduleRef.get(StrategyService, { strict: false });
          if (strategyService && strategy.isActive) {
            const currentExec = await strategyService.getLatestExecution(data.strategyId);
            if (currentExec) {
              orders = await strategyService.getExecutionOrders(currentExec.id);
            }
          }

          client.emit('strategy-event', {
            logs,
            state,
            orders,
          });
        }
      } catch (err: any) {
        this.logger.error(`Error sending initial state to client ${client.id}: ${err.message}`);
      }
    }
  }

  private getEngine(type: any) {
    try {
      if (type === 'BREAKOUT_15MIN') return this.moduleRef.get(Breakout15MinEngine, { strict: false });
      if (type === 'EMA_VWAP_CROSSOVER' || type === 'EMA_RSI_OPTIONS' || type === 'DAILY_SCALPER') return this.moduleRef.get(EmaVwapCrossoverEngine, { strict: false });
      if (type === 'STOCK_OPTIONS_BUYING') return this.moduleRef.get(StockOptionsBuyingEngine, { strict: false });
      if (type === 'NIFTY_OPTIONS_SCALPER') return this.moduleRef.get(NiftyOptionsScalperEngine, { strict: false });
      if (type === 'GAMMA_BLAST_EXPIRY') return this.moduleRef.get(GammaBlastExpiryEngine, { strict: false });
    } catch { }
    return null;
  }

  broadcastStrategyUpdate(strategyId: string, payload: { logs: string[]; state: any; orders?: any[] }) {
    if (this.server) {
      this.server.to(strategyId).emit('strategy-event', payload);
    }
  }
}
