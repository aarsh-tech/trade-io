import { Controller, Get, Post, Delete, Body, Query, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { requireUserId } from './require-user';
import { MarketService } from './market.service';
import { OhlScannerService } from './ohl-scanner.service';
import { getMarketSessionInfo } from './market-calendar';

@ApiTags('Market')
@Controller('market')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MarketController {
  constructor(
    private readonly marketService: MarketService,
    private readonly ohlScannerService: OhlScannerService,
  ) { }

  @Get('ohl-stocks')
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Get Live Open=High and Open=Low stocks with streaming metrics' })
  async getOhlStocks(
    @Query('universe') universe: string = 'fno',
    @Query('tolerance') tolerance: string = '0.05',
    @Query('filter') filter: string = 'all',
    @Request() req: any,
  ) {
    const tolNum = parseFloat(tolerance) || 0.05;
    const data = await this.ohlScannerService.scan(requireUserId(req), universe, tolNum, filter);
    return { success: true, data };
  }

  // ── Market Data ─────────────────────────────────────────────────────────────

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

  @Get('lot-size')
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Get dynamic lot size for an instrument or stock symbol' })
  async getLotSize(
    @Query('symbol') symbol: string,
    @Query('accountId') accountId: string,
    @Request() req: any,
  ) {
    const lotSize = await this.marketService.getLotSize(symbol, req.user?.id, accountId);
    return { success: true, symbol, lotSize };
  }

  @Get('session')
  @ApiOperation({ summary: 'Exchange session state (pre-open/open/closed/holiday/weekend) for the UI status bar' })
  session() {
    return { success: true, data: getMarketSessionInfo() };
  }

  @Get('overview')
  @ApiOperation({ summary: 'Get dashboard overview (indices and watchlist)' })
  async overview(@Request() req: any) {
    const data = await this.marketService.getOverview(req.user?.id);
    return { success: true, data };
  }

  @Get('live-prices')
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Get live LTP for dashboard ticker banner' })
  async livePrices(@Request() req: any) {
    const data = await this.marketService.getLivePrices(requireUserId(req));
    return { success: true, data };
  }

  @Get('fo-stocks')
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Get active F&O stock list with lot sizes and quotes' })
  async foStocks(@Request() req: any) {
    const data = await this.marketService.getFoStocks(requireUserId(req));
    return { success: true, data };
  }

  @Get('movers')
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Get top gainers and top losers with live quotes' })
  async movers(@Request() req: any) {
    const data = await this.marketService.getMovers(requireUserId(req));
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
