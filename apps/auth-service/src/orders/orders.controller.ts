import { Controller, Get, Post, Query, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrdersService } from './orders.service';

@ApiTags('Orders')
@Controller('orders')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @ApiOperation({ summary: 'Get all orders for the current user' })
  async list(@Request() req) {
    const orders = await this.ordersService.getUserOrders(req.user.id);
    return { success: true, data: orders };
  }

  @Post('sync')
  @ApiOperation({ summary: 'Force-sync orders from active broker accounts into local DB' })
  async sync(@Request() req) {
    const result = await this.ordersService.syncBrokerOrders(req.user.id);
    return { success: true, data: result };
  }

  @Get('ledger')
  @ApiOperation({ summary: 'Get monthly realized P&L ledger with daily breakdowns and closed trade journal' })
  @ApiQuery({ name: 'month', required: false, type: Number })
  @ApiQuery({ name: 'year', required: false, type: Number })
  async ledger(
    @Request() req,
    @Query('month') month?: string,
    @Query('year') year?: string,
  ) {
    const monthNum = month ? parseInt(month, 10) : undefined;
    const yearNum = year ? parseInt(year, 10) : undefined;
    const ledger = await this.ordersService.getMonthlyLedger(req.user.id, monthNum, yearNum);
    return { success: true, data: ledger };
  }
}
