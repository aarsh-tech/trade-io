"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Briefcase, TrendingUp, TrendingDown, RefreshCcw, Zap, Search,
  ShoppingCart, Plus, Minus, Info, Box, Settings2, Calculator,
  ChevronDown, MousePointer2, LayoutGrid, BarChart3, Clock, Wallet, X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useBrokers } from "@/hooks/useBrokers";
import { usePortfolio } from "@/hooks/usePortfolio";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { marketApi } from "@/lib/api";
import { toast } from "sonner";
import { OrderWindow } from "@/components/dashboard/OrderWindow";

export default function PortfolioPage() {
  const { brokers = [], isLoading: brokersLoading } = useBrokers();
  const [selectedBroker, setSelectedBroker] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"holdings" | "positions">("holdings");
  const [showRenewModal, setShowRenewModal] = useState(false);
  const [requestToken, setRequestToken] = useState("");

  // Trade Modal State
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [tradeSearch, setTradeSearch] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<any | null>(null);
  const [orderSide, setOrderSide] = useState<"BUY" | "SELL">("BUY");
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState<number | "">("");
  const [orderType, setOrderType] = useState<"MARKET" | "LIMIT">("MARKET");
  const [productType, setProductType] = useState<"CNC" | "MIS" | "NRML">("CNC");
  const [isSearching, setIsSearching] = useState(false);
  const [selectedExchange, setSelectedExchange] = useState<"NSE" | "BSE">("NSE");

  // Order Window State
  const [orderState, setOrderState] = useState<{
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

  const {
    holdings = [],
    positions = [],
    margins,
    isLoading: holdingsLoading,
    isPositionsLoading,
    refreshHoldings,
    renewSession,
    isRenewing,
    getLoginUrl,
    placeOrder
  } = usePortfolio(selectedBroker);

  // Debounced Search
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (tradeSearch.length >= 2 && !selectedSymbol) {
        try {
          setIsSearching(true);
          const res = await marketApi.search(tradeSearch, selectedBroker);
          setSearchResults(res.data.data);
        } catch {
          setSearchResults([]);
        } finally {

          setIsSearching(false);
        }
      } else {
        setSearchResults([]);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [tradeSearch, selectedSymbol]);

  const openTrade = (item?: any, side: "BUY" | "SELL" = "BUY") => {
    if (!selectedBroker) {
      toast.error("Please select a broker account first");
      return;
    }
    if (item) {
      setOrderState({
        isOpen: true,
        type: side,
        symbol: item.symbol,
        ltp: item.ltpNSE || item.ltpBSE || item.ltp || item.avgPrice || 0
      });
    } else {
      setSelectedSymbol(null);
      setTradeSearch("");
      setOrderSide(side);
      setShowTradeModal(true);
    }
  };

  const handlePlaceOrder = async () => {
    if (!selectedSymbol) return;
    if (!qty || qty <= 0) {
      toast.error("Please enter a valid quantity");
      return;
    }
    if (orderType === "LIMIT" && (!price || Number(price) <= 0)) {
      toast.error("Please enter a valid price for Limit order");
      return;
    }

    try {
      await placeOrder({
        symbol: selectedSymbol.symbol,
        exchange: selectedExchange,
        side: orderSide,
        qty: Number(qty),
        orderType: orderType,
        product: productType,
        price: orderType === "LIMIT" ? Number(price) : undefined,
      });
      setShowTradeModal(false);
      setSelectedSymbol(null);
      setTradeSearch("");
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Failed to place order");
    }
  };



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

  const getLTP = () => {
    if (!selectedSymbol) return 0;
    return selectedExchange === "NSE" ? selectedSymbol.ltpNSE : selectedSymbol.ltpBSE;
  };

  return (
    <div className="space-y-6 animate-[fade-up_0.4s_ease_both]">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Portfolio</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Monitor your holdings and open positions across brokers
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            className="h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[160px]"
            value={selectedBroker || ""}
            onChange={(e) => setSelectedBroker(e.target.value)}
          >
            <option value="" disabled>Select Broker Account</option>
            {brokers?.map((b: any) => (
              <option key={b.id} value={b.id}>{b.broker} ({b.clientId})</option>
            ))}
            {brokers?.length === 0 && !brokersLoading && <option disabled>No brokers connected</option>}
          </select>

          <Button
            className="gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold"
            size="sm"
            onClick={() => openTrade()}
          >
            <ShoppingCart className="h-4 w-4" /> Place Order
          </Button>

          {selectedBroker && (
            <Button variant="outline" size="sm" className="gap-2 border-orange-200 text-orange-700 bg-orange-50 hover:bg-orange-100" onClick={() => setShowRenewModal(true)}>
              <Zap className="h-4 w-4" /> Daily Login
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            className="border-slate-200 h-10 w-10 flex items-center justify-center p-0"
            onClick={() => refreshHoldings()}
            disabled={holdingsLoading}
          >
            <RefreshCcw className={cn("h-4 w-4 text-slate-500", holdingsLoading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-white border-slate-100 shadow-sm">
          <CardContent className="pt-6">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 opacity-70">Total Equity</p>
            <h3 className="text-2xl font-black text-slate-900 tracking-tight">₹{holdings.reduce((sum: number, h: any) => sum + (h.ltp * h.qty || 0), 0).toLocaleString()}</h3>
            <p className="text-[10px] font-bold text-slate-400 mt-1">INVESTED: ₹{holdings.reduce((sum: number, h: any) => sum + (h.avgPrice * h.qty || 0), 0).toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="bg-white border-slate-100 shadow-sm border-l-4 border-l-blue-500">
          <CardContent className="pt-6">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 opacity-70">Total P&L</p>
            <div className="flex items-center gap-2">
              <h3 className={cn("text-2xl font-black tracking-tight", holdings.reduce((sum: number, h: any) => sum + (h.pnl || 0), 0) >= 0 ? "text-green-600" : "text-red-500")}>
                {holdings.reduce((sum: number, h: any) => sum + (h.pnl || 0), 0) >= 0 ? "+" : ""}₹{Math.abs(holdings.reduce((sum: number, h: any) => sum + (h.pnl || 0), 0)).toLocaleString()}
              </h3>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white border-slate-100 shadow-sm">
          <CardContent className="pt-6">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 opacity-70">Connection Status</p>
            <div className="flex items-center gap-2">
              <div className={cn("h-2.5 w-2.5 rounded-full", selectedBroker ? "bg-green-500 animate-pulse" : "bg-slate-300")} />
              <span className="text-sm font-bold text-slate-700">{selectedBroker ? "Active Session" : "Disconnected"}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden min-h-[400px]">
        <div className="flex border-b border-slate-100 bg-slate-50/30">
          <button
            onClick={() => setActiveTab("holdings")}
            className={cn(
              "px-8 py-4 text-xs font-bold uppercase tracking-widest transition-all border-b-2",
              activeTab === "holdings"
                ? "border-blue-600 text-blue-600 bg-white"
                : "border-transparent text-slate-400 hover:text-slate-600"
            )}
          >
            Holdings ({holdings?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab("positions")}
            className={cn(
              "px-8 py-4 text-xs font-black uppercase tracking-widest transition-all border-b-2",
              activeTab === "positions"
                ? "border-blue-600 text-blue-600 bg-white"
                : "border-transparent text-slate-400 hover:text-slate-600"
            )}
          >
            Positions ({positions?.length || 0})
          </button>
        </div>

        <div className="p-0 overflow-x-auto">
          {!selectedBroker ? (
            <div className="py-32 text-center">
              <div className="h-16 w-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100">
                <Briefcase className="h-8 w-8 text-slate-200" />
              </div>
              <h3 className="text-base font-bold text-slate-900">Select a broker account</h3>
              <p className="text-xs text-slate-400 max-w-[200px] mx-auto mt-1">Connect your trading account to see live data</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Instrument</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Qty</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Avg. Cost</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">LTP</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Returns</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {activeTab === "holdings" && holdings?.map((h: any) => (
                  <tr key={h.symbol} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-6 py-5">
                      <div>
                        <p className="text-sm font-black text-slate-900 group-hover:text-blue-600 transition-colors">{h.symbol}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">NSE: Equity</p>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-sm font-bold text-slate-600">{h.qty}</td>
                    <td className="px-6 py-5 text-sm font-bold text-slate-600 text-right">₹{h.avgPrice?.toLocaleString()}</td>
                    <td className="px-6 py-5 text-sm font-black text-slate-900 text-right">₹{h.ltp?.toLocaleString()}</td>
                    <td className="px-6 py-5 text-right">
                      <p className={cn("text-sm font-bold", (h.pnl || 0) >= 0 ? "text-green-600" : "text-red-500")}>
                        {(h.pnl || 0) >= 0 ? "+" : ""}₹{Math.abs(h.pnl || 0).toLocaleString()}
                      </p>
                      <p className={cn("text-[10px] font-bold opacity-70", (h.pnl || 0) >= 0 ? "text-green-500" : "text-red-400")}>
                        {(h.pnl || 0) >= 0 ? "+" : ""}{h.pnlPct || 0}%
                      </p>
                    </td>
                    <td className="px-6 py-5 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <Button size="sm" className="h-8 px-4 bg-green-600 hover:bg-green-700 text-white font-bold text-[10px] tracking-tight" onClick={() => openTrade(h, "BUY")}>BUY</Button>
                        <Button size="sm" className="h-8 px-4 bg-red-600 hover:bg-red-700 text-white font-bold text-[10px] tracking-tight" onClick={() => openTrade(h, "SELL")}>SELL</Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {(activeTab === "holdings" && holdings?.length === 0 && !holdingsLoading) && (
                  <tr>
                    <td colSpan={6} className="py-32 text-center text-slate-400 italic text-xs font-bold">
                      Holdings not loaded. Please perform a Daily Login.
                    </td>
                  </tr>
                )}
                {activeTab === "positions" && positions?.map((p: any) => (
                  <tr key={p.symbol} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-2">
                        <div>
                          <p className="text-sm font-black text-slate-900 group-hover:text-blue-600 transition-colors">{p.symbol}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className={cn("text-[9px] px-1.5 py-0.5 rounded font-black text-white", p.side === "BUY" ? "bg-blue-500" : "bg-orange-500")}>
                              {p.side}
                            </span>
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter bg-slate-100 px-1.5 py-0.5 rounded">{p.product}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-sm font-bold text-slate-600">{p.qty}</td>
                    <td className="px-6 py-5 text-sm font-bold text-slate-600 text-right">₹{p.avgPrice?.toLocaleString()}</td>
                    <td className="px-6 py-5 text-sm font-black text-slate-900 text-right">₹{p.ltp?.toLocaleString()}</td>
                    <td className="px-6 py-5 text-right">
                      <p className={cn("text-sm font-black", (p.pnl || 0) >= 0 ? "text-green-600" : "text-red-500")}>
                        {(p.pnl || 0) >= 0 ? "+" : ""}₹{Math.abs(p.pnl || 0).toLocaleString()}
                      </p>
                    </td>
                    <td className="px-6 py-5 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <Button size="sm" className="h-8 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10px] tracking-tight" onClick={() => openTrade(p, "BUY")}>BUY More</Button>
                        <Button size="sm" className="h-8 px-4 bg-orange-600 hover:bg-orange-700 text-white font-bold text-[10px] tracking-tight" onClick={() => openTrade(p, "SELL")}>Exit</Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {(activeTab === "positions" && positions?.length === 0 && !isPositionsLoading) && (
                  <tr>
                    <td colSpan={6} className="py-32 text-center text-slate-400 italic text-xs font-bold font-medium">No open positions</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Trade Modal */}
      <Dialog open={showTradeModal} onOpenChange={setShowTradeModal}>
        <DialogContent className="max-w-[800px] p-0 overflow-hidden border-none shadow-2xl rounded-xl">
          <div className={cn("px-8 py-6 flex items-center justify-between", orderSide === "BUY" ? "bg-blue-600" : "bg-orange-600")}>
            <div className="flex items-center gap-4">
              <div className="bg-white/10 p-2.5 rounded-lg backdrop-blur-md">
                <TrendingUp className="h-6 w-6 text-white" />
              </div>
              <div className="flex flex-col">
                <h2 className="text-white font-bold text-2xl tracking-tight leading-none mb-1">
                  {orderSide} {selectedSymbol?.symbol || "Select Asset"}
                </h2>
                <div className="flex gap-2 items-center text-[11px] font-semibold text-white/70 uppercase tracking-widest">
                  <span className="bg-white/20 px-1.5 py-0.5 rounded">{selectedExchange}</span>
                  <span>•</span>
                  <span>{selectedSymbol?.name || "Search and select from NSE/BSE"}</span>
                </div>
              </div>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-white font-bold text-3xl tracking-tighter tabular-nums leading-none">₹{getLTP()?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <div className="flex items-center gap-1.5 mt-1">
                <div className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                <span className="text-white/60 text-[10px] font-bold uppercase tracking-widest">Live Market Price</span>
              </div>
            </div>
          </div>

          <div className="flex h-[480px]">
            {/* Left Panel: Search & Instrument Selection */}
            <div className="w-[340px] border-r border-slate-100 p-6 bg-slate-50/50">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Instrument Search</span>
                  {selectedSymbol && (
                    <button
                      onClick={() => { setSelectedSymbol(null); setTradeSearch(""); }}
                      className="text-[10px] font-bold text-blue-600 hover:text-blue-700 bg-blue-50 px-2 py-1 rounded"
                    >
                      CHANGE
                    </button>
                  )}
                </div>

                {!selectedSymbol ? (
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      autoFocus
                      placeholder="Search Stocks..."
                      className="pl-10 h-12 border-slate-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-bold bg-white"
                      value={tradeSearch}
                      onChange={(e) => setTradeSearch(e.target.value)}
                    />

                    {searchResults.length > 0 && (
                      <div className="absolute top-full left-0 right-0 z-50 mt-2 bg-white border border-slate-200 rounded-lg shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 scale-100">
                        {/* Table Headers */}
                        <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          <div className="w-24">Symbol</div>
                          <div className="flex-1">Description</div>
                          <div className="w-16 text-right">Exch.</div>
                        </div>

                        <div className="max-h-[340px] overflow-y-auto">
                          {searchResults.map((item: any) => {
                            const highlightMatch = (text: string) => {
                              if (!tradeSearch) return text;
                              const parts = text.split(new RegExp(`(${tradeSearch})`, 'gi'));
                              return parts.map((part, i) =>
                                part.toLowerCase() === tradeSearch.toLowerCase()
                                  ? <span key={i} className="text-blue-600 font-black">{part.toUpperCase()}</span>
                                  : part.toUpperCase()
                              );
                            };

                            return (
                              <button
                                key={item.symbol + item.exchange}
                                className="w-full px-5 py-3.5 text-left hover:bg-blue-50/50 flex items-center group border-b border-slate-50 last:border-0 transition-colors"
                                onClick={() => {
                                  setShowTradeModal(false);
                                  setOrderState({
                                    isOpen: true,
                                    type: orderSide,
                                    symbol: item.symbol,
                                    ltp: item.price || item.ltpNSE || item.ltpBSE || 0
                                  });
                                }}
                              >
                                <div className="w-24 font-bold text-slate-900 group-hover:text-blue-700 text-xs">
                                  {highlightMatch(item.symbol || "")}
                                </div>
                                <div className="flex-1 text-[10px] font-semibold text-slate-500 uppercase tracking-tight truncate pr-4">
                                  {highlightMatch(item.name || "")}
                                </div>
                                <div className="w-16 text-right">
                                  <span className="text-[10px] font-bold text-slate-400 group-hover:text-slate-600">{item.exchange}</span>
                                </div>
                              </button>
                            );
                          })}
                        </div>

                        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 text-center">
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter italic">Simply select a row to populate the trade engine</p>
                        </div>
                      </div>
                    )}

                    {isSearching && (
                      <div className="absolute top-full left-0 right-0 p-8 text-center bg-white border border-slate-100 shadow-xl z-50 rounded-lg">
                        <RefreshCcw className="h-6 w-6 animate-spin mx-auto text-blue-500 opacity-50" />
                        <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase">Scanning Markets...</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-white p-5 rounded-xl border border-blue-100 shadow-sm space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-blue-50 flex items-center justify-center font-bold text-blue-600">
                        {selectedSymbol.symbol[0]}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900 leading-none">{selectedSymbol.symbol}</p>
                        <p className="text-[10px] font-semibold text-slate-400 mt-1 uppercase">{selectedSymbol.name}</p>
                      </div>
                    </div>
                    <div className="pt-4 border-t border-slate-50 flex justify-between">
                      <div className="flex flex-col">
                        <span className="text-[9px] font-bold text-slate-400 uppercase">Avg. Vol</span>
                        <span className="text-xs font-bold text-slate-700">1.2M</span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-[9px] font-bold text-slate-400 uppercase">Day Range</span>
                        <span className="text-xs font-bold text-slate-700">₹1,240 - ₹1,290</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="pt-6">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="h-px flex-1 bg-slate-200" />
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Exchange Toggles</span>
                    <div className="h-px flex-1 bg-slate-200" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {['NSE', 'BSE'].map(ex => (
                      <button
                        key={ex}
                        onClick={() => setSelectedExchange(ex as any)}
                        className={cn(
                          "px-4 py-3 rounded-lg border text-center transition-all",
                          selectedExchange === ex
                            ? "border-blue-500 bg-blue-600 text-white shadow-lg shadow-blue-100"
                            : "border-slate-200 text-slate-500 hover:border-slate-300 bg-white"
                        )}
                      >
                        <span className="font-bold text-xs">{ex}</span>
                        <p className={cn("text-[8px] font-bold mt-0.5", selectedExchange === ex ? "text-white/70" : "text-slate-400")}>
                          ₹{ex === 'NSE' ? selectedSymbol?.ltpNSE || '0.00' : selectedSymbol?.ltpBSE || '0.00'}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Right Panel: Order Parameters */}
            <div className="flex-1 p-8 overflow-y-auto">
              {!selectedSymbol ? (
                <div className="h-full flex flex-col items-center justify-center text-center opacity-50 grayscale">
                  <div className="bg-slate-100 p-8 rounded-full mb-6">
                    <MousePointer2 className="h-12 w-12 text-slate-400 mx-auto" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">Select an instrument</h3>
                  <p className="text-sm font-medium text-slate-500 max-w-[200px] mt-1">Please search and select a stock to start placing orders.</p>
                </div>
              ) : (
                <div className="space-y-8 animate-in fade-in duration-500">
                  {/* Product & Order Type Sections */}
                  <div className="grid grid-cols-2 gap-12">
                    <div className="space-y-4">
                      <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                        <Box className="h-3 w-3" /> Product Type
                      </label>
                      <div className="flex p-1 bg-slate-100 rounded-xl">
                        {[
                          { id: 'CNC', label: 'Longterm', sub: 'CNC' },
                          { id: 'MIS', label: 'Intraday', sub: 'MIS' }
                        ].map(p => (
                          <button
                            key={p.id}
                            onClick={() => setProductType(p.id as any)}
                            className={cn(
                              "flex-1 py-3 px-2 rounded-lg text-center transition-all",
                              productType === p.id
                                ? "bg-white text-blue-600 shadow-md font-bold"
                                : "text-slate-500 font-semibold hover:text-slate-700"
                            )}
                          >
                            <div className="text-xs">{p.label}</div>
                            <div className="text-[8px] opacity-70 uppercase tracking-tighter mt-0.5">{p.sub}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                        <Settings2 className="h-3 w-3" /> Variety
                      </label>
                      <div className="flex p-1 bg-slate-100 rounded-xl">
                        {["MARKET", "LIMIT"].map((t: any) => (
                          <button
                            key={t}
                            onClick={() => setOrderType(t)}
                            className={cn(
                              "flex-1 py-3 rounded-lg text-center transition-all text-xs",
                              orderType === t
                                ? "bg-white text-slate-900 shadow-md font-bold"
                                : "text-slate-500 font-semibold hover:text-slate-700"
                            )}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Input Fields */}
                  <div className="grid grid-cols-2 gap-8 pt-4">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Quantity</label>
                        <span className="text-[10px] font-bold text-slate-300">Min: 1</span>
                      </div>
                      <div className="relative group">
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 font-bold group-focus-within:text-blue-500 transition-colors">#</div>
                        <Input
                          type="number"
                          value={qty}
                          onChange={(e) => setQty(Number(e.target.value))}
                          className="pl-10 h-16 border-slate-200 bg-slate-50/50 font-bold text-xl rounded-2xl focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500 transition-all"
                        />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Price (₹)</label>
                        <span className="text-[10px] font-bold text-slate-300">{orderType === "MARKET" ? "CURRENT PRICE" : "SET LIMIT"}</span>
                      </div>
                      <div className="relative group">
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 font-bold group-focus-within:text-blue-500 transition-colors">₹</div>
                        <Input
                          type="number"
                          disabled={orderType === "MARKET"}
                          placeholder={orderType === "MARKET" ? "Market" : "0.00"}
                          value={price}
                          onChange={(e) => setPrice(e.target.value === "" ? "" : Number(e.target.value))}
                          className="pl-10 h-16 border-slate-200 bg-slate-50/50 font-bold text-xl rounded-2xl focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500 disabled:opacity-50 transition-all"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="bg-blue-50/50 p-6 rounded-2xl border border-blue-100/50 mt-10">
                    <div className="flex items-start gap-3">
                      <div className="bg-blue-100 p-2 rounded-lg">
                        <Calculator className="h-5 w-5 text-blue-600" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-baseline justify-between mb-2">
                          <span className="text-xs font-bold text-slate-600">Total Capital Required</span>
                          <span className="text-xl font-bold text-blue-700 tracking-tighter">
                            ₹{(Number(qty) * (Number(price) || getLTP())).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </span>
                        </div>
                        <p className="text-[10px] font-semibold text-slate-400 border-t border-slate-200 pt-2 leading-relaxed uppercase tracking-tighter">
                          Final margin amount is calculated based on current market depth and selected leverage.
                          Broker charges apply.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="px-8 py-6 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2 group cursor-help">
                <div className="bg-white p-2 rounded-full border border-slate-200 shadow-sm group-hover:border-blue-200 transition-all">
                  <Zap className="h-4 w-4 text-orange-500" />
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-slate-400 leading-none">MODE</span>
                  <span className="text-xs font-bold text-slate-700 mt-1">{productType === "CNC" ? "INVESTMENT" : "INTRADAY"}</span>
                </div>
              </div>
              <div className="h-8 w-px bg-slate-200" />
              <button className="flex items-center gap-2 group opacity-60 hover:opacity-100 transition-opacity">
                <span className="text-[10px] font-bold text-slate-400 tracking-widest leading-none">ADVANCED OPTIONS</span>
                <ChevronDown className="h-3 w-3 text-slate-400 group-hover:translate-y-0.5 transition-transform" />
              </button>
            </div>

            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                className="font-bold text-slate-400 hover:text-red-500 hover:bg-red-50 text-xs tracking-tight px-6 h-12"
                onClick={() => setShowTradeModal(false)}
              >
                DISCARD
              </Button>
              <Button
                disabled={!selectedSymbol}
                onClick={handlePlaceOrder}
                className={cn(
                  "h-14 px-16 font-bold text-base tracking-tight rounded-xl shadow-2xl transition-all active:scale-95",
                  orderSide === "BUY"
                    ? "bg-blue-600 hover:bg-blue-700 shadow-blue-500/20"
                    : "bg-orange-600 hover:bg-orange-700 shadow-orange-500/20"
                )}
              >
                {orderSide === "BUY" ? "BUY NOW" : "SELL NOW"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>



      {/* Renew Session Modal */}


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
                1. Open Broker Login Page
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
                <Button type="button" onClick={() => handleRenewSession({ preventDefault: () => {} } as any)} disabled={isRenewing} className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-md">
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
        availableMargin={margins?.equity?.available?.live_balance ?? margins?.equity?.available?.cash ?? 0}
        brokerId={selectedBroker || undefined}
        onTypeChange={(newType) => setOrderState(prev => ({ ...prev, type: newType }))}
      />
    </div>
  );
}

