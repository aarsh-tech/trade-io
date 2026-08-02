"use client";

import React, { useMemo, useState } from "react";
import {
  LayoutGrid,
  History,
  Activity,
  ArrowUpCircle,
  PieChart as PieChartIcon,
  Loader2,
  Zap,
  ChevronUp,
  ChevronDown,
  MoreVertical
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { OrderWindow } from "@/components/dashboard/OrderWindow";
import { useDashboard } from "@/hooks/useDashboard";
import { usePortfolio } from "@/hooks/usePortfolio";
import { useBrokers } from "@/hooks/useBrokers";
import { useMarketData } from "@/hooks/use-market-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface MarketItem {
  symbol: string;
  price: number;
  change: number;
  changeAbs?: number;
  exchange?: string;
}

interface Holding {
  symbol: string;
  qty: number;
  avgPrice: number;
  ltp: number;
  pnl: number;
}

interface Margin {
  equity: {
    available: {
      cash: number;
      live_balance?: number;
      opening_balance?: number;
    };
    utilised: { debits: number };
  };
  commodity?: {
    available: { cash: number };
    utilised: { debits: number };
  };
}

interface Broker {
  id: string;
  broker: string;
  clientId: string;
  isActive: boolean;
}

function useMarketStatus() {
  const [status, setStatus] = React.useState<"OPEN" | "CLOSED" | "PRE-OPEN">("CLOSED");

  React.useEffect(() => {
    const checkStatus = () => {
      const now = new Date();
      const str = now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
      const istDate = new Date(str);
      const day = istDate.getDay();
      const hours = istDate.getHours();
      const minutes = istDate.getMinutes();

      if (day === 0 || day === 6) {
        setStatus("CLOSED");
        return;
      }

      const timeInMinutes = hours * 60 + minutes;
      const marketOpen = 9 * 60 + 15;
      const preOpen = 9 * 60;
      const marketClose = 15 * 60 + 30;

      if (timeInMinutes >= marketOpen && timeInMinutes < marketClose) {
        setStatus("OPEN");
      } else if (timeInMinutes >= preOpen && timeInMinutes < marketOpen) {
        setStatus("PRE-OPEN");
      } else {
        setStatus("CLOSED");
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 60000);
    return () => clearInterval(interval);
  }, []);

  return status;
}

export default function DashboardPage() {
  const { movers, isLoading: isDashboardLoading } = useDashboard();
  const { brokers } = useBrokers();
  const marketStatus = useMarketStatus();

  const moverSymbols = useMemo(() => {
    const gainers = (movers?.topGainers || []).map((g: any) => g.symbol);
    const losers = (movers?.topLosers || []).map((l: any) => l.symbol);
    return [...gainers, ...losers];
  }, [movers]);

  const { prices } = useMarketData(moverSymbols);

  const [showRenewModal, setShowRenewModal] = useState(false);
  const [requestToken, setRequestToken] = useState("");

  // Order Window State
  const [orderState, setOrderState] = React.useState<{
    isOpen: boolean;
    type: 'BUY' | 'SELL';
    symbol: string;
    ltp: number;
  }>({
    isOpen: false,
    type: 'BUY',
    symbol: '',
    ltp: 0
  });


  // Pick first active Zerodha broker or any active broker
  const activeBroker = useMemo(() => {
    const brokerList = (brokers || []) as Broker[];
    return brokerList.find(b => b.isActive && b.broker === 'ZERODHA') || brokerList.find(b => b.isActive);
  }, [brokers]);

  const { holdings, margins, isLoading: isPortfolioLoading, renewSession, isRenewing, getLoginUrl } = usePortfolio(activeBroker?.id);

  const handleOpenLogin = async () => {
    const url = await getLoginUrl();
    if (url) window.open(url, "_blank");
  };

  const handleRenewSession = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await renewSession(requestToken);
      setShowRenewModal(false);
      setRequestToken("");
    } catch { }
  };

  // Calculate Real Portfolio Stats
  const stats = useMemo(() => {
    const safeHoldings = (holdings || []) as Holding[];
    const safeMargins = margins as Margin | null;

    const totalInvestment = safeHoldings.reduce((acc, h) => acc + (Number(h.avgPrice || 0) * Number(h.qty || 0)), 0);
    const currentValue = safeHoldings.reduce((acc, h) => acc + (Number(h.ltp || 0) * Number(h.qty || 0)), 0);
    const pnl = currentValue - totalInvestment;
    const pnlPercent = totalInvestment > 0 ? (pnl / totalInvestment) * 100 : 0;

    return {
      totalInvestment,
      currentValue,
      pnl,
      pnlPercent,
      marginAvailable: safeMargins?.equity?.available?.live_balance ?? safeMargins?.equity?.available?.cash ?? 0,
      marginsUsed: safeMargins?.equity?.utilised?.debits ?? 0
    };
  }, [holdings, margins]);

  // Allocation data for the bar chart
  const allocationData = useMemo(() => {
    const safeHoldings = (holdings || []) as Holding[];
    if (safeHoldings.length === 0) return [];
    return safeHoldings.map(h => ({
      symbol: h.symbol,
      value: (h.ltp || 0) * (h.qty || 0),
      color: `hsl(${Math.random() * 360}, 70%, 50%)`
    })).sort((a, b) => b.value - a.value);
  }, [holdings]);

  // Mock historical data for the chart (real data would come from marketApi.candles)
  const chartData = [
    { name: "Jul 25", value: 19500 },
    { name: "Aug 25", value: 20200 },
    { name: "Sep 25", value: 19800 },
    { name: "Oct 25", value: 21500 },
    { name: "Nov 25", value: 21200 },
    { name: "Dec 25", value: 22800 },
    { name: "Jan 26", value: 23100 },
    { name: "Feb 26", value: 22400 },
    { name: "Mar 26", value: 23800 },
    { name: "Apr 26", value: 24200 },
  ];

  if (isDashboardLoading || isPortfolioLoading) {
    return (
      <div className="flex h-[calc(100vh-64px)] items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
          <p className="text-sm font-bold text-slate-400 animate-pulse uppercase tracking-widest">Loading Kite Terminal...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex h-[calc(100vh-64px)] bg-white overflow-hidden font-sans"
    >
      {/* Main Area expands to full width now */}

      {/* ── Main Area ── */}
      <div className="flex-1 overflow-y-auto bg-slate-50/20 p-8 flex flex-col gap-8 scrollbar-hide">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            Hi, Aarsh <span className="wave">👋</span>
          </h1>
          <div className="flex items-center gap-4">
            {activeBroker && (
              <Button variant="outline" size="sm" className="gap-2 border-orange-200 text-orange-700 bg-orange-50 hover:bg-orange-100" onClick={() => setShowRenewModal(true)}>
                <Zap className="h-4 w-4" /> Daily Login
              </Button>
            )}
            <div className="text-right">
              <p className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">Market Status</p>
              <div className="flex items-center gap-1.5 justify-end">
                <div className={cn(
                  "h-2 w-2 rounded-full",
                  marketStatus === "OPEN" ? "bg-emerald-500 animate-pulse" :
                  marketStatus === "PRE-OPEN" ? "bg-orange-500 animate-pulse" : "bg-slate-300"
                )} />
                <span className="text-xs font-bold text-slate-700 uppercase">{marketStatus}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Equity & Commodity Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="shadow-sm border-slate-100 hover:shadow-md transition-shadow group overflow-hidden relative">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <ArrowUpCircle className="h-16 w-16 text-blue-600" />
            </div>
            <CardHeader className="pb-2">
              <CardTitle className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <LayoutGrid className="h-3 w-3" />
                Equity Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end justify-between">
                <div className="flex flex-col">
                  <span className="text-4xl font-black text-slate-900 tracking-tighter">
                    {stats.marginAvailable >= 0 ? "" : "-"}₹{Math.abs(stats.marginAvailable).toLocaleString('en-IN')}
                  </span>
                  <span className="text-xs font-medium text-slate-500">Margin available</span>
                </div>
                <div className="text-right space-y-1">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs text-slate-400 font-medium">Margins used</span>
                    <span className="text-xs font-bold text-slate-700">₹{stats.marginsUsed.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs text-slate-400 font-medium">Opening balance</span>
                    <span className="text-xs font-bold text-slate-700">₹{stats.marginAvailable.toLocaleString('en-IN')}</span>
                  </div>

                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-slate-100 hover:shadow-md transition-shadow group overflow-hidden relative">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Activity className="h-16 w-16 text-slate-400" />
            </div>
            <CardHeader className="pb-2">
              <CardTitle className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <History className="h-3 w-3" />
                Commodity Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end justify-between">
                <div className="flex flex-col">
                  <span className="text-4xl font-black text-slate-900 tracking-tighter">0</span>
                  <span className="text-xs font-medium text-slate-500">Margin available</span>
                </div>
                <div className="text-right space-y-1">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs text-slate-400 font-medium">Margins used</span>
                    <span className="text-xs font-bold text-slate-700">0</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs text-slate-400 font-medium">Opening balance</span>
                    <span className="text-xs font-bold text-slate-700">0</span>
                  </div>

                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Top Gainers & Top Losers Section (Exact Zerodha Kite Style) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Gainers Card */}
          <div className="bg-white border border-slate-200/80 rounded-xl p-5 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-slate-800 tracking-tight">Top Gainers</h3>
                  <span className="text-[11px] font-medium bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                    Nifty 500
                  </span>
                </div>
                <button className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-md">
                  <MoreVertical className="h-4 w-4" />
                </button>
              </div>

              <div className="divide-y divide-slate-100">
                {(movers?.topGainers || []).slice(0, 8).map((item: any) => {
                  const livePrice = prices[item.symbol] || item.ltp;
                  const liveChangePct = item.changePercent;
                  return (
                    <div
                      key={item.symbol}
                      onClick={() => setOrderState({ isOpen: true, type: 'BUY', symbol: item.symbol, ltp: livePrice })}
                      className="py-2.5 flex items-center justify-between hover:bg-slate-50/80 px-2 -mx-2 rounded-lg transition-colors cursor-pointer group"
                    >
                      <div>
                        <div className="font-semibold text-slate-800 text-[13.5px] uppercase tracking-tight group-hover:text-blue-600 transition-colors">
                          {item.symbol}
                        </div>
                        <div className="text-[10.5px] font-semibold text-slate-400 uppercase tracking-wider mt-0.5">
                          {item.exchange || 'NSE'}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[13.5px] font-semibold text-emerald-600 tracking-tight">
                          {livePrice ? livePrice.toFixed(2) : '0.00'}
                        </div>
                        <div className="text-[11.5px] font-medium text-emerald-600 flex items-center justify-end gap-0.5 mt-0.5">
                          <ChevronUp className="h-3 w-3 stroke-[2.5]" />
                          {Math.abs(liveChangePct || 0).toFixed(2)}%
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Top Losers Card */}
          <div className="bg-white border border-slate-200/80 rounded-xl p-5 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-slate-800 tracking-tight">Top Losers</h3>
                  <span className="text-[11px] font-medium bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                    Nifty 500
                  </span>
                </div>
                <button className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-md">
                  <MoreVertical className="h-4 w-4" />
                </button>
              </div>

              <div className="divide-y divide-slate-100">
                {(movers?.topLosers || []).slice(0, 8).map((item: any) => {
                  const livePrice = prices[item.symbol] || item.ltp;
                  const liveChangePct = item.changePercent;
                  return (
                    <div
                      key={item.symbol}
                      onClick={() => setOrderState({ isOpen: true, type: 'BUY', symbol: item.symbol, ltp: livePrice })}
                      className="py-2.5 flex items-center justify-between hover:bg-slate-50/80 px-2 -mx-2 rounded-lg transition-colors cursor-pointer group"
                    >
                      <div>
                        <div className="font-semibold text-slate-800 text-[13.5px] uppercase tracking-tight group-hover:text-blue-600 transition-colors">
                          {item.symbol}
                        </div>
                        <div className="text-[10.5px] font-semibold text-slate-400 uppercase tracking-wider mt-0.5">
                          {item.exchange || 'NSE'}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[13.5px] font-semibold text-rose-500 tracking-tight">
                          {livePrice ? livePrice.toFixed(2) : '0.00'}
                        </div>
                        <div className="text-[11.5px] font-medium text-rose-500 flex items-center justify-end gap-0.5 mt-0.5">
                          <ChevronDown className="h-3 w-3 stroke-[2.5]" />
                          -{Math.abs(liveChangePct || 0).toFixed(2)}%
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>


      </div>

      <style jsx global>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .wave {
          display: inline-block;
          animation: wave-animation 2.5s infinite;
          transform-origin: 70% 70%;
        }
        @keyframes wave-animation {
          0% { transform: rotate( 0.0deg) }
          10% { transform: rotate(14.0deg) }
          20% { transform: rotate(-8.0deg) }
          30% { transform: rotate(14.0deg) }
          40% { transform: rotate(-4.0deg) }
          50% { transform: rotate(10.0deg) }
          60% { transform: rotate( 0.0deg) }
          100% { transform: rotate( 0.0deg) }
        }
      `}</style>

      {/* Renew Session Modal */}
      <Dialog open={showRenewModal} onOpenChange={setShowRenewModal}>
        <DialogContent className="max-w-md p-0 overflow-hidden border-orange-100">
          <DialogHeader className="px-6 pt-6 pb-2">
            <div className="h-12 w-12 rounded-full bg-orange-50 flex items-center justify-center mb-3">
              <Zap className="h-6 w-6 text-orange-500" />
            </div>
            <DialogTitle className="text-xl font-bold">Broker Daily Login</DialogTitle>
            <DialogDescription className="text-xs font-medium text-slate-500 leading-relaxed">
              Your broker requires a fresh session every day. Follow these steps:
            </DialogDescription>
          </DialogHeader>

          <div className="px-6 py-4 space-y-4">
            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="h-5 w-5 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-600 shrink-0 mt-0.5">1</div>
                <p className="text-[12.5px] text-slate-600 font-medium">Click the button below to open the broker login page.</p>
              </div>
              <Button onClick={handleOpenLogin} className="w-full h-11 bg-orange-500 hover:bg-orange-600 text-white font-bold shadow-sm">
                Open Broker Login Page
              </Button>
            </div>

            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="h-5 w-5 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-600 shrink-0 mt-0.5">2</div>
                <p className="text-[12.5px] text-slate-600 font-medium leading-relaxed">
                  After logging in, copy any session token/code provided by the broker and paste it below.
                </p>
              </div>
              <form onSubmit={handleRenewSession} className="space-y-3 pt-1">
                <Button type="button" onClick={() => handleRenewSession({ preventDefault: () => { } } as any)} disabled={isRenewing} className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-md">
                  {isRenewing ? "Logging in..." : "Run Automated Login"}
                </Button>
                <div className="flex items-center gap-2 py-2">
                  <div className="h-px flex-1 bg-slate-200" />
                  <span className="text-[10px] font-bold text-slate-400 uppercase">OR PASTE MANUALLY</span>
                  <div className="h-px flex-1 bg-slate-200" />
                </div>
                <Input
                  value={requestToken}
                  onChange={(e) => setRequestToken(e.target.value)}
                  placeholder="Paste token or session ID here"
                  className="h-11 border-slate-200 focus:ring-orange-500 focus:border-orange-500"
                />
                <Button type="submit" disabled={isRenewing || !requestToken} className="w-full h-11 bg-slate-900 hover:bg-slate-800 text-white font-bold">
                  {isRenewing ? "Activating..." : "2. Activate Manual Session"}
                </Button>
              </form>
            </div>
          </div>

          <div className="bg-slate-50 p-6 flex justify-end">
            <Button type="button" variant="ghost" className="text-slate-500 font-semibold" onClick={() => setShowRenewModal(false)}>Cancel</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Kite Order Window */}
      <OrderWindow
        isOpen={orderState.isOpen}
        onClose={() => setOrderState(prev => ({ ...prev, isOpen: false }))}
        symbol={orderState.symbol}
        type={orderState.type}
        ltp={orderState.ltp}
        availableMargin={stats.marginAvailable}
        brokerId={activeBroker?.id}
        onTypeChange={(newType) => setOrderState(prev => ({ ...prev, type: newType }))}
      />
    </div>
  );
}
