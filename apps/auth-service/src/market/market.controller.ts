import { Controller, Get, Post, Delete, Body, Query, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';
import { MarketService } from './market.service';
import { OhlScannerService } from './ohl-scanner.service';

@ApiTags('Market')
@Controller('market')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MarketController {
  constructor(
    private readonly marketService: MarketService,
    private readonly ohlScannerService: OhlScannerService,
  ) {}

  @Get('ohl-stocks')
  @Public()
  @ApiOperation({ summary: 'Get Live Open=High and Open=Low stocks with streaming metrics' })
  async getOhlStocks(
    @Query('universe') universe: string = 'fno',
    @Query('tolerance') tolerance: string = '0.05',
    @Query('filter') filter: string = 'all',
    @Request() req: any,
  ) {
    const tolNum = parseFloat(tolerance) || 0.05;
    const data = await this.ohlScannerService.scan(req.user?.id, universe, tolNum, filter);
    return { success: true, data };
  }


  @Get('search')
  @ApiOperation({ summary: 'Search for stocks/instruments' })
  async search(
    @Query('q') q: string,
    @Query('accountId') accountId: string,
    @Request() req: any,
  ) {
    const results = await this.marketService.search(q, req.user?.id, accountId);
    return { success: true, data: results };
  }

  @Get('overview')
  @ApiOperation({ summary: 'Get dashboard overview (indices and watchlist)' })
  async overview(@Request() req: any) {
    const data = await this.marketService.getOverview(req.user?.id);
    return { success: true, data };
  }

  @Get('live-prices')
  @Public()
  @ApiOperation({ summary: 'Get live LTP for dashboard ticker banner' })
  async livePrices(@Request() req: any) {
    const data = await this.marketService.getLivePrices(req.user?.id);
    return { success: true, data };
  }

  @Get('fo-stocks')
  @Public()
  @ApiOperation({ summary: 'Get active F&O stock list with lot sizes and quotes' })
  async foStocks(@Request() req: any) {
    const data = await this.marketService.getFoStocks(req.user?.id);
    return { success: true, data };
  }

  @Get('movers')
  @Public()
  @ApiOperation({ summary: 'Get top gainers and top losers with live quotes' })
  async movers(@Request() req: any) {
    const data = await this.marketService.getMovers(req.user?.id);
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
