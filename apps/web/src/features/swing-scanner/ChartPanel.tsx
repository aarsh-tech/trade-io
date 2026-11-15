"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import { Loader2 } from "lucide-react";
import type { SwingChartData } from "@/lib/api";
import { cn } from "@/lib/utils";
import { dailyStats, fmtVolume, toWeekly, type Bars } from "./chart-math";
import { loadChart, type ChartSetup } from "./chart-data";
import { patternMeta } from "./types";
import type { MaLine } from "./StockChart";

const StockChart = dynamic(() => import("./StockChart"), {
  ssr: false,
  loading: () => <ChartPlaceholder text="Loading chart…" />,
});

const MA_OPTIONS: MaLine[] = [
  { period: 10, token: "warn" },
  { period: 20, token: "info" },
  { period: 50, token: "foreground" },
  { period: 200, token: "muted-foreground" },
];
const PREFS_KEY = "swing-chart-prefs";
interface Prefs {
  tf: "D" | "W";
  mas: number[];
  levels: boolean;
}
const DEFAULT_PREFS: Prefs = { tf: "D", mas: [10, 20, 50, 200], levels: true };

function readPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

export const fmtPrice = (n: number) => (n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const signed = (n: number | null | undefined, digits = 1) =>
  n === null || n === undefined || !Number.isFinite(n) ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;

interface Props {
  setup: ChartSetup;
  /** The scan's scannedAt: part of the cache key, so a new scan refetches. */
  version: string | null;
  /** Left of the symbol (e.g. a back button on phones). */
  leading?: ReactNode;
  /** Right end of the toolbar (e.g. prev/next, open in new window). */
  trailing?: ReactNode;
  /** Right end of the footer (e.g. the Buy button). */
  action?: ReactNode;
}

/** Header + chart + levels footer for one stock. Fills its parent's height. */
export function ChartPanel({ setup, version, leading, trailing, action }: Props) {
  const { resolvedTheme } = useTheme();
  // Only rendered client side (chart view / chart page), so reading storage in the initialiser is safe.
  const [prefs, setPrefs] = useState<Prefs>(() => (typeof window === "undefined" ? DEFAULT_PREFS : readPrefs()));
  const [data, setData] = useState<SwingChartData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  const updatePrefs = (patch: Partial<Prefs>) =>
    setPrefs((p) => {
      const next = { ...p, ...patch };
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });

  const { symbol } = setup;
  useEffect(() => {
    let alive = true;
    setError(null);
    loadChart(symbol, version)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setHover(null);
      })
      .catch((e) => {
        if (alive) setError(e?.response?.data?.message || e?.message || "Could not load the chart");
      });
    return () => {
      alive = false;
    };
  }, [symbol, version]);

  // The chart keeps showing the previous stock until the next one arrives (no remount, no flicker);
  // levels, base and stats are only drawn once the bars match the current symbol.
  const loaded = data && data.symbol === symbol ? data : null;
  const daily: Bars | null = data?.bars ?? null;
  const bars = useMemo(() => (daily && prefs.tf === "W" ? toWeekly(daily) : daily), [daily, prefs.tf]);
  const stats = useMemo(() => (loaded ? dailyStats(loaded.bars) : null), [loaded]);
  const mas = useMemo(() => MA_OPTIONS.filter((m) => prefs.mas.includes(m.period)), [prefs.mas]);
  const { pattern, direction, entry, stopLoss, target1, target2 } = setup;
  const levels = useMemo(
    () =>
      prefs.levels && loaded && entry && stopLoss
        ? { entry, stopLoss, target1: target1 ?? 0, target2: target2 ?? 0 }
        : null,
    [prefs.levels, loaded, entry, stopLoss, target1, target2],
  );
  const base = useMemo(() => {
    if (!loaded || !prefs.levels || !pattern) return null;
    return loaded.bases.find((b) => b.pattern === pattern && (!direction || b.direction === direction)) ?? null;
  }, [loaded, prefs.levels, pattern, direction]);

  const lastClose = loaded ? loaded.bars.c[loaded.bars.c.length - 1] : 0;
  const price = setup.price ?? lastClose;
  const toEntry = entry && price > 0 ? ((entry - price) / price) * 100 : null;

  // OHLC row: hovered bar, else the latest.
  const bi = bars ? (hover ?? bars.t.length - 1) : -1;
  const bar =
    bars && bi >= 0
      ? { o: bars.o[bi], h: bars.h[bi], l: bars.l[bi], c: bars.c[bi], v: bars.v[bi], prev: bi > 0 ? bars.c[bi - 1] : bars.o[bi] }
      : null;

  return (
    <div className="flex flex-col h-full min-h-0 bg-card">
      {/* Toolbar: stock, setup, timeframe, toggles */}
      <div className="flex items-center justify-between gap-2 flex-wrap px-3 pt-2.5">
        <div className="flex items-center gap-2 min-w-0">
          {leading}
          <h2 className="text-sm font-semibold text-foreground">{symbol}</h2>
          {pattern && <span className={cn("text-[11px]", patternMeta(pattern).color)}>{patternMeta(pattern).label}</span>}
          {direction && (
            <span className={cn("text-[11px] font-semibold", direction === "LONG" ? "text-profit" : "text-loss")}>{direction}</span>
          )}
          {price > 0 && <span className="text-xs font-mono font-semibold text-foreground">₹{fmtPrice(price)}</span>}
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          <Segment value={prefs.tf} options={["D", "W"]} onChange={(tf) => updatePrefs({ tf: tf as Prefs["tf"] })} />
          <span className="w-px h-4 bg-border mx-1" />
          {MA_OPTIONS.map((m) => {
            const on = prefs.mas.includes(m.period);
            return (
              <button
                key={m.period}
                onClick={() =>
                  updatePrefs({ mas: on ? prefs.mas.filter((x) => x !== m.period) : [...prefs.mas, m.period].sort((a, b) => a - b) })
                }
                className={cn(
                  "text-[10.5px] font-semibold px-1.5 py-0.5 rounded border transition-colors",
                  on ? "border-border text-foreground" : "border-transparent text-muted-foreground/60 line-through",
                )}
                title={`${on ? "Hide" : "Show"} ${m.period}-period SMA`}
              >
                <span style={{ color: on ? `hsl(var(--${m.token}))` : undefined }}>SMA {m.period}</span>
              </button>
            );
          })}
          {entry ? (
            <button
              onClick={() => updatePrefs({ levels: !prefs.levels })}
              className={cn(
                "text-[10.5px] font-semibold px-1.5 py-0.5 rounded border transition-colors",
                prefs.levels ? "border-border text-foreground" : "border-transparent text-muted-foreground/60 line-through",
              )}
              title="Show entry, stop-loss, targets and the base"
            >
              Levels
            </button>
          ) : null}
          {trailing}
        </div>
      </div>

      {/* Bar values and stats */}
      <div className="flex items-center gap-x-3 gap-y-0.5 flex-wrap px-3 pt-1 pb-1.5 text-[11px] text-muted-foreground font-mono">
        {bar && (
          <span>
            O <b className="text-foreground font-medium">{fmtPrice(bar.o)}</b> H <b className="text-foreground font-medium">{fmtPrice(bar.h)}</b> L{" "}
            <b className="text-foreground font-medium">{fmtPrice(bar.l)}</b> C <b className="text-foreground font-medium">{fmtPrice(bar.c)}</b>{" "}
            <span className={bar.c >= bar.prev ? "text-profit" : "text-loss"}>{signed(bar.prev > 0 ? (bar.c / bar.prev - 1) * 100 : null, 2)}</span>
            <span className="ml-2">Vol {fmtVolume(bar.v)}</span>
          </span>
        )}
        {stats && (
          <>
            <span>1M <span className={(stats.change1M ?? 0) >= 0 ? "text-profit" : "text-loss"}>{signed(stats.change1M)}</span></span>
            <span>3M <span className={(stats.change3M ?? 0) >= 0 ? "text-profit" : "text-loss"}>{signed(stats.change3M)}</span></span>
            <span title="Relative strength vs the scanned universe (1–99), weighted to the last 3 months">
              RS <b className="text-foreground font-medium">{loaded?.rsRating ?? "—"}</b>
            </span>
            <span title="Today's volume vs the 20-day average">
              Avg20 {fmtVolume(stats.avgVol20)} · RVol <b className="text-foreground font-medium">{stats.rvol === null ? "—" : `${stats.rvol.toFixed(0)}%`}</b>
            </span>
          </>
        )}
        {toEntry !== null && (
          <span title="Distance from the scan price to the entry trigger">
            To entry <b className="text-foreground font-medium">{signed(toEntry)}</b>
          </span>
        )}
      </div>

      {/* Chart */}
      <div className="relative flex-1 min-h-0 border-t border-border">
        {error ? (
          <ChartPlaceholder text={error} />
        ) : bars && data ? (
          <>
            <StockChart
              bars={bars}
              weekly={prefs.tf === "W"}
              levels={levels}
              base={base}
              mas={mas}
              fitKey={`${data.symbol}-${prefs.tf}`}
              theme={resolvedTheme}
              onHover={setHover}
            />
            {!loaded && <Loader2 className="absolute top-2 left-2 h-4 w-4 animate-spin text-muted-foreground" aria-label="Loading chart" />}
          </>
        ) : (
          <ChartPlaceholder text="Loading chart…" />
        )}
      </div>

      {/* Levels + action */}
      {(entry || action) && (
        <div className="flex items-center justify-between gap-2 flex-wrap px-3 py-2 border-t border-border text-[11px]">
          <div className="flex items-center gap-3 font-mono">
            {entry ? <span className="text-muted-foreground">Entry <b className="text-foreground">₹{fmtPrice(entry)}</b></span> : null}
            {stopLoss ? <span className="text-muted-foreground">SL <b className="text-loss">₹{fmtPrice(stopLoss)}</b></span> : null}
            {target1 ? <span className="text-muted-foreground">T1 <b className="text-profit">₹{fmtPrice(target1)}</b></span> : null}
            {target2 ? <span className="text-muted-foreground hidden sm:inline">T2 <b className="text-profit">₹{fmtPrice(target2)}</b></span> : null}
            {setup.riskPct ? (
              <span className="text-muted-foreground hidden sm:inline">Risk <b className="text-foreground">{setup.riskPct.toFixed(1)}%</b></span>
            ) : null}
          </div>
          {action}
        </div>
      )}
    </div>
  );
}

function Segment({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-0.5 p-0.5 rounded-md bg-muted/50 border border-border/80">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className={cn(
            "text-[11px] font-semibold px-2 py-0.5 rounded transition-colors",
            value === o ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

function ChartPlaceholder({ text }: { text: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center gap-2 text-xs text-muted-foreground px-6 text-center">
      {text.startsWith("Loading") && <Loader2 className="h-4 w-4 animate-spin" />}
      {text}
    </div>
  );
}
