/**
 * The one place numbers are formatted for display. Indian digit grouping (1,23,456.78), fixed decimals so
 * columns line up, and "—" for missing values. Pair with the `tabular-nums` class (or `.num`) in the UI.
 */

const cache = new Map<string, Intl.NumberFormat>();

function nf(decimals: number): Intl.NumberFormat {
  const key = String(decimals);
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    cache.set(key, f);
  }
  return f;
}

export const EMPTY = "—";

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export interface FormatOptions {
  /** Decimal places (default 2 for money/percent, 0 for quantities). */
  decimals?: number;
  /** Always show "+" for positive values (use for P&L and changes). */
  signed?: boolean;
}

function withSign(formatted: string, value: number, signed?: boolean): string {
  if (signed && value > 0) return `+${formatted}`;
  return formatted;
}

/** ₹1,23,456.78 — negatives render as -₹1,234.00 (sign before the symbol). */
export function formatINR(value: number | null | undefined, opts: FormatOptions = {}): string {
  if (!finite(value)) return EMPTY;
  const { decimals = 2, signed } = opts;
  const body = nf(decimals).format(Math.abs(value));
  const sign = value < 0 && Number(body.replace(/[^0-9]/g, "")) !== 0 ? "-" : signed && value > 0 ? "+" : "";
  return `${sign}₹${body}`;
}

/** Plain grouped number without a currency symbol (prices, index levels). */
export function formatPrice(value: number | null | undefined, opts: FormatOptions = {}): string {
  if (!finite(value)) return EMPTY;
  const { decimals = 2, signed } = opts;
  return withSign(nf(decimals).format(value), value, signed);
}

/** +1.23% / -0.45% (percent value, not a fraction). Sign shown for positives by default. */
export function formatPct(value: number | null | undefined, opts: FormatOptions = {}): string {
  if (!finite(value)) return EMPTY;
  const { decimals = 2, signed = true } = opts;
  return `${withSign(nf(decimals).format(value), value, signed)}%`;
}

/** Whole quantities / lots: 1,20,000. */
export function formatQty(value: number | null | undefined): string {
  if (!finite(value)) return EMPTY;
  return nf(0).format(value);
}

/** 1.2 L / 3.4 Cr style compaction for large rupee figures in tight spaces. */
export function formatCompactINR(value: number | null | undefined): string {
  if (!finite(value)) return EMPTY;
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e7) return `${sign}₹${nf(2).format(abs / 1e7)} Cr`;
  if (abs >= 1e5) return `${sign}₹${nf(2).format(abs / 1e5)} L`;
  return formatINR(value, { decimals: 0 });
}

/** "profit" | "loss" | "flat" — drives the semantic colour classes (never colour alone: also show the sign). */
export function pnlTone(value: number | null | undefined): "profit" | "loss" | "flat" {
  if (!finite(value) || value === 0) return "flat";
  return value > 0 ? "profit" : "loss";
}

export const PNL_TEXT_CLASS = {
  profit: "text-profit",
  loss: "text-loss",
  flat: "text-muted-foreground",
} as const;

export function pnlClass(value: number | null | undefined): string {
  return PNL_TEXT_CLASS[pnlTone(value)];
}
