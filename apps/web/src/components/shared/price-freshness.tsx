"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { findTick, useMarketStore } from "@/store/market-store";

function ageLabel(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

/**
 * Small clock icon next to a price when it is not a fresh live tick, so stale numbers never look live.
 * Renders nothing while the feed is healthy and this symbol has a live tick. The icon (not colour alone)
 * carries the state; the tooltip says why and how old the price is.
 *
 * Deliberately silent when the market is closed: the feed status is "closed" then and prices are final.
 */
export function PriceFreshness({ symbol, className }: { symbol: string | null | undefined; className?: string }) {
  const connected = useMarketStore((s) => s.connected);
  const feedStatus = useMarketStore((s) => s.feed.status);
  const tick = useMarketStore((s) => findTick(s, symbol));
  const [now, setNow] = useState(() => Date.now());

  const needsClock = !connected || feedStatus === "stale";
  useEffect(() => {
    if (!needsClock) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, [needsClock]);

  if (feedStatus === "closed" && connected) return null;

  let reason: string | null = null;
  if (!connected) reason = "Live feed disconnected";
  else if (feedStatus === "stale") reason = "Exchange feed is delayed";
  else if (!tick) reason = "No live tick yet, showing broker snapshot";
  if (!reason) return null;

  const age = tick ? Date.parse(tick.ts) : NaN;
  const title = Number.isFinite(age) ? `${reason} (last update ${ageLabel(now - age)} ago)` : reason;

  return (
    <span title={title} role="img" aria-label={title} className={cn("inline-flex align-middle text-warn", className)}>
      <Clock className="h-3 w-3" aria-hidden />
    </span>
  );
}
