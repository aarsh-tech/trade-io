"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertOctagon, KeyRound } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { marketApi, orderApi } from "@/lib/api";
import { formatINR, pnlClass } from "@/lib/format";
import { useMarketStore } from "@/store/market-store";
import { useBrokers } from "@/hooks/useBrokers";
import { useRiskStatus } from "@/hooks/useRiskStatus";

type SessionState = "pre-open" | "open" | "closed" | "holiday" | "weekend";
interface SessionInfo { state: SessionState; nextOpenAt: string | null; closesAt: string | null }

const SESSION_LABEL: Record<SessionState, string> = {
  "pre-open": "Pre-open",
  open: "Market open",
  closed: "Market closed",
  holiday: "Market holiday",
  weekend: "Weekend",
};

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function formatAge(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

function formatCountdown(ms: number) {
  const m = Math.floor(ms / 60_000);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

const istFormat = new Intl.DateTimeFormat("en-IN", {
  weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata", hour12: false,
});

/** Global live-market state: feed, exchange session, broker token expiry, kill switch and day P&L. */
export function StatusBar({ onReconnect }: { onReconnect: () => void }) {
  const now = useNow();
  const socketConnected = useMarketStore((s) => s.connected);
  const feed = useMarketStore((s) => s.feed);
  const lastTickAt = useMarketStore((s) => {
    let max = 0;
    for (const t of Object.values(s.ticks)) {
      const ts = Date.parse(t.ts);
      if (ts > max) max = ts;
    }
    return max;
  });
  const { brokers } = useBrokers();
  const { data: risk } = useRiskStatus();
  const { data: session } = useQuery({
    queryKey: ["market", "session"],
    queryFn: async () => (await marketApi.session()).data?.data as SessionInfo,
    refetchInterval: 60_000,
  });

  const kite = brokers.find((b: any) => b.broker === "ZERODHA");
  const expiryMs = kite?.accessToken && kite?.tokenExpiry ? new Date(kite.tokenExpiry).getTime() : null;
  const remaining = expiryMs !== null ? expiryMs - now : null;
  const tokenState = !kite ? "none" : remaining === null || remaining <= 0 ? "expired" : remaining < 60 * 60_000 ? "soon" : "ok";

  const marketLive = session?.state === "open" || session?.state === "pre-open";
  const feedState: "offline" | "live" | "stale" | "closed" = !socketConnected
    ? "offline"
    : feed.status === "connected" ? "live" : feed.status === "stale" ? "stale" : "closed";
  const feedLabel = { offline: "Disconnected", live: "Live", stale: "Delayed", closed: "Feed closed" }[feedState];
  const feedDot =
    feedState === "live" ? "bg-profit" : feedState === "stale" ? "bg-warn" : feedState === "offline" ? "bg-loss" : "bg-muted-foreground";
  const tickAge = lastTickAt ? formatAge(now - lastTickAt) : null;

  // Realised P&L from real fills (same FIFO/charges as the ledger); unrealised from live positions.
  const { data: dayRealised } = useQuery({
    queryKey: ["orders", "day-pnl"],
    queryFn: async () => (await orderApi.dayPnl()).data?.data as { realizedPnl: number; charges: number },
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const nextOpen = session?.nextOpenAt ? istFormat.format(new Date(session.nextOpenAt)) : null;
  const dayPnl = dayRealised && risk ? dayRealised.realizedPnl + risk.unrealizedPnl : undefined;

  return (
    <div
      role="status"
      aria-label="Market and account status"
      className="flex items-center gap-x-4 gap-y-1 flex-wrap px-3 sm:px-6 py-1.5 bg-card border-b border-border text-[11px] sm:text-xs text-foreground/75 shrink-0"
    >
      <span className="flex items-center gap-1.5 whitespace-nowrap" title="Live price feed">
        <span className={cn("h-2 w-2 rounded-full shrink-0", feedDot, feedState === "live" && "animate-pulse")} aria-hidden />
        <span className="font-semibold">{feedLabel}</span>
        {tickAge && feedState !== "closed" && <span className="text-muted-foreground num">· last tick {tickAge} ago</span>}
      </span>

      <span className="whitespace-nowrap" title="NSE/BSE session (IST)">
        <span className={cn("font-semibold", marketLive ? "text-profit" : "text-foreground/75")}>
          {session ? SESSION_LABEL[session.state] : "Market —"}
        </span>
        {session && !marketLive && nextOpen && <span className="text-muted-foreground"> · opens {nextOpen} IST</span>}
      </span>

      <span className="flex items-center gap-1.5 whitespace-nowrap" title="Zerodha access tokens expire daily at 06:00 IST">
        <KeyRound className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {tokenState === "none" && <span className="text-muted-foreground">No broker</span>}
        {tokenState === "ok" && <span>Kite token {formatCountdown(remaining!)} left</span>}
        {tokenState === "soon" && <span className="text-warn font-semibold">Kite token expires in {formatCountdown(remaining!)}</span>}
        {tokenState === "expired" && <span className="text-loss font-semibold">Kite session expired</span>}
        {tokenState !== "ok" && (
          <button type="button" onClick={onReconnect} className="underline underline-offset-2 font-semibold text-info hover:opacity-80 cursor-pointer">
            {tokenState === "none" ? "Connect" : "Re-login"}
          </button>
        )}
      </span>

      {risk?.killSwitchActive && (
        <Link href="/strategies" className="flex items-center gap-1 font-bold text-loss whitespace-nowrap">
          <AlertOctagon className="h-3.5 w-3.5" aria-hidden /> Kill switch ON
        </Link>
      )}

      <span className="ml-auto whitespace-nowrap" title={dayRealised && risk ? `Realised ${formatINR(dayRealised.realizedPnl)} (net of charges) + unrealised ${formatINR(risk.unrealizedPnl)}` : "Realised + unrealised"}>
        Day P&amp;L{" "}
        <span className={cn("font-semibold num", dayPnl === undefined ? "text-muted-foreground" : pnlClass(dayPnl))}>
          {dayPnl === undefined ? "—" : formatINR(dayPnl, { signed: true })}
        </span>
      </span>
    </div>
  );
}
