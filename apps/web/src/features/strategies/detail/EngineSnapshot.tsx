"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { EMPTY, formatINR } from "@/lib/format";
import { lastOfKind, parseLogs } from "@/lib/engine-log";
import { cn } from "@/lib/utils";
import type { DetailCtx } from "./useStrategyDetail";

/** Engines name these differently; take the first one that is a positive number. */
function firstPrice(state: any, keys: string[]): number | null {
  for (const k of keys) {
    const n = Number(state?.[k]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function ageLabel(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h ${m % 60}m ago`;
}

const STALE_AFTER_MS = 90_000;

function Item({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className={cn("mt-0.5 text-sm font-semibold text-foreground truncate", tone)}>{value}</div>
    </div>
  );
}

/**
 * At-a-glance engine state above the console: where the engine is in its cycle, the levels it is
 * working with, the last signal, and how fresh the data feeding this page is.
 */
export function EngineSnapshot({ ctx }: { ctx: DetailCtx }) {
  const { strategy, liveState, liveLogs, isWsConnected } = ctx;

  // "Data received" age: bump whenever the logs or state objects are replaced (socket push or poll).
  const [receivedAt, setReceivedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => setReceivedAt(Date.now()), [liveState, liveLogs]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const logs = useMemo(() => parseLogs(liveLogs), [liveLogs]);
  const lastSignal = lastOfKind(logs, "SIGNAL");
  const lastLog = logs[logs.length - 1];

  const entry = firstPrice(liveState, ["entryPrice"]);
  const sl = firstPrice(liveState, ["stopLossPrice", "slPrice", "currentSl", "trailingSl"]);
  const target = firstPrice(liveState, ["targetPrice", "target1Price", "target1"]);
  const inPosition = Boolean(liveState?.entryTriggered) || liveState?.stateType === "ACTIVE_POSITION";

  const age = now - receivedAt;
  const stale = strategy.isActive && age > STALE_AFTER_MS;
  const phase = !strategy.isActive
    ? "Stopped"
    : inPosition
      ? `In position${typeof liveState?.entryTriggered === "string" ? ` (${liveState.entryTriggered})` : ""}`
      : liveState?.isGoalAchieved
        ? "Daily target reached"
        : "Scanning for signals";

  return (
    <Card className="border-border/60 bg-card/60 shadow-xs">
      <CardContent className="p-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-3">
        <Item label="Engine" value={phase} tone={!strategy.isActive ? "text-muted-foreground" : undefined} />
        <Item label="Entry" value={entry ? formatINR(entry) : EMPTY} />
        <Item label="Stop-loss" value={sl ? formatINR(sl) : EMPTY} tone={sl ? "text-loss" : undefined} />
        <Item label="Target" value={target ? formatINR(target) : EMPTY} tone={target ? "text-profit" : undefined} />
        <Item
          label="Last signal"
          value={lastSignal ? <span title={lastSignal.raw}>{lastSignal.text}</span> : EMPTY}
        />
        <Item
          label="Data feed"
          value={
            <span className={cn(stale && "text-warn")}>
              {isWsConnected ? "Live" : "Polling"} · {ageLabel(age)}
              {stale && " (stale)"}
            </span>
          }
        />
        {lastLog?.time && (
          <div className="col-span-full text-[10px] text-muted-foreground">Last engine log: {lastLog.time}</div>
        )}
      </CardContent>
    </Card>
  );
}
