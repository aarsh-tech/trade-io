import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BrokerClientFactory } from '../brokers/broker-client.factory';
import { analyzeStock, DailyCandle } from './vcp.analyzer';

// ─── Nifty 500 scan universe (liquid NSE stocks) ──────────────────────────────
const SCAN_UNIVERSE = [
  '3MINDIA', 'AAVAS', 'ABB', 'ABCAPITAL', 'ABFRL', 'ACC', 'ADANIGREEN', 'ADANIPORTS', 'ADANIPOWER', 'ADANITRANS', 'ADVENZYMES', 'AEGISCHEM', 'AIAENG', 'AJANTPHARM', 'AKZOINDIA', 'ALBK', 'ALKEM', 'ALLCARGO', 'AMARAJABAT', 'AMBUJACEM', 'ANDHRABANK', 'APLAPOLLO', 'APLLTD', 'APOLLOHOSP', 'APOLLOTYRE', 'ASHOKA', 'ASHOKLEY', 'ASIANPAINT', 'ASTERDM', 'ASTRAL', 'ASTRAZEN', 'ATUL', 'AUBANK', 'AUROPHARMA', 'AVANTIFEED', 'AXISBANK', 'BAJAJ-AUTO', 'BAJAJCON', 'BAJAJELEC', 'BAJAJFINSV', 'BAJAJHLDNG', 'BAJFINANCE', 'BALKRISIND', 'BALMLAWRIE', 'BALRAMCHIN', 'BANDHANBNK', 'BANKBARODA', 'BANKINDIA', 'BASF', 'BATAINDIA', 'BBTC', 'BDL', 'BEL', 'BEML', 'BERGEPAINT', 'BHARATFORG', 'BHARTIARTL', 'BHEL', 'BIOCON', 'BIRLACORPN', 'BLISSGVS', 'BLUEDART', 'BLUESTARCO', 'BOMDYEING', 'BOSCHLTD', 'BPCL', 'BRIGADE', 'BRITANNIA', 'BSE', 'CADILAHC', 'CANBK', 'CANFINHOME', 'CAPLIPOINT', 'CARBORUNIV', 'CARERATING', 'CASTROLIND', 'CCL', 'CDSL', 'CEATLTD', 'CENTRALBK', 'CENTURYPLY', 'CERA', 'CESC', 'CGPOWER', 'CHAMBLFERT', 'CHENNPETRO', 'CHOLAFIN', 'CHOLAHLDNG', 'CIPLA', 'COALINDIA', 'COCHINSHIP', 'COFFEEDAY', 'COLPAL', 'CONCOR', 'COROMANDEL', 'CORPBANK', 'COX&KINGS', 'CREDITACC', 'CRISIL', 'CROMPTON', 'CUB', 'CUMMINSIND', 'CYIENT', 'DABUR', 'DBCORP', 'DBL', 'DCAL', 'DCBBANK', 'DCMSHRIRAM', 'DEEPAKFERT', 'DEEPAKNTR', 'DELTACORP', 'DHFL', 'DISHTV', 'DIVISLAB', 'DIXON', 'DLF', 'DMART', 'DRREDDY', 'ECLERX', 'EDELWEISS', 'EICHERMOT', 'EIDPARRY', 'EIHOTEL', 'ELGIEQUIP', 'EMAMILTD', 'ENDURANCE', 'ENGINERSIN', 'EQUITAS', 'ERIS', 'ESCORTS', 'ESSELPACK', 'EXIDEIND', 'FCONSUMER', 'FDC', 'FEDERALBNK', 'FINCABLES', 'FINEORG', 'FINPIPE', 'FLFL', 'FORTIS', 'FRETAIL', 'FSL', 'GAIL', 'GALAXYSURF', 'GAYAPROJ', 'GDL', 'GEPIL', 'GESHIP', 'GET&D', 'GHCL', 'GICRE', 'GILLETTE', 'GLAXO', 'GLENMARK', 'GMDCLTD', 'GMRINFRA', 'GNFC', 'GODFRYPHLP', 'GODREJAGRO', 'GODREJCP', 'GODREJIND', 'GODREJPROP', 'GPPL', 'GRANULES', 'GRAPHITE', 'GRASIM', 'GREAVESCOT', 'GRINDWELL', 'GRUH', 'GSFC', 'GSKCONS', 'GSPL', 'GUJALKALI', 'GUJFLUORO', 'GUJGASLTD', 'GULFOILLUB', 'HAL', 'HATHWAY', 'HATSUN', 'HAVELLS', 'HCLTECH', 'HDFC', 'HDFCAMC', 'HDFCBANK', 'HDFCLIFE', 'HEG', 'HEIDELBERG', 'HERITGFOOD', 'HEROMOTOCO', 'HEXAWARE', 'HFCL', 'HIMATSEIDE', 'HINDALCO', 'HINDCOPPER', 'HINDPETRO', 'HINDUNILVR', 'HINDZINC', 'HONAUT', 'HSCL', 'HUDCO', 'IBREALEST', 'IBULHSGFIN', 'IBULISL', 'IBVENTURES', 'ICICIBANK', 'ICICIGI', 'ICICIPRULI', 'ICRA', 'IDBI', 'IDEA', 'IDFC', 'IDFCFIRSTB', 'IEX', 'IFBIND', 'IFCI', 'IGL', 'INDHOTEL', 'INDIACEM', 'INDIANB', 'INDIGO', 'INDOCO', 'INDOSTAR', 'INDUSINDBK', 'INFIBEAM', 'INFRATEL', 'INFY', 'INOXLEISUR', 'INOXWIND', 'INTELLECT', 'IOB', 'IOC', 'IPCALAB', 'IRB', 'IRCON', 'ISEC', 'ITC', 'ITDC', 'ITDCEM', 'ITI', 'J&KBANK', 'JAGRAN', 'JAICORPLTD', 'JAMNAAUTO', 'JBCHEPHARM', 'JETAIRWAYS', 'JINDALSAW', 'JINDALSTEL', 'JISLJALEQS', 'JKCEMENT', 'JKLAKSHMI', 'JKPAPER', 'JKTYRE', 'JMFINANCIL', 'JPASSOCIAT', 'JSL', 'JSLHISAR', 'JSWENERGY', 'JSWSTEEL', 'JUBILANT', 'JUBLFOOD', 'JUSTDIAL', 'JYOTHYLAB', 'KAJARIACER', 'KALPATPOWR', 'KANSAINER', 'KARURVYSYA', 'KEC', 'KEI', 'KIOCL', 'KIRLOSENG', 'KNRCON', 'KOLTEPATIL', 'KOTAKBANK', 'KPRMILL', 'KRBL', 'KSCL', 'KTKBANK', 'L&TFH', 'LAKSHVILAS', 'LALPATHLAB', 'LAURUSLABS', 'LAXMIMACH', 'LEMONTREE', 'LICHSGFIN', 'LINDEINDIA', 'LT', 'LTI', 'LTTS', 'LUPIN', 'LUXIND', 'M&M', 'M&MFIN', 'MAGMA', 'MAHABANK', 'MAHINDCIE', 'MAHLOG', 'MAHSCOOTER', 'MAHSEAMLES', 'MANAPPURAM', 'MARICO', 'MARUTI', 'MASFIN', 'MAXINDIA', 'MCDOWELL-N', 'MFSL', 'MGL', 'MHRIL', 'MINDACORP', 'MINDAIND', 'MINDTREE', 'MMTC', 'MOIL', 'MONSANTO', 'MOTHERSUMI', 'MOTILALOFS', 'MPHASIS', 'MRF', 'MRPL', 'MUTHOOTFIN', 'NATCOPHARM', 'NATIONALUM', 'NAUKRI', 'NAVINFLUOR', 'NBCC', 'NBVENTURES', 'NCC', 'NESCO', 'NETWORK18', 'NFL', 'NH', 'NHPC', 'NIACL', 'NIITTECH', 'NILKAMAL', 'NLCINDIA', 'NMDC', 'NTPC', 'OBEROIRLTY', 'OFSS', 'OIL', 'OMAXE', 'ONGC', 'ORIENTBANK', 'ORIENTCEM', 'ORIENTELEC', 'PAGEIND', 'PARAGMILK', 'PCJEWELLER', 'PEL', 'PERSISTENT', 'PETRONET', 'PFC', 'PFIZER', 'PGHH', 'PGHL', 'PHILIPCARB', 'PHOENIXLTD', 'PIDILITIND', 'PIIND', 'PNB', 'PNBHOUSING', 'PNCINFRA', 'POWERGRID', 'PRAJIND', 'PRESTIGE', 'PRSMJOHNSN', 'PTC', 'PVR', 'QUESS', 'RADICO', 'RAIN', 'RAJESHEXPO', 'RALLIS', 'RAMCOCEM', 'RAYMOND', 'RBLBANK', 'RCF', 'RCOM', 'RECLTD', 'REDINGTON', 'RELAXO', 'RELCAPITAL', 'RELIANCE', 'RELINFRA', 'RENUKA', 'REPCOHOME', 'RHFL', 'RITES', 'RKFORGE', 'RNAM', 'RPOWER', 'RUPA', 'SADBHAV', 'SAIL', 'SANOFI', 'SBILIFE', 'SBIN', 'SCHAEFFLER', 'SCI', 'SFL', 'SHANKARA', 'SHARDACROP', 'SHILPAMED', 'SHK', 'SHOPERSTOP', 'SHREECEM', 'SHRIRAMCIT', 'SIEMENS', 'SIS', 'SJVN', 'SKFINDIA', 'SOBHA', 'SOLARINDS', 'SONATSOFTW', 'SOUTHBANK', 'SPARC', 'SPTL', 'SREINFRA', 'SRF', 'SRTRANSFIN', 'STAR', 'STARCEMENT', 'STRTECH', 'SUDARSCHEM', 'SUNCLAYLTD', 'SUNDARMFIN', 'SUNDRMFAST', 'SUNPHARMA', 'SUNTECK', 'SUNTV', 'SUPRAJIT', 'SUPREMEIND', 'SUVEN', 'SUZLON', 'SWANENERGY', 'SYMPHONY', 'SYNDIBANK', 'SYNGENE', 'TAKE', 'TATACHEM', 'TATACOFFEE', 'TATAELXSI', 'TATAGLOBAL', 'TATAINVEST', 'TATAMOTORS', 'TATAMTRDVR', 'TATAPOWER', 'TATASTEEL', 'TCNSBRANDS', 'TCS', 'TEAMLEASE', 'TECHM', 'THERMAX', 'THOMASCOOK', 'THYROCARE', 'TIINDIA', 'TIMETECHNO', 'TIMKEN', 'TITAN', 'TNPL', 'TORNTPHARM', 'TORNTPOWER', 'TRENT', 'TRIDENT', 'TRITURBINE', 'TTKPRESTIG', 'TV18BRDCST', 'TVSMOTOR', 'TVTODAY', 'UBL', 'UCOBANK', 'UFLEX', 'UJJIVAN', 'ULTRACEMCO', 'UNIONBANK', 'UPL', 'VAKRANGEE', 'VARROC', 'VBL', 'VEDL', 'VENKEYS', 'VGUARD', 'VINATIORGA', 'VIPIND', 'VMART', 'VOLTAS', 'VRLLOG', 'VSTIND', 'VTL', 'WABAG', 'WABCOINDIA', 'WELCORP', 'WELSPUNIND', 'WHIRLPOOL', 'WIPRO', 'WOCKPHARMA', 'YESBANK', 'ZEEL', 'ZENSARTECH', 'ZYDUSWELL'
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

    // ── Build dynamic universe from NSE instruments ─────────────────────────────
    const tokenMap = new Map<string, number>();
    const instrumentToSymbol = new Map<number, string>();
    const dynamicUniverse: string[] = [];
    instruments.forEach((i: any) => {
      if (i.instrument_type === 'EQ' && i.exchange === 'NSE') {
        tokenMap.set(i.tradingsymbol, i.instrument_token);
        instrumentToSymbol.set(i.instrument_token, i.tradingsymbol);
        dynamicUniverse.push(i.tradingsymbol);
      }
    });

    // ── Get Live Quotes (LTP) for the entire universe ────────────────────────
    // We filter for liquid stocks to avoid scanning thousands of illiquid ones
    // For now, let's use the top 750 most liquid or simply those in dynamicUniverse
    const ltpBatch = dynamicUniverse.slice(0, 1000); // Limit to top 1000 for efficiency
    const ltpSymbols = ltpBatch.map(s => `NSE:${s}`);
    let liveQuotes: Record<string, { last_price: number }> = {};
    try {
      // Kite LTP can handle up to 500 symbols
      liveQuotes = await kite.getLTP(ltpSymbols);
    } catch (err) {
      this.logger.warn(`Live quotes fetch failed: ${err.message}`);
    }

    const results: ScanResult[] = [];
    let scanned = 0;

    const scanList = dynamicUniverse.slice(0, 1000);
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

            patterns.forEach(p => {
              // Calculate suggested qty to earn ₹500 at T1
              const profitPerShare = p.target1 - p.entryPrice;
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
              });
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
      results: results.slice(0, 150), // increased from 50 to 150
    };

    this.cache.set(userId, run);

    // Persist to DB
    await this.persistResults(userId, run).catch(e =>
      this.logger.warn(`Failed to persist scan results: ${e.message}`),
    );

    this.logger.log(`Scan complete — ${results.length} setups found from ${scanned} stocks`);
    return run;
  }

  async getLastScan(userId: string, query: { page?: number; pageSize?: number; pattern?: string; sortBy?: string } = {}): Promise<any> {
    const { page = 1, pageSize = 30, pattern, sortBy = 'score' } = query;
    const skip = (page - 1) * pageSize;

    // 1. Find the latest scan timestamp for this user
    const lastResult = await (this.prisma as any).swingScan.findFirst({
      where: { userId },
      orderBy: { scannedAt: 'desc' },
      select: { scannedAt: true },
    }).catch(() => null);

    if (!lastResult) return null;
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
      totalScanned: 500, // Approximate total stocks checked
      totalResults: totalCount,
      page,
      pageSize,
      totalPages: Math.ceil(totalCount / pageSize),
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
