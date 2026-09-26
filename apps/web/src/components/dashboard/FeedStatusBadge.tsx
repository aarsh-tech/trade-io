"use client";

import { cn } from "@/lib/utils";
import type { FeedStatus } from "@/hooks/useDashboard";

const LABEL = { connected: "Live", stale: "Delayed", closed: "Market closed" } as const;

const TONE = {
  connected: "bg-profit/10 text-profit border-profit/25",
  stale: "bg-warn/10 text-warn border-warn/30",
  closed: "bg-card text-muted-foreground border-border",
} as const;

const DOT = { connected: "bg-profit", stale: "bg-warn animate-pulse", closed: "bg-muted-foreground" } as const;

function clock(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false });
}

/** Market feed health. "Delayed" means the websocket is silent and prices are REST snapshots. */
export function FeedStatusBadge({ feed }: { feed: FeedStatus }) {
  const at = clock(feed.lastExchangeTs);
  return (
    <span
      role="status"
      title={at ? `Last exchange update ${at} IST` : undefined}
      className={cn("inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border text-xs font-medium", TONE[feed.status])}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", DOT[feed.status])} />
      {LABEL[feed.status]}
      {feed.status !== "closed" && at ? <span className="tabular-nums opacity-70">{at}</span> : null}
    </span>
  );
}
