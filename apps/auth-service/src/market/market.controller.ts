import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MarketService } from './market.service';

@ApiTags('Market')
@Controller('market')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MarketController {
  constructor(private readonly marketService: MarketService) {}

  @Get('search')
  @ApiOperation({ summary: 'Search for stocks/instruments' })
  async search(
    @Query('q') q: string,
    @Query('accountId') accountId: string,
    @Request() req: any,
  ) {
    const results = await this.marketService.search(q, req.user.id, accountId);
    return { success: true, data: results };
  }

  @Get('overview')
  @ApiOperation({ summary: 'Get dashboard overview (indices and watchlist)' })
  async overview(@Request() req: any) {
    const data = await this.marketService.getOverview(req.user.id);
    return { success: true, data };
  }

  @Get('live-prices')
  @ApiOperation({ summary: 'Get live LTP for dashboard ticker banner' })
  async livePrices(@Request() req: any) {
    const data = await this.marketService.getLivePrices(req.user.id);
    return { success: true, data };
  }
}
