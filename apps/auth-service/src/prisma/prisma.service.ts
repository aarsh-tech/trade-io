import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { orderEvents } from '../common/events';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super();
    const baseClient = this;

    const extended = this.$extends({
      query: {
        order: {
          async create({ args, query }) {
            const result = await query(args);
            orderEvents.emit('order.created', result);
            return result;
          },
          async update({ args, query }) {
            const result = await query(args);
            orderEvents.emit('order.updated', result);
            return result;
          },
          async updateMany({ args, query }) {
            let affectedOrders: any[] = [];
            try {
              affectedOrders = await (baseClient as any).order.findMany({
                where: args.where || {},
              });
            } catch (e) {
              console.error('Error finding orders for updateMany:', e.message);
            }

            const result = await query(args);

            const updatedData = args.data || {};
            affectedOrders.forEach((o) => {
              orderEvents.emit('order.updated', { ...o, ...updatedData });
            });

            return result;
          },
        },
      },
    });

    // Attach lifecycle hooks to the extended client
    (extended as any).onModuleInit = async () => {
      await baseClient.$connect();
    };
    (extended as any).onModuleDestroy = async () => {
      await baseClient.$disconnect();
    };

    return extended as any;
  }

  async onModuleInit() {
    // Overridden by constructor return
  }

  async onModuleDestroy() {
    // Overridden by constructor return
  }
}
