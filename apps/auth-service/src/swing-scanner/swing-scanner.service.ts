import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { BrokerClientFactory } from '../brokers/broker-client.factory';
import { getSharedInstruments } from '../brokers/instrument-store';
import { toKiteError, withKiteRetry } from '../brokers/kite-errors';
import { NIFTY_500_UNIVERSE } from '../market/market.constants';
import { PrismaService } from '../prisma/prisma.service';
import { analyzeStock, DailyCandle } from './vcp.analyzer';

// Nifty 500 + F&O stocks still listed on NSE, kept only if they trade at least this much a day.
const MIN_AVG_TURNOVER_CR = 5;
// Best setups kept per pattern. A single overall cap let the high-scoring daily inside /
// momentum setups crowd out every weekly inside, monthly inside and EMA pullback result.
const MAX_PER_PATTERN = 500;

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
  isFnO: boolean;
  lotSize: number;
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
  // Active running scans per user
  private activeScans = new Map<string, {
    status: 'running' | 'completed' | 'error';
    startedAt: string;
    scanned: number;
    total: number;
    error?: string;
  }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly factory: BrokerClientFactory,
  ) {}

  // ── Public API ──────────────────────────────────────────────────────────────

  async runScan(userId: string): Promise<{ success: boolean; message: string; isScanning: boolean }> {
    const account = await this.prisma.brokerAccount.findFirst({
      where: { userId, isActive: true, accessToken: { not: null } },
    });

    if (!account?.accessToken) {
      throw new BadRequestException('No active broker session found. Please connect and login to Zerodha first.');
    }

    const current = this.activeScans.get(userId);
    if (current && current.status === 'running') {
      return {
        success: true,
        message: 'Swing scan is already running in background',
        isScanning: true,
      };
    }

    this.activeScans.set(userId, {
      status: 'running',
      startedAt: new Date().toISOString(),
      scanned: 0,
      total: 500,
    });

    // Run in background without blocking HTTP request
    this.executeScan(userId, account).catch(err => {
      this.logger.error(`Background scan failed for user ${userId}: ${err.message}`);
      this.activeScans.set(userId, {
        status: 'error',
        startedAt: new Date().toISOString(),
        scanned: 0,
        total: 500,
        error: err.message,
      });
    });

    return {
      success: true,
      message: 'Swing scan initiated in background',
      isScanning: true,
    };
  }

  private async executeScan(userId: string, account: any): Promise<ScanRun> {
    const client = this.factory.createClient(account);
    const kite   = client['kite'];

    // NSE instruments for token resolution (shared daily master)
    let instruments: any[];
    try {
      instruments = await getSharedInstruments(kite, 'NSE');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(`Failed to fetch NSE instruments: ${message}`);
    }

    // Fetch NFO instruments to map F&O lot sizes dynamically
    let nfoInstruments: any[] = [];
    try {
      nfoInstruments = await getSharedInstruments(kite, 'NFO');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to fetch NFO instruments: ${message}`);
    }

    const fnoLotSizes = new Map<string, number>();
    nfoInstruments.forEach((i: any) => {
      if (i.name && i.lot_size) {
        fnoLotSizes.set(i.name.toUpperCase(), i.lot_size);
      }
    });

    // ── Universe: NIFTY 500 + F&O underlyings that are still listed on NSE ─────────
    // (The raw NSE "EQ" list has 10k+ entries incl. govt bonds and SME series in no useful
    // order, so slicing it missed most large/mid caps.)
    const tokenMap = new Map<string, number>();
    instruments.forEach((i: any) => {
      if (i.instrument_type === 'EQ' && i.exchange === 'NSE' && i.segment === 'NSE') tokenMap.set(i.tradingsymbol, i.instrument_token);
    });
    const universe = new Set<string>(NIFTY_500_UNIVERSE.filter((s) => tokenMap.has(s)));
    for (const sym of fnoLotSizes.keys()) if (tokenMap.has(sym)) universe.add(sym);
    const scanList = Array.from(universe);
    this.activeScans.set(userId, { status: 'running', startedAt: new Date().toISOString(), scanned: 0, total: scanList.length });
    this.logger.log(`Starting swing scan for user ${userId} — ${scanList.length} stocks (NIFTY 500 + F&O)`);

    // ── Get Live Quotes (LTP) for the entire universe ────────────────────────
    // kiteconnect builds the request as GET /quote/ltp?i=NSE:SYM&i=NSE:SYM2&... — sending
    // ~1000 symbols in one call produced a real "URI Too Long" (414), so 200/chunk keeps
    // the query string short. Which chunk trips a raw, non-Kite-JSON 403 has moved around
    // (3rd of 3, then 5th of 5) as the chunking changed, which means it isn't tied to a
    // specific chunk's size or position — it's a short-lived condition on Kite's side (this
    // server also runs live strategy engines sharing the same API key/quote rate bucket).
    // toKiteError already classifies it as retryable (NetworkException); the fix that
    // actually applies here is giving that retry enough time to outlast the blip rather
    // than continuing to reshuffle chunk boundaries.
    const ltpBatch = scanList.map(s => `NSE:${s}`);
    let liveQuotes: Record<string, { last_price: number }> = {};
    const LTP_CHUNK_SIZE = 200;
    for (let i = 0; i < ltpBatch.length; i += LTP_CHUNK_SIZE) {
      const chunk = ltpBatch.slice(i, i + LTP_CHUNK_SIZE);
      const chunkNo = Math.floor(i / LTP_CHUNK_SIZE) + 1;
      try {
        // 5 attempts, backoff 800ms→6.4s: ~12s worst case, acceptable since this scan
        // already runs in the background and this is its slowest-to-clear failure mode.
        const chunkQuotes = await withKiteRetry(() => kite.getLTP(chunk), 5, 800);
        Object.assign(liveQuotes, chunkQuotes);
      } catch (err: any) {
        const kerr = toKiteError(err);
        this.logger.warn(`Live quotes chunk ${chunkNo} fetch failed after retries (${kerr.name}): ${kerr.message}`);
      }
      if (i + LTP_CHUNK_SIZE < ltpBatch.length) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    const results: ScanResult[] = [];
    let scanned = 0;
    let candleFetchFailures = 0;

    for (let i = 0; i < scanList.length; i += 5) {
      const batch = scanList.slice(i, i + 5);
      await Promise.allSettled(
        batch.map(async (symbol) => {
          try {
            const token = tokenMap.get(symbol);
            if (!token) return;

            let candles = await this.fetchDailyCandles(kite, token, 365); // ~1.5 years for VCP patterns
            // INTRADAY_MOMENTUM needs only 50 candles; VCP needs ~200.
            // Accept any stock with at least 50 candles so intraday picks aren't dropped.
            if (!candles || candles.length < 50) return;

            // Skip thinly traded names: 20-session average traded value (before today).
            const prior = candles.slice(-21, -1);
            const avgTurnoverCr = prior.reduce((sum, c) => sum + c.close * c.volume, 0) / Math.max(1, prior.length) / 1e7;
            if (avgTurnoverCr < MIN_AVG_TURNOVER_CR) return;

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
              }
            }

            scanned++;
            const patterns = analyzeStock(symbol, candles);
            if (!patterns || patterns.length === 0) return;

            const isFnO = fnoLotSizes.has(symbol.toUpperCase());
            const lotSize = fnoLotSizes.get(symbol.toUpperCase()) ?? 1;

            patterns.forEach(p => {
              // Calculate suggested qty to earn ₹500 at T1
              const profitPerShare = Math.abs(p.target1 - p.entryPrice);
              const suggestedQty = profitPerShare > 0
                ? Math.ceil(500 / profitPerShare)
                : 0;

              results.push({
                rank: 0,
                symbol,
                exchange: 'NSE',
                pattern: p.pattern,
                score: p.score,
                confidence: p.confidence,
                trendStrength: p.trendStrength,
                volumeSignal: p.volumeSignal,
                currentPrice: p.currentPrice,
                pivotPrice: p.pivotPrice,
                entryPrice: p.entryPrice,
                stopLoss: p.stopLoss,
                target1: p.target1,
                target2: p.target2,
                target3: p.target3,
                riskReward: p.riskReward,
                riskPct: p.riskPct,
                contractions: p.contractions,
                suggestedQty,
                notes: p.notes,
                isFnO,
                lotSize,
              });
            });
          } catch (err) {
            candleFetchFailures++;
          }
        }),
      );
      const progress = this.activeScans.get(userId);
      if (progress) progress.scanned = Math.min(scanList.length, i + 5);
      // Small delay between batches to respect rate limits
      await new Promise(r => setTimeout(r, 350));
    }

    if (candleFetchFailures > 0) {
      this.logger.warn(`Historical candle fetch failed for ${candleFetchFailures}/${scanList.length} stocks (network/rate-limit — excluded from results)`);
    }

    // Sort by score desc, assign rank
    results.sort((a, b) => b.score - a.score);
    const perPattern = new Map<string, number>();
    const kept = results.filter((r) => {
      const count = (perPattern.get(r.pattern) ?? 0) + 1;
      perPattern.set(r.pattern, count);
      return count <= MAX_PER_PATTERN;
    });
    kept.forEach((r, i) => (r.rank = i + 1));

    const run: ScanRun = {
      id: `scan_${Date.now()}`,
      scannedAt: new Date().toISOString(),
      totalScanned: scanned,
      results: kept,
    };


    this.cache.set(userId, run);

    // Persist to DB
    await this.persistResults(userId, run).catch(e =>
      this.logger.warn(`Failed to persist scan results: ${e.message}`),
    );

    this.activeScans.set(userId, {
      status: 'completed',
      startedAt: new Date().toISOString(),
      scanned,
      total: scanned,
    });

    this.logger.log(`Scan complete — ${results.length} setups found from ${scanned} stocks, ${kept.length} kept (max ${MAX_PER_PATTERN} per pattern)`);
    return run;
  }

  async getLastScan(userId: string, query: { page?: number; pageSize?: number; pattern?: string; sortBy?: string } = {}): Promise<any> {
    const { page = 1, pageSize = 30, pattern, sortBy = 'score' } = query;
    const skip = (page - 1) * pageSize;

    const active = this.activeScans.get(userId);
    const isScanning = active?.status === 'running';

    // 1. Find the latest scan timestamp for this user
    const lastResult = await (this.prisma as any).swingScan.findFirst({
      where: { userId },
      orderBy: { scannedAt: 'desc' },
      select: { scannedAt: true },
    }).catch(() => null);

    if (!lastResult) {
      return {
        id: null,
        scannedAt: null,
        totalScanned: 0,
        totalResults: 0,
        page: 1,
        pageSize,
        totalPages: 0,
        results: [],
        isScanning,
      };
    }
    const scanDate = lastResult.scannedAt;

    // 2. Build where clause
    const where: any = { 
      userId, 
      scannedAt: scanDate 
    };
    if (pattern && pattern !== 'ALL') {
      where.pattern = pattern;
    }

    // 3. Build sorting
    const orderBy: any = {};
    if (sortBy === 'riskPct') orderBy.riskPct = 'asc';
    else if (sortBy === 'riskReward') orderBy.riskReward = 'desc';
    else orderBy.score = 'desc';

    // 4. Fetch results and total count
    const [rows, totalCount] = await Promise.all([
      (this.prisma as any).swingScan.findMany({
        where,
        orderBy,
        skip,
        take: pageSize,
      }),
      (this.prisma as any).swingScan.count({ where }),
    ]).catch(() => [[], 0]);

    return {
      id: `scan_${new Date(scanDate).getTime()}`,
      scannedAt: scanDate.toISOString(),
      totalScanned: this.cache.get(userId)?.totalScanned ?? 0,
      totalResults: totalCount,
      page,
      pageSize,
      totalPages: Math.ceil(totalCount / pageSize),
      isScanning,
      results: rows.map((r: any, i: number) => ({
        rank: skip + i + 1,
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
        isFnO: r.isFnO ?? false,
        lotSize: r.lotSize ?? 1,
      })),
    };
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async fetchDailyCandles(kite: any, token: number, days: number): Promise<DailyCandle[]> {
    const to   = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days);

    // Historical is capped at 3 req/s across the whole app; under load a call can get
    // queued behind others long enough to look like a failure, so retry network/429 blips
    // instead of silently dropping the stock from the scan.
    const data = await withKiteRetry<any[]>(() => kite.getHistoricalData(token, 'day', from, to, false), 3, 400);
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
        isFnO: r.isFnO,
        lotSize: r.lotSize,
      })),
    }).catch(() => {});
  }
}
