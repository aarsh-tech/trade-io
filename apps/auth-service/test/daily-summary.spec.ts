import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildDailySummary, readSignalRows } from '../src/strategy/daily-summary';

/** Rows shaped like the real 12 Nov 2026 HINDCOPPER fade short (logs/strategy-signals/2026-11-12.jsonl). */
const SID = 'live1';
const rows = [
  { ts: '2026-11-12T03:50:04.548Z', kind: 'SETUP', strategyId: SID, event: 'SIGNAL', symbol: 'HINDCOPPER', side: 'SHORT', candle: { t: 1794455100000 } },
  { ts: '2026-11-12T03:50:06.900Z', kind: 'SETUP', strategyId: SID, event: 'ENTRY_TIMING', symbol: 'HINDCOPPER', sentMs: 182, seenMs: 391, viaPush: true },
  { ts: '2026-11-12T03:50:07.481Z', kind: 'ENTRY', strategyId: SID, symbol: 'HINDCOPPER', side: 'SHORT', entry: 456.4807692307692, qty: 91 },
  { ts: '2026-11-12T03:50:07.845Z', kind: 'SETUP', strategyId: SID, event: 'ENTRY_QUOTE', symbol: 'HINDCOPPER', costPct: 0.0917, spreadPct: 0.0547 },
  { ts: '2026-11-12T03:51:50.291Z', kind: 'EXIT', strategyId: SID, symbol: 'HINDCOPPER', side: 'SHORT', reason: 'BROKER_SL', entry: 456.48, exit: 462, qty: 91, pnl: -502.25 },
  { ts: '2026-11-12T03:50:30.000Z', kind: 'SCAN', strategyId: SID, event: 'QUOTE_CANDLE_CHECK', compared: 12, sameDecision: 11 },
  { ts: '2026-11-12T03:50:07.481Z', kind: 'ENTRY', strategyId: 'someone-else', symbol: 'XYZ', side: 'LONG', entry: 10, qty: 1 },
];

describe('daily summary', () => {
  it('reports the trade, its speed, its cost and the live total', () => {
    const text = buildDailySummary('2026-11-12', rows, [{ id: SID, name: 'In-play Fade', isPaper: false }]);
    expect(text).toContain('Day summary');
    expect(text).toContain('Thu, 12 Nov 2026');
    expect(text).toContain('HINDCOPPER SHORT 91 @ ₹456.48 → ₹462.00 stop: −₹502.25');
    expect(text).toContain('candle close → fill 7.5 s');
    expect(text).toContain('order accepted 182 ms, fill seen 391 ms (websocket)');
    expect(text).toContain('entry cost 0.092% (spread 0.055%)');
    expect(text).toContain('same decision for 11/12 stocks');
    expect(text).toContain('Live: 1 trade(s), 0W/1L, −₹502.25 gross (before charges)');
    expect(text).not.toContain('XYZ'); // a strategy not in the list is left out
  });

  it('says so when a strategy ran without trading, or nothing ran', () => {
    expect(buildDailySummary('2026-11-12', [], [{ id: SID, name: 'In-play Fade', isPaper: false }])).toContain('No trade today.');
    expect(buildDailySummary('2026-11-12', [], [])).toContain('No strategy ran today.');
  });

  it('flags an entry with no exit', () => {
    const text = buildDailySummary('2026-11-12', rows.filter((r) => r.kind !== 'EXIT'), [{ id: SID, name: 'Fade', isPaper: false }]);
    expect(text).toContain('no exit recorded, check Kite');
  });

  it('keeps paper trades out of the live total', () => {
    const text = buildDailySummary('2026-11-12', rows, [{ id: SID, name: 'Fade', isPaper: true }]);
    expect(text).toContain('Fade (paper)');
    expect(text).not.toContain('Live:');
  });

  it('reads a day file and skips broken lines', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'summary-'));
    fs.writeFileSync(path.join(dir, '2026-11-12.jsonl'), `${JSON.stringify(rows[2])}\n{"half":\n${JSON.stringify(rows[4])}\n`);
    expect(readSignalRows('2026-11-12', dir)).toHaveLength(2);
    expect(readSignalRows('2026-11-13', dir)).toEqual([]);
  });
});
