"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowDownToLine, Copy, Download, Search, Terminal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { countByFilter, filterLogs, parseLogs, type LogFilter, type LogKind } from "@/lib/engine-log";
import { cn } from "@/lib/utils";
import type { DetailCtx } from "./useStrategyDetail";

const FILTERS: { id: LogFilter; label: string }[] = [
  { id: "ALL", label: "All" },
  { id: "ORDER", label: "Orders" },
  { id: "SIGNAL", label: "Signals" },
  { id: "ERROR", label: "Errors" },
];

const KIND_STYLE: Record<LogKind, string> = {
  PNL: "text-log-text",
  SIGNAL: "text-log-text",
  ORDER: "text-log-text",
  ERROR: "bg-log-error-row text-log-error -mx-3 px-3",
  WARN: "text-log-text",
  INFO: "text-log-text",
};

/** Tag colours follow the design system's log tokens; the tag text keeps kind readable without colour. */
const KIND_TAG_STYLE: Record<LogKind, string> = {
  PNL: "text-log-pnl",
  SIGNAL: "text-log-signal",
  ORDER: "text-log-order",
  ERROR: "text-log-error",
  WARN: "text-log-warn",
  INFO: "text-log-info",
};

/** Log-line tag so a kind is never conveyed by colour alone. */
const KIND_TAG: Record<LogKind, string> = { PNL: "P&L", SIGNAL: "SIG", ORDER: "ORD", ERROR: "ERR", WARN: "WRN", INFO: "INF" };

const NEAR_BOTTOM_PX = 40;

export function EngineConsole({ ctx }: { ctx: DetailCtx }) {
  const { strategy, liveLogs, setLiveLogs } = ctx;
  const [filter, setFilter] = useState<LogFilter>("ALL");
  const [query, setQuery] = useState("");
  const [following, setFollowing] = useState(true);
  const scroller = useRef<HTMLDivElement>(null);

  const parsed = useMemo(() => parseLogs(liveLogs), [liveLogs]);
  const counts = useMemo(() => countByFilter(parsed), [parsed]);
  const shown = useMemo(() => filterLogs(parsed, filter, query), [parsed, filter, query]);

  // Follow the tail only while the reader is at the bottom; scrolling up pauses it.
  useEffect(() => {
    const el = scroller.current;
    if (el && following) el.scrollTop = el.scrollHeight;
  }, [shown, following]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    setFollowing(el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX);
  };

  const jumpToLatest = () => {
    setFollowing(true);
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  const exportText = () => shown.map((l) => l.raw).join("\n");

  const copy = async () => {
    if (shown.length === 0) return;
    await navigator.clipboard.writeText(exportText());
    toast.success(`Copied ${shown.length} log lines`);
  };

  const download = () => {
    if (shown.length === 0) return;
    const url = URL.createObjectURL(new Blob([exportText()], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${strategy.name.replace(/\W+/g, "_")}-engine-log.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="border-border/60 bg-card overflow-hidden rounded-lg">
      <CardHeader className="p-4 bg-muted/30 border-b border-border/60 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-profit" aria-hidden />
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-foreground">Engine console</CardTitle>
            {strategy.isActive && <span className="inline-flex h-2 w-2 rounded-full bg-profit animate-ping" aria-label="Engine running" />}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant={following ? "secondary" : "ghost"}
              size="sm"
              onClick={() => (following ? setFollowing(false) : jumpToLatest())}
              aria-pressed={following}
              className="gap-1 text-[11px]"
            >
              <ArrowDownToLine className="h-3 w-3" aria-hidden /> Auto-scroll {following ? "on" : "off"}
            </Button>
            <Button variant="ghost" size="sm" onClick={copy} className="px-2 text-[11px] gap-1 text-muted-foreground" aria-label="Copy shown log lines">
              <Copy className="h-3 w-3" aria-hidden /> <span className="hidden sm:inline">Copy</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={download} className="px-2 text-[11px] gap-1 text-muted-foreground" aria-label="Download shown log lines">
              <Download className="h-3 w-3" aria-hidden /> <span className="hidden sm:inline">Download</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setLiveLogs([]);
                toast.success("Console cleared (engine keeps running)");
              }}
              className="px-2 text-[11px] gap-1 text-muted-foreground hover:text-loss"
              aria-label="Clear console"
            >
              <Trash2 className="h-3 w-3" aria-hidden /> <span className="hidden sm:inline">Clear</span>
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Log filter" className="flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                aria-pressed={filter === f.id}
                className={cn(
                  "h-10 md:h-8 px-3 rounded-md text-xs font-semibold border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  filter === f.id ? "bg-accent text-accent-foreground border-primary" : "bg-transparent text-muted-foreground border-border hover:text-foreground hover:bg-muted",
                )}
              >
                {f.label} <span className="num opacity-80">{counts[f.id]}</span>
              </button>
            ))}
          </div>
          <label className="relative ml-auto w-full sm:w-52">
            <span className="sr-only">Search logs</span>
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search logs"
              className="h-10 md:h-8 w-full rounded-md border border-input bg-sunken pl-7 pr-2 text-xs placeholder:text-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
        </div>
      </CardHeader>

      <CardContent className="p-0 relative">
        <div
          ref={scroller}
          onScroll={onScroll}
          role="log"
          aria-live="off"
          aria-label="Engine log"
          tabIndex={0}
          className="h-72 sm:h-80 overflow-y-auto bg-log-bg border-t border-border px-3 py-2 font-code text-xs select-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {shown.length === 0 ? (
            <p className="text-muted-foreground italic py-4 text-sm">
              {parsed.length > 0
                ? "No log lines match this filter."
                : strategy.isActive
                  ? "Engine running. Waiting for market ticks and signals."
                  : "Start the engine to see its log."}
            </p>
          ) : (
            shown.map((l) => (
              <div key={l.index} className={cn("leading-[18px] py-px flex gap-2 items-baseline", KIND_STYLE[l.kind])}>
                <span className={cn("shrink-0 w-9 text-center text-[10px] font-semibold leading-4 border border-current rounded-xs", KIND_TAG_STYLE[l.kind])} aria-hidden>{KIND_TAG[l.kind]}</span>
                {l.time && <span className="shrink-0 text-log-time num">{l.time.split(", ").pop()}</span>}
                <span className="break-words min-w-0">{l.text}</span>
              </div>
            ))
          )}
        </div>
        {!following && shown.length > 0 && (
          <Button
            size="sm"
            onClick={jumpToLatest}
            className="absolute bottom-3 right-4 gap-1 text-[11px] rounded-full shadow-md"
          >
            <ArrowDown className="h-3 w-3" aria-hidden /> Jump to latest
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
