import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Request, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StrategyService } from './strategy.service';
import { Breakout15MinEngine } from './breakout15min.engine';
import { CreateStrategyDto, UpdateStrategyDto } from './dto/strategy.dto';

@ApiTags('Strategies')
@Controller('strategies')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class StrategyController {
  constructor(
    private readonly strategyService: StrategyService,
    private readonly engine: Breakout15MinEngine,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all strategies for the user' })
  async list(@Request() req) {
    const data = await this.strategyService.list(req.user.id);
    return { success: true, data };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single strategy' })
  async get(@Request() req, @Param('id') id: string) {
    const data = await this.strategyService.get(req.user.id, id);
    return { success: true, data };
  }

  @Post()
  @ApiOperation({ summary: 'Create a new strategy' })
  async create(@Request() req, @Body() dto: CreateStrategyDto) {
    const data = await this.strategyService.create(req.user.id, dto);
    return { success: true, data };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update strategy config' })
  async update(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: UpdateStrategyDto,
  ) {
    const data = await this.strategyService.update(req.user.id, id, dto);
    return { success: true, data };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a strategy' })
  async delete(@Request() req, @Param('id') id: string) {
    await this.strategyService.delete(req.user.id, id);
    return { success: true };
  }

  @Post(':id/start')
  @ApiOperation({ summary: 'Start executing a strategy' })
  async start(@Request() req, @Param('id') id: string) {
    // Guard: must own the strategy
    await this.strategyService.get(req.user.id, id);
    const result = await this.engine.start(id);
    return { success: true, data: result };
  }

  @Post(':id/stop')
  @ApiOperation({ summary: 'Stop a running strategy' })
  async stop(@Request() req, @Param('id') id: string) {
    await this.strategyService.get(req.user.id, id);
    await this.engine.stop(id);
    return { success: true };
  }

  @Get(':id/status')
  @ApiOperation({ summary: 'Get live strategy status & logs' })
  async status(@Request() req, @Param('id') id: string) {
    await this.strategyService.get(req.user.id, id);
    return {
      success: true,
      data: {
        running: this.engine.isRunning(id),
        logs: this.engine.getLogs(id),
      },
    };
  }

  @Get(':id/executions')
  @ApiOperation({ summary: 'Get past execution history' })
  async executions(@Request() req, @Param('id') id: string) {
    const data = await this.strategyService.getExecutions(req.user.id, id);
    return { success: true, data };
  }
}
