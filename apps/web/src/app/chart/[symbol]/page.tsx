"use client";

// Cloudflare (next-on-pages) requires every dynamic route to run on the Edge runtime.
export const runtime = "edge";

// Full-window chart (opened in a new tab from the swing scanner, like Kite's chart window).
// Outside the (dashboard) group on purpose: no sidebar, top bar or market socket, just the chart.
import { Suspense, useEffect, useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { ChartPanel } from "@/features/swing-scanner/ChartPanel";
import { setupFromQuery } from "@/features/swing-scanner/chart-data";

function ChartWindow() {
  const params = useParams<{ symbol: string }>();
  const query = useSearchParams();
  const symbol = decodeURIComponent(params.symbol ?? "").toUpperCase();
  const queryKey = query.toString();
  const setup = useMemo(() => setupFromQuery(symbol, new URLSearchParams(queryKey)), [symbol, queryKey]);

  useEffect(() => {
    document.title = `${symbol} · Chart · Tradeio`;
  }, [symbol]);

  return (
    <div className="h-dvh w-full bg-card">
      <ChartPanel setup={setup} version={query.get("v")} />
    </div>
  );
}

export default function ChartPage() {
  return (
    <AuthGuard>
      <Suspense fallback={<div className="h-dvh w-full bg-card" />}>
        <ChartWindow />
      </Suspense>
    </AuthGuard>
  );
}
