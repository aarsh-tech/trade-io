"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ChartPanel, fmtPrice } from "./ChartPanel";
import { chartHref, loadChart, setupFromResult } from "./chart-data";
import { getDirection, patternMeta, resultKey, type ScanResult } from "./types";

interface Props {
  results: ScanResult[];
  scannedAt: string | null;
  onTrade: (r: ScanResult) => void;
}

/**
 * Split view: setups on the left, chart on the right; ↑/↓ moves through the list.
 * No live-price socket here: prices are the scan snapshot (the order window subscribes to its one stock while open).
 */
export function SwingChartView({ results, scannedAt, onTrade }: Props) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // Keep a valid selection when the filter/search changes.
  const index = Math.max(0, results.findIndex((r) => resultKey(r) === selectedKey));
  const selected = results[index] ?? null;
  useEffect(() => {
    if (results.length && (!selectedKey || !results.some((r) => resultKey(r) === selectedKey))) {
      setSelectedKey(resultKey(results[0]));
    }
  }, [results, selectedKey]);

  const select = useCallback(
    (i: number) => {
      const r = results[Math.max(0, Math.min(results.length - 1, i))];
      if (r) setSelectedKey(resultKey(r));
    },
    [results],
  );

  // Once the selected stock has loaded, warm its neighbours so ↑/↓ is instant (same cache the panel reads).
  const symbol = selected?.symbol ?? null;
  useEffect(() => {
    if (!symbol) return;
    let alive = true;
    loadChart(symbol, scannedAt)
      .then(() => {
        if (!alive) return;
        for (const j of [index + 1, index - 1, index + 2]) {
          const n = results[j]?.symbol;
          if (n && n !== symbol) loadChart(n, scannedAt).catch(() => {});
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // index/results only steer which neighbours are warmed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, scannedAt]);

  // ↑/↓ moves through the list (not while typing in an input).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      e.preventDefault();
      select(index + (e.key === "ArrowDown" ? 1 : -1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, select]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-row="${index}"]`)?.scrollIntoView({ block: "nearest" });
  }, [index]);

  const setup = useMemo(() => (selected ? setupFromResult(selected) : null), [selected]);

  if (!results.length) return null;
  const direction = selected ? getDirection(selected) : "LONG";

  return (
    <div className="flex border border-border rounded bg-card overflow-hidden h-[calc(100dvh-200px)] min-h-[520px]">
      {/* ── Results list ── */}
      <div ref={listRef} className="w-full lg:w-72 xl:w-80 shrink-0 overflow-y-auto border-r border-border" role="listbox" aria-label="Setups">
        {results.map((r, i) => {
          const dir = getDirection(r);
          const active = i === index;
          return (
            <button
              key={resultKey(r)}
              data-row={i}
              role="option"
              aria-selected={active}
              onClick={() => {
                select(i);
                setMobileOpen(true);
              }}
              className={cn(
                "w-full flex items-center justify-between gap-2 px-3 py-2 border-b border-border/60 text-left transition-colors [content-visibility:auto] [contain-intrinsic-size:auto_46px]",
                active ? "bg-accent" : "hover:bg-muted/50",
              )}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-foreground truncate">{r.symbol}</span>
                  <span className={cn("text-[10px] font-semibold", dir === "LONG" ? "text-profit" : "text-loss")}>
                    {dir === "LONG" ? "L" : "S"}
                  </span>
                </div>
                <span className={cn("text-[10.5px]", patternMeta(r.pattern).color)}>{patternMeta(r.pattern).label}</span>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs font-mono font-semibold text-foreground">{fmtPrice(r.currentPrice)}</div>
                <div className="text-[10px] text-muted-foreground">Score {r.score}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Chart pane (full screen on phones) ── */}
      <div className={cn("flex-col min-w-0 flex-1", mobileOpen ? "flex fixed inset-0 z-[60] lg:static lg:z-auto" : "hidden lg:flex")}>
        {selected && setup && (
          <ChartPanel
            setup={setup}
            version={scannedAt}
            leading={
              <Button variant="ghost" size="icon" aria-label="Back to list" className="lg:hidden h-8 w-8 -ml-1" onClick={() => setMobileOpen(false)}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
            }
            trailing={
              <>
                <div className="lg:hidden flex items-center ml-1">
                  <Button variant="ghost" size="icon" aria-label="Previous stock" className="h-8 w-8" onClick={() => select(index - 1)} disabled={index === 0}>
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Next stock"
                    className="h-8 w-8"
                    onClick={() => select(index + 1)}
                    disabled={index >= results.length - 1}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </div>
                <a
                  href={chartHref(selected, scannedAt)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open ${selected.symbol} chart in a new window`}
                  title="Open chart in a new window"
                  className="ml-1 inline-flex h-7 w-7 items-center justify-center rounded border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </>
            }
            action={
              <Button
                onClick={() => onTrade(selected)}
                className={cn(
                  "h-8 px-4 text-xs font-medium rounded-sm",
                  direction === "LONG" ? "bg-profit hover:bg-profit/90 text-on-profit" : "bg-loss hover:bg-loss/90 text-on-loss",
                )}
              >
                {direction === "LONG" ? "Buy" : "Short"} {selected.symbol}
              </Button>
            }
          />
        )}
      </div>
    </div>
  );
}
