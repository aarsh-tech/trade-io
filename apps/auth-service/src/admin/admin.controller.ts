import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { AdminService } from './admin.service';
import {
  CreateUserDto,
  UpdateUserStatusDto,
  UpdateUserRoleDto,
  ResetUserPasswordDto,
} from './dto/admin.dto';

@ApiTags('Admin')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@ApiBearerAuth()
export class AdminController {
  constructor(private readonly adminService: AdminService) { }

  @Get('users')
  @ApiOperation({ summary: 'List all users and session statistics (Admin only)' })
  async listUsers() {
    const data = await this.adminService.listUsers();
    return { success: true, data };
  }

  @Post('users')
  @ApiOperation({ summary: 'Create/provision a new user with credentials (Admin only)' })
  async createUser(@Body() dto: CreateUserDto) {
    const data = await this.adminService.createUser(dto);
    return { success: true, data };
  }

  @Patch('users/:id/status')
  @ApiOperation({ summary: 'Activate or deactivate a user (Admin only)' })
  async updateStatus(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    const data = await this.adminService.updateStatus(id, dto.isActive, req.user.id);
    return { success: true, data };
  }

  @Patch('users/:id/role')
  @ApiOperation({ summary: 'Update user role (Admin only)' })
  async updateRole(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: UpdateUserRoleDto,
  ) {
    const data = await this.adminService.updateRole(id, dto.role, req.user.id);
    return { success: true, data };
  }

  @Post('users/:id/reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset a user password and return new credentials (Admin only)' })
  async resetPassword(
    @Param('id') id: string,
    @Body() dto: ResetUserPasswordDto,
  ) {
    const data = await this.adminService.resetPassword(id, dto.newPassword);
    return { success: true, data };
  }

  @Post('users/:id/revoke-sessions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Force logout: terminate all active sessions for user (Admin only)' })
  async revokeSessions(@Param('id') id: string) {
    const data = await this.adminService.revokeSessions(id);
    return { success: true, data };
  }

  @Delete('users/:id')
  @ApiOperation({ summary: 'Delete a user account (Admin only)' })
  async deleteUser(@Request() req, @Param('id') id: string) {
    const data = await this.adminService.deleteUser(id, req.user.id);
    return { success: true, data };
  }
}
