import { Controller, Get, Post, UseGuards, Request, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SwingScannerService } from './swing-scanner.service';

@ApiTags('Swing Scanner')
@Controller('swing-scanner')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SwingScannerController {
  constructor(private readonly scanner: SwingScannerService) {}

  @Post('run')
  @ApiOperation({ summary: 'Run a full swing scan (VCP / Rocket Base / Tight Area)' })
  async run(@Request() req) {
    const data = await this.scanner.runScan(req.user.id);
    return { success: true, data };
  }

  @Get('last')
  @ApiOperation({ summary: 'Get results of the last scan run' })
  async last(
    @Request() req,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('pattern') pattern?: string,
    @Query('sortBy') sortBy?: string,
  ) {
    const data = await this.scanner.getLastScan(req.user.id, {
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      pattern,
      sortBy,
    });
    return { success: true, data };
  }
}
