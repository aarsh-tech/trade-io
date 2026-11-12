import * as fs from 'fs';
import * as path from 'path';

/**
 * End-of-day summary sent to the alert channels (Telegram) after the close: every trade with its result, how fast the
 * entry went out, what the fill cost, and the 09:20 quote-vs-candle check. Built from the day's signal log
 * (logs/strategy-signals/YYYY-MM-DD.jsonl), so it needs no broker call. Gross P&L, before charges.
 */

export interface SummaryStrategy {
  id: string;
  name: string;
  isPaper: boolean;
}

export function signalLogDir(): string {
  return process.env.SIGNAL_LOG_DIR || path.join(process.cwd(), 'logs', 'strategy-signals');
}

/** The day's signal rows; bad lines are skipped and a missing file reads as no rows. */
export function readSignalRows(day: string, dir = signalLogDir()): any[] {
  let text: string;
  try {
    text = fs.readFileSync(path.join(dir, `${day}.jsonl`), 'utf8');
  } catch {
    return [];
  }
  const rows: any[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch { /* a half-written line */ }
  }
  return rows;
}

const EXIT_LABEL: Record<string, string> = {
  SL: 'stop', BROKER_SL: 'stop', TARGET: 'target', TREND: 'EMA crossback', SQUARE_OFF: '15:05 square-off', MANUAL: 'manual exit',
  BROKER_SYNC: 'closed outside the engine', NO_PROTECTION: 'flattened (no stop)', FORCE_CLOSE: 'square-off', PARTIAL_TARGET: 'partial target',
};

const rs = (n: number) => `${n < 0 ? '−' : '+'}₹${Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const px = (n: number) => `₹${Number(n).toFixed(2)}`;
const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

function dayLabel(day: string): string {
  const d = new Date(`${day}T12:00:00+05:30`);
  const part = (o: Intl.DateTimeFormatOptions) => d.toLocaleDateString('en-GB', { ...o, timeZone: 'Asia/Kolkata' });
  return `${part({ weekday: 'short' })}, ${part({ day: 'numeric' })} ${part({ month: 'short' })} ${part({ year: 'numeric' })}`;
}

/**
 * The summary text. `strategies` are the ones that ran today (a strategy with no rows is reported as "no trade");
 * rows of strategies not in the list are ignored.
 */
export function buildDailySummary(day: string, rows: any[], strategies: SummaryStrategy[]): string {
  const lines: string[] = [`📊 Day summary — ${dayLabel(day)}`];
  let liveTotal = 0;
  let liveTrades = 0;
  let liveWins = 0;
  let liveLosses = 0;
  if (strategies.length === 0) lines.push('', 'No strategy ran today.');

  for (const s of strategies) {
    const mine = rows.filter((r) => r.strategyId === s.id);
    const entries = mine.filter((r) => r.kind === 'ENTRY');
    const exits = mine.filter((r) => r.kind === 'EXIT');
    lines.push('', `${s.name}${s.isPaper ? ' (paper)' : ''}`);
    if (entries.length === 0 && exits.length === 0) {
      lines.push('• No trade today.');
    }
    const usedExits = new Set<any>();
    let total = 0;
    for (const e of entries) {
      const x = exits.find((r) => !usedExits.has(r) && r.symbol === e.symbol && r.ts >= e.ts);
      if (x) usedExits.add(x);
      const head = `• ${e.symbol} ${e.side} ${e.qty} @ ${px(e.entry)}`;
      if (x) {
        const pnl = Number(x.pnl) || 0;
        total += pnl;
        if (!s.isPaper) {
          liveTrades++;
          if (pnl > 0) liveWins++;
          else if (pnl < 0) liveLosses++;
        }
        lines.push(`${head} → ${px(x.exit)} ${EXIT_LABEL[x.reason] ?? x.reason}: ${rs(pnl)}`);
      } else {
        lines.push(`${head} — ⚠ no exit recorded, check Kite`);
        if (!s.isPaper) liveTrades++;
      }
      // Speed and cost of the entry (Stocks-in-Play rows), when recorded.
      const detail: string[] = [];
      const sig = mine.filter((r) => r.event === 'SIGNAL' && r.symbol === e.symbol && r.ts <= e.ts && r.candle?.t).pop();
      if (sig) detail.push(`candle close → fill ${secs(new Date(e.ts).getTime() - (Number(sig.candle.t) + 5 * 60_000))}`);
      const timing = mine.filter((r) => r.event === 'ENTRY_TIMING' && r.symbol === e.symbol && r.ts <= e.ts).pop();
      if (timing) detail.push(`order accepted ${timing.sentMs} ms, fill seen ${timing.seenMs} ms${timing.viaPush ? ' (websocket)' : ''}`);
      const quote = mine.find((r) => r.event === 'ENTRY_QUOTE' && r.symbol === e.symbol && r.ts >= e.ts);
      if (quote && Number.isFinite(quote.costPct)) detail.push(`entry cost ${Number(quote.costPct).toFixed(3)}%${Number.isFinite(quote.spreadPct) ? ` (spread ${Number(quote.spreadPct).toFixed(3)}%)` : ''}`);
      if (detail.length > 0) lines.push(`  ${detail.join(' · ')}`);
    }
    // Exits without an entry today (a position carried over a restart).
    for (const x of exits) {
      if (usedExits.has(x)) continue;
      const pnl = Number(x.pnl) || 0;
      total += pnl;
      if (!s.isPaper) {
        liveTrades++;
        if (pnl > 0) liveWins++;
        else if (pnl < 0) liveLosses++;
      }
      lines.push(`• ${x.symbol} ${x.side} closed @ ${px(x.exit)} ${EXIT_LABEL[x.reason] ?? x.reason}: ${rs(pnl)}`);
    }
    if (entries.length + exits.length > 0) lines.push(`  Total ${rs(total)} gross`);
    if (!s.isPaper) liveTotal += total;

    const check = mine.filter((r) => r.event === 'QUOTE_CANDLE_CHECK').pop();
    if (check && check.compared > 0) {
      lines.push(`  09:20 quote-candle check: same decision for ${check.sameDecision}/${check.compared} stocks (log only)`);
    }
  }

  if (strategies.some((s) => !s.isPaper)) {
    lines.push('', `Live: ${liveTrades} trade(s), ${liveWins}W/${liveLosses}L, ${rs(liveTotal)} gross (before charges)`);
  }
  return lines.join('\n');
}
