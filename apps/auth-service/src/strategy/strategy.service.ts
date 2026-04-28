import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStrategyDto, UpdateStrategyDto } from './dto/strategy.dto';

@Injectable()
export class StrategyService {
  constructor(private prisma: PrismaService) {}

  async list(userId: string) {
    const strategies = await this.prisma.strategy.findMany({
      where: { userId },
      include: {
        brokerAccount: {
          select: { broker: true, clientId: true },
        },
        executions: {
          orderBy: { startedAt: 'desc' },
          take: 1,
          select: { id: true, status: true, startedAt: true, stoppedAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return strategies.map((s) => ({
      ...s,
      config: this.parseConfig(s.config),
      latestExecution: s.executions[0] || null,
    }));
  }

  async get(userId: string, id: string) {
    const strategy = await this.prisma.strategy.findUnique({
      where: { id },
      include: {
        brokerAccount: {
          select: { broker: true, clientId: true },
        },
        executions: {
          orderBy: { startedAt: 'desc' },
          take: 10,
          select: {
            id: true,
            status: true,
            startedAt: true,
            stoppedAt: true,
            logs: true,
            errorMsg: true,
          },
        },
      },
    });

    if (!strategy) throw new NotFoundException('Strategy not found');
    if (strategy.userId !== userId) throw new ForbiddenException();

    return { ...strategy, config: this.parseConfig(strategy.config) };
  }

  async create(userId: string, dto: CreateStrategyDto) {
    return this.prisma.strategy.create({
      data: {
        userId,
        name: dto.name,
        type: dto.type as any,
        config: dto.config,
        brokerAccountId: dto.brokerAccountId || null,
        isActive: false,
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateStrategyDto) {
    await this.assertOwner(userId, id);
    return this.prisma.strategy.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.config && { config: dto.config }),
        ...(dto.brokerAccountId !== undefined && {
          brokerAccountId: dto.brokerAccountId,
        }),
      },
    });
  }

  async delete(userId: string, id: string) {
    await this.assertOwner(userId, id);
    await this.prisma.strategy.delete({ where: { id } });
    return { success: true };
  }

  async setActive(userId: string, id: string, active: boolean) {
    await this.assertOwner(userId, id);
    return this.prisma.strategy.update({
      where: { id },
      data: { isActive: active },
    });
  }

  async setAutoStart(userId: string, id: string, autoStart: boolean) {
    await this.assertOwner(userId, id);
    return this.prisma.strategy.update({
      where: { id },
      data: { autoStart } as any,
    });
  }

  async getExecutions(userId: string, strategyId: string) {
    await this.assertOwner(userId, strategyId);
    return this.prisma.strategyExecution.findMany({
      where: { strategyId },
      orderBy: { startedAt: 'desc' },
      take: 20,
    });
  }

  // ── helpers ──────────────────────────────────────────────────────────────────

  private async assertOwner(userId: string, id: string) {
    const s = await this.prisma.strategy.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Strategy not found');
    if (s.userId !== userId) throw new ForbiddenException();
    return s;
  }

  private parseConfig(raw: string) {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
}
