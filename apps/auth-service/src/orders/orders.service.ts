import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BrokerClientFactory } from '../brokers/broker-client.factory';
import { OrderSide, OrderType, ProductType, OrderStatus } from '@prisma/client';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly factory: BrokerClientFactory,
  ) {}

  async getUserOrders(userId: string) {
    // 1. Sync orders from active broker accounts
    const accounts = await this.prisma.brokerAccount.findMany({
      where: { userId, isActive: true },
    });

    for (const account of accounts) {
      if (account.accessToken && account.tokenExpiry && new Date(account.tokenExpiry) > new Date()) {
        try {
          const client = this.factory.createClient(account);
          const brokerOrders = await client.getOrders();

          for (const bo of brokerOrders) {
            // Find existing order in our database
            const existing = await this.prisma.order.findFirst({
              where: { userId, brokerOrderId: bo.orderId },
            });

            let dbStatus: OrderStatus = OrderStatus.OPEN;
            const statusUpper = bo.status.toUpperCase();
            if (statusUpper === 'COMPLETE') dbStatus = OrderStatus.COMPLETE;
            else if (statusUpper === 'REJECTED') dbStatus = OrderStatus.REJECTED;
            else if (statusUpper === 'CANCELLED') dbStatus = OrderStatus.CANCELLED;
            else if (statusUpper === 'OPEN' || statusUpper.includes('PENDING')) dbStatus = OrderStatus.OPEN;

            const dbAvgPrice = bo.avgPrice || null;
            const dbPrice = bo.price || null;

            if (existing) {
              if (
                existing.status !== dbStatus ||
                existing.filledQty !== bo.filledQty ||
                existing.avgPrice !== dbAvgPrice ||
                existing.price !== dbPrice ||
                existing.qty !== bo.qty
              ) {
                await this.prisma.order.update({
                  where: { id: existing.id },
                  data: {
                    status: dbStatus,
                    filledQty: bo.filledQty,
                    avgPrice: dbAvgPrice,
                    price: dbPrice,
                    qty: bo.qty,
                  },
                });
              }
            } else {
              // Create a new order row for any order placed outside our app (or missed)
              const side: OrderSide = bo.side.toUpperCase() === 'SELL' ? OrderSide.SELL : OrderSide.BUY;
              
              let orderType: OrderType = OrderType.MARKET;
              const typeUpper = bo.type.toUpperCase();
              if (typeUpper === 'LIMIT') orderType = OrderType.LIMIT;
              else if (typeUpper === 'SL' || typeUpper === 'STOPLOSS') orderType = OrderType.SL;
              else if (typeUpper === 'SL-M' || typeUpper === 'SL_M' || typeUpper.includes('SL')) orderType = OrderType.SL_M;

              await this.prisma.order.create({
                data: {
                  userId,
                  brokerAccountId: account.id,
                  symbol: bo.symbol,
                  exchange: 'NSE', // Default exchange
                  side,
                  orderType,
                  productType: ProductType.MIS, // Default product type
                  qty: bo.qty,
                  price: bo.price || null,
                  avgPrice: bo.avgPrice || null,
                  brokerOrderId: bo.orderId,
                  status: dbStatus,
                  filledQty: bo.filledQty,
                  createdAt: bo.orderTime ? new Date(bo.orderTime) : new Date(),
                  isPaperTrade: false,
                },
              });
            }
          }
        } catch (err) {
          console.error(`Error syncing orders for account ${account.id}:`, err.message);
        }
      }
    }

    // 2. Fetch and return all orders from local DB sorted by createdAt desc
    return this.prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        execution: {
          include: {
            strategy: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });
  }
}
