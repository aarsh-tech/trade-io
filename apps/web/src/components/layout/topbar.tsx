"use client";

import { Bell, Search, TrendingUp, TrendingDown, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/store";

// Mock ticker data — will be replaced by WebSocket feed
const tickerData = [
  { symbol: "NIFTY 50", price: 22450.15, change: 0.82 },
  { symbol: "SENSEX", price: 73857.40, change: 1.12 },
  { symbol: "BANKNIFTY", price: 47842.30, change: -0.34 },
  { symbol: "RELIANCE", price: 2891.50, change: 1.45 },
  { symbol: "TCS", price: 3742.80, change: -0.21 },
  { symbol: "INFY", price: 1567.90, change: 0.63 },
  { symbol: "HDFCBANK", price: 1678.20, change: -0.87 },
  { symbol: "WIPRO", price: 521.30, change: 2.31 },
];

export function TopBar() {
  const repeatedTickers = [...tickerData, ...tickerData]; // double for seamless loop
  const { toggleSidebar } = useUIStore();

  return (
    <header className="h-14 bg-white border-b border-slate-200 flex flex-col">
      {/* Ticker tape */}
      <div className="h-7 border-b border-slate-100 ticker-wrap flex items-center bg-slate-50">
        <div className="ticker-content flex items-center gap-6 px-4">
          {repeatedTickers.map((t, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs whitespace-nowrap">
              <span className="font-medium text-slate-600">{t.symbol}</span>
              <span className="font-semibold text-slate-900">{t.price.toLocaleString("en-IN")}</span>
              <span
                className={cn(
                  "flex items-center gap-0.5 font-medium",
                  t.change >= 0 ? "text-green-600" : "text-red-600"
                )}
              >
                {t.change >= 0 ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {t.change >= 0 ? "+" : ""}
                {t.change.toFixed(2)}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Main topbar */}
      <div className="flex-1 flex items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-3">
          <button onClick={toggleSidebar} className="md:hidden p-2 -ml-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors">
            <Menu className="h-5 w-5" />
          </button>
          <div className="relative w-48 lg:w-72 hidden sm:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="search"
              placeholder="Search symbol, strategy..."
              className="w-full h-8 pl-9 pr-3 rounded-lg bg-slate-100 border border-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Market status */}
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-50 border border-green-200">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs font-medium text-green-700">Market Open</span>
          </div>

          {/* Notifications */}
          <button className="relative h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-900 transition-colors">
            <Bell className="h-4 w-4" />
            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-blue-600" />
          </button>
        </div>
      </div>
    </header>
  );
}
