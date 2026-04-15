import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto, LoginDto } from './dto/auth.dto';
import { randomBytes } from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private users: UsersService,
    private jwt: JwtService,
    private config: ConfigService,
    private prisma: PrismaService,
  ) {}

  // ─── Register ────────────────────────────────────────────────────────────────
  async register(dto: RegisterDto) {
    const user = await this.users.create(dto);
    const tokens = await this.generateTokens(user.id, user.email);
    return { user, ...tokens };
  }

  // ─── Login ───────────────────────────────────────────────────────────────────
  async login(dto: LoginDto) {
    const user = await this.users.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await this.users.validatePassword(user, dto.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    // 2FA check
    if (user.twoFaEnabled) {
      if (!dto.totpCode) {
        return { requireTotp: true };
      }
      const isValidTotp = speakeasy.totp.verify({
        secret: user.totpSecret!,
        encoding: 'base32',
        token: dto.totpCode,
        window: 1,
      });
      if (!isValidTotp) throw new UnauthorizedException('Invalid 2FA code');
    }

    const tokens = await this.generateTokens(user.id, user.email);
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        twoFaEnabled: user.twoFaEnabled,
      },
      ...tokens,
    };
  }

  // ─── Refresh Token ────────────────────────────────────────────────────────────
  async refresh(token: string) {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { token },
    });

    if (!stored || stored.expiresAt < new Date()) {
      if (stored) await this.prisma.refreshToken.delete({ where: { token } });
      throw new UnauthorizedException('Refresh token expired or invalid');
    }

    await this.prisma.refreshToken.delete({ where: { token } });

    const user = await this.users.findById(stored.userId);
    const tokens = await this.generateTokens(user.id, user.email);
    return { user, ...tokens };
  }

  // ─── Logout ───────────────────────────────────────────────────────────────────
  async logout(refreshToken: string) {
    await this.prisma.refreshToken
      .delete({ where: { token: refreshToken } })
      .catch(() => {}); // ignore if not found
    return { message: 'Logged out' };
  }

  // ─── 2FA Setup ────────────────────────────────────────────────────────────────
  async setup2fa(userId: string) {
    const secret = speakeasy.generateSecret({
      name: `AlgoTrade (${userId})`,
      issuer: 'AlgoTrade',
    });

    await this.users.updateTotpSecret(userId, secret.base32);

    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url!);
    return { secret: secret.base32, qrCode: qrCodeUrl };
  }

  // ─── Verify 2FA ───────────────────────────────────────────────────────────────
  async verify2fa(userId: string, code: string) {
    const user = await this.users.findById(userId);
    if (!user.totpSecret) throw new BadRequestException('2FA not set up');

    const valid = speakeasy.totp.verify({
      secret: user.totpSecret,
      encoding: 'base32',
      token: code,
      window: 1,
    });
    if (!valid) throw new UnauthorizedException('Invalid 2FA code');

    await this.users.enableTwoFa(userId);
    return { message: '2FA enabled successfully' };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────
  private async generateTokens(userId: string, email: string) {
    const payload = { sub: userId, email };

    const accessToken = this.jwt.sign(payload, {
      expiresIn: this.config.get('JWT_ACCESS_EXPIRY', '15m'),
    });

    const rawRefresh = randomBytes(40).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

    await this.prisma.refreshToken.create({
      data: { userId, token: rawRefresh, expiresAt },
    });

    return { accessToken, refreshToken: rawRefresh };
  }

  async validateAccessToken(payload: { sub: string }) {
    return this.users.findById(payload.sub);
  }
}
