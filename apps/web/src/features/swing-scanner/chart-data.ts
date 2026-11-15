import { swingApi, type SwingChartData } from "@/lib/api";
import { getDirection, type ScanResult } from "./types";

// One request per stock per scan, shared by the split view, its prefetch and re-renders.
const MAX_CACHED = 80;
const chartCache = new Map<string, Promise<SwingChartData>>();

export function loadChart(symbol: string, version: string | null): Promise<SwingChartData> {
  const key = `${symbol}|${version ?? ""}`;
  let p = chartCache.get(key);
  if (!p) {
    p = swingApi.chart(symbol, version);
    p.catch(() => chartCache.delete(key));
    chartCache.set(key, p);
    while (chartCache.size > MAX_CACHED) chartCache.delete(chartCache.keys().next().value as string);
  }
  return p;
}

/** What the chart draws for a stock. Everything but the symbol is optional (a bare /chart/SYMBOL link works too). */
export interface ChartSetup {
  symbol: string;
  pattern?: string;
  direction?: "LONG" | "SHORT";
  entry?: number;
  stopLoss?: number;
  target1?: number;
  target2?: number;
  /** Scan-time price, for the header and "to entry". */
  price?: number;
  riskPct?: number;
}

export function setupFromResult(r: ScanResult): ChartSetup {
  return {
    symbol: r.symbol,
    pattern: r.pattern,
    direction: getDirection(r),
    entry: r.entryPrice,
    stopLoss: r.stopLoss,
    target1: r.target1,
    target2: r.target2,
    price: r.currentPrice,
    riskPct: r.riskPct,
  };
}

/** Full-window chart URL (opened in a new tab, like Kite). Levels ride in the query so the page needs one request. */
export function chartHref(r: ScanResult, version: string | null): string {
  const q = new URLSearchParams({
    p: r.pattern,
    d: getDirection(r),
    e: String(r.entryPrice),
    sl: String(r.stopLoss),
    t1: String(r.target1),
    t2: String(r.target2),
    px: String(r.currentPrice),
    rk: String(r.riskPct),
  });
  if (version) q.set("v", version);
  return `/chart/${encodeURIComponent(r.symbol)}?${q}`;
}

export function setupFromQuery(symbol: string, q: URLSearchParams): ChartSetup {
  const num = (k: string) => {
    const v = Number(q.get(k));
    return Number.isFinite(v) && v > 0 ? v : undefined;
  };
  const d = q.get("d");
  return {
    symbol,
    pattern: q.get("p") ?? undefined,
    direction: d === "LONG" || d === "SHORT" ? d : undefined,
    entry: num("e"),
    stopLoss: num("sl"),
    target1: num("t1"),
    target2: num("t2"),
    price: num("px"),
    riskPct: num("rk"),
  };
}
