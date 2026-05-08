import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BrokerClientFactory } from '../brokers/broker-client.factory';
import { analyzeStock, DailyCandle } from './vcp.analyzer';

// ─── Nifty 500 scan universe (liquid NSE stocks) ──────────────────────────────
const SCAN_UNIVERSE = [
  // Nifty 50 core
  'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'HINDUNILVR', 'ITC',
  'SBIN', 'BAJFINANCE', 'BHARTIARTL', 'KOTAKBANK', 'LT', 'HCLTECH',
  'ASIANPAINT', 'AXISBANK', 'MARUTI', 'SUNPHARMA', 'TITAN', 'NESTLEIND',
  'ULTRACEMCO', 'WIPRO', 'POWERGRID', 'NTPC', 'ONGC', 'ADANIPORTS',
  'TECHM', 'INDUSINDBK', 'DIVISLAB', 'DRREDDY', 'BPCL', 'CIPLA',
  'EICHERMOT', 'BAJAJFINSV', 'HINDALCO', 'GRASIM', 'TATASTEEL', 'JSWSTEEL',
  'COALINDIA', 'BRITANNIA', 'APOLLOHOSP', 'TATACONSUM', 'TRENT',
  // Mid/Small caps with momentum
  'DMART', 'NAUKRI', 'PERSISTENT', 'LTIM', 'COFORGE', 'MPHASIS', 'OFSS',
  'HAL', 'BEL', 'SIEMENS', 'ABB', 'CUMMINSIND', 'THERMAX', 'BHEL',
  'HAVELLS', 'PIDILITIND', 'BERGEPAINT', 'VOLTAS', 'WHIRLPOOL', 'SYMPHONY',
  'DABUR', 'MARICO', 'GODREJCP', 'COLPAL', 'EMAMILTD', 'VBL',
  'JUBLFOOD', 'DEVYANI', 'SAPPHIRE',
  'MUTHOOTFIN', 'BAJAJHLDNG', 'CHOLAFIN', 'LICHSGFIN', 'M&MFIN',
  'IDFCFIRSTB', 'FEDERALBNK', 'AUBANK', 'BANDHANBNK', 'RBLBANK',
  'BANKBARODA', 'PNB', 'CANBK', 'UNIONBANK',
  'PAGEIND', 'TRENT', 'KALYANKJIL', 'SENCO',
  'INDUSTOWER', 'CDSL', 'MCX', 'BSE', 'CAMS', 'ANGELONE', 'MOTILALOFS',
  'BALKRISIND', 'APOLLOTYRE', 'MRF', 'CEATLTD', 'BOSCHLTD', 'TATAMOTORS', 'M&M', 'ASHOKLEY',
  'SAIL', 'NMDC', 'VEDL', 'HINDCOPPER', 'NATIONALUM', 'TATAMETALI',
  'ADANIENT', 'ADANIGREEN', 'ATGL', 'NYKAA', 'ZOMATO', 'PAYTM',
  'TORNTPHARM', 'AUROPHARMA', 'ALKEM', 'BIOCON', 'LUPIN', 'GLENMARK', 'IPCALAB', 'LAURUSLABS',
  'PIIND', 'COROMANDEL', 'UPL', 'DHANUKA', 'RALLIS',
  'SWARAJENG', 'ESCORTS', 'MAHINDCIE', 'EXIDEIND',
  'POLYCAB', 'KEI', 'FINOLEX', 'RCF', 'DEEPAKFERT', 'FACT', 'GNFC', 'CHAMBLFERT',
  'ATUL', 'CLEAN', 'GALAXYSURF', 'NAVINFLUOR', 'SRF', 'TATACHEM',
  'IRCTC', 'CONCOR', 'GMRINFRA', 'IRB', 'GPPL', 'IRFC', 'RVNL', 'BEML', 'RITES',
  'OBEROIRLTY', 'DLF', 'GODREJPROP', 'PRESTIGE', 'PHOENIXLTD', 'BRIGADE',
  'HDFCAMC', 'NIPPONLIFE', 'UTIAMC',
  'LINDEINDIA', 'SOLARINDS', 'HFCL', 'STLTECH', 'TEJASNET', 'DIXON', 'AMBER',
  'TATAELXSI', 'LTTS', 'CYIENT', 'TATACOMM', 'JUBLFOOD', 'IRCTC', 'HINDZINC',
  'ICICIGI', 'ICICIPRULI', 'HDFCLIFE', 'SBILIFE', 'RECLTD', 'PFC'
];

export interface ScanResult {
  rank: number;
  symbol: string;
  exchange: string;
  pattern: string;
  score: number;
  confidence: string;
  trendStrength: string;
  volumeSignal: string;
  currentPrice: number;
  pivotPrice: number;
  entryPrice: number;
  stopLoss: number;
  target1: number;
  target2: number;
  target3: number;
  riskReward: number;
  riskPct: number;
  contractions: number;
  suggestedQty: number;   // to earn ₹500 at T1
  notes: string[];
}

export interface ScanRun {
  id: string;
  scannedAt: string;
  totalScanned: number;
  results: ScanResult[];
}

@Injectable()
export class SwingScannerService {
  private readonly logger = new Logger(SwingScannerService.name);
  // Cache last run per user
  private cache = new Map<string, ScanRun>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly factory: BrokerClientFactory,
  ) {}

  // ── Public API ──────────────────────────────────────────────────────────────

  async runScan(userId: string): Promise<ScanRun> {
    const account = await this.prisma.brokerAccount.findFirst({
      where: { userId, isActive: true, accessToken: { not: null } },
    });

    if (!account?.accessToken) {
      throw new BadRequestException('No active broker session found. Please connect and login to Zerodha first.');
    }

    const client = this.factory.createClient(account);
    const kite   = client['kite'];

    this.logger.log(`Starting swing scan for user ${userId} — ${SCAN_UNIVERSE.length} stocks`);

    // Fetch NSE instruments for token resolution (cached by kite SDK)
    let instruments: any[];
    try {
      instruments = await kite.getInstruments('NSE');
    } catch (err) {
      throw new BadRequestException(`Failed to fetch NSE instruments: ${err.message}`);
    }

    // Build token map
    const tokenMap = new Map<string, number>();
    const instrumentToSymbol = new Map<number, string>();
    instruments.forEach((i: any) => {
      if (i.instrument_type === 'EQ') {
        tokenMap.set(i.tradingsymbol, i.instrument_token);
        instrumentToSymbol.set(i.instrument_token, i.tradingsymbol);
      }
    });

    // ── Get Live Quotes (LTP) for the entire universe ────────────────────────
    const ltpSymbols = SCAN_UNIVERSE.map(s => `NSE:${s}`);
    let liveQuotes: Record<string, { last_price: number }> = {};
    try {
      // Kite LTP can handle up to 500 symbols
      liveQuotes = await kite.getLTP(ltpSymbols);
    } catch (err) {
      this.logger.warn(`Live quotes fetch failed: ${err.message}`);
    }

    const results: ScanResult[] = [];
    let scanned = 0;

    // Scan in batches of 5 to avoid rate limiting
    for (let i = 0; i < SCAN_UNIVERSE.length; i += 5) {
      const batch = SCAN_UNIVERSE.slice(i, i + 5);
      await Promise.allSettled(
        batch.map(async (symbol) => {
          try {
            const token = tokenMap.get(symbol);
            if (!token) return;

            let candles = await this.fetchDailyCandles(kite, token, 365); // ~1.5 years for VCP patterns
            // INTRADAY_MOMENTUM needs only 50 candles; VCP needs ~200.
            // Accept any stock with at least 50 candles so intraday picks aren't dropped.
            if (!candles || candles.length < 50) return;

            // ── Update with Live Data ────────────────────────────────────────
            const liveLtp = liveQuotes[`NSE:${symbol}`]?.last_price;
            if (liveLtp) {
              const lastCandle = candles[candles.length - 1];
              const now = new Date();
              const isToday = lastCandle.date.toDateString() === now.toDateString();

              if (isToday) {
                // Update today's candle with latest price
                lastCandle.close = liveLtp;
                lastCandle.high = Math.max(lastCandle.high, liveLtp);
                lastCandle.low = Math.min(lastCandle.low, liveLtp);
              } else if (now.getHours() >= 9) {
                // Pre-market or early market where today's candle isn't in history yet
                // Create a synthetic today's candle
                candles.push({
                  date: now,
                  open: liveLtp, // Assume open is LTP for now
                  high: liveLtp,
                  low: liveLtp,
                  close: liveLtp,
                  volume: lastCandle.volume, // dummy volume for now
                });
              }
            }

            scanned++;
            const result = analyzeStock(symbol, candles);
            if (!result || result.score < 20) return; // Lowered to 20 for more setups

            // Calculate suggested qty to earn ₹500 at T1
            const profitPerShare = result.target1 - result.entryPrice;
            const suggestedQty = profitPerShare > 0
              ? Math.ceil(500 / profitPerShare)
              : 0;

            results.push({
              rank: 0,
              symbol,
              exchange: 'NSE',
              pattern: result.pattern,
              score: result.score,
              confidence: result.confidence,
              trendStrength: result.trendStrength,
              volumeSignal: result.volumeSignal,
              currentPrice: result.currentPrice,
              pivotPrice: result.pivotPrice,
              entryPrice: result.entryPrice,
              stopLoss: result.stopLoss,
              target1: result.target1,
              target2: result.target2,
              target3: result.target3,
              riskReward: result.riskReward,
              riskPct: result.riskPct,
              contractions: result.contractions,
              suggestedQty,
              notes: result.notes,
            });
          } catch (err) {
            // Silently skip failed stocks
          }
        }),
      );
      // Small delay between batches to respect rate limits
      await new Promise(r => setTimeout(r, 350));
    }

    // Sort by score desc, assign rank
    results.sort((a, b) => b.score - a.score);
    results.forEach((r, i) => (r.rank = i + 1));

    const run: ScanRun = {
      id: `scan_${Date.now()}`,
      scannedAt: new Date().toISOString(),
      totalScanned: scanned,
      results: results.slice(0, 50), // top 50 instead of 30
    };

    this.cache.set(userId, run);

    // Persist to DB
    await this.persistResults(userId, run).catch(e =>
      this.logger.warn(`Failed to persist scan results: ${e.message}`),
    );

    this.logger.log(`Scan complete — ${results.length} setups found from ${scanned} stocks`);
    return run;
  }

  async getLastScan(userId: string): Promise<ScanRun | null> {
    // Return in-memory cache first
    if (this.cache.has(userId)) return this.cache.get(userId)!;

    // Fallback: load from DB
    const rows = await (this.prisma as any).swingScan.findMany({
      where: { userId },
      orderBy: { scannedAt: 'desc' },
      take: 30,
    }).catch(() => []);

    if (!rows || rows.length === 0) return null;

    const scanDate = rows[0].scannedAt;
    return {
      id: `scan_${new Date(scanDate).getTime()}`,
      scannedAt: scanDate.toISOString(),
      totalScanned: rows.length,
      results: rows.map((r: any, i: number) => ({
        rank: i + 1,
        symbol: r.symbol,
        exchange: r.exchange,
        pattern: r.pattern,
        score: r.score,
        confidence: r.confidence,
        trendStrength: r.trendStrength,
        volumeSignal: r.volumeSignal,
        currentPrice: r.currentPrice,
        pivotPrice: r.pivotPrice,
        entryPrice: r.entryPrice,
        stopLoss: r.stopLoss,
        target1: r.target1,
        target2: r.target2,
        target3: r.target3,
        riskReward: r.riskReward,
        riskPct: r.riskPct,
        contractions: r.contractions,
        suggestedQty: r.suggestedQty,
        notes: JSON.parse(r.notes || '[]'),
      })),
    };
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async fetchDailyCandles(kite: any, token: number, days: number): Promise<DailyCandle[]> {
    const to   = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days);

    const data = await kite.getHistoricalData(token, 'day', from, to, false);
    return (data || []).map((c: any) => ({
      date:   new Date(c.date),
      open:   c.open,
      high:   c.high,
      low:    c.low,
      close:  c.close,
      volume: c.volume,
    }));
  }

  private async persistResults(userId: string, run: ScanRun) {
    // Delete today's old results first
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await (this.prisma as any).swingScan.deleteMany({
      where: { userId, scannedAt: { gte: today } },
    }).catch(() => {});

    await (this.prisma as any).swingScan.createMany({
      data: run.results.map(r => ({
        userId,
        symbol: r.symbol,
        exchange: r.exchange,
        pattern: r.pattern,
        score: r.score,
        confidence: r.confidence,
        trendStrength: r.trendStrength,
        volumeSignal: r.volumeSignal,
        currentPrice: r.currentPrice,
        pivotPrice: r.pivotPrice,
        entryPrice: r.entryPrice,
        stopLoss: r.stopLoss,
        target1: r.target1,
        target2: r.target2,
        target3: r.target3,
        riskReward: r.riskReward,
        riskPct: r.riskPct,
        contractions: r.contractions,
        suggestedQty: r.suggestedQty,
        notes: JSON.stringify(r.notes),
      })),
    }).catch(() => {});
  }
}
