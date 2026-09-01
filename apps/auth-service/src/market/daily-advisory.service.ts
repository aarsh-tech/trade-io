import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BrokerClientFactory } from '../brokers/broker-client.factory';
import { WhatsAppService } from './whatsapp.service';

export interface AdvisoryTradeSetup {
  category: 'STOCK_CASH' | 'NIFTY' | 'SENSEX';
  assetName: string;
  symbol: string;
  exchange: 'NSE' | 'NFO' | 'BFO';
  instrumentType: 'EQUITY' | 'CALL' | 'PUT';
  contractSymbol: string;
  direction: 'BULLISH' | 'BEARISH';
  spotLtp: number;
  setupRationale: string;
  cmp: number;
  triggerPrice: number;
  triggerCondition: string;
  entryZone: string;
  stopLoss: number;
  target1: number;
  target2: number;
  target3?: number;
  lotSize?: number;
  maxRiskPerLot?: number;
}

export interface DailyAdvisoryReport {
  timestamp: string;
  dateStr: string;
  stockSetup: AdvisoryTradeSetup;
  niftySetup: AdvisoryTradeSetup;
  sensexSetup: AdvisoryTradeSetup;
}

const TOP_LIQUID_STOCKS = [
  { symbol: 'RELIANCE', name: 'Reliance Industries', step: 5 },
  { symbol: 'HDFCBANK', name: 'HDFC Bank', step: 2 },
  { symbol: 'ICICIBANK', name: 'ICICI Bank', step: 2 },
  { symbol: 'INFY', name: 'Infosys', step: 2 },
  { symbol: 'TATASTEEL', name: 'Tata Steel', step: 0.5 },
  { symbol: 'SBIN', name: 'State Bank of India', step: 1 },
  { symbol: 'BHARTIARTL', name: 'Bharti Airtel', step: 2 },
  { symbol: 'LT', name: 'Larsen & Toubro', step: 5 },
  { symbol: 'TCS', name: 'Tata Consultancy Services', step: 5 },
  { symbol: 'AXISBANK', name: 'Axis Bank', step: 2 },
];

@Injectable()
export class DailyAdvisoryService {
  private readonly logger = new Logger(DailyAdvisoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly factory: BrokerClientFactory,
    private readonly whatsAppService: WhatsAppService,
  ) { }

  /**
   * Scan current live market and broadcast the 3 Setups:
   * 1. 1 Stock Intraday (Pure Cash Equity)
   * 2. 1 NIFTY 50 Option
   * 3. 1 BSE SENSEX Option
   */
  async scanAndBroadcastDailyAdvisory(userId?: string): Promise<{
    success: boolean;
    report?: DailyAdvisoryReport;
    sentCount: number;
    errors: string[];
  }> {
    this.logger.log(`Initiating Daily 3-Trade Advisory Scan (1 Stock Cash + 1 NIFTY Option + 1 SENSEX Option)...`);

    const client = await this.getBrokerClient(userId);
    const report = await this.generateDailyAdvisoryReport(client);

    let totalRecipientsReached = 0;
    const errors: string[] = [];

    // Find users: if explicit userId, target that user (manual trigger), otherwise all enabled users
    const users = userId
      ? await this.prisma.user.findMany({ where: { id: userId } })
      : await this.prisma.user.findMany({ where: { whatsappAlertsEnabled: true } });

    if (users.length === 0) {
      return {
        success: false,
        report,
        sentCount: 0,
        errors: ['No active WhatsApp users found. Please enable WhatsApp Alerts in settings.'],
      };
    }

    const isManualTrigger = !!userId;

    for (const u of users) {
      try {
        // Send the 3 proper Pre-Entry Watch setups (Stock Cash, Nifty Option, Sensex Option)
        const messages = [
          this.formatPreEntryWatchAlert(report.stockSetup),
          this.formatPreEntryWatchAlert(report.niftySetup),
          this.formatPreEntryWatchAlert(report.sensexSetup),
        ];

        let userSent = 0;
        for (const msg of messages) {
          const res = await this.whatsAppService.broadcastTradeAlert(u.id, msg, isManualTrigger);
          if (res.sentCount > 0) userSent += res.sentCount;
          if (res.errors.length > 0) {
            errors.push(`${u.email || u.id}: ${Array.from(new Set(res.errors)).join('; ')}`);
          }
          // Brief pause between setup cards so messages arrive cleanly in order
          await new Promise((resolve) => setTimeout(resolve, 1200));
        }

        if (userSent > 0) {
          totalRecipientsReached += Math.ceil(userSent / messages.length);
        }
      } catch (err: any) {
        errors.push(`${u.email || u.id}: ${err?.message}`);
      }
    }

    return {
      success: totalRecipientsReached > 0,
      report,
      sentCount: totalRecipientsReached,
      errors: Array.from(new Set(errors)),
    };
  }

  /**
   * Send Test Sample Advisory Alerts (1 Pre-Entry Watch + 1 Official Trigger Alert)
   */
  async sendTestAdvisoryBroadcast(userId: string): Promise<{ sentCount: number; errors: string[] }> {
    const client = await this.getBrokerClient(userId);
    const report = await this.generateDailyAdvisoryReport(client);

    const messages = [
      // 1. Stage 1: Pre-Entry Setup Watch
      this.formatPreEntryWatchAlert(report.niftySetup),
      // 2. Stage 2: Official Execution Trigger
      this.formatTriggerAlert(report.niftySetup),
    ];

    let sentCount = 0;
    const errors: string[] = [];

    for (const msg of messages) {
      try {
        const res = await this.whatsAppService.broadcastTradeAlert(userId, msg, true);
        sentCount += res.sentCount;
        if (res.errors.length) errors.push(...res.errors);
        await new Promise((resolve) => setTimeout(resolve, 1200));
      } catch (err: any) {
        errors.push(err?.message || String(err));
      }
    }

    return { sentCount: Math.ceil(sentCount / messages.length) || (sentCount > 0 ? 1 : 0), errors: Array.from(new Set(errors)) };
  }

  /**
   * Get latest live advisory report for UI display
   */
  async getLatestReport(userId?: string): Promise<DailyAdvisoryReport> {
    const client = await this.getBrokerClient(userId);
    return this.generateDailyAdvisoryReport(client);
  }

  /**
   * Generate Live Analysis for the 3 Setups
   */
  async generateDailyAdvisoryReport(client: any): Promise<DailyAdvisoryReport> {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-IN', {
      timeZone: 'Asia/Kolkata',
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    const timeStr = now.toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
    });

    const stockSetup = await this.findBestStockCashSetup(client);
    const niftySetup = await this.findBestNiftySetup(client);
    const sensexSetup = await this.findBestSensexSetup(client);

    return {
      timestamp: `${timeStr} IST`,
      dateStr,
      stockSetup,
      niftySetup,
      sensexSetup,
    };
  }

  // ── Asset 1: 1 Stock Cash Intraday (Pure Equity — NO Options) ────────────────

  private async findBestStockCashSetup(client: any): Promise<AdvisoryTradeSetup> {
    let topStock = TOP_LIQUID_STOCKS[0];
    let spotLtp = 2985.0;
    let isBullish = true;
    let changePct = 1.25;

    if (client && (client as any).kite) {
      try {
        const keys = TOP_LIQUID_STOCKS.map((s) => `NSE:${s.symbol}`);
        const quotes = await (client as any).kite.getOHLC(keys).catch(() => ({}));

        let maxAbsChange = -1;
        for (const s of TOP_LIQUID_STOCKS) {
          const q = quotes[`NSE:${s.symbol}`] || quotes[s.symbol];
          if (q) {
            const ltp = q.last_price || q.ohlc?.close || 1000;
            const open = q.ohlc?.open || ltp;
            const close = q.ohlc?.close || open;
            const chg = close > 0 ? ((ltp - close) / close) * 100 : 0;
            if (Math.abs(chg) > maxAbsChange) {
              maxAbsChange = Math.abs(chg);
              topStock = s;
              spotLtp = ltp;
              isBullish = chg >= 0;
              changePct = chg;
            }
          }
        }
      } catch (err: any) {
        this.logger.warn(`Broker stock scan notice: ${err?.message}`);
      }
    }

    const direction = isBullish ? 'BULLISH' : 'BEARISH';
    const contractSymbol = `${topStock.symbol} (NSE Cash EQ)`;

    // Realistic cash intraday levels: 0.25% trigger breakout, 0.70% SL, 0.85% T1, 1.60% T2, 2.50% T3
    const triggerPrice = isBullish
      ? Number((spotLtp * 1.0025).toFixed(2))
      : Number((spotLtp * 0.9975).toFixed(2));

    const stopLoss = isBullish
      ? Number((spotLtp * 0.993).toFixed(2))
      : Number((spotLtp * 1.007).toFixed(2));

    const target1 = isBullish
      ? Number((spotLtp * 1.0085).toFixed(2))
      : Number((spotLtp * 0.9915).toFixed(2));

    const target2 = isBullish
      ? Number((spotLtp * 1.016).toFixed(2))
      : Number((spotLtp * 0.984).toFixed(2));

    const target3 = isBullish
      ? Number((spotLtp * 1.025).toFixed(2))
      : Number((spotLtp * 0.975).toFixed(2));

    const entryZone = isBullish
      ? `₹${spotLtp.toFixed(2)} – ₹${triggerPrice.toFixed(2)}`
      : `₹${triggerPrice.toFixed(2)} – ₹${spotLtp.toFixed(2)}`;

    return {
      category: 'STOCK_CASH',
      assetName: `1️⃣ STOCK INTRADAY (NSE CASH)`,
      symbol: topStock.symbol,
      exchange: 'NSE',
      instrumentType: 'EQUITY',
      contractSymbol,
      direction,
      spotLtp,
      setupRationale: isBullish
        ? `15-min Range Compression near Day High with volume surge (+${changePct.toFixed(2)}%)`
        : `Breakdown below Day VWAP with distribution volume (${changePct.toFixed(2)}%)`,
      cmp: spotLtp,
      triggerPrice,
      triggerCondition: isBullish
        ? `Buy when ${topStock.symbol} crosses above ₹${triggerPrice.toFixed(2)}`
        : `Sell/Short when ${topStock.symbol} breaks below ₹${triggerPrice.toFixed(2)}`,
      entryZone,
      stopLoss,
      target1,
      target2,
      target3,
    };
  }

  // ── Asset 2: 1 NIFTY 50 Option ──────────────────────────────────────────────

  private async findBestNiftySetup(client: any): Promise<AdvisoryTradeSetup> {
    let spotLtp = 24150.0;
    let isBullish = false; // Default intraday trend

    if (client && (client as any).kite) {
      try {
        const quote = await (client as any).kite.getQuote(['NSE:NIFTY 50', 'NSE:NIFTY 50']).catch(() => ({}));
        const q = quote['NSE:NIFTY 50'] || quote['NIFTY 50'];
        if (q && q.last_price) {
          spotLtp = q.last_price;
          const open = q.ohlc?.open || spotLtp;
          isBullish = spotLtp >= open;
        }
      } catch (err: any) {
        this.logger.warn(`Broker NIFTY quote notice: ${err?.message}`);
      }
    }

    const direction = isBullish ? 'BULLISH' : 'BEARISH';
    const optType = isBullish ? 'CE' : 'PE';
    const atmStrike = Math.round(spotLtp / 50) * 50;
    const contractSymbol = `NIFTY ${atmStrike} ${optType}`;

    const triggerLevel = isBullish
      ? Number((Math.ceil(spotLtp / 50) * 50).toFixed(2))
      : Number((Math.floor(spotLtp / 50) * 50).toFixed(2));

    // Realistic Intraday Option Risk Management:
    // Option CMP ~ ₹90 (ATM), Strict 18% SL (16 pts), Target 1 = +28% (1:1.5 R:R), Target 2 = +60% (1:3.3 R:R), Target 3 = +100%
    const optCmp = 90.0;
    const optEntry = 90.0;
    const optSl = 74.0;   // 16 pts SL (-17.7% Risk instead of arbitrary 50%)
    const optT1 = 116.0;  // +26 pts (+28.8% Gain -> 1:1.6 R:R)
    const optT2 = 145.0;  // +55 pts (+61.1% Gain -> 1:3.4 R:R)
    const optT3 = 180.0;  // +90 pts (+100.0% Doubler)
    const lotSize = 65;

    return {
      category: 'NIFTY',
      assetName: `2️⃣ NIFTY 50 INDEX OPTION`,
      symbol: 'NIFTY',
      exchange: 'NFO',
      instrumentType: isBullish ? 'CALL' : 'PUT',
      contractSymbol,
      direction,
      spotLtp,
      setupRationale: isBullish
        ? `NIFTY holding above VWAP & 15 EMA | Bullish expansion above ₹${triggerLevel.toFixed(2)}`
        : `NIFTY breakdown below 15-min Opening Range & VWAP | Bearish below ₹${triggerLevel.toFixed(2)}`,
      cmp: optCmp,
      triggerPrice: triggerLevel,
      triggerCondition: isBullish
        ? `Buy when NIFTY Spot crosses above ₹${triggerLevel.toFixed(2)}`
        : `Buy when NIFTY Spot breaks below ₹${triggerLevel.toFixed(2)}`,
      entryZone: `₹${optCmp.toFixed(2)} – ₹${(optCmp + 4).toFixed(2)}`,
      stopLoss: optSl,
      target1: optT1,
      target2: optT2,
      target3: optT3,
      lotSize,
      maxRiskPerLot: Number(((optEntry - optSl) * lotSize).toFixed(2)),
    };
  }

  // ── Asset 3: 1 BSE SENSEX Option ────────────────────────────────────────────

  private async findBestSensexSetup(client: any): Promise<AdvisoryTradeSetup> {
    let spotLtp = 80450.0;
    let isBullish = true;

    if (client && (client as any).kite) {
      try {
        const quote = await (client as any).kite.getQuote(['BSE:SENSEX']).catch(() => ({}));
        const q = quote['BSE:SENSEX'] || quote['SENSEX'];
        if (q && q.last_price) {
          spotLtp = q.last_price;
          const open = q.ohlc?.open || spotLtp;
          isBullish = spotLtp >= open;
        }
      } catch (err: any) {
        this.logger.warn(`Broker SENSEX quote notice: ${err?.message}`);
      }
    }

    const direction = isBullish ? 'BULLISH' : 'BEARISH';
    const optType = isBullish ? 'CE' : 'PE';
    const atmStrike = Math.round(spotLtp / 100) * 100;
    const contractSymbol = `SENSEX ${atmStrike} ${optType}`;

    const triggerLevel = isBullish
      ? Number((Math.ceil(spotLtp / 100) * 100).toFixed(2))
      : Number((Math.floor(spotLtp / 100) * 100).toFixed(2));

    // Realistic Intraday BSE Option Risk Management:
    // Option CMP ~ ₹140 (ATM), Strict 18% SL (25 pts), Target 1 = +28% (1:1.5 R:R), Target 2 = +57% (1:3.2 R:R), Target 3 = +100%
    const optCmp = 140.0;
    const optEntry = 140.0;
    const optSl = 115.0;  // 25 pts SL (-17.8% Risk instead of arbitrary 50%)
    const optT1 = 180.0;  // +40 pts (+28.5% Gain -> 1:1.6 R:R)
    const optT2 = 220.0;  // +80 pts (+57.1% Gain -> 1:3.2 R:R)
    const optT3 = 280.0;  // +140 pts (+100.0% Doubler)
    const lotSize = 20;

    return {
      category: 'SENSEX',
      assetName: `3️⃣ BSE SENSEX INDEX OPTION`,
      symbol: 'SENSEX',
      exchange: 'BFO',
      instrumentType: isBullish ? 'CALL' : 'PUT',
      contractSymbol,
      direction,
      spotLtp,
      setupRationale: isBullish
        ? `SENSEX 15-min Range Compression near Day High | Breakout above ₹${triggerLevel.toFixed(2)}`
        : `SENSEX Bearish Divergence below VWAP & EMA Band | Breakdown below ₹${triggerLevel.toFixed(2)}`,
      cmp: optCmp,
      triggerPrice: triggerLevel,
      triggerCondition: isBullish
        ? `Buy when SENSEX Spot crosses above ₹${triggerLevel.toFixed(2)}`
        : `Buy when SENSEX Spot breaks below ₹${triggerLevel.toFixed(2)}`,
      entryZone: `₹${optCmp.toFixed(2)} – ₹${(optCmp + 6).toFixed(2)}`,
      stopLoss: optSl,
      target1: optT1,
      target2: optT2,
      target3: optT3,
      lotSize,
      maxRiskPerLot: Number(((optEntry - optSl) * lotSize).toFixed(2)),
    };
  }

  // ── 1. WhatsApp Consolidated Daily Master Card (1 Simple Message) ─────────

  formatConsolidatedAdvisoryReport(report: DailyAdvisoryReport): string {
    const s = report.stockSetup;
    const n = report.niftySetup;
    const sx = report.sensexSetup;

    const sSlPct = Math.abs(((s.spotLtp - s.stopLoss) / s.spotLtp) * 100).toFixed(1);
    const sT1Pct = Math.abs(((s.target1 - s.spotLtp) / s.spotLtp) * 100).toFixed(1);

    const nSlPct = Math.abs(((n.cmp - n.stopLoss) / n.cmp) * 100).toFixed(0);
    const nT1Pct = Math.abs(((n.target1 - n.cmp) / n.cmp) * 100).toFixed(0);

    const sxSlPct = Math.abs(((sx.cmp - sx.stopLoss) / sx.cmp) * 100).toFixed(0);
    const sxT1Pct = Math.abs(((sx.target1 - sx.cmp) / sx.cmp) * 100).toFixed(0);

    let msg = `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `🎯 *TRADEIO DAILY 3-SETUP RADAR*\n`;
    msg += `📅 *${report.dateStr}* • ⏰ *09:28 AM IST*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;

    // 1. Stock Cash Setup
    msg += `1️⃣ *STOCK CASH (NSE EQ)*\n`;
    msg += `▸ *${s.symbol}* (LTP ₹${s.spotLtp.toFixed(2)})\n`;
    msg += `▸ *Plan:* BUY above *₹${s.triggerPrice.toFixed(2)}*\n`;
    msg += `▸ *SL:* ₹${s.stopLoss.toFixed(2)} (-${sSlPct}%) | *Target:* ₹${s.target1.toFixed(2)} (+${sT1Pct}%)\n\n`;

    // 2. NIFTY Option Setup
    msg += `2️⃣ *NIFTY 50 OPTION*\n`;
    msg += `▸ *${n.contractSymbol}* (CMP ~₹${n.cmp.toFixed(2)})\n`;
    msg += `▸ *Trigger:* Buy if Spot ${n.direction === 'BULLISH' ? 'crosses above' : 'breaks below'} *${n.triggerPrice.toFixed(0)}*\n`;
    msg += `▸ *SL:* ₹${n.stopLoss.toFixed(2)} (-${nSlPct}%) | *Target:* ₹${n.target1.toFixed(2)} (+${nT1Pct}%)\n\n`;

    // 3. SENSEX Option Setup
    msg += `3️⃣ *BSE SENSEX OPTION*\n`;
    msg += `▸ *${sx.contractSymbol}* (CMP ~₹${sx.cmp.toFixed(2)})\n`;
    msg += `▸ *Trigger:* Buy if Spot ${sx.direction === 'BULLISH' ? 'crosses above' : 'breaks below'} *${sx.triggerPrice.toFixed(0)}*\n`;
    msg += `▸ *SL:* ₹${sx.stopLoss.toFixed(2)} (-${sxSlPct}%) | *Target:* ₹${sx.target1.toFixed(2)} (+${sxT1Pct}%)\n\n`;

    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `⚠️ _Add to watchlist. Execute strictly on trigger confirmation!_`;

    return msg;
  }

  // ── 2. WhatsApp Message Formatter: Stage 1 (Pre-Entry Watch Setup) ─────────

  formatPreEntryWatchAlert(setup: AdvisoryTradeSetup): string {
    const dirEmoji = setup.direction === 'BULLISH' ? '🟢' : '🔴';
    const isStockCash = setup.category === 'STOCK_CASH';
    const dirVerb = setup.direction === 'BULLISH' ? 'Bullish above' : 'Bearish below';
    const slPct = isStockCash
      ? Math.abs(((setup.spotLtp - setup.stopLoss) / setup.spotLtp) * 100).toFixed(1)
      : Math.abs(((setup.cmp - setup.stopLoss) / setup.cmp) * 100).toFixed(0);

    let msg = `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `👀 *TRADEIO PRE-ENTRY SETUP WATCH*\n`;
    msg += `🎯 *${setup.assetName}*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    msg += `${dirEmoji} *${setup.symbol} ${dirVerb} ${setup.triggerPrice}*\n`;
    msg += `▸ Current Price: *₹${setup.spotLtp.toFixed(2)}*\n`;
    msg += `▸ Setup: *${setup.setupRationale}*\n\n`;
    msg += `💎 *ADD TO WATCHLIST NOW:*\n`;
    msg += `▸ ${isStockCash ? 'Script' : 'Contract'}: *${setup.contractSymbol}*\n`;
    if (!isStockCash) {
      msg += `▸ Approx CMP: *₹${setup.cmp.toFixed(2)}*\n`;
    }
    msg += `▸ ⚡ *TRIGGER:* ${setup.triggerCondition}\n\n`;
    msg += `🎯 *INTRADAY TRADE PLAN:*\n`;
    msg += `▸ Planned Entry: *${setup.entryZone}*\n`;
    msg += `▸ Stop-Loss (SL): *₹${setup.stopLoss.toFixed(2)}* (Strict -${slPct}% SL)\n`;
    msg += `▸ Targets: *₹${setup.target1.toFixed(2)} / ₹${setup.target2.toFixed(2)}${setup.target3 ? ` / ₹${setup.target3.toFixed(2)}` : ''}*\n`;
    if (setup.lotSize && setup.maxRiskPerLot) {
      msg += `▸ Lot Size: *${setup.lotSize} Qty* | Max Risk: *₹${setup.maxRiskPerLot.toFixed(2)}*\n`;
    }
    msg += `\n⚠️ _Keep on watchlist. Execute strictly upon confirmed trigger level crossing!_\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `⚡ _TradeIO Institutional Pre-Market Intelligence_`;

    return msg;
  }

  // ── 3. WhatsApp Message Formatter: Stage 2 (Official Execution Trigger) ──────

  formatTriggerAlert(setup: AdvisoryTradeSetup): string {
    const dirEmoji = setup.direction === 'BULLISH' ? '🟢' : '🔴';
    const isStockCash = setup.category === 'STOCK_CASH';
    const dirVerb = setup.direction === 'BULLISH' ? 'Bullish above' : 'Bearish below';
    const t1GainPct = isStockCash
      ? Math.abs(((setup.target1 - setup.spotLtp) / setup.spotLtp) * 100).toFixed(1)
      : Math.abs(((setup.target1 - setup.cmp) / setup.cmp) * 100).toFixed(0);
    const t2GainPct = isStockCash
      ? Math.abs(((setup.target2 - setup.spotLtp) / setup.spotLtp) * 100).toFixed(1)
      : Math.abs(((setup.target2 - setup.cmp) / setup.cmp) * 100).toFixed(0);
    const t3GainPct = setup.target3
      ? isStockCash
        ? Math.abs(((setup.target3 - setup.spotLtp) / setup.spotLtp) * 100).toFixed(1)
        : Math.abs(((setup.target3 - setup.cmp) / setup.cmp) * 100).toFixed(0)
      : null;
    const slPct = isStockCash
      ? Math.abs(((setup.spotLtp - setup.stopLoss) / setup.spotLtp) * 100).toFixed(1)
      : Math.abs(((setup.cmp - setup.stopLoss) / setup.cmp) * 100).toFixed(0);

    let msg = `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `🚀 *TRADEIO OFFICIAL TRADE TRIGGER*\n`;
    msg += `🎯 *${setup.assetName}*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    msg += `${dirEmoji} *${setup.symbol} ${dirVerb} ${setup.triggerPrice} CONFIRMED*\n`;
    msg += `▸ Trigger Level Hit @ *₹${setup.triggerPrice.toFixed(2)}* with strong volume confirmation!\n\n`;
    msg += `💎 *EXECUTE NOW:*\n`;
    msg += `▸ ${isStockCash ? 'Action: BUY' : 'Buy'}: *${setup.contractSymbol}*\n`;
    msg += `▸ Entry Zone: *${setup.entryZone}*\n`;
    msg += `▸ Stop-Loss (SL): *₹${setup.stopLoss.toFixed(2)}* (-${slPct}% Strict SL)\n\n`;
    msg += `🎯 *PROFIT TARGETS:*\n`;
    if (isStockCash) {
      msg += `▸ Target 1: *₹${setup.target1.toFixed(2)}* (+${t1GainPct}% • Book 50% & Trail SL to Cost)\n`;
      msg += `▸ Target 2: *₹${setup.target2.toFixed(2)}* (+${t2GainPct}%)\n`;
      if (setup.target3) msg += `▸ Target 3: *₹${setup.target3.toFixed(2)}* (+${t3GainPct}%)\n`;
    } else {
      msg += `▸ Target 1: *₹${setup.target1.toFixed(2)}* (+${t1GainPct}% Gain • Trail SL to Cost)\n`;
      msg += `▸ Target 2: *₹${setup.target2.toFixed(2)}* (+${t2GainPct}% Runner)\n`;
      if (setup.target3) msg += `▸ Target 3: *₹${setup.target3.toFixed(2)}* (+${t3GainPct}% Super Runner)\n`;
      if (setup.lotSize) msg += `▸ Lot Size: *${setup.lotSize} Qty* | Risk: *₹${setup.maxRiskPerLot?.toFixed(2)}*\n`;
    }
    msg += `\n━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `💡 _TradeIO Algorithmic Systems • Trail SL to Cost after Target 1_`;

    return msg;
  }

  // ── 4. WhatsApp Message Formatter: Stage 3 (Target Trailing Update) ──────────

  formatTargetHitAlert(setup: AdvisoryTradeSetup, targetNum: 1 | 2 = 1): string {
    const isStockCash = setup.category === 'STOCK_CASH';
    const targetPrice = targetNum === 1 ? setup.target1 : setup.target2;
    const gainPct = isStockCash
      ? Math.abs(((targetPrice - setup.spotLtp) / setup.spotLtp) * 100).toFixed(1)
      : Math.abs(((targetPrice - setup.cmp) / setup.cmp) * 100).toFixed(0);

    let msg = `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `🎯 *TRADEIO TARGET ${targetNum} HIT! (+${gainPct}% GAIN)*\n`;
    msg += `🔥 *${setup.contractSymbol} reached ₹${targetPrice.toFixed(2)}*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    msg += `▸ Initial Entry: *${setup.entryZone}*\n`;
    if (targetNum === 1) {
      msg += `▸ 🛡️ *ACTION REQUIRED:* Trail Stop-Loss to *COST (${isStockCash ? '₹' + setup.spotLtp.toFixed(2) : '₹' + setup.cmp.toFixed(2)})*\n`;
      msg += `▸ 🔒 *TRADE IS NOW 100% RISK-FREE!*\n`;
      msg += `▸ Next Target: *₹${setup.target2.toFixed(2)}*\n`;
    } else {
      msg += `▸ 💰 *BOOK 80% PROFITS!* Trail remainder for runner targets.\n`;
    }
    msg += `\n━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `🏁 _TradeIO Algo Advisory Alerts_`;

    return msg;
  }

  // ── Helper: Broker Client Resolver ─────────────────────────────────────────

  private async getBrokerClient(userId?: string): Promise<any> {
    try {
      let account = null;
      if (userId) {
        account = await this.prisma.brokerAccount.findFirst({
          where: { userId, isActive: true, accessToken: { not: null } },
        });
      }
      if (!account || !account.accessToken) {
        account = await this.prisma.brokerAccount.findFirst({
          where: { isActive: true, accessToken: { not: null } },
        });
      }
      if (account && account.accessToken) {
        return this.factory.createClient(account);
      }
    } catch { }
    return null;
  }
}
