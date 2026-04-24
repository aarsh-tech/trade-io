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
    <div className="w-full bg-white border-b border-slate-100 px-6 py-2 overflow-hidden">
      <div className="flex items-center gap-8 animate-[marquee_30s_linear_infinite] whitespace-nowrap">
        {indices.map((idx) => (
          <div key={idx.symbol} className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-tight">{idx.symbol}</span>
            <span className="text-sm font-mono font-bold text-slate-900">{idx.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            <div className={cn(
              "flex items-center gap-0.5 text-[11px] font-bold",
              idx.change >= 0 ? "text-emerald-500" : "text-rose-500"
            )}>
              {idx.change >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              <span>{Math.abs(idx.changeAbs).toFixed(2)} ({Math.abs(idx.change).toFixed(2)}%)</span>
            </div>
          </div>
        ))}
        {/* Duplicate for seamless loop if needed, but flex gap is enough for now */}
      </div>
    </div>
  );
}
