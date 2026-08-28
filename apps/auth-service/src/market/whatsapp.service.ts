import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import * as QRCode from 'qrcode';
import * as path from 'path';
import * as fs from 'fs';
import pino from 'pino';
import { OhlStockResult } from './ohl-scanner.service';

export interface WhatsAppStatus {
  isConnected: boolean;
  phoneNumber: string | null;
  qrCode: string | null;
  groups: Array<{ id: string; name: string }>;
}

@Injectable()
export class WhatsAppService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsAppService.name);
  private sockets = new Map<string, WASocket>();
  private qrCodes = new Map<string, string | null>();
  private isConnectedMap = new Map<string, boolean>();
  private phoneNumbers = new Map<string, string | null>();
  private groupCache = new Map<string, Array<{ id: string; name: string }>>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    this.logger.log('WhatsApp Service initialized.');
    // Automatically attempt restoring existing sessions on startup
    this.restoreActiveSessions().catch((err) => {
      this.logger.warn(`Could not restore previous WhatsApp sessions: ${err?.message || err}`);
    });
  }

  onModuleDestroy() {
    for (const [userId, sock] of this.sockets.entries()) {
      try {
        sock.end(undefined);
      } catch {}
    }
  }

  private getAuthDir(userId: string): string {
    const baseDir = path.resolve(process.cwd(), 'data', 'whatsapp_sessions', userId);
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }
    return baseDir;
  }

  private async restoreActiveSessions() {
    const sessionsRoot = path.resolve(process.cwd(), 'data', 'whatsapp_sessions');
    if (!fs.existsSync(sessionsRoot)) return;

    const userDirs = fs.readdirSync(sessionsRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    for (const userId of userDirs) {
      this.logger.log(`Restoring WhatsApp session for user: ${userId}`);
      this.initSession(userId).catch((e) => {
        this.logger.warn(`Failed to auto-restore session for ${userId}: ${e?.message}`);
      });
    }
  }

  async getStatus(userId: string): Promise<WhatsAppStatus> {
    const isConnected = this.isConnectedMap.get(userId) || false;
    const phoneNumber = this.phoneNumbers.get(userId) || null;
    const qrCode = this.qrCodes.get(userId) || null;
    const groups = this.groupCache.get(userId) || [];

    return {
      isConnected,
      phoneNumber,
      qrCode,
      groups,
    };
  }

  async initSession(userId: string): Promise<{ qrCode: string | null; isConnected: boolean }> {
    if (this.sockets.has(userId) && this.isConnectedMap.get(userId)) {
      return { qrCode: null, isConnected: true };
    }

    const authDir = this.getAuthDir(userId);
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      logger: pino({ level: 'silent' }) as any,
      printQRInTerminal: false,
      auth: state,
      browser: ['TradeIO Platform', 'Desktop', '1.0.0'],
      syncFullHistory: false,
    });

    this.sockets.set(userId, sock);

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          const qrDataUrl = await QRCode.toDataURL(qr);
          this.qrCodes.set(userId, qrDataUrl);
          this.logger.log(`Generated new WhatsApp QR code for user [${userId}]`);
        } catch (err: any) {
          this.logger.error(`Failed to generate QR DataURL: ${err?.message}`);
        }
      }

      if (connection === 'close') {
        const shouldReconnect =
          (lastDisconnect?.error as any)?.output?.statusCode !== DisconnectReason.loggedOut;

        this.isConnectedMap.set(userId, false);
        this.logger.warn(`WhatsApp connection closed for ${userId}. Reconnecting: ${shouldReconnect}`);

        if (shouldReconnect) {
          setTimeout(() => this.initSession(userId), 3000);
        } else {
          this.disconnectSession(userId);
        }
      } else if (connection === 'open') {
        this.isConnectedMap.set(userId, true);
        this.qrCodes.set(userId, null);

        const phone = sock.user?.id ? sock.user.id.split(':')[0] : null;
        this.phoneNumbers.set(userId, phone);
        this.logger.log(`WhatsApp connected successfully for user [${userId}] (Number: ${phone})`);

        // Fetch groups
        this.refreshGroups(userId).catch(() => {});
      }
    });

    return {
      qrCode: this.qrCodes.get(userId) || null,
      isConnected: this.isConnectedMap.get(userId) || false,
    };
  }

  async refreshGroups(userId: string): Promise<Array<{ id: string; name: string }>> {
    const sock = this.sockets.get(userId);
    if (!sock || !this.isConnectedMap.get(userId)) {
      return [];
    }

    try {
      const groupData = await sock.groupFetchAllParticipating();
      const groups = Object.values(groupData).map((g) => ({
        id: g.id,
        name: g.subject,
      }));
      this.groupCache.set(userId, groups);
      return groups;
    } catch (err: any) {
      this.logger.warn(`Error fetching participating WhatsApp groups: ${err?.message}`);
      return [];
    }
  }

  async disconnectSession(userId: string): Promise<boolean> {
    const sock = this.sockets.get(userId);
    if (sock) {
      try {
        await sock.logout();
      } catch {}
      this.sockets.delete(userId);
    }

    this.isConnectedMap.set(userId, false);
    this.qrCodes.set(userId, null);
    this.phoneNumbers.set(userId, null);
    this.groupCache.set(userId, []);

    const authDir = this.getAuthDir(userId);
    if (fs.existsSync(authDir)) {
      try {
        fs.rmSync(authDir, { recursive: true, force: true });
      } catch {}
    }

    this.logger.log(`Disconnected and cleared WhatsApp session for user [${userId}]`);
    return true;
  }

  private formatJid(target: string): string {
    const cleaned = target.trim().replace(/[\s\-\+\(\)]/g, '');
    if (cleaned.includes('@g.us') || cleaned.includes('@s.whatsapp.net')) {
      return cleaned;
    }
    // If phone number
    return `${cleaned}@s.whatsapp.net`;
  }

  async sendTextMessage(userId: string, targetJid: string, text: string): Promise<boolean> {
    const sock = this.sockets.get(userId);
    if (!sock || !this.isConnectedMap.get(userId)) {
      throw new Error('WhatsApp is not connected. Please scan the QR code first.');
    }

    const jid = this.formatJid(targetJid);
    await sock.sendMessage(jid, { text });
    return true;
  }

  /**
   * Broadcast formatted OHL scan alert to recipients / groups
   */
  async broadcastOhlScan(
    userId: string,
    openLowStocks: OhlStockResult[],
    openHighStocks: OhlStockResult[],
    alertTime: string = '09:20',
  ): Promise<{ sentCount: number; errors: string[] }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        whatsappNumber: true,
        whatsappGroupId: true,
        whatsappAlertsEnabled: true,
      },
    });

    if (!user || !user.whatsappAlertsEnabled) {
      return { sentCount: 0, errors: ['WhatsApp alerts disabled for user.'] };
    }

    const targets: string[] = [];

    // Parse comma-separated phone numbers (up to 10 numbers)
    if (user.whatsappNumber) {
      const numbers = user.whatsappNumber
        .split(',')
        .map((n) => n.trim())
        .filter((n) => n.length > 5);

      for (const num of numbers.slice(0, 10)) {
        targets.push(num);
      }
    }

    // Add group ID if configured
    if (user.whatsappGroupId && user.whatsappGroupId.trim()) {
      targets.push(user.whatsappGroupId.trim());
    }

    if (targets.length === 0) {
      return { sentCount: 0, errors: ['No recipient phone numbers or group configured.'] };
    }

    // Format the alert message
    const message = this.formatOhlAlertMessage(openLowStocks, openHighStocks, alertTime);

    let sentCount = 0;
    const errors: string[] = [];

    for (const target of targets) {
      try {
        await this.sendTextMessage(userId, target, message);
        sentCount++;
        this.logger.log(`Sent 09:20 OHL alert to: ${target}`);
      } catch (err: any) {
        this.logger.error(`Failed to send alert to ${target}: ${err?.message}`);
        errors.push(`${target}: ${err?.message}`);
      }
    }

    return { sentCount, errors };
  }

  formatOhlAlertMessage(
    openLowStocks: OhlStockResult[],
    openHighStocks: OhlStockResult[],
    alertTime: string,
  ): string {
    const dateStr = new Date().toLocaleDateString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

    let msg = `📊 *TradeIO Morning OHL Scanner Alert (${alertTime} IST)*\n`;
    msg += `📅 *Date:* ${dateStr}\n\n`;

    // 🟢 BULLISH — OPEN = LOW
    msg += `🟢 *BULLISH — OPEN = LOW (Buyers in Control)*\n`;
    if (openLowStocks.length === 0) {
      msg += `_No pure Open=Low setups detected today._\n`;
    } else {
      openLowStocks.slice(0, 12).forEach((s) => {
        const changeSign = s.changePct >= 0 ? '+' : '';
        msg += `• *${s.symbol}* | LTP: ₹${s.ltp.toFixed(2)} (${changeSign}${s.changePct.toFixed(2)}%) | Open: ₹${s.open.toFixed(2)}\n`;
      });
      if (openLowStocks.length > 12) {
        msg += `_...and ${openLowStocks.length - 12} more Open=Low stocks._\n`;
      }
    }

    msg += `\n`;

    // 🔴 BEARISH — OPEN = HIGH
    msg += `🔴 *BEARISH — OPEN = HIGH (Sellers in Control)*\n`;
    if (openHighStocks.length === 0) {
      msg += `_No pure Open=High setups detected today._\n`;
    } else {
      openHighStocks.slice(0, 12).forEach((s) => {
        const changeSign = s.changePct >= 0 ? '+' : '';
        msg += `• *${s.symbol}* | LTP: ₹${s.ltp.toFixed(2)} (${changeSign}${s.changePct.toFixed(2)}%) | Open: ₹${s.open.toFixed(2)}\n`;
      });
      if (openHighStocks.length > 12) {
        msg += `_...and ${openHighStocks.length - 12} more Open=High stocks._\n`;
      }
    }

    msg += `\n⚡ _Sent automatically by TradeIO Algorithmic Platform_`;

    return msg;
  }
}
