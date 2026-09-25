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

  @Get('day-pnl')
  @ApiOperation({ summary: "Today's realized P&L (net of charges) from real fills, same matching as the ledger" })
  async dayPnl(@Request() req) {
    return { success: true, data: await this.ordersService.getDayRealizedPnl(req.user.id) };
  }

  @Get('ledger')
  @ApiOperation({ summary: 'Monthly realized P&L ledger (net of charges, algo vs manual) with a paginated trade journal' })
  @ApiQuery({ name: 'month', required: false, type: Number })
  @ApiQuery({ name: 'year', required: false, type: Number })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: ['ALL', 'PROFIT', 'LOSS'] })
  @ApiQuery({ name: 'segment', required: false, enum: ['ALL', 'EQUITY', 'FNO'] })
  @ApiQuery({ name: 'date', required: false, type: String, description: 'IST day, YYYY-MM-DD' })
  @ApiQuery({ name: 'q', required: false, type: String })
  async ledger(
    @Request() req,
    @Query('month') month?: string,
    @Query('year') year?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
    @Query('segment') segment?: string,
    @Query('date') date?: string,
    @Query('q') q?: string,
  ) {
    const num = (v?: string) => (v && Number.isFinite(parseInt(v, 10)) ? parseInt(v, 10) : undefined);
    const ledger = await this.ordersService.getMonthlyLedger(req.user.id, {
      month: num(month),
      year: num(year),
      page: num(page),
      pageSize: num(pageSize),
      status: status === 'PROFIT' || status === 'LOSS' ? status : 'ALL',
      segment: segment === 'EQUITY' || segment === 'FNO' ? segment : 'ALL',
      date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined,
      q: q?.slice(0, 60),
    });
    return { success: true, data: ledger };
  }
}
