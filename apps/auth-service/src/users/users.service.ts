import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async create(data: { email: string; name: string; password: string }) {
    const exists = await this.prisma.user.findUnique({ where: { email: data.email } });
    if (exists) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(data.password, 12);
    return this.prisma.user.create({
      data: { email: data.email, name: data.name, passwordHash },
      select: { id: true, email: true, name: true, twoFaEnabled: true, createdAt: true },
    });
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, name: true, twoFaEnabled: true, totpSecret: true, createdAt: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateTotpSecret(userId: string, secret: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { totpSecret: secret },
    });
  }

  async enableTwoFa(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { twoFaEnabled: true },
      select: { id: true, email: true, name: true, twoFaEnabled: true },
    });
  }

  async disableTwoFa(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { twoFaEnabled: false, totpSecret: null },
      select: { id: true, email: true, name: true, twoFaEnabled: true },
    });
  }

  async update(id: string, data: { email?: string; name?: string }) {
    if (data.email) {
      const exists = await this.prisma.user.findUnique({ where: { email: data.email } });
      if (exists && exists.id !== id) throw new ConflictException('Email already in use');
    }

    return this.prisma.user.update({
      where: { id },
      data,
      select: { id: true, email: true, name: true, twoFaEnabled: true, createdAt: true },
    });
  }

  async updatePassword(userId: string, currentPass: string, newPass: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const isValid = await bcrypt.compare(currentPass, user.passwordHash);
    if (!isValid) throw new ConflictException('Incorrect current password');

    const passwordHash = await bcrypt.hash(newPass, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    return { success: true };
  }

  async validatePassword(user: { passwordHash: string }, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.passwordHash);
  }
}
