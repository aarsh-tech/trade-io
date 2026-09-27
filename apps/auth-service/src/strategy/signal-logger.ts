import * as fs from 'fs';
import * as path from 'path';

/**
 * Append-only JSONL forward-data log (one file per IST day) so real scanner snapshots, setups and trade outcomes
 * can be compared with backtests and used to train/validate models later. Never throws — logging must not affect trading.
 * Location: <cwd>/logs/strategy-signals/YYYY-MM-DD.jsonl (override with SIGNAL_LOG_DIR).
 */
export function logSignal(kind: 'SCAN' | 'SETUP' | 'ENTRY' | 'EXIT', strategyId: string, payload: Record<string, any>): void {
  try {
    const now = new Date();
    const ist = new Date(now.getTime() + 330 * 60000 + now.getTimezoneOffset() * 60000);
    const day = ist.toISOString().split('T')[0];
    const dir = process.env.SIGNAL_LOG_DIR || path.join(process.cwd(), 'logs', 'strategy-signals');
    fs.mkdirSync(dir, { recursive: true });
    const line = JSON.stringify({ ts: now.toISOString(), kind, strategyId, ...payload }) + '\n';
    fs.appendFile(path.join(dir, `${day}.jsonl`), line, () => { /* best effort */ });
  } catch { /* never break trading for logging */ }
}
