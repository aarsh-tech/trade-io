import {
  Controller, Get, Post, Delete, Body, Param, UseGuards, Request,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BrokersService } from './brokers.service';
import { ConnectBrokerDto } from './dto/broker.dto';

@ApiTags('Brokers')
@Controller('brokers')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class BrokersController {
  constructor(private readonly brokersService: BrokersService) {}

  @Get()
  @ApiOperation({ summary: 'List connected broker accounts' })
  async list(@Request() req) {
    const result = await this.brokersService.list(req.user.id);
    return { success: true, data: result };
  }

  @Post('connect')
  @ApiOperation({ summary: 'Connect a new broker account' })
  async connect(@Request() req, @Body() dto: ConnectBrokerDto) {
    const result = await this.brokersService.connect(req.user.id, dto);
    return { success: true, data: result };
  }

  @Get(':id/holdings')
  @ApiOperation({ summary: 'Get holdings for a specific broker account' })
  async holdings(@Request() req, @Param('id') id: string) {
    const result = await this.brokersService.getHoldings(req.user.id, id);
    return { success: true, data: result };
  }

  @Get(':id/positions')
  @ApiOperation({ summary: 'Get positions for a specific broker account' })
  async positions(@Request() req, @Param('id') id: string) {
    const result = await this.brokersService.getPositions(req.user.id, id);
    return { success: true, data: result };
  }

  @Get(':id/login-url')
  @ApiOperation({ summary: 'Get broker login URL' })
  async loginUrl(@Request() req, @Param('id') id: string) {
    return this.brokersService.getLoginUrl(req.user.id, id);
  }

  @Post(':id/session')
  @ApiOperation({ summary: 'Set active session for a broker account' })
  async setSession(@Request() req, @Param('id') id: string, @Body('requestToken') token: string) {
    return this.brokersService.setSession(req.user.id, id, token);
  }

  @Post(':id/orders')
  @ApiOperation({ summary: 'Place an order' })
  async placeOrder(@Request() req, @Param('id') id: string, @Body() orderData: any) {
    const result = await this.brokersService.placeOrder(req.user.id, id, orderData);
    return { success: true, data: result };
  }


  @Delete(':id')

  @ApiOperation({ summary: 'Disconnect a broker account' })
  async disconnect(@Request() req, @Param('id') id: string) {
    await this.brokersService.disconnect(req.user.id, id);
    return { success: true, message: 'Account disconnected' };
  }
}
