"use client";

import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";

interface IndexData {
  symbol: string;
  price: number;
  change: number;
  changeAbs: number;
}

export function MarketTicker({ indices }: { indices: IndexData[] }) {
  return (
    <div className="h-10 bg-card border-b border-border flex items-center overflow-hidden whitespace-nowrap">
      <div className="flex animate-marquee hover:pause gap-12 px-6">
        {[...indices, ...indices].map((item, idx) => (
          <div key={`${item.symbol}-${idx}`} className="flex items-center gap-2 group cursor-pointer">
            <span className="text-[11px] font-semibold text-muted-foreground group-hover:text-accent-foreground transition-colors uppercase">
              {item.symbol}
            </span>
            <span className="text-[11px] font-semibold text-foreground tabular-nums">
              {item.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
            <div className={cn(
              "flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded",
              item.change >= 0 ? "bg-profit-subtle text-profit" : "bg-loss-subtle text-loss"
            )}>
              {item.change >= 0 ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
              {item.change >= 0 ? "+" : ""}{item.change.toFixed(2)}%
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
