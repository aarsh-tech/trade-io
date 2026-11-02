import { normalizeSymbol } from './broker-position-guard';

/**
 * One stock, one strategy. Zerodha nets every position in a symbol per account, and each engine's exit safety checks
 * (flat at the broker, orphan qty, "already squared off") read that net quantity. If the Stock Picker and the
 * In-play Fade both held the same stock, each would misread the other's shares — e.g. a fade short 83 + picker
 * long 40 shows as -43, and the picker's exit guard would think its long was already closed.
 *
 * Each LIVE engine registers a `holds(symbol)` view of its own state; before entering, an engine asks whether any
 * other live strategy on the same broker account holds or is entering that stock, and skips it if so.
 * Paper strategies never touch the broker, so they do not register.
 */
interface Holder {
  brokerAccountId: string;
  label: string;
  holds: (symbol: string) => boolean;
}

const holders = new Map<string, Holder>();

export function registerSymbolHolder(strategyId: string, brokerAccountId: string, label: string, holds: (symbol: string) => boolean): void {
  holders.set(strategyId, { brokerAccountId, label, holds });
}

export function unregisterSymbolHolder(strategyId: string): void {
  holders.delete(strategyId);
}

/** The label of another live strategy on this account that holds (or is entering) `symbol`, else null. */
export function symbolHeldByOther(strategyId: string, brokerAccountId: string, symbol: string): string | null {
  const sym = normalizeSymbol(symbol);
  for (const [id, h] of holders) {
    if (id === strategyId || h.brokerAccountId !== brokerAccountId) continue;
    try {
      if (h.holds(sym)) return h.label;
    } catch {
      // A broken view must not block entries in other engines.
    }
  }
  return null;
}
