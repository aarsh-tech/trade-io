import { Controller, Get, Post, Patch, Delete, Body, Query, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';
import { MarketService } from './market.service';
import { OhlScannerService } from './ohl-scanner.service';
import { WhatsAppService } from './whatsapp.service';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('Market')
@Controller('market')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MarketController {
  constructor(
    private readonly marketService: MarketService,
    private readonly ohlScannerService: OhlScannerService,
    private readonly whatsAppService: WhatsAppService,
    private readonly prisma: PrismaService,
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

  // ── WhatsApp Alerts Integration ─────────────────────────────────────────────

  @Get('whatsapp/status')
  @ApiOperation({ summary: 'Get WhatsApp session status and alert configuration' })
  async getWhatsAppStatus(@Request() req: any) {
    const status = await this.whatsAppService.getStatus(req.user.id);
    const user = await this.prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        whatsappNumber: true,
        whatsappGroupId: true,
        whatsappAlertsEnabled: true,
        whatsappAlertTime: true,
        whatsappUniverse: true,
        whatsappTolerance: true,
      },
    });

    return {
      success: true,
      data: {
        ...status,
        settings: user || {
          whatsappNumber: '',
          whatsappGroupId: '',
          whatsappAlertsEnabled: false,
          whatsappAlertTime: '09:20',
          whatsappUniverse: 'fno',
          whatsappTolerance: 0.05,
        },
      },
    };
  }

  @Post('whatsapp/connect')
  @ApiOperation({ summary: 'Initialize WhatsApp Web QR code session' })
  async connectWhatsApp(@Request() req: any) {
    const session = await this.whatsAppService.initSession(req.user.id);
    return { success: true, data: session };
  }

  @Post('whatsapp/disconnect')
  @ApiOperation({ summary: 'Disconnect and logout WhatsApp session' })
  async disconnectWhatsApp(@Request() req: any) {
    await this.whatsAppService.disconnectSession(req.user.id);
    return { success: true, message: 'WhatsApp session disconnected.' };
  }

  @Get('whatsapp/groups')
  @ApiOperation({ summary: 'Fetch participating WhatsApp groups' })
  async getWhatsAppGroups(@Request() req: any) {
    const groups = await this.whatsAppService.refreshGroups(req.user.id);
    return { success: true, data: groups };
  }

  @Patch('whatsapp/settings')
  @ApiOperation({ summary: 'Update WhatsApp notification settings' })
  async updateWhatsAppSettings(
    @Request() req: any,
    @Body()
    body: {
      whatsappNumber?: string;
      whatsappGroupId?: string;
      whatsappAlertsEnabled?: boolean;
      whatsappAlertTime?: string;
      whatsappUniverse?: string;
      whatsappTolerance?: number;
    },
  ) {
    const updated = await this.prisma.user.update({
      where: { id: req.user.id },
      data: {
        whatsappNumber: body.whatsappNumber !== undefined ? body.whatsappNumber : undefined,
        whatsappGroupId: body.whatsappGroupId !== undefined ? body.whatsappGroupId : undefined,
        whatsappAlertsEnabled:
          body.whatsappAlertsEnabled !== undefined ? body.whatsappAlertsEnabled : undefined,
        whatsappAlertTime: body.whatsappAlertTime || undefined,
        whatsappUniverse: body.whatsappUniverse || undefined,
        whatsappTolerance: body.whatsappTolerance !== undefined ? Number(body.whatsappTolerance) : undefined,
      },
      select: {
        whatsappNumber: true,
        whatsappGroupId: true,
        whatsappAlertsEnabled: true,
        whatsappAlertTime: true,
        whatsappUniverse: true,
        whatsappTolerance: true,
      },
    });

    return { success: true, data: updated };
  }

  @Post('whatsapp/test')
  @ApiOperation({ summary: 'Send a test WhatsApp message to configured numbers / group' })
  async sendTestWhatsAppAlert(@Request() req: any) {
    const user = await this.prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        whatsappNumber: true,
        whatsappGroupId: true,
      },
    });

    if (!user || (!user.whatsappNumber && !user.whatsappGroupId)) {
      return {
        success: false,
        message: 'Please configure at least one phone number or WhatsApp group first.',
      };
    }

    const testMsg = `🚀 *TradeIO Connection Test*\n\n✅ Your WhatsApp is successfully connected to the TradeIO Algorithmic Engine!\n⏰ You will receive automated Morning OHL scanner alerts as scheduled.\n\n⚡ _TradeIO Platform_`;

    const targets: string[] = [];
    if (user.whatsappNumber) {
      user.whatsappNumber.split(',').map((n) => n.trim()).filter((n) => n.length > 5).slice(0, 10).forEach((n) => targets.push(n));
    }
    if (user.whatsappGroupId) {
      targets.push(user.whatsappGroupId.trim());
    }

    let sent = 0;
    const errors: string[] = [];
    for (const t of targets) {
      try {
        await this.whatsAppService.sendTextMessage(req.user.id, t, testMsg);
        sent++;
      } catch (err: any) {
        errors.push(`${t}: ${err?.message}`);
      }
    }

    return {
      success: sent > 0,
      sentCount: sent,
      errors,
      message: sent > 0 ? `Test alert sent successfully to ${sent} destination(s)!` : `Failed to send: ${errors.join(', ')}`,
    };
  }

  @Post('whatsapp/trigger-ohl')
  @ApiOperation({ summary: 'Run live OHL scan right now and send WhatsApp alert' })
  async triggerOhlAlertNow(@Request() req: any) {
    const user = await this.prisma.user.findUnique({
      where: { id: req.user.id },
    });

    if (!user) return { success: false, message: 'User not found' };

    const universe = user.whatsappUniverse || 'fno';
    const tolerance = user.whatsappTolerance ?? 0.05;
    const timeLabel = new Date().toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const scanResult = await this.ohlScannerService.scan(req.user.id, universe, tolerance, 'all');
    const openLowStocks = scanResult.stocks.filter((s) => s.signal === 'OPEN_LOW');
    const openHighStocks = scanResult.stocks.filter((s) => s.signal === 'OPEN_HIGH');

    const broadcastRes = await this.whatsAppService.broadcastOhlScan(
      req.user.id,
      openLowStocks,
      openHighStocks,
      timeLabel,
    );

    return {
      success: broadcastRes.sentCount > 0,
      openLowCount: openLowStocks.length,
      openHighCount: openHighStocks.length,
      sentCount: broadcastRes.sentCount,
      errors: broadcastRes.errors,
      message:
        broadcastRes.sentCount > 0
          ? `OHL alert sent to ${broadcastRes.sentCount} recipient(s) with ${openLowStocks.length} Open=Low & ${openHighStocks.length} Open=High stocks!`
          : `Alert dispatch notice: ${broadcastRes.errors.join(', ')}`,
    };
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
