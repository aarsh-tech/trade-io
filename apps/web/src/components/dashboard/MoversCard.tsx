"use client";

import { useEffect, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { ChevronDown, ChevronUp, TrendingDown, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMarketSocket } from "@/components/market-socket-provider";
import { useMarketStore } from "@/store/market-store";
import { EMPTY, formatINR, formatPct, pnlClass } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface Mover {
  symbol: string;
  exchange?: string;
  ltp: number;
  close?: number;
  changePercent: number;
}

interface MoversCardProps {
  kind: "gainers" | "losers";
  items: Mover[];
  onSelect: (symbol: string, ltp: number) => void;
}

const keyOf = (m: Mover) => `${m.exchange || "NSE"}:${m.symbol}`;

/**
 * One movers list. The server sends LTP and previous close; live ticks from the shared store
 * replace LTP and carry the exchange's own change %, so the % is always measured from the
 * previous close, never from a guessed baseline.
 */
export function MoversCard({ kind, items, onSelect }: MoversCardProps) {
  const { subscribe } = useMarketSocket();
  const rows = items.slice(0, 8);
  const keysKey = useMemo(() => rows.map(keyOf).join(","), [rows]);

  useEffect(() => {
    if (!keysKey) return;
    return subscribe(keysKey.split(","));
  }, [keysKey, subscribe]);

  const ticks = useMarketStore(
    useShallow((s) => {
      const out: Record<string, { ltp: number; changePct: number | null }> = {};
      if (!keysKey) return out;
      for (const k of keysKey.split(",")) {
        const t = s.ticks[k];
        if (t) out[k] = { ltp: t.ltp, changePct: t.changePct };
      }
      return out;
    }),
  );

  const gainers = kind === "gainers";
  const Icon = gainers ? TrendingUp : TrendingDown;
  const Arrow = gainers ? ChevronUp : ChevronDown;

  return (
    <Card className="p-0 overflow-hidden">
      <CardHeader className="mb-0 py-2.5 px-4 border-b border-border flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={cn("h-6 w-6 rounded-md flex items-center justify-center", gainers ? "bg-profit/10 text-profit" : "bg-loss/10 text-loss")}>
            <Icon className="h-3.5 w-3.5" aria-hidden />
          </div>
          <CardTitle className="text-[13px] font-semibold text-foreground">{gainers ? "Top Gainers" : "Top Losers"}</CardTitle>
        </div>
        <div className="flex items-center gap-1">
          <Badge variant="outline" className="text-[9.5px] font-semibold text-muted-foreground bg-muted/50 py-0 px-1.5">1D</Badge>
          <Badge variant="outline" className="text-[9.5px] font-semibold text-muted-foreground bg-muted/50 py-0 px-1.5">NIFTY 500</Badge>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="divide-y divide-border text-xs">
          {rows.map((item) => {
            const tick = ticks[keyOf(item)];
            const ltp = tick?.ltp ?? item.ltp;
            const pct = tick?.changePct ?? item.changePercent;
            return (
              <button
                type="button"
                key={item.symbol}
                onClick={() => onSelect(item.symbol, ltp || 0)}
                title="Place order" className="w-full h-12 px-4 flex items-center justify-between text-left hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none transition-colors group cursor-pointer"
              >
                <div>
                  <div className="font-medium text-foreground text-[13px] uppercase flex items-center gap-1.5">
                    {item.symbol}
                    <span className="text-[10px] font-normal text-muted-foreground">{item.exchange || "NSE"}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[13px] font-medium num text-foreground">{ltp > 0 ? formatINR(ltp) : EMPTY}</div>
                  <div className={cn("text-[11px] num font-medium flex items-center justify-end gap-0.5", pnlClass(pct))}>
                    <Arrow className="h-3 w-3 stroke-[2.5]" aria-hidden />
                    {formatPct(pct)}
                  </div>
                </div>
              </button>
            );
          })}
          {rows.length === 0 && (
            <div className="py-8 text-center text-xs text-muted-foreground">
              {gainers ? "No gainers yet. Connect a broker and wait for the market data." : "No losers yet. Connect a broker and wait for the market data."}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
