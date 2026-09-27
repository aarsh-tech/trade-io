"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Layers, Loader2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useBrokers } from "@/hooks/useBrokers";
import { usePortfolio } from "@/hooks/usePortfolio";
import { formatINR, pnlClass } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Position {
  symbol: string;
  qty: number;
  avgPrice: number;
  ltp: number;
  pnl: number;
  product: string;
}

export function PositionsSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { brokers = [] } = useBrokers();
  const activeBrokerId = useMemo(() => {
    const active = (brokers as any[]).find((b) => b.isActive && b.broker === "ZERODHA") || (brokers as any[]).find((b) => b.isActive);
    return active?.id || null;
  }, [brokers]);

  const { positions = [], isPositionsLoading, positionsError } = usePortfolio(activeBrokerId);
  const openPositions = (positions as Position[]).filter((p) => p.qty !== 0);
  const totalPnl = openPositions.reduce((sum, p) => sum + (p.pnl || 0), 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="p-0">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-accent-foreground" aria-hidden />
            Running Positions
          </SheetTitle>
          <SheetDescription>
            {activeBrokerId ? "Live open positions on your connected broker" : "Connect a broker to see open positions"}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {!activeBrokerId ? (
            <div className="py-16 text-center px-6 text-sm text-muted-foreground">No broker connected.</div>
          ) : positionsError ? (
            <div className="py-16 text-center px-6 text-sm text-loss">Failed to load positions.</div>
          ) : isPositionsLoading && openPositions.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              Fetching positions...
            </div>
          ) : openPositions.length === 0 ? (
            <div className="py-16 text-center px-6 text-sm text-muted-foreground">No open positions right now.</div>
          ) : (
            <ul className="divide-y divide-border">
              {openPositions.map((pos, idx) => {
                const isLong = pos.qty > 0;
                return (
                  <li key={`${pos.symbol}-${idx}`} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-sm font-semibold text-foreground">{pos.symbol}</span>
                      <Badge variant="secondary" className="shrink-0 text-[10px] font-semibold">
                        {pos.product || "MIS"}
                      </Badge>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span className={cn("font-mono font-medium", isLong ? "text-profit" : "text-loss")}>
                        {isLong ? "+" : ""}
                        {pos.qty} @ ₹{pos.avgPrice?.toFixed(2) || "0.00"}
                      </span>
                      <span className="font-mono text-foreground">LTP ₹{pos.ltp?.toFixed(2) || "0.00"}</span>
                    </div>
                    <div className="mt-1 text-right">
                      <span className={cn("font-mono text-sm font-semibold", pnlClass(pos.pnl || 0))}>
                        {formatINR(pos.pnl || 0, { signed: true })}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {openPositions.length > 0 && (
          <SheetFooter className="flex-col items-stretch gap-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total P&amp;L ({openPositions.length} open)</span>
              <span className={cn("font-mono font-semibold", pnlClass(totalPnl))}>{formatINR(totalPnl, { signed: true })}</span>
            </div>
            <Link href="/positions" onClick={() => onOpenChange(false)}>
              <Button variant="outline" size="sm" className="w-full">
                View all positions
              </Button>
            </Link>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
