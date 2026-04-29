import { Controller, Get, Post, Delete, Body, Query, UseGuards, Request } from '@nestjs/common';
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
 
  @Post('watchlist')
  @ApiOperation({ summary: 'Add symbol to watchlist' })
  async addToWatchlist(@Request() req: any, @Body() body: { symbol: string; exchange?: string }) {
    const data = await this.marketService.addToWatchlist(req.user.id, body.symbol, body.exchange);
    return { success: true, data };
  }
 
  @Delete('watchlist')
  @ApiOperation({ summary: 'Remove symbol from watchlist' })
  async removeFromWatchlist(@Request() req: any, @Query('symbol') symbol: string, @Query('exchange') exchange?: string) {
    const data = await this.marketService.removeFromWatchlist(req.user.id, symbol, exchange);
    return { success: true, data };
  }
}
