"use client";

import { Bell, Menu, TrendingUp, TrendingDown, Wifi, WifiOff, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/store";
import { marketApi } from "@/lib/api";
import { useCallback, useEffect, useRef, useState } from "react";

import { io, Socket } from "socket.io-client";

// ─── Types ────────────────────────────────────────────────────────────────────
interface TickerItem {
  symbol: string;
  price: number;
  changePct: number;
}

// ─── Live price hook — Uses WebSocket ───────────────
const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL?.replace('/v1', '') || "http://localhost:3002";

function useLivePrices() {
  const [tickers, setTickers] = useState<TickerItem[]>([
    { symbol: 'NIFTY 50', price: 0, changePct: 0 },
    { symbol: 'BANKNIFTY', price: 0, changePct: 0 },
    { symbol: 'SENSEX', price: 0, changePct: 0 }
  ]);
  const [connected, setConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    const socket = io(`${SOCKET_URL}/market`, { transports: ['websocket'] });

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('subscribe', { symbols: ['NIFTY 50', 'BANKNIFTY', 'SENSEX'] });
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('ltp', (payload: { symbol: string; ltp: number }) => {
      setTickers(prev => prev.map(t => {
        if (t.symbol === payload.symbol) {
          // Simplistic change calculation for topbar if we don't have prev close
          const changePct = t.price ? ((payload.ltp - t.price) / t.price) * 100 : 0;
          // To keep it stable, we accumulate changePct or just rely on backend to send change if we had it.
          // For now, if t.price is 0 (initial), change is 0. 
          return { ...t, price: payload.ltp, changePct: t.price ? t.changePct + changePct : 0 };
        }
        return t;
      }));
      setLastUpdated(new Date());
    });

    return () => { socket.disconnect(); };
  }, []);

  // Fetch initial prices once to get correct change percentages and avoid 0 price
  useEffect(() => {
    marketApi.marketOverview().then(res => {
      const data = res.data?.data?.indices || [];
      if (data.length > 0) {
        setTickers(data.map((idx: any) => ({
          symbol: idx.symbol,
          price: idx.price,
          changePct: idx.change
        })));
      }
    }).catch(() => {});
  }, []);

  return { connected, tickers: tickers.filter(t => t.price > 0), loading: !connected && tickers.every(t => t.price === 0), lastUpdated, refresh: () => {} };
}

// ─── Market open/closed (IST 9:15–15:30) ─────────────────────────────────────
function useMarketStatus() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const check = () => {
      const ist  = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
      const hhmm = ist.getHours() * 60 + ist.getMinutes();
      setOpen(hhmm >= 9 * 60 + 15 && hhmm < 15 * 60 + 30);
    };
    check();
    const t = setInterval(check, 60_000);
    return () => clearInterval(t);
  }, []);
  return open;
}

// ─── Ticker tape item ─────────────────────────────────────────────────────────
function TickerEntry({ t }: { t: TickerItem }) {
  const up = t.changePct >= 0;
  return (
    <div className="flex items-center gap-1.5 text-[11px] whitespace-nowrap select-none">
      <span className="font-semibold text-slate-600">{t.symbol}</span>
      <span className="font-bold text-slate-900">
        ₹{t.price.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
      <span className={cn("flex items-center gap-0.5 font-medium tabular-nums", up ? "text-emerald-600" : "text-red-500")}>
        {up ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
        {up ? "+" : ""}{t.changePct.toFixed(2)}%
      </span>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────
export function TopBar() {
  const { toggleSidebar }              = useUIStore();
  const { connected, tickers, loading, lastUpdated, refresh } = useLivePrices();
  const marketOpen                     = useMarketStatus();

  // Duplicate list for seamless infinite scroll
  const repeated = tickers.length > 0 ? [...tickers, ...tickers] : [];

  return (
    <header className="h-14 bg-white border-b border-slate-200 flex flex-col">

      {/* ── Ticker tape ─────────────────────────────────────────────────── */}
      <div className="ticker-banner h-7 border-b border-slate-100 bg-slate-50 overflow-hidden relative flex items-center">
        {/* Loading skeleton */}
        {loading && (
          <div className="flex items-center gap-6 px-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <div className="h-2.5 w-16 rounded bg-slate-200 animate-pulse" />
                <div className="h-2.5 w-20 rounded bg-slate-200 animate-pulse" />
                <div className="h-2.5 w-12 rounded bg-slate-200 animate-pulse" />
              </div>
            ))}
          </div>
        )}

        {/* No broker connected message */}
        {!loading && !connected && (
          <div className="flex items-center gap-2 px-4 text-xs text-slate-400">
            <WifiOff className="h-3 w-3" />
            <span>Connect your Zerodha broker to see live prices</span>
          </div>
        )}

        {/* Live prices — scrolling */}
        {!loading && connected && tickers.length > 0 && (
          <div
            className="flex items-center gap-8 px-4 animate-[ticker_40s_linear_infinite]"
            style={{ width: "max-content" }}
          >
            {repeated.map((t, i) => (
              <TickerEntry key={`${t.symbol}-${i}`} t={t} />
            ))}
          </div>
        )}
      </div>

      {/* ── Main bar ────────────────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-between px-4 md:px-6">
        {/* Left — mobile hamburger */}
        <div className="flex items-center gap-3">
          <button
            onClick={toggleSidebar}
            className="md:hidden p-2 -ml-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>

        {/* Right — status badges + bell */}
        <div className="flex items-center gap-2">

          {/* Last updated + refresh */}
          {connected && lastUpdated && (
            <button
              onClick={refresh}
              title="Refresh prices"
              className="hidden sm:flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-600 transition-colors"
            >
              <RefreshCw className="h-3 w-3" />
              {lastUpdated.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
            </button>
          )}

          {/* Live / Offline badge */}
          <div
            title={connected ? "Live prices from Zerodha" : "No broker session — connect on Brokers page"}
            className={cn(
              "hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-colors",
              connected
                ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                : "bg-slate-100 border-slate-200 text-slate-400"
            )}
          >
            {connected
              ? <><Wifi className="h-2.5 w-2.5" /> Live</>
              : <><WifiOff className="h-2.5 w-2.5" /> Offline</>
            }
          </div>

          {/* Market open/closed */}
          <div
            className={cn(
              "hidden sm:flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[10px] font-semibold transition-colors",
              marketOpen
                ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                : "bg-red-50 border-red-200 text-red-600"
            )}
          >
            <span className={cn(
              "h-1.5 w-1.5 rounded-full",
              marketOpen ? "bg-emerald-500 animate-pulse" : "bg-red-400"
            )} />
            {marketOpen ? "Market Open" : "Market Closed"}
          </div>

          {/* Notifications */}
          <button className="relative h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-900 transition-colors">
            <Bell className="h-4 w-4" />
            <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-blue-600" />
          </button>
        </div>
      </div>
    </header>
  );
}
