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
    <div className="h-10 bg-white border-b border-slate-100 flex items-center overflow-hidden whitespace-nowrap">
      <div className="flex animate-marquee hover:pause gap-12 px-6">
        {[...indices, ...indices].map((item, idx) => (
          <div key={`${item.symbol}-${idx}`} className="flex items-center gap-2 group cursor-pointer">
            <span className="text-[11px] font-bold text-slate-500 group-hover:text-blue-600 transition-colors uppercase">
              {item.symbol}
            </span>
            <span className="text-[11px] font-black text-slate-800 tabular-nums">
              {item.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
            <div className={cn(
              "flex items-center text-[10px] font-black px-1.5 py-0.5 rounded",
              item.change >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
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
