"use client";

import { cn } from "@/lib/utils";
import type { FeedStatus } from "@/hooks/useDashboard";

const LABEL = { connected: "Live", stale: "Delayed", closed: "Market closed" } as const;

const TONE = {
  connected: "bg-emerald-50 text-emerald-700 border-emerald-200",
  stale: "bg-amber-50 text-amber-700 border-amber-200",
  closed: "bg-slate-50 text-slate-500 border-slate-200",
} as const;

const DOT = { connected: "bg-emerald-500", stale: "bg-amber-500 animate-pulse", closed: "bg-slate-400" } as const;

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
      className={cn("inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border text-xs font-medium", TONE[feed.status])}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", DOT[feed.status])} />
      {LABEL[feed.status]}
      {feed.status !== "closed" && at ? <span className="tabular-nums opacity-70">{at}</span> : null}
    </span>
  );
}
