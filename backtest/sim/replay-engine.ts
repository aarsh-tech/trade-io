// Replays past days through the REAL StocksInPlayEngine (paper mode) with a fake broker fed from backtest/data/5minute,
// and compares its candidates and trades with the simulator (sim/orb-sim.js) for the same days.
// Usage (from apps/auth-service): npx ts-node -T ../../backtest/sim/replay-engine.ts [firstDay] [lastDay] [quote|history]
import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { StocksInPlayEngine } from '../../apps/auth-service/src/strategy/stocks-in-play.engine';

const DATA = path.join(__dirname, '..', 'data', '5minute');
const first = process.argv[2] || '2026-08-25';
const last = process.argv[3] || '2026-09-24';
const mode = (process.argv[4] || 'quote') as 'quote' | 'history';

type Bar = { date: Date; open: number; high: number; low: number; close: number; volume: number };
const ist = (d: Date) => new Date(d.getTime() + 330 * 60000);
const dayOf = (d: Date) => ist(d).toISOString().slice(0, 10);
const hhmmOf = (d: Date) => { const x = ist(d); return x.getUTCHours() * 60 + x.getUTCMinutes(); };
const at = (day: string, hh: number, mm: number, ss = 0) => new Date(`${day}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}.000+05:30`);

// Load a window of candles per stock (35 calendar days before `first` .. `last`).
const winStart = new Date(at(first, 9, 15).getTime() - 40 * 86400e3);
const winEnd = at(last, 15, 30);
const series = new Map<string, Bar[]>();
for (const f of fs.readdirSync(DATA)) {
  const sym = f.replace('.json', '');
  if (/NIFTY|INDIA_VIX|SENSEX|FUT$/.test(sym)) continue;
  const raw: any[] = JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));
  const bars: Bar[] = [];
  for (const b of raw) { const d = new Date(b.date); if (d >= winStart && d <= winEnd) bars.push({ date: d, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume }); }
  if (bars.length) series.set(sym, bars);
}
const days = Array.from(new Set(Array.from(series.get('RELIANCE')!.map((b) => dayOf(b.date))))).filter((d) => d >= first && d <= last).sort();
console.log(`stocks ${series.size}, replay days ${days.length} (${days[0]} .. ${days[days.length - 1]}), first-candle source: ${mode}`);

// ── fakes ──
const orders: any[] = [];
const prisma: any = {
  order: { findMany: async () => orders, updateMany: async () => ({}) },
  strategyExecution: { update: async () => ({}) },
  brokerAccount: { findUnique: async () => null },
};
const orderGateway: any = { recordEngineOrder: async (o: any) => { orders.push({ ...o, brokerOrderId: o.brokerOrderId, createdAt: new Date(), filledQty: o.status === 'COMPLETE' ? o.qty : 0 }); } };
const ticker: any = { subscribeSymbol: async () => undefined, registerListener: () => () => undefined };
const engine = new StocksInPlayEngine(prisma, {} as any, ticker, orderGateway) as any;

let clock = new Date();
const client: any = {
  getHistoricalData: async (sym: string, _ex: string, _iv: string, from: Date, to: Date) => (series.get(sym) || []).filter((b) => b.date >= from && b.date <= to && b.date.getTime() + 5 * 60e3 <= clock.getTime()),
};
client.kite = {
  getQuote: async (keys: string[]) => {
    const out: Record<string, any> = {};
    for (const k of keys) {
      const sym = k.replace('NSE:', ''); const day = dayOf(clock);
      const bars = (series.get(sym) || []).filter((b) => dayOf(b.date) === day && b.date.getTime() + 5 * 60e3 <= clock.getTime());
      if (!bars.length) continue;
      out[k] = { volume: bars.reduce((a, b) => a + b.volume, 0), last_price: bars[bars.length - 1].close, ohlc: { open: bars[0].open, high: Math.max(...bars.map((b) => b.high)), low: Math.min(...bars.map((b) => b.low)) }, lower_circuit_limit: 0, upper_circuit_limit: 0 };
    }
    return out;
  },
};

async function main() {
  const results: any[] = [];
  for (const day of days) {
    orders.length = 0;
    const cfg = engine.resolveConfig({ stopLossRs: 1e9, maxPositions: 2, maxCapital: 15000, leverage: 5 });
    const state: any = {
      strategyId: 'replay', executionId: 'replay', userId: 'u', brokerAccountId: 'a', isPaperTrade: true, config: cfg,
      baselines: null, baselineLoading: false, candidates: null, candidatesTriedAt: 0, tradedSymbols: new Set(), positions: [],
      tradesToday: 0, winsToday: 0, lossesToday: 0, realizedTodayRs: 0, logs: [], busy: false, stopping: false, completeReason: null,
      client, clientCheckedAt: Date.now(), subscribed: new Set(), lastPnlLog: 0, loggedNoSession: false, loggedCutoff: false,
    };
    engine.running.set('replay', state);
    // Baselines: history up to 09:10 (quote mode: first candle read at 09:20) or up to 09:25 (history mode).
    clock = mode === 'quote' ? at(day, 9, 10) : at(day, 9, 25);
    const base = new Map<string, any>();
    for (const [sym] of series) {
      const raw = await client.getHistoricalData(sym, 'NSE', '5minute', new Date(at(day, 9, 15).getTime() - 24 * 86400e3), clock);
      const b = engine.baselineFrom(raw, day, 0.05);
      if (b) base.set(sym, b);
    }
    state.baselines = base;
    clock = at(day, 9, 20, 5);
    await engine.buildCandidates(state, client, clock);
    if (!state.candidates) { clock = at(day, 9, 22, 5); await engine.buildCandidates(state, client, clock); }

    const watch = new Set<string>((state.candidates || []).map((c: any) => c.symbol));
    const barsOf = (sym: string) => (series.get(sym) || []).filter((b) => dayOf(b.date) === day);
    for (let s = 1; s < 75 && (state.candidates?.length || state.positions.length); s++) {
      const t0 = at(day, 9, 15).getTime() + s * 5 * 60e3;
      const syms = new Set<string>([...watch, ...state.positions.map((p: any) => p.symbol)]);
      // path per symbol: o -> (l,h | h,l) -> c, interpolated in 20 steps per leg
      const paths = new Map<string, number[]>();
      for (const sym of syms) {
        const b = barsOf(sym).find((x) => hhmmOf(x.date) === 555 + s * 5);
        if (!b) continue;
        const pts = b.close >= b.open ? [b.open, b.low, b.high, b.close] : [b.open, b.high, b.low, b.close];
        const seq: number[] = [pts[0]];
        for (let i = 1; i < pts.length; i++) for (let k = 1; k <= 20; k++) seq.push(pts[i - 1] + (pts[i] - pts[i - 1]) * k / 20);
        paths.set(sym, seq);
      }
      const steps = 61;
      for (let k = 0; k < steps; k++) {
        clock = new Date(t0 + k * (5 * 60e3 / steps));
        for (const [sym, seq] of paths) {
          const px = seq[k] ?? seq[seq.length - 1];
          for (const c of state.candidates || []) if (c.symbol === sym) { c.ltp = px; c.ltpAt = clock.getTime(); }
          for (const p of state.positions) if (p.symbol === sym) { p.ltp = px; p.ltpAt = clock.getTime(); }
        }
        await engine.managePositions(state, client, clock);
        if (hhmmOf(clock) < 905 && state.candidates) await engine.checkEntries(state, client, clock);
        if (hhmmOf(clock) >= 905) break;
      }
      if (hhmmOf(clock) >= 905) break;
    }
    const exits = state.logs.filter((l: string) => l.includes('🏁'));
    const entries = state.logs.filter((l: string) => l.includes('📋 Placed Trade'));
    results.push({ day, candidates: (state.candidates || []).map((c: any) => `${c.symbol}:${c.side[0]}:${c.rvol.toFixed(1)}`), entries: entries.length, pnl: +state.realizedTodayRs.toFixed(2), open: state.positions.length });
    console.log(`${day} cand [${results[results.length - 1].candidates.join(' ')}] trades ${entries.length} pnl ₹${state.realizedTodayRs.toFixed(2)}${state.positions.length ? ` OPEN ${state.positions.length}` : ''}`);
    for (const l of [...entries, ...exits]) console.log('    ' + l.replace(/^\[[^\]]+\]\s*/, '').slice(0, 170));
    engine.running.delete('replay');
  }
  fs.writeFileSync(path.join(__dirname, `replay-${mode}.json`), JSON.stringify(results, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });
