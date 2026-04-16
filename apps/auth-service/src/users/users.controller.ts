import {
  Controller, Patch, Post, Body, UseGuards, Request,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersService } from './users.service';
import { IsEmail, IsString, MinLength } from 'class-validator';

class UpdateProfileDto {
  @IsEmail()
  email?: string;

  @IsString()
  @MinLength(2)
  name?: string;
}

class ChangePasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}

@ApiTags('Users')
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService) { }

  @Patch('profile')
  @ApiOperation({ summary: 'Update user profile' })
  async updateProfile(@Request() req, @Body() dto: UpdateProfileDto) {
    const result = await this.usersService.update(req.user.id, dto);
    return { success: true, data: result };
  }

  @Post('change-password')
  @ApiOperation({ summary: 'Change user password' })
  async changePassword(@Request() req, @Body() dto: ChangePasswordDto) {
    await this.usersService.updatePassword(req.user.id, dto.currentPassword, dto.newPassword);
    return { success: true, message: 'Password updated successfully' };
  }
}
