import { Controller, Post, Get, Body, UseGuards, Request } from '@nestjs/common';
import { BacktestService } from './backtest.service';
import { RunBacktestDto } from './dto/backtest.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Backtest')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('backtest')
export class BacktestController {
  constructor(private readonly backtestService: BacktestService) {}

  @Post('run')
  @ApiOperation({ summary: 'Run a backtest for a strategy' })
  async runBacktest(@Request() req: any, @Body() dto: RunBacktestDto) {
    return this.backtestService.runBacktest(req.user.id, dto);
  }

  @Get('history')
  @ApiOperation({ summary: 'Get backtest history' })
  async getBacktests(@Request() req: any) {
    return this.backtestService.getBacktests(req.user.id);
  }
}
