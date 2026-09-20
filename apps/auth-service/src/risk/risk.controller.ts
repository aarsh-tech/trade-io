import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RiskService } from './risk.service';
import { UpdateRiskSettingsDto, TriggerKillSwitchDto } from './dto/risk.dto';

@ApiTags('Risk Management System (RMS)')
@Controller('risk')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class RiskController {
  constructor(private readonly riskService: RiskService) {}

  @Get('status')
  @ApiOperation({ summary: 'Get live daily P&L, risk usage, and Kill Switch status' })
  async getStatus(@Request() req) {
    const data = await this.riskService.getRiskStatus(req.user.id);
    return { success: true, data };
  }

  @Post('kill-switch')
  @ApiOperation({ summary: 'Emergency Kill Switch: square off all positions, cancel orders, and suspend trading' })
  async triggerKillSwitch(@Request() req, @Body() dto: TriggerKillSwitchDto) {
    const result = await this.riskService.triggerKillSwitch(
      req.user.id,
      dto.reason || 'Manual user-triggered emergency stop',
    );
    return result;
  }

  @Post('reset-kill-switch')
  @ApiOperation({ summary: 'Reset Kill Switch to re-enable trading' })
  async resetKillSwitch(@Request() req) {
    const result = await this.riskService.resetKillSwitch(req.user.id);
    return result;
  }

  @Patch('settings')
  @ApiOperation({ summary: 'Update risk settings (max daily loss, max order value, max order quantity)' })
  async updateSettings(@Request() req, @Body() dto: UpdateRiskSettingsDto) {
    return await this.riskService.updateRiskSettings(req.user.id, dto);
  }

  @Get('broker-health')
  @ApiOperation({ summary: 'Verify broker session token health and connectivity' })
  async checkBrokerHealth(@Request() req) {
    const data = await this.riskService.checkBrokerSessionHealth(req.user.id);
    return { success: true, data };
  }
}
