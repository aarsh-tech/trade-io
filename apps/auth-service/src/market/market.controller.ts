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
  async search(@Query('q') q: string, @Query('accountId') accountId: string, @Request() req: any) {
    const results = await this.marketService.search(q, req.user.id, accountId);
    return { success: true, data: results };
  }


}
