"use client";

import React, { useMemo } from "react";
import {
  Search,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  LayoutGrid,
  History,
  Activity,
  ArrowUpCircle,
  PieChart as PieChartIcon,
  Loader2,
  Trash2,
  ExternalLink,
  BarChart2,
  TrendingUp,
  LineChart,
  Trash,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { OrderWindow } from "@/components/dashboard/OrderWindow";
import { useDashboard } from "@/hooks/useDashboard";
import { usePortfolio } from "@/hooks/usePortfolio";
import { useBrokers } from "@/hooks/useBrokers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { marketApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from "recharts";

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

export default function DashboardPage() {
  const { market, isLoading: isDashboardLoading, refresh } = useDashboard();
  const { brokers } = useBrokers();

  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchResults, setSearchResults] = React.useState<any[]>([]);
  const [isSearching, setIsSearching] = React.useState(false);
  const [showSearchResults, setShowSearchResults] = React.useState(false);

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

  // Debounced search
  React.useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.trim().length > 1) {
        setIsSearching(true);
        try {
          const res = await marketApi.search(searchQuery, activeBroker?.id);
          setSearchResults(res.data.data || []);
          setShowSearchResults(true);
        } catch (err) {
          console.error("Search failed:", err);
        } finally {
          setIsSearching(false);
        }
      } else {
        setSearchResults([]);
        setShowSearchResults(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  async function handleAddToWatchlist(symbol: string, exchange: string) {
    try {
      await marketApi.addToWatchlist(symbol, exchange);
      toast.success(`Added ${symbol} to watchlist`);
      setSearchQuery("");
      setShowSearchResults(false);
      refresh(); // Refresh watchlist
    } catch (err) {
      toast.error("Failed to add to watchlist");
    }
  }

  async function handleRemoveFromWatchlist(e: React.MouseEvent, symbol: string, exchange: string) {
    e.stopPropagation();
    try {
      await marketApi.removeFromWatchlist(symbol, exchange);
      toast.success(`Removed ${symbol} from watchlist`);
      refresh(); // Refresh watchlist
    } catch (err) {
      toast.error("Failed to remove from watchlist");
    }
  }

  // Pick first active Zerodha broker or any active broker
  const activeBroker = useMemo(() => {
    const brokerList = (brokers || []) as Broker[];
    return brokerList.find(b => b.isActive && b.broker === 'ZERODHA') || brokerList.find(b => b.isActive);
  }, [brokers]);

  const { holdings, margins, isLoading: isPortfolioLoading } = usePortfolio(activeBroker?.id);

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
      onClick={() => setShowSearchResults(false)}
    >
      {/* ── Left Sidebar (Watchlist) ── */}
      <div className="w-[350px] border-r border-slate-100 flex flex-col bg-white shrink-0">
        <div
          className="p-4 border-b border-slate-50 flex flex-col gap-2 relative"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="relative flex-1 group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
            <Input
              placeholder="Search eg: infy bse, nifty fut, index fund, et"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => searchQuery.length > 1 && setShowSearchResults(true)}
              className="pl-9 h-10 bg-slate-50/50 border-none focus-visible:ring-1 focus-visible:ring-blue-100 placeholder:text-slate-400 text-sm"
            />
            {isSearching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin text-blue-500" />
            )}
          </div>

          {/* Search Results Dropdown */}
          {showSearchResults && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 z-50 bg-white border border-slate-100 shadow-xl max-h-[400px] overflow-y-auto">
              {searchResults.map((item) => {
                const isAlreadyAdded = (market.stocks as MarketItem[]).some(s => s.symbol === item.symbol);
                return (
                  <div
                    key={`${item.exchange}:${item.symbol}`}
                    className="px-4 py-3 border-b border-slate-50 flex items-center justify-between hover:bg-slate-50 cursor-pointer group"
                    onClick={() => !isAlreadyAdded && handleAddToWatchlist(item.symbol, item.exchange)}
                  >
                    <div className="flex flex-col" onClick={() => {
                      setOrderState({ isOpen: true, type: 'BUY', symbol: item.symbol, ltp: item.price || 0 });
                    }}>
                      <span className="text-sm font-bold text-slate-700">{item.symbol}</span>
                      <span className="text-[10px] text-slate-400 font-medium uppercase">{item.exchange} | {item.name}</span>
                    </div>
                    {isAlreadyAdded ? (
                      <Badge variant="secondary" className="text-[10px] text-slate-400 border-slate-200">Added</Badge>
                    ) : (
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px] font-bold text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
                        ADD
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {showSearchResults && searchResults.length === 0 && !isSearching && searchQuery.length > 1 && (
            <div className="absolute top-full left-0 right-0 z-50 bg-white border border-slate-100 p-4 text-center text-xs text-slate-400 shadow-xl">
              No instruments found for "{searchQuery}"
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-4 py-2 border-b border-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-white">
          <div className="flex items-center gap-1 cursor-pointer hover:text-slate-600 transition-colors">
            <span>Watchlist (5/250)</span>
            <ChevronDown className="h-3 w-3" />
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="icon" className="h-4 w-4 text-slate-400 hover:text-blue-500">
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-hide">
          {(market.stocks as MarketItem[]).map((stock) => (
            <div
              key={stock.symbol}
              className="group px-4 py-[9px] border-b border-slate-50 flex items-center justify-between hover:bg-slate-50 transition-all duration-75 cursor-pointer relative overflow-hidden"
            >
              <div className="flex flex-col">
                <span className={cn(
                  "text-[13px] font-medium tracking-tight",
                  stock.change >= 0 ? "text-[#4caf50]" : "text-[#ff5722]"
                )}>
                  {stock.symbol}
                </span>
              </div>

              {/* Action Buttons on Hover - Official Kite Style */}
              <div className="absolute right-0 top-0 bottom-0 flex items-center pr-1 opacity-0 group-hover:opacity-100 transition-opacity z-10 pl-12 bg-gradient-to-l from-white via-white to-transparent">
                <div className="flex items-center gap-0.5">
                  <Button
                    variant="ghost"
                    className="h-[28px] px-2 bg-[#448aff] hover:bg-[#3d7ae6] text-white text-[11px] font-bold rounded-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOrderState({ isOpen: true, type: 'BUY', symbol: stock.symbol, ltp: stock.price });
                    }}
                  >
                    B
                  </Button>
                  <Button
                    variant="ghost"
                    className="h-[28px] px-2 bg-[#ff5722] hover:bg-[#f4511e] text-white text-[11px] font-bold rounded-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOrderState({ isOpen: true, type: 'SELL', symbol: stock.symbol, ltp: stock.price });
                    }}
                  >
                    S
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-none"
                    onClick={(e) => { e.stopPropagation(); toast.info(`Market Depth for ${stock.symbol}`); }}
                  >
                    <BarChart2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-none rounded-r-sm"
                    onClick={(e) => handleRemoveFromWatchlist(e, stock.symbol, stock.exchange || 'NSE')}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <div className="text-right flex flex-col items-end group-hover:opacity-0 transition-opacity">
                <div className="flex items-center gap-1.5">
                  <span className="text-[13px] font-medium text-slate-600">
                    {stock.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-normal text-slate-400">
                    {stock.change >= 0 ? '+' : ''}{stock.change.toFixed(2)}%
                  </span>
                  {stock.change >= 0 ? <ArrowUpRight className="h-2.5 w-2.5 text-[#4caf50]" /> : <ArrowDownRight className="h-2.5 w-2.5 text-[#ff5722]" />}
                </div>
              </div>
            </div>
          ))}

          {/* Add Indices to watchlist too */}
          {(market.indices as MarketItem[]).map((idx) => (
            <div
              key={idx.symbol}
              className="group px-4 py-3 border-b border-slate-50 flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer bg-blue-50/20"
            >
              <div className="flex flex-col">
                <span className="text-sm font-black tracking-tight text-blue-700">
                  {idx.symbol}
                </span>
                <Badge variant="secondary" className="text-[8px] h-3 px-1 py-0 w-fit mt-0.5 border-blue-200 text-blue-600 bg-white">INDEX</Badge>
              </div>
              <div className="text-right">
                <p className="text-sm font-black text-slate-900">₹{idx.price.toLocaleString('en-IN')}</p>
                <span className={cn(
                  "text-[10px] font-bold",
                  idx.change >= 0 ? "text-emerald-500" : "text-red-500"
                )}>
                  {idx.change >= 0 ? '+' : ''}{idx.change.toFixed(2)}%
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Watchlist pagination - Official Kite Style */}
        <div className="h-9 border-t border-slate-50 bg-white flex items-center shadow-[0_-2px_10px_rgba(0,0,0,0.02)]">
          {[1, 2, 3, 4, 5, 6, 7].map((num) => (
            <div
              key={num}
              className={cn(
                "flex-1 h-full flex items-center justify-center text-[11px] font-bold cursor-pointer transition-colors border-r border-slate-50 last:border-r-0",
                num === 1 ? "bg-slate-100 text-slate-700" : "text-slate-300 hover:bg-slate-50 hover:text-slate-500"
              )}
            >
              {num}
            </div>
          ))}
        </div>
      </div>

      {/* ── Main Area ── */}
      <div className="flex-1 overflow-y-auto bg-slate-50/20 p-8 flex flex-col gap-8 scrollbar-hide">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            Hi, Aarsh <span className="wave">👋</span>
          </h1>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">Market Status</p>
              <div className="flex items-center gap-1.5 justify-end">
                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-bold text-slate-700 uppercase">Live</span>
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

        {/* Holdings Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-3 shadow-sm border-slate-100 overflow-hidden">
            <CardHeader className="pb-2 border-b border-slate-50">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-bold text-slate-600 flex items-center gap-2">
                  <PieChartIcon className="h-4 w-4" />
                  Holdings ({holdings.length})
                </CardTitle>
                <div className="flex gap-4">
                  <div className="flex items-center gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Current value</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Invested</span>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="grid grid-cols-1 md:grid-cols-4 items-center">
                <div className="p-8 md:col-span-2 border-r border-slate-50 flex flex-col justify-center">
                  <div className="flex items-baseline gap-2">
                    <span className={cn(
                      "text-5xl font-black tracking-tighter",
                      stats.pnl >= 0 ? "text-emerald-500" : "text-orange-600"
                    )}>
                      {stats.pnl >= 0 ? "" : "-"}₹{Math.abs(stats.pnl).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </span>
                    <span className={cn(
                      "text-lg font-bold",
                      stats.pnl >= 0 ? "text-emerald-400" : "text-orange-400"
                    )}>
                      {stats.pnl >= 0 ? "+" : ""}{stats.pnlPercent.toFixed(2)}%
                    </span>
                  </div>
                  <span className="text-sm font-bold text-slate-400 uppercase tracking-widest mt-1">Total P&L</span>

                  {/* Allocation Bar */}
                  <div className="mt-8">
                    <div className="h-8 w-full rounded-md bg-slate-100 overflow-hidden flex shadow-inner">
                      {allocationData.map((item, idx) => (
                        <div
                          key={item.symbol}
                          style={{
                            width: `${(item.value / stats.currentValue) * 100}%`,
                            backgroundColor: item.color
                          }}
                          className="h-full hover:brightness-110 transition-all cursor-help"
                          title={`${item.symbol}: ${((item.value / stats.currentValue) * 100).toFixed(1)}%`}
                        />
                      ))}
                    </div>
                    <div className="flex justify-between items-center mt-3">
                      <span className="text-xs font-black text-slate-700">₹{stats.currentValue.toLocaleString('en-IN')}</span>
                      <div className="flex gap-4 text-[10px] font-bold text-slate-400">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input type="radio" name="view" defaultChecked className="h-2 w-2 accent-blue-600" /> Current value
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input type="radio" name="view" className="h-2 w-2 accent-blue-600" /> Invested
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input type="radio" name="view" className="h-2 w-2 accent-blue-600" /> P&L
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-8 flex flex-col items-center justify-center gap-2 border-r border-slate-50 h-full">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Current value</span>
                  <span className="text-xl font-black text-slate-800 tracking-tight">₹{(stats.currentValue / 1000).toFixed(2)}k</span>
                </div>

                <div className="p-8 flex flex-col items-center justify-center gap-2 h-full">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Investment</span>
                  <span className="text-xl font-black text-slate-800 tracking-tight">₹{(stats.totalInvestment / 1000).toFixed(2)}k</span>
                </div>
              </div>
            </CardContent>
          </Card>
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
