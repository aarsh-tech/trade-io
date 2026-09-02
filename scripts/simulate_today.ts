import { PrismaClient } from '@prisma/client';
import { KiteConnect } from 'kiteconnect';

const prisma = new PrismaClient();

interface Candle {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function calculateEMA(candles: Candle[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  const k = 2 / (period + 1);
  let ema: number | null = null;
  for (let i = 0; i < candles.length; i++) {
    const close = candles[i].close;
    if (i < period - 1) {
      result.push(null);
    } else if (i === period - 1) {
      let sum = 0;
      for (let j = 0; j < period; j++) sum += candles[j].close;
      ema = sum / period;
      result.push(ema);
    } else {
      ema = close * k + ema! * (1 - k);
      result.push(ema);
    }
  }
  return result;
}

function calculateVWAP(candles: Candle[]): (number | null)[] {
  const result: (number | null)[] = [];
  let cumVol = 0;
  let cumVolPrice = 0;
  let currentDay = '';

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const day = c.date.toISOString().split('T')[0];
    if (day !== currentDay) {
      currentDay = day;
      cumVol = 0;
      cumVolPrice = 0;
    }
    const typicalPrice = (c.high + c.low + c.close) / 3;
    const vol = c.volume || 1;
    cumVol += vol;
    cumVolPrice += typicalPrice * vol;
    result.push(cumVol > 0 ? cumVolPrice / cumVol : c.close);
  }
  return result;
}

async function runSimulation() {
  console.log('================================================================');
  console.log('🚀 RUNNING LIVE INTRADAY SIMULATION ON TODAY’S HISTORICAL DATA');
  console.log('================================================================\n');

  const account = await prisma.brokerAccount.findFirst({
    where: { isActive: true, accessToken: { not: null } },
  });

  if (!account || !account.accessToken) {
    console.error('❌ No active Zerodha broker account with accessToken found in database.');
    return;
  }

  const apiKey = (account as any).apiKey || process.env.KITE_API_KEY || 'kitefront';
  const kite = new KiteConnect({ api_key: apiKey });
  kite.setAccessToken(account.accessToken);

  // Fetch instruments
  console.log('📡 Connecting to Zerodha Kite API...');
  const nseInstruments = await kite.getInstruments('NSE');
  const tokenMap = new Map<string, number>();
  nseInstruments.forEach((i: any) => {
    if (i.instrument_type === 'EQ') {
      tokenMap.set(i.tradingsymbol.toUpperCase().trim(), i.instrument_token);
    }
  });

  // Top watched stocks from today
  const testSymbols = ['SHRIRAMFIN', 'HEROMOTOCO', 'TCS', 'ADANIENSOL', 'SWIGGY', 'TATAMOTORS'];
  const today = new Date();
  const fromDate = new Date(today);
  fromDate.setDate(fromDate.getDate() - 3);

  console.log(`\n🔍 Fetching 1-minute and 5-minute data for: ${testSymbols.join(', ')}...\n`);

  for (const sym of testSymbols) {
    const token = tokenMap.get(sym);
    if (!token) {
      console.log(`[${sym}] Instrument token not found.`);
      continue;
    }

    try {
      const raw5m = await kite.getHistoricalData(token, '5minute', fromDate, today);
      const raw1m = await kite.getHistoricalData(token, 'minute', fromDate, today);

      const candles5m: Candle[] = raw5m.map((c: any) => ({
        date: new Date(c.date),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      }));

      const candles1m: Candle[] = raw1m.map((c: any) => ({
        date: new Date(c.date),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      }));

      const todayStr = today.toISOString().split('T')[0];
      const today5m = candles5m.filter(c => c.date.toISOString().split('T')[0] === todayStr);
      const today1m = candles1m.filter(c => c.date.toISOString().split('T')[0] === todayStr);

      if (today5m.length === 0 || today1m.length === 0) {
        console.log(`[${sym}] No candles for today (${todayStr}).`);
        continue;
      }

      console.log(`----------------------------------------------------------------`);
      console.log(`📊 SIMULATION ANALYSIS: [${sym}] (Today's Total 5m Candles: ${today5m.length}, 1m Candles: ${today1m.length})`);
      console.log(`----------------------------------------------------------------`);

      // 1. Opening Drive Check at 09:15 AM
      const open1m = today1m[0];
      const openPrice = open1m.open;
      const highAt0915 = open1m.high;
      const lowAt0915 = open1m.low;
      const close0915 = open1m.close;
      const diffHighOpen = Math.abs(highAt0915 - openPrice) / openPrice;
      const diffOpenLow = Math.abs(openPrice - lowAt0915) / openPrice;

      console.log(`⏰ 09:15:00 Opening 1m Candle: Open=₹${openPrice.toFixed(2)}, High=₹${highAt0915.toFixed(2)}, Low=₹${lowAt0915.toFixed(2)}, Close=₹${close0915.toFixed(2)}`);

      let triggeredTrade: any = null;

      // Check Instant Opening Trigger (09:15:00 - 09:16:00)
      if (diffHighOpen <= 0.0018 && close0915 < openPrice) {
        const slPrice = Math.min(highAt0915, openPrice * 1.003);
        const targetPrice = openPrice - (slPrice - openPrice) * 2.5;
        console.log(`🔥 [09:15:20 IST] 🚀 INSTANT BEARISH OPEN=HIGH TRIGGER ACTIVATED!`);
        console.log(`   👉 SIDE: SHORT | Entry Price: ₹${close0915.toFixed(2)} | SL: ₹${slPrice.toFixed(2)} (${((slPrice - close0915)/close0915 * 100).toFixed(2)}% Risk) | Target: ₹${targetPrice.toFixed(2)}`);
        triggeredTrade = { side: 'SELL', entryPrice: close0915, slPrice, targetPrice, entryTime: open1m.date };
      } else if (diffOpenLow <= 0.0018 && close0915 > openPrice) {
        const slPrice = Math.max(lowAt0915, openPrice * 0.997);
        const targetPrice = openPrice + (openPrice - slPrice) * 2.5;
        console.log(`🔥 [09:15:20 IST] 🚀 INSTANT BULLISH OPEN=LOW TRIGGER ACTIVATED!`);
        console.log(`   👉 SIDE: BUY | Entry Price: ₹${close0915.toFixed(2)} | SL: ₹${slPrice.toFixed(2)} (${((close0915 - slPrice)/close0915 * 100).toFixed(2)}% Risk) | Target: ₹${targetPrice.toFixed(2)}`);
        triggeredTrade = { side: 'BUY', entryPrice: close0915, slPrice, targetPrice, entryTime: open1m.date };
      }

      // Replay throughout the day with 5m candles
      const emas5m = calculateEMA(candles5m, 15);
      const vwaps5m = calculateVWAP(candles5m);

      for (let i = candles5m.length - today5m.length; i < candles5m.length; i++) {
        const c = candles5m[i];
        const ema = emas5m[i];
        const vwap = vwaps5m[i];
        const timeStr = c.date.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });

        if (triggeredTrade) {
          // Check SL / Target hit on 5m candle
          if (triggeredTrade.side === 'SELL') {
            if (c.high >= triggeredTrade.slPrice) {
              console.log(`   ❌ [${timeStr}] SL Hit at ₹${triggeredTrade.slPrice.toFixed(2)} | PnL: ₹${(triggeredTrade.entryPrice - triggeredTrade.slPrice).toFixed(2)}`);
              triggeredTrade = null;
            } else if (c.low <= triggeredTrade.targetPrice) {
              console.log(`   🎯 [${timeStr}] Target Hit at ₹${triggeredTrade.targetPrice.toFixed(2)} | PnL: +₹${(triggeredTrade.entryPrice - triggeredTrade.targetPrice).toFixed(2)} 🎉`);
              triggeredTrade = null;
            }
          } else if (triggeredTrade.side === 'BUY') {
            if (c.low <= triggeredTrade.slPrice) {
              console.log(`   ❌ [${timeStr}] SL Hit at ₹${triggeredTrade.slPrice.toFixed(2)} | PnL: ₹${(triggeredTrade.slPrice - triggeredTrade.entryPrice).toFixed(2)}`);
              triggeredTrade = null;
            } else if (c.high >= triggeredTrade.targetPrice) {
              console.log(`   🎯 [${timeStr}] Target Hit at ₹${triggeredTrade.targetPrice.toFixed(2)} | PnL: +₹${(triggeredTrade.targetPrice - triggeredTrade.entryPrice).toFixed(2)} 🎉`);
              triggeredTrade = null;
            }
          }
        }

        // Check Intraday Trend Breakdown / Breakout
        if (!triggeredTrade && ema && vwap) {
          const isDowntrend = ema < vwap && c.close <= vwap && c.close <= ema;
          const isUptrend = ema > vwap && c.close >= vwap && c.close >= ema;

          // Check if breaking new Day Low
          const priorTodayCandles = candles5m.slice(candles5m.length - today5m.length, i);
          if (priorTodayCandles.length >= 2) {
            const priorLow = Math.min(...priorTodayCandles.map(x => x.low));
            const priorHigh = Math.max(...priorTodayCandles.map(x => x.high));

            if (isDowntrend && c.low < priorLow) {
              const slPrice = Math.min(c.high, ema);
              const targetPrice = c.close - (slPrice - c.close) * 2;
              console.log(`   📉 [${timeStr}] 🎯 TREND BREAKDOWN TRIGGER! New Day Low formed at ₹${c.low.toFixed(2)} (Prior: ₹${priorLow.toFixed(2)}) | 15-EMA: ₹${ema.toFixed(2)}, VWAP: ₹${vwap.toFixed(2)}`);
              console.log(`      👉 SHORT Entry: ₹${c.close.toFixed(2)} | SL: ₹${slPrice.toFixed(2)} | Target: ₹${targetPrice.toFixed(2)}`);
              triggeredTrade = { side: 'SELL', entryPrice: c.close, slPrice, targetPrice, entryTime: c.date };
            } else if (isUptrend && c.high > priorHigh) {
              const slPrice = Math.max(c.low, ema);
              const targetPrice = c.close + (c.close - slPrice) * 2;
              console.log(`   📈 [${timeStr}] 🎯 TREND BREAKOUT TRIGGER! New Day High formed at ₹${c.high.toFixed(2)} (Prior: ₹${priorHigh.toFixed(2)}) | 15-EMA: ₹${ema.toFixed(2)}, VWAP: ₹${vwap.toFixed(2)}`);
              console.log(`      👉 LONG Entry: ₹${c.close.toFixed(2)} | SL: ₹${slPrice.toFixed(2)} | Target: ₹${targetPrice.toFixed(2)}`);
              triggeredTrade = { side: 'BUY', entryPrice: c.close, slPrice, targetPrice, entryTime: c.date };
            }
          }
        }
      }
      console.log('');
    } catch (e: any) {
      console.error(`[${sym}] Error running simulation:`, e.message);
    }
  }

  await prisma.$disconnect();
}

runSimulation().catch(console.error);
