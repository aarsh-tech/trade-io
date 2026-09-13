import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/admin.dto';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listUsers() {
    const users = await this.prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        twoFaEnabled: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            refreshTokens: true,
            brokerAccounts: true,
            strategies: true,
          },
        },
        refreshTokens: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            expiresAt: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const now = new Date();
    const formatted = users.map((u) => {
      const latestToken = u.refreshTokens[0];
      const hasActiveSession = Boolean(latestToken && latestToken.expiresAt > now);
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        isActive: u.isActive,
        twoFaEnabled: u.twoFaEnabled,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
        sessionCount: u._count.refreshTokens,
        brokerAccountsCount: u._count.brokerAccounts,
        strategiesCount: u._count.strategies,
        hasActiveSession,
        lastActiveAt: latestToken ? latestToken.createdAt : null,
      };
    });

    const totalUsers = formatted.length;
    const activeUsers = formatted.filter((u) => u.isActive).length;
    const totalAdmins = formatted.filter((u) => u.role === Role.ADMIN).length;
    const activeSessions = formatted.filter((u) => u.hasActiveSession).length;

    return {
      stats: {
        totalUsers,
        activeUsers,
        totalAdmins,
        activeSessions,
      },
      users: formatted,
    };
  }

  async createUser(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
    });
    if (existing) {
      throw new ConflictException('A user with this email address already exists');
    }

    const clearPassword =
      dto.password && dto.password.trim().length >= 6
        ? dto.password.trim()
        : randomBytes(6).toString('hex'); // 12-char secure random alphanumeric password

    const passwordHash = await bcrypt.hash(clearPassword, 12);

    const newUser = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase().trim(),
        name: dto.name.trim(),
        passwordHash,
        role: dto.role || Role.USER,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    return {
      user: newUser,
      temporaryPassword: clearPassword,
    };
  }

  async updateStatus(userId: string, isActive: boolean, currentAdminId: string) {
    if (userId === currentAdminId && !isActive) {
      throw new BadRequestException('You cannot deactivate your own admin account');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!isActive) {
      // Immediate force-logout: invalidate all active sessions
      await this.prisma.refreshToken.deleteMany({ where: { userId } }).catch(() => {});
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { isActive },
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });

    return updated;
  }

  async updateRole(userId: string, role: Role, currentAdminId: string) {
    if (userId === currentAdminId && role !== Role.ADMIN) {
      throw new BadRequestException('You cannot demote your own admin account');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { role },
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });

    return updated;
  }

  async resetPassword(userId: string, customNewPassword?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const clearPassword =
      customNewPassword && customNewPassword.trim().length >= 6
        ? customNewPassword.trim()
        : randomBytes(6).toString('hex');

    const passwordHash = await bcrypt.hash(clearPassword, 12);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        resetToken: null,
        resetExpires: null,
      },
    });

    // Invalidate old sessions so user must log in with the new password
    await this.prisma.refreshToken.deleteMany({ where: { userId } }).catch(() => {});

    return {
      success: true,
      newPassword: clearPassword,
    };
  }

  async revokeSessions(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.refreshToken.deleteMany({ where: { userId } }).catch(() => {});

    return {
      success: true,
      message: 'All active sessions for this user have been terminated.',
    };
  }

  async deleteUser(userId: string, currentAdminId: string) {
    if (userId === currentAdminId) {
      throw new BadRequestException('You cannot delete your own admin account');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.user.delete({ where: { id: userId } });

    return {
      success: true,
      message: 'User deleted successfully',
    };
  }
}
