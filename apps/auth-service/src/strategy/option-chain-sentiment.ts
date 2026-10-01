/**
 * Option-chain and futures positioning for index options: the near-the-money put/call OI ratio (PCR) and the
 * futures OI build-up. Shared by the index option engines. These are context only: callers log them next to a
 * setup or trade and never block on them. Every function returns null on any lookup failure instead of throwing.
 */

export type IndexUnderlying = 'NIFTY' | 'BANKNIFTY' | 'FINNIFTY' | 'MIDCPNIFTY' | 'SENSEX';

/** `NIFTY`, `NSE:NIFTY 50`, `BANKNIFTY`, `NIFTY BANK`, `SENSEX` ... -> the option underlying's name in Kite's master. */
export function optionUnderlying(symbol: string): IndexUnderlying {
  const s = (symbol || 'NIFTY').toUpperCase();
  if (s.includes('BANK')) return 'BANKNIFTY';
  if (s.includes('FIN')) return 'FINNIFTY';
  if (s.includes('MIDCP') || s.includes('MID SELECT')) return 'MIDCPNIFTY';
  if (s.includes('SENSEX')) return 'SENSEX';
  return 'NIFTY';
}

/** SENSEX derivatives trade on BSE's F&O segment (BFO), the NSE indices on NFO. */
export function derivativesExchange(underlying: IndexUnderlying): 'NFO' | 'BFO' {
  return underlying === 'SENSEX' ? 'BFO' : 'NFO';
}

/** An instrument-master expiry as an IST `YYYY-MM-DD` string ('' when missing). */
export function expiryDateStr(expiry: any): string {
  if (!expiry) return '';
  const d = new Date(expiry);
  return isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** The strike interval near `refPrice`: the smallest gap between listed strikes within 5% of it. */
export function strikeStepNear(strikes: number[], refPrice: number): number {
  const near = Array.from(new Set(strikes)).filter((k) => Math.abs(k - refPrice) <= refPrice * 0.05).sort((a, b) => a - b);
  let step = Infinity;
  for (let i = 1; i < near.length; i++) step = Math.min(step, near[i] - near[i - 1]);
  return Number.isFinite(step) && step > 0 ? step : 50;
}

/** Index option rows of one underlying (CE and PE) from the exchange's instrument master. */
export async function indexOptionChain(client: any, underlying: IndexUnderlying): Promise<any[]> {
  const exchange = derivativesExchange(underlying);
  const instruments = await client.getInstruments(exchange);
  return (instruments || []).filter(
    (i: any) => i.name === underlying && (i.instrument_type === 'CE' || i.instrument_type === 'PE') && (i.segment === `${exchange}-OPT` || !i.segment),
  );
}

export interface PcrSnapshot {
  pcr: number;
  callOi: number;
  putOi: number;
  expiry: string;
  /** PCR skewed towards puts, or less call OI than put OI. */
  isBullishConfluence: boolean;
  /** PCR skewed towards calls, or less put OI than call OI. */
  isBearishConfluence: boolean;
}

/**
 * Put/call OI ratio over the ATM strike and `strikesEachSide` strikes either side, for the nearest expiry on or
 * after today (or `expiry` when given). `refPrice` picks the ATM strike.
 */
export async function computeAtmPcr(
  client: any,
  underlying: IndexUnderlying,
  refPrice: number,
  opts: { strikesEachSide?: number; expiry?: string } = {},
): Promise<PcrSnapshot | null> {
  try {
    const kite = client['kite'] || client;
    if (!kite?.getQuote || !(refPrice > 0)) return null;
    const exchange = derivativesExchange(underlying);
    const chain = await indexOptionChain(client, underlying);
    if (chain.length === 0) return null;

    const today = expiryDateStr(new Date());
    const expiry = opts.expiry || Array.from(new Set(chain.map((i: any) => expiryDateStr(i.expiry)))).filter((e) => e !== '' && e >= today).sort()[0];
    if (!expiry) return null;
    const series = chain.filter((i: any) => expiryDateStr(i.expiry) === expiry);

    const step = strikeStepNear(series.map((i: any) => Number(i.strike)), refPrice);
    const atm = Math.round(refPrice / step) * step;
    const each = opts.strikesEachSide ?? 3;
    const band = new Set<number>();
    for (let m = -each; m <= each; m++) band.add(atm + m * step);
    const legs = series.filter((i: any) => band.has(Number(i.strike)));
    if (legs.length === 0) return null;

    const quotes = await kite.getQuote(legs.map((i: any) => `${exchange}:${i.tradingsymbol}`)).catch(() => null);
    if (!quotes) return null;

    let callOi = 0, putOi = 0;
    for (const inst of legs) {
      const q = quotes[`${exchange}:${inst.tradingsymbol}`];
      if (!q) continue;
      if (inst.instrument_type === 'CE') callOi += q.oi || 0;
      else putOi += q.oi || 0;
    }
    if (callOi <= 0 && putOi <= 0) return null;

    const pcr = callOi > 0 ? putOi / callOi : 1.0;
    return {
      pcr: Number(pcr.toFixed(2)),
      callOi,
      putOi,
      expiry,
      isBullishConfluence: pcr >= 1.05 || callOi < putOi,
      isBearishConfluence: pcr <= 0.95 || putOi < callOi,
    };
  } catch {
    return null;
  }
}

export type OiBuildup = 'LONG_BUILDUP' | 'SHORT_BUILDUP' | 'SHORT_COVERING' | 'LONG_UNWINDING' | 'NEUTRAL';

export interface FuturesOiSnapshot {
  futSymbol: string;
  price: number;
  prevClose: number;
  priceChgPct: number;
  oi: number;
  prevOi: number;
  oiChgPct: number;
  buildup: OiBuildup;
}

/**
 * Near-month futures price and OI now against the previous session's last 5m candle:
 * price up + OI up = long build-up, price down + OI up = short build-up,
 * price up + OI down = short covering, price down + OI down = long unwinding.
 * Changes under 0.05% (price) or 0.5% (OI) count as flat.
 */
export async function computeFuturesOiBuildup(client: any, underlying: IndexUnderlying, now = new Date()): Promise<FuturesOiSnapshot | null> {
  try {
    const kite = client['kite'] || client;
    if (!kite?.getHistoricalData) return null;
    const exchange = derivativesExchange(underlying);
    const instruments = await client.getInstruments(exchange);
    const today = expiryDateStr(now);
    const fut = (instruments || [])
      .filter((i: any) => i.name === underlying && i.instrument_type === 'FUT' && expiryDateStr(i.expiry) >= today)
      .sort((a: any, b: any) => new Date(a.expiry).getTime() - new Date(b.expiry).getTime())[0];
    if (!fut?.instrument_token) return null;

    const from = new Date(now.getTime() - 5 * 24 * 3600_000);
    const candles: any[] = await kite.getHistoricalData(fut.instrument_token, '5minute', from, now, false, true);
    if (!candles || candles.length < 2) return null;

    const prev = [...candles].reverse().find((c: any) => expiryDateStr(new Date(c.date)) < today);
    const last = candles[candles.length - 1];
    if (!prev || expiryDateStr(new Date(last.date)) !== today) return null;

    const price = Number(last.close), prevClose = Number(prev.close);
    const oi = Number(last.oi) || 0, prevOi = Number(prev.oi) || 0;
    if (!(prevClose > 0) || !(prevOi > 0)) return null;

    const priceChgPct = ((price - prevClose) / prevClose) * 100;
    const oiChgPct = ((oi - prevOi) / prevOi) * 100;
    const pSign = Math.abs(priceChgPct) < 0.05 ? 0 : Math.sign(priceChgPct);
    const oSign = Math.abs(oiChgPct) < 0.5 ? 0 : Math.sign(oiChgPct);
    let buildup: OiBuildup = 'NEUTRAL';
    if (pSign > 0 && oSign > 0) buildup = 'LONG_BUILDUP';
    else if (pSign < 0 && oSign > 0) buildup = 'SHORT_BUILDUP';
    else if (pSign > 0 && oSign < 0) buildup = 'SHORT_COVERING';
    else if (pSign < 0 && oSign < 0) buildup = 'LONG_UNWINDING';

    return {
      futSymbol: fut.tradingsymbol,
      price,
      prevClose,
      priceChgPct: Number(priceChgPct.toFixed(2)),
      oi,
      prevOi,
      oiChgPct: Number(oiChgPct.toFixed(2)),
      buildup,
    };
  } catch {
    return null;
  }
}
