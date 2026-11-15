"use client";

// Loaded with next/dynamic only when the chart view opens, so lightweight-charts never lands in the scanner's first load.
import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type LineData,
  type UTCTimestamp,
} from "lightweight-charts";
import { firstBarFrom, sma, type Bars } from "./chart-math";

export interface ChartLevels {
  entry: number;
  stopLoss: number;
  target1: number;
  target2: number;
}

/** Colours are theme token names from globals.css (`--warn`, `--info`, …). */
export interface MaLine {
  period: number;
  token: string;
}

interface Props {
  bars: Bars;
  weekly: boolean;
  levels: ChartLevels | null;
  base: { from: number; high: number; low: number } | null;
  mas: MaLine[];
  /** Changes when the stock or timeframe changes: the view then jumps to the latest bars. */
  fitKey: string;
  /** Re-reads the colour tokens when the light/dark theme flips. */
  theme: string | undefined;
  onHover: (index: number | null) => void;
}

const MA_SLOTS = 4;
const VISIBLE_DAILY = 130;
const VISIBLE_WEEKLY = 90;

let colorCtx: CanvasRenderingContext2D | null = null;
/** CSS token (HSL triplet) → a colour string lightweight-charts can parse (#rrggbb or rgba()). */
function tokenColor(token: string, alpha?: number): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(`--${token}`).trim();
  colorCtx ??= document.createElement("canvas").getContext("2d");
  if (!colorCtx || !raw) return "#888888";
  colorCtx.fillStyle = "#888888";
  colorCtx.fillStyle = alpha === undefined ? `hsl(${raw})` : `hsl(${raw} / ${alpha})`;
  return String(colorCtx.fillStyle);
}

interface Handles {
  chart: IChartApi;
  candles: ISeriesApi<"Candlestick">;
  volume: ISeriesApi<"Histogram">;
  volAvg: ISeriesApi<"Line">;
  mas: ISeriesApi<"Line">[];
  baseTop: ISeriesApi<"Line">;
  baseBottom: ISeriesApi<"Line">;
  lines: IPriceLine[];
}

const quiet = { lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false } as const;

export default function StockChart({ bars, weekly, levels, base, mas, fitKey, theme, onHover }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const h = useRef<Handles | null>(null);
  const hoverRef = useRef(onHover);
  useEffect(() => {
    hoverRef.current = onHover;
  }, [onHover]);
  const timesRef = useRef<Map<number, number>>(new Map());

  // Create once.
  useEffect(() => {
    if (!el.current) return;
    const chart = createChart(el.current, {
      autoSize: true,
      crosshair: { mode: CrosshairMode.Normal },
      timeScale: { rightOffset: 4, minBarSpacing: 1.5 },
      rightPriceScale: { scaleMargins: { top: 0.08, bottom: 0.05 } },
    });
    const candles = chart.addSeries(CandlestickSeries, { borderVisible: false });
    const mas = Array.from({ length: MA_SLOTS }, () => chart.addSeries(LineSeries, { lineWidth: 1, ...quiet }));
    const baseTop = chart.addSeries(LineSeries, { lineWidth: 2, ...quiet });
    const baseBottom = chart.addSeries(LineSeries, { lineWidth: 1, lineStyle: LineStyle.Dashed, ...quiet });
    const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, ...quiet }, 1);
    const volAvg = chart.addSeries(LineSeries, { lineWidth: 1, priceFormat: { type: "volume" }, ...quiet }, 1);
    chart.panes()[0]?.setStretchFactor(3);
    chart.panes()[1]?.setStretchFactor(1);

    chart.subscribeCrosshairMove((p) => {
      const i = p.time === undefined ? undefined : timesRef.current.get(p.time as number);
      hoverRef.current(i ?? null);
    });

    h.current = { chart, candles, volume, volAvg, mas, baseTop, baseBottom, lines: [] };
    return () => {
      h.current = null;
      chart.remove();
    };
  }, []);

  // Theme colours.
  useEffect(() => {
    const x = h.current;
    if (!x) return;
    const border = tokenColor("border");
    x.chart.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: tokenColor("card") },
        textColor: tokenColor("muted-foreground"),
        fontSize: 11,
        fontFamily: getComputedStyle(document.body).fontFamily,
        panes: { separatorColor: border, separatorHoverColor: tokenColor("muted", 0.6) },
      },
      grid: { vertLines: { color: tokenColor("line-subtle", 0.6) }, horzLines: { color: tokenColor("line-subtle", 0.6) } },
      rightPriceScale: { borderColor: border },
      timeScale: { borderColor: border },
      crosshair: {
        vertLine: { color: tokenColor("muted-foreground", 0.5), labelBackgroundColor: tokenColor("foreground") },
        horzLine: { color: tokenColor("muted-foreground", 0.5), labelBackgroundColor: tokenColor("foreground") },
      },
    });
    const up = tokenColor("profit");
    const down = tokenColor("loss");
    x.candles.applyOptions({ upColor: up, downColor: down, wickUpColor: up, wickDownColor: down });
    x.baseTop.applyOptions({ color: tokenColor("info") });
    x.baseBottom.applyOptions({ color: tokenColor("info", 0.7) });
    x.volAvg.applyOptions({ color: tokenColor("warn", 0.9) });
  }, [theme]);

  // Bars, volume and moving averages.
  useEffect(() => {
    const x = h.current;
    if (!x) return;
    const time = (i: number) => bars.t[i] as UTCTimestamp;
    timesRef.current = new Map(bars.t.map((t, i) => [t, i]));

    x.candles.setData(bars.t.map((_, i) => ({ time: time(i), open: bars.o[i], high: bars.h[i], low: bars.l[i], close: bars.c[i] })));

    const upVol = tokenColor("profit", 0.45);
    const downVol = tokenColor("loss", 0.45);
    x.volume.setData(bars.t.map((_, i) => ({ time: time(i), value: bars.v[i], color: bars.c[i] >= bars.o[i] ? upVol : downVol })));
    x.volAvg.setData(toLine(bars.t, sma(bars.v, 20)));

    x.mas.forEach((series, slot) => {
      const ma = mas[slot];
      if (!ma) {
        series.setData([]);
        return;
      }
      series.applyOptions({ color: tokenColor(ma.token, 0.9) });
      series.setData(toLine(bars.t, sma(bars.c, ma.period)));
    });
  }, [bars, mas, theme]);

  // Setup levels and the base range.
  useEffect(() => {
    const x = h.current;
    if (!x) return;
    x.lines.forEach((l) => x.candles.removePriceLine(l));
    x.lines = [];
    if (levels) {
      const add = (price: number, token: string, title: string, style: LineStyle) => {
        if (!(price > 0)) return;
        x.lines.push(
          x.candles.createPriceLine({ price, color: tokenColor(token), lineWidth: 1, lineStyle: style, axisLabelVisible: true, title }),
        );
      };
      add(levels.entry, "info", "Entry", LineStyle.Dashed);
      add(levels.stopLoss, "loss", "SL", LineStyle.Dashed);
      add(levels.target1, "profit", "T1", LineStyle.Dotted);
      add(levels.target2, "profit", "T2", LineStyle.Dotted);
    }
    if (base && bars.t.length) {
      const start = firstBarFrom(bars.t, base.from, weekly);
      const span = bars.t.slice(start);
      x.baseTop.setData(span.map((t) => ({ time: t as UTCTimestamp, value: base.high })));
      x.baseBottom.setData(span.map((t) => ({ time: t as UTCTimestamp, value: base.low })));
    } else {
      x.baseTop.setData([]);
      x.baseBottom.setData([]);
    }
  }, [levels, base, bars, weekly, theme]);

  // Jump to the latest bars when the stock or timeframe changes.
  useEffect(() => {
    const x = h.current;
    if (!x || !bars.t.length) return;
    const n = bars.t.length;
    const show = weekly ? VISIBLE_WEEKLY : VISIBLE_DAILY;
    x.chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - show), to: n + 3 });
    // Only on fitKey: re-running on every data refresh would undo the user's scroll/zoom.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  return <div ref={el} className="h-full w-full" />;
}

function toLine(t: number[], values: (number | null)[]): LineData<UTCTimestamp>[] {
  const out: LineData<UTCTimestamp>[] = [];
  for (let i = 0; i < t.length; i++) {
    const v = values[i];
    if (v !== null) out.push({ time: t[i] as UTCTimestamp, value: v });
  }
  return out;
}
