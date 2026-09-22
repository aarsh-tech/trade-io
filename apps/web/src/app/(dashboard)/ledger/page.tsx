"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { orderApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Award,
  BarChart3,
  BookOpen,
  Calendar,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Flame,
  Loader2,
  RefreshCcw,
  Search,
  TrendingDown,
  TrendingUp,
  XCircle
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

interface ClosedTrade {
  id: string;
  symbol: string;
  exchange: string;
  product: string;
  side: "LONG" | "SHORT";
  qty: number;
  entryPrice: number;
  exitPrice: number;
  entryTime: string;
  exitTime: string;
  date: string;
  holdingDuration: string;
  realizedPnl: number;
  pnlPct: number;
  status: "PROFIT" | "LOSS" | "BREAKEVEN";
  strategyName?: string;
}

interface DailyLedgerItem {
  date: string;
  formattedDate: string;
  dayOfWeek: string;
  tradesCount: number;
  pnl: number;
  wins: number;
  losses: number;
  winRate: number;
  status: "PROFIT" | "LOSS" | "BREAKEVEN";
  cumulativePnl: number;
  trades: ClosedTrade[];
}

interface MonthlyLedgerData {
  selectedMonth: number;
  selectedYear: number;
  availableMonths: Array<{ month: number; year: number; label: string }>;
  summary: {
    totalRealizedPnl: number;
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    breakevenTrades: number;
    winRate: number;
    totalGrossProfit: number;
    totalGrossLoss: number;
    profitFactor: number;
    tradingDaysCount: number;
    profitableDays: number;
    lossDays: number;
    breakevenDays: number;
    avgDailyPnl: number;
    avgTradePnl: number;
    avgWin: number;
    avgLoss: number;
    bestTrade: ClosedTrade | null;
    worstTrade: ClosedTrade | null;
  };
  chartSeries: Array<{ date: string; dailyPnl: number; cumulativePnl: number }>;
  dailyLedger: DailyLedgerItem[];
  closedTrades: ClosedTrade[];
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

/**
 * Formats option trading symbols into readable Zerodha labels
 */
function formatOptionSymbol(rawSymbol: string) {
  if (!rawSymbol) return { displayName: "", isDerivative: false };

  // Weekly index option pattern: NIFTY2690124250PE
  const weeklyMatch = rawSymbol.match(/^([A-Z]+)(\d{2})([1-9OND])(\d{2})(\d+)(CE|PE)$/i);
  if (weeklyMatch) {
    const [_, underlying, , mCode, day, strike, optType] = weeklyMatch;
    const monthNames: Record<string, string> = {
      "1": "JAN", "2": "FEB", "3": "MAR", "4": "APR", "5": "MAY", "6": "JUN",
      "7": "JUL", "8": "AUG", "9": "SEP", "O": "OCT", "N": "NOV", "D": "DEC"
    };
    const month = monthNames[mCode.toUpperCase()] || mCode;
    const dayNum = parseInt(day, 10);
    const suffix = dayNum === 1 || dayNum === 21 || dayNum === 31 ? "st" : dayNum === 2 || dayNum === 22 ? "nd" : dayNum === 3 || dayNum === 23 ? "rd" : "th";
    return {
      displayName: `${underlying} ${dayNum}${suffix} ${month} ${strike} ${optType.toUpperCase()}`,
      isDerivative: true,
      strike,
      optType: optType.toUpperCase(),
      underlying,
    };
  }

  // Monthly option pattern: NIFTY26SEP24250PE
  const monthlyMatch = rawSymbol.match(/^([A-Z]+)(\d{2})([A-Z]{3})(\d+)(CE|PE)$/i);
  if (monthlyMatch) {
    const [_, underlying, , month, strike, optType] = monthlyMatch;
    return {
      displayName: `${underlying} ${month.toUpperCase()} ${strike} ${optType.toUpperCase()}`,
      isDerivative: true,
      strike,
      optType: optType.toUpperCase(),
      underlying,
    };
  }

  return {
    displayName: rawSymbol,
    isDerivative: false,
  };
}

export default function MonthlyLedgerPage() {
  const queryClient = useQueryClient();
  const currentDate = new Date();
  const [selectedMonth, setSelectedMonth] = useState<number>(currentDate.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(currentDate.getFullYear());
  const [tradeFilter, setTradeFilter] = useState<"ALL" | "PROFIT" | "LOSS">("ALL");
  const [segmentFilter, setSegmentFilter] = useState<"ALL" | "EQUITY" | "FNO">("ALL");
  const [searchSymbol, setSearchSymbol] = useState("");
  const [selectedDateFilter, setSelectedDateFilter] = useState<string | null>(null);

  const { data: ledgerResponse, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["ledger", selectedMonth, selectedYear],
    queryFn: async () => {
      const res = await orderApi.ledger({ month: selectedMonth, year: selectedYear });
      return res.data?.data as MonthlyLedgerData;
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await orderApi.sync();
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(data?.data?.message || "Synced latest trades with broker");
      queryClient.invalidateQueries({ queryKey: ["ledger"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || "Failed to sync broker trades");
    },
  });

  const summary = ledgerResponse?.summary || {
    totalRealizedPnl: 0,
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    breakevenTrades: 0,
    winRate: 0,
    totalGrossProfit: 0,
    totalGrossLoss: 0,
    profitFactor: 0,
    tradingDaysCount: 0,
    profitableDays: 0,
    lossDays: 0,
    breakevenDays: 0,
    avgDailyPnl: 0,
    avgTradePnl: 0,
    avgWin: 0,
    avgLoss: 0,
    bestTrade: null,
    worstTrade: null,
  };

  const dailyLedger = useMemo(() => ledgerResponse?.dailyLedger || [], [ledgerResponse]);
  const closedTrades = useMemo(() => ledgerResponse?.closedTrades || [], [ledgerResponse]);

  // Month navigation helpers
  const handlePrevMonth = () => {
    setSelectedDateFilter(null);
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear((prev) => prev - 1);
    } else {
      setSelectedMonth((prev) => prev - 1);
    }
  };

  const handleNextMonth = () => {
    setSelectedDateFilter(null);
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear((prev) => prev + 1);
    } else {
      setSelectedMonth((prev) => prev + 1);
    }
  };

  const handleCurrentMonth = () => {
    setSelectedDateFilter(null);
    setSelectedMonth(currentDate.getMonth() + 1);
    setSelectedYear(currentDate.getFullYear());
  };

  // Filtered Closed Trades
  const filteredTrades = useMemo(() => {
    return closedTrades.filter((t) => {
      const matchesStatus =
        tradeFilter === "ALL" ? true : t.status === tradeFilter;
      const matchesDate =
        selectedDateFilter === null ? true : t.date === selectedDateFilter;

      const isFno = t.exchange === "NFO" || t.symbol.includes("CE") || t.symbol.includes("PE") || t.symbol.includes("FUT");
      const matchesSegment =
        segmentFilter === "ALL" ? true : segmentFilter === "FNO" ? isFno : !isFno;

      const formatted = formatOptionSymbol(t.symbol);
      const matchesSearch =
        searchSymbol.trim() === ""
          ? true
          : t.symbol.toLowerCase().includes(searchSymbol.toLowerCase()) ||
          formatted.displayName.toLowerCase().includes(searchSymbol.toLowerCase()) ||
          t.strategyName?.toLowerCase().includes(searchSymbol.toLowerCase());

      return matchesStatus && matchesDate && matchesSegment && matchesSearch;
    });
  }, [closedTrades, tradeFilter, segmentFilter, selectedDateFilter, searchSymbol]);

  // Segment counts based on current month / selected date
  const segmentCounts = useMemo(() => {
    let equity = 0;
    let fno = 0;
    closedTrades.forEach((t) => {
      if (selectedDateFilter && t.date !== selectedDateFilter) return;
      const isFno = t.exchange === "NFO" || t.symbol.includes("CE") || t.symbol.includes("PE") || t.symbol.includes("FUT");
      if (isFno) fno++;
      else equity++;
    });
    return { all: equity + fno, equity, fno };
  }, [closedTrades, selectedDateFilter]);

  // Status counts based on current month / selected date
  const statusCounts = useMemo(() => {
    let wins = 0;
    let losses = 0;
    closedTrades.forEach((t) => {
      if (selectedDateFilter && t.date !== selectedDateFilter) return;
      if (t.status === "PROFIT") wins++;
      else if (t.status === "LOSS") losses++;
    });
    return { all: wins + losses, wins, losses };
  }, [closedTrades, selectedDateFilter]);

  // Calendar Day Map
  const dailyPnlMap = useMemo(() => {
    const map = new Map<string, DailyLedgerItem>();
    dailyLedger.forEach((d) => map.set(d.date, d));
    return map;
  }, [dailyLedger]);

  const todayStr = useMemo(() => {
    return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  }, []);

  // Generate Calendar Days for Selected Month (Monday to Sunday grid)
  const calendarDays = useMemo(() => {
    const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
    const firstDayOfWeek = new Date(selectedYear, selectedMonth - 1, 1).getDay(); // 0 = Sun, 1 = Mon ...

    // Shift so Monday is index 0
    const startOffset = (firstDayOfWeek + 6) % 7;

    const days: Array<{
      dayNum: number;
      dateStr: string;
      item: DailyLedgerItem | null;
      isCurrentMonth: boolean;
      isToday: boolean;
    }> = [];

    // Empty offset slots before the 1st of month
    for (let i = 0; i < startOffset; i++) {
      days.push({ dayNum: 0, dateStr: "", item: null, isCurrentMonth: false, isToday: false });
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const item = dailyPnlMap.get(dateStr) || null;
      days.push({
        dayNum: day,
        dateStr,
        item,
        isCurrentMonth: true,
        isToday: dateStr === todayStr,
      });
    }

    return days;
  }, [selectedYear, selectedMonth, dailyPnlMap, todayStr]);

  const isNetProfit = summary.totalRealizedPnl >= 0;

  // CSV Export Handler
  const handleExportCSV = () => {
    if (closedTrades.length === 0) {
      toast.error("No trades available to export for this month");
      return;
    }

    const headers = ["Date", "Time", "Symbol", "Exchange", "Product", "Side", "Qty", "Entry Price", "Exit Price", "Duration", "Realized PnL (INR)", "PnL %", "Status", "Strategy"];
    const rows = closedTrades.map((t) => [
      t.date,
      new Date(t.exitTime).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" }),
      t.symbol,
      t.exchange,
      t.product,
      t.side,
      t.qty,
      t.entryPrice,
      t.exitPrice,
      t.holdingDuration,
      t.realizedPnl,
      t.pnlPct,
      t.status,
      `"${t.strategyName || "Intraday Algo"}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `PnL_Ledger_${MONTH_NAMES[selectedMonth - 1]}_${selectedYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Trade journal exported successfully");
  };

  return (
    <div className="space-y-4 sm:space-y-6 animate-[fade-up_0.3s_ease_both] pb-16 font-sans">
      {/* ── 1. Header & Month Controls ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <BookOpen className="h-5 w-5 sm:h-6 sm:w-6 text-emerald-500 shrink-0" />
              <span>Monthly P&L Ledger & Journal</span>
            </h1>
            <Badge variant="outline" className="text-[10px] sm:text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/20 font-medium">
              Verified Executions
            </Badge>
          </div>
          <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">
            Round-trip trade analytics, calendar heat-matrix, and FIFO realized P&L journal
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-2.5">
          {/* Month Navigation Toolbar */}
          <div className="flex items-center justify-between sm:justify-start bg-card border border-border rounded-xl p-1 shadow-2xs">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0"
              onClick={handlePrevMonth}
              title="Previous Month"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <div className="flex items-center justify-center flex-1 sm:flex-initial px-2 gap-1.5 border-x border-border">
              <select
                value={selectedMonth}
                onChange={(e) => {
                  setSelectedMonth(Number(e.target.value));
                  setSelectedDateFilter(null);
                }}
                className="bg-transparent text-xs font-bold text-foreground focus:outline-none cursor-pointer"
              >
                {MONTH_NAMES.map((name, idx) => (
                  <option key={name} value={idx + 1} className="bg-popover text-foreground">
                    {name}
                  </option>
                ))}
              </select>

              <select
                value={selectedYear}
                onChange={(e) => {
                  setSelectedYear(Number(e.target.value));
                  setSelectedDateFilter(null);
                }}
                className="bg-transparent text-xs font-bold text-foreground focus:outline-none cursor-pointer"
              >
                {[2025, 2026, 2027].map((yr) => (
                  <option key={yr} value={yr} className="bg-popover text-foreground">
                    {yr}
                  </option>
                ))}
              </select>
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0"
              onClick={handleNextMonth}
              title="Next Month"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Action buttons */}
          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCurrentMonth}
              className="text-xs h-9"
            >
              Current Month
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              disabled={closedTrades.length === 0}
              className="gap-1.5 text-xs h-9"
            >
              <Download className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span>Export CSV</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending || isFetching}
              className="gap-1.5 border-emerald-500/30 text-emerald-600 bg-emerald-50/50 hover:bg-emerald-100/50 dark:bg-emerald-950/20 text-xs h-9"
            >
              <RefreshCcw className={cn("h-3.5 w-3.5 shrink-0", syncMutation.isPending && "animate-spin text-emerald-500")} />
              <span>{syncMutation.isPending ? "Syncing..." : "Sync"}</span>
            </Button>

            <Button
              variant="default"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs h-9"
            >
              <RefreshCcw className={cn("h-3.5 w-3.5 shrink-0", isFetching && "animate-spin")} />
              <span>Refresh</span>
            </Button>
          </div>
        </div>
      </div>

      {/* ── 2. Top Summary Metric Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: Net Realized P&L */}
        <Card className={cn(
          "border relative overflow-hidden shadow-2xs backdrop-blur",
          isNetProfit ? "border-emerald-500/30 bg-emerald-500/5" : "border-rose-500/30 bg-rose-500/5"
        )}>
          <CardHeader className="p-4 sm:p-6 pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-[11px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Net Realized P&L ({MONTH_NAMES[selectedMonth - 1]})
            </CardTitle>
            <div className={cn(
              "h-6 w-6 rounded-md flex items-center justify-center shrink-0",
              isNetProfit ? "bg-emerald-500/15 text-emerald-600" : "bg-rose-500/15 text-rose-600"
            )}>
              {isNetProfit ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0">
            <div className={cn(
              "text-2xl sm:text-3xl font-black font-mono tracking-tight",
              isNetProfit ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
            )}>
              {isNetProfit ? "+" : ""}₹{summary.totalRealizedPnl.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="flex items-center gap-2 mt-2 text-[11px] sm:text-xs text-muted-foreground flex-wrap">
              <span>Gross Profit: <span className="text-emerald-500 font-mono font-semibold">+₹{summary.totalGrossProfit.toFixed(0)}</span></span>
              <span>•</span>
              <span>Loss: <span className="text-rose-500 font-mono font-semibold">-₹{summary.totalGrossLoss.toFixed(0)}</span></span>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Win Rate & Profit Factor */}
        <Card className="border-border bg-card/60 backdrop-blur shadow-2xs">
          <CardHeader className="p-4 sm:p-6 pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-[11px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Win Rate & Profit Factor
            </CardTitle>
            <div className="h-6 w-6 rounded-md bg-blue-500/15 text-blue-600 flex items-center justify-center shrink-0">
              <Award className="h-3.5 w-3.5" />
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0">
            <div className="text-2xl sm:text-3xl font-black font-mono text-foreground flex items-baseline gap-2">
              <span>{summary.winRate}%</span>
              <Badge variant="outline" className="text-[10px] font-bold border-blue-500/30 text-blue-600 bg-blue-500/5">
                PF: {summary.profitFactor}x
              </Badge>
            </div>
            <div className="flex items-center gap-2 mt-2 text-[11px] sm:text-xs text-muted-foreground flex-wrap">
              <span>Wins: <strong className="text-emerald-500 font-mono">{summary.winningTrades}</strong></span>
              <span>•</span>
              <span>Losses: <strong className="text-rose-500 font-mono">{summary.losingTrades}</strong></span>
              <span>•</span>
              <span>Total: <strong className="text-foreground font-mono">{summary.totalTrades}</strong></span>
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Trading Days Breakdown */}
        <Card className="border-border bg-card/60 backdrop-blur shadow-2xs">
          <CardHeader className="p-4 sm:p-6 pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-[11px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Sessions Result
            </CardTitle>
            <div className="h-6 w-6 rounded-md bg-purple-500/15 text-purple-600 flex items-center justify-center shrink-0">
              <CalendarDays className="h-3.5 w-3.5" />
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0">
            <div className="text-2xl sm:text-3xl font-black font-mono text-foreground flex items-baseline gap-1.5 flex-wrap">
              <span className="text-emerald-500">{summary.profitableDays}G</span>
              <span className="text-muted-foreground text-sm font-normal">/</span>
              <span className="text-rose-500">{summary.lossDays}R</span>
              <span className="text-[11px] sm:text-xs font-normal text-muted-foreground">({summary.tradingDaysCount} Active)</span>
            </div>
            <div className="w-full bg-muted rounded-full h-1.5 mt-3 flex overflow-hidden">
              <div
                className="bg-emerald-500 h-full transition-all"
                style={{
                  width: `${summary.tradingDaysCount > 0 ? (summary.profitableDays / summary.tradingDaysCount) * 100 : 0}%`,
                }}
              />
              <div
                className="bg-rose-500 h-full transition-all"
                style={{
                  width: `${summary.tradingDaysCount > 0 ? (summary.lossDays / summary.tradingDaysCount) * 100 : 0}%`,
                }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Card 4: Trade Performance Metrics */}
        <Card className="border-border bg-card/60 backdrop-blur shadow-2xs">
          <CardHeader className="p-4 sm:p-6 pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-[11px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Avg Win vs Avg Loss
            </CardTitle>
            <div className="h-6 w-6 rounded-md bg-amber-500/15 text-amber-600 flex items-center justify-center shrink-0">
              <Flame className="h-3.5 w-3.5" />
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0">
            <div className="text-xs sm:text-sm font-bold font-mono text-foreground flex items-center justify-between">
              <span className="text-emerald-500">+₹{summary.avgWin.toFixed(0)} <span className="text-[10px] text-muted-foreground font-normal">avg win</span></span>
              <span className="text-rose-500">-₹{summary.avgLoss.toFixed(0)} <span className="text-[10px] text-muted-foreground font-normal">avg loss</span></span>
            </div>
            <div className="text-[11px] sm:text-xs text-muted-foreground mt-2 flex items-center justify-between border-t border-border pt-2">
              <span>Best: <strong className="text-emerald-500 font-mono">+{summary.bestTrade ? `₹${summary.bestTrade.realizedPnl.toFixed(2)}` : "₹0"}</strong></span>
              <span>Worst: <strong className="text-rose-500 font-mono">{summary.worstTrade ? `₹${summary.worstTrade.realizedPnl.toFixed(2)}` : "₹0"}</strong></span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── 3. Interactive Monthly P&L Calendar Matrix ── */}
      <Card className="border-border bg-card shadow-xs overflow-hidden">
        <CardHeader className="py-3.5 sm:py-4 px-4 sm:px-6 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/20">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
              <Calendar className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-sm font-bold text-foreground">
                {MONTH_NAMES[selectedMonth - 1]} {selectedYear} Day-by-Day P&L Heat-Matrix
              </CardTitle>
              <p className="text-[11px] text-muted-foreground">
                Click any trading day to isolate and analyze its individual executions in the journal below
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {selectedDateFilter && (
              <Badge variant="outline" className="text-[11px] sm:text-xs bg-blue-500/10 text-blue-600 border-blue-500/20 gap-1.5 py-1">
                Filtered Day: <strong>{selectedDateFilter}</strong>
                <button onClick={() => setSelectedDateFilter(null)} className="ml-1 text-muted-foreground hover:text-foreground font-bold">
                  ✕
                </button>
              </Badge>
            )}
            {selectedDateFilter && (
              <Button size="sm" variant="ghost" className="text-xs h-7 px-2" onClick={() => setSelectedDateFilter(null)}>
                Clear Filter
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-3 sm:p-6 overflow-x-auto">
          <div className="min-w-[560px] sm:min-w-0">
            {/* Day of Week Headers */}
            <div className="grid grid-cols-7 gap-1.5 sm:gap-2.5 text-center text-[10px] sm:text-xs font-bold text-muted-foreground mb-2 sm:mb-3">
              <span className="py-1">MON</span>
              <span className="py-1">TUE</span>
              <span className="py-1">WED</span>
              <span className="py-1">THU</span>
              <span className="py-1">FRI</span>
              <span className="py-1 text-muted-foreground/40">SAT</span>
              <span className="py-1 text-muted-foreground/40">SUN</span>
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-1.5 sm:gap-2.5">
              {calendarDays.map((cell, idx) => {
                if (!cell.isCurrentMonth) {
                  return (
                    <div
                      key={`empty-${idx}`}
                      className="h-16 sm:h-24 rounded-xl bg-muted/10 border border-border/20 opacity-30"
                    />
                  );
                }

                const isSelected = selectedDateFilter === cell.dateStr;
                const hasData = cell.item !== null;
                const isProfit = (cell.item?.pnl || 0) > 0.5;
                const isLoss = (cell.item?.pnl || 0) < -0.5;

                return (
                  <div
                    key={cell.dateStr}
                    onClick={() => {
                      if (hasData) {
                        setSelectedDateFilter(isSelected ? null : cell.dateStr);
                      }
                    }}
                    className={cn(
                      "h-16 sm:h-24 p-1.5 sm:p-2.5 rounded-xl border flex flex-col justify-between transition-all select-none relative group",
                      hasData ? "cursor-pointer hover:scale-[1.02] shadow-2xs" : "bg-card/40 border-border/40 opacity-70",
                      isSelected ? "ring-2 ring-blue-500 border-blue-500 z-10 shadow-md" : "",
                      cell.isToday && !isSelected ? "ring-1 ring-emerald-500/50" : "",
                      hasData && isProfit
                        ? "bg-emerald-500/10 border-emerald-500/30 hover:border-emerald-500 dark:bg-emerald-950/20"
                        : hasData && isLoss
                          ? "bg-rose-500/10 border-rose-500/30 hover:border-rose-500 dark:bg-rose-950/20"
                          : hasData
                            ? "bg-muted/40 border-border"
                            : ""
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] sm:text-xs font-bold text-foreground font-mono">
                          {cell.dayNum}
                        </span>
                        {cell.isToday && (
                          <span className="text-[7.5px] sm:text-[8.5px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-500/15 px-1 py-0.2 rounded">
                            Today
                          </span>
                        )}
                      </div>
                      {hasData && (
                        <span className={cn(
                          "text-[8px] sm:text-[9px] font-bold px-1 sm:px-1.5 py-0.2 rounded-full truncate",
                          isProfit ? "bg-emerald-500 text-white" : isLoss ? "bg-rose-500 text-white" : "bg-muted text-muted-foreground"
                        )}>
                          {cell.item?.tradesCount}T
                        </span>
                      )}
                    </div>

                    {hasData ? (
                      <div>
                        <div className={cn(
                          "text-[11px] sm:text-sm font-bold font-mono text-right truncate",
                          isProfit ? "text-emerald-600 dark:text-emerald-400" : isLoss ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground"
                        )}>
                          {isProfit ? "+" : ""}₹{(cell.item?.pnl || 0).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </div>
                        <div className="text-[8.5px] sm:text-[9.5px] text-muted-foreground text-right mt-0.5 truncate hidden sm:block">
                          Win: {cell.item?.winRate}%
                        </div>
                      </div>
                    ) : (
                      <div className="text-[9px] sm:text-[10px] text-muted-foreground/40 text-center font-medium">
                        -
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── 4. Closed Trades Round-Trip Journal ── */}
      <Card className="border-border bg-card shadow-xs">
        <CardHeader className="border-b border-border py-3.5 sm:py-4 px-4 sm:px-6 flex flex-col gap-3 sm:gap-4">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-blue-500/10 text-blue-600 flex items-center justify-center shrink-0">
              <BarChart3 className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-sm font-bold text-foreground">
                Round-Trip Closed Trades Journal ({filteredTrades.length})
              </CardTitle>
              <p className="text-[11px] text-muted-foreground">
                Detailed lifecycle execution matching: Entry price, Exit price, timestamps, and realized P&L
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
            {/* Segment & Status Filters */}
            <div className="flex flex-col xs:flex-row items-stretch gap-2 flex-wrap">
              {/* Segment Filter */}
              <div className="grid grid-cols-3 sm:flex items-center gap-1 bg-muted/80 dark:bg-muted/40 p-1 rounded-xl border border-border shadow-2xs">
                {(
                  [
                    { id: "ALL", label: "All", count: segmentCounts.all },
                    { id: "EQUITY", label: "Equity", count: segmentCounts.equity },
                    { id: "FNO", label: "F&O", count: segmentCounts.fno },
                  ] as const
                ).map((seg) => {
                  const isActive = segmentFilter === seg.id;
                  return (
                    <button
                      key={seg.id}
                      onClick={() => setSegmentFilter(seg.id)}
                      className={cn(
                        "px-2 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold transition-all inline-flex items-center justify-center gap-1 select-none",
                        isActive
                          ? "bg-card text-foreground shadow-xs ring-1 ring-border/80 font-bold dark:bg-accent dark:text-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-card/40"
                      )}
                    >
                      <span>{seg.label}</span>
                      <span
                        className={cn(
                          "text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0.2 rounded-full font-mono font-bold transition-colors",
                          isActive
                            ? "bg-muted text-foreground"
                            : "bg-muted/60 text-muted-foreground"
                        )}
                      >
                        {seg.count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Status Filter Tabs */}
              <div className="grid grid-cols-3 sm:flex items-center gap-1 bg-muted/80 dark:bg-muted/40 p-1 rounded-xl border border-border shadow-2xs">
                {(
                  [
                    {
                      id: "ALL",
                      label: "All",
                      count: statusCounts.all,
                      activeClass: "bg-blue-600 text-white shadow-xs font-bold",
                      activeBadge: "bg-white/25 text-white",
                    },
                    {
                      id: "PROFIT",
                      label: "Wins",
                      count: statusCounts.wins,
                      activeClass: "bg-emerald-600 text-white shadow-xs font-bold",
                      activeBadge: "bg-white/25 text-white",
                    },
                    {
                      id: "LOSS",
                      label: "Losses",
                      count: statusCounts.losses,
                      activeClass: "bg-rose-600 text-white shadow-xs font-bold",
                      activeBadge: "bg-white/25 text-white",
                    },
                  ] as const
                ).map((tab) => {
                  const isActive = tradeFilter === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setTradeFilter(tab.id)}
                      className={cn(
                        "px-2 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold transition-all inline-flex items-center justify-center gap-1 select-none",
                        isActive
                          ? tab.activeClass
                          : "text-muted-foreground hover:text-foreground hover:bg-card/40"
                      )}
                    >
                      <span>{tab.label}</span>
                      <span
                        className={cn(
                          "text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0.2 rounded-full font-mono font-bold transition-colors",
                          isActive
                            ? tab.activeBadge
                            : "bg-muted/60 text-muted-foreground"
                        )}
                      >
                        {tab.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Symbol Search */}
            <div className="relative w-full sm:w-56">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search symbol / strategy..."
                value={searchSymbol}
                onChange={(e) => setSearchSymbol(e.target.value)}
                className="w-full bg-background border border-border text-foreground text-xs rounded-xl pl-8 pr-7 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs placeholder:text-muted-foreground/60"
              />
              {searchSymbol && (
                <button
                  onClick={() => setSearchSymbol("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs font-bold"
                  title="Clear search"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3">
              <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
              <p className="text-xs sm:text-sm text-muted-foreground">Calculating closed trade ledger from broker records...</p>
            </div>
          ) : filteredTrades.length === 0 ? (
            <div className="py-16 text-center px-4">
              <div className="mx-auto w-12 h-12 rounded-full bg-muted/60 flex items-center justify-center mb-3">
                <BookOpen className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="text-sm sm:text-base font-semibold text-foreground">No Closed Trades Found</h3>
              <p className="text-xs sm:text-sm text-muted-foreground max-w-sm mx-auto mt-1 mb-4">
                {searchSymbol || tradeFilter !== "ALL" || segmentFilter !== "ALL" || selectedDateFilter
                  ? "No closed trades match your filter criteria."
                  : `No completed trades recorded for ${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}.`}
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
                className="gap-1.5 text-xs"
              >
                <RefreshCcw className={cn("h-3.5 w-3.5", syncMutation.isPending && "animate-spin")} />
                Sync with Broker
              </Button>
            </div>
          ) : (
            <>
              {/* ── Mobile View: Responsive Cards (< md) ── */}
              <div className="block md:hidden divide-y divide-border">
                {filteredTrades.map((t) => {
                  const isWin = t.realizedPnl > 0.5;
                  const isLoss = t.realizedPnl < -0.5;
                  const exitD = new Date(t.exitTime);
                  const formattedExitTime = exitD.toLocaleTimeString("en-IN", {
                    timeZone: "Asia/Kolkata",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  });
                  const formatted = formatOptionSymbol(t.symbol);

                  return (
                    <div key={t.id} className="p-3.5 space-y-2.5 hover:bg-muted/20 transition-colors">
                      {/* Top Row: Symbol, Side Badge, Status */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-bold text-xs sm:text-sm text-foreground truncate">
                            {formatted.displayName}
                          </span>
                          <span className="text-[9px] font-semibold text-muted-foreground bg-muted px-1.5 py-0.2 rounded shrink-0">
                            {t.exchange}
                          </span>
                          <Badge variant="outline" className="text-[8.5px] font-bold px-1 py-0 bg-muted/40 shrink-0">
                            {t.product}
                          </Badge>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <Badge
                            className={cn(
                              "text-[10px] font-bold px-2 py-0.5 border-0 shadow-2xs",
                              t.side === "LONG" ? "bg-blue-600 text-white" : "bg-purple-600 text-white"
                            )}
                          >
                            {t.side}
                          </Badge>
                          <Badge
                            variant="secondary"
                            className={cn(
                              "text-[10px] font-bold px-1.5 py-0.5 inline-flex items-center gap-1",
                              isWin
                                ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                                : isLoss
                                  ? "bg-rose-500/10 text-rose-600 border border-rose-500/20"
                                  : "bg-muted text-muted-foreground"
                            )}
                          >
                            {isWin && <CheckCircle2 className="h-3 w-3" />}
                            {isLoss && <XCircle className="h-3 w-3" />}
                            {t.status}
                          </Badge>
                        </div>
                      </div>

                      {/* Middle Row: Qty, Prices, Duration */}
                      <div className="flex items-center justify-between text-xs bg-muted/30 p-2 rounded-xl">
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <span>Qty: <strong className="text-foreground font-mono">{t.qty}</strong></span>
                          <span>•</span>
                          <span>{t.holdingDuration}</span>
                        </div>
                        <div className="flex items-center gap-1 font-mono text-[11px]">
                          <span className="text-muted-foreground">₹{t.entryPrice.toFixed(2)}</span>
                          <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          <span className="font-bold text-foreground">₹{t.exitPrice.toFixed(2)}</span>
                        </div>
                      </div>

                      {/* Bottom Row: Date/Time + Net Realized P&L */}
                      <div className="flex items-center justify-between text-xs pt-0.5">
                        <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span>{t.date} · {formattedExitTime} IST</span>
                        </div>

                        <div className="text-right">
                          <div className={cn(
                            "font-mono font-black text-sm",
                            isWin ? "text-emerald-600 dark:text-emerald-400" : isLoss ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground"
                          )}>
                            {isWin ? "+" : ""}₹{t.realizedPnl.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                          <span className={cn(
                            "text-[10px] font-mono font-bold",
                            isWin ? "text-emerald-600" : isLoss ? "text-rose-600" : "text-muted-foreground"
                          )}>
                            ({isWin ? "+" : ""}{t.pnlPct.toFixed(2)}%)
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ── Desktop View: Detailed Table (>= md) ── */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/40 text-xs font-semibold text-muted-foreground border-b border-border">
                    <tr>
                      <th className="py-3 px-4">Date & Time</th>
                      <th className="py-3 px-4">Instrument</th>
                      <th className="py-3 px-4">Side</th>
                      <th className="py-3 px-4">Strategy</th>
                      <th className="py-3 px-4 text-right">Qty</th>
                      <th className="py-3 px-4 text-right">Entry → Exit Price</th>
                      <th className="py-3 px-4 text-right">Duration</th>
                      <th className="py-3 px-4 text-right">Realized P&L</th>
                      <th className="py-3 px-4 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredTrades.map((t) => {
                      const isWin = t.realizedPnl > 0.5;
                      const isLoss = t.realizedPnl < -0.5;
                      const exitD = new Date(t.exitTime);
                      const formattedExitTime = exitD.toLocaleTimeString("en-IN", {
                        timeZone: "Asia/Kolkata",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                        hour12: false,
                      });
                      const formatted = formatOptionSymbol(t.symbol);

                      return (
                        <tr key={t.id} className="hover:bg-muted/30 transition-colors">
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="font-mono text-xs font-bold text-foreground">{t.date}</div>
                            <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                              <Clock className="h-3 w-3" />
                              {formattedExitTime} IST
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-foreground flex items-center gap-1.5">
                              <span>{formatted.displayName}</span>
                              <span className="text-[9.5px] font-semibold text-muted-foreground bg-muted px-1.5 py-0.2 rounded">
                                {t.exchange}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              {formatted.isDerivative && (
                                <span className="text-[10px] text-muted-foreground font-mono">
                                  {t.symbol}
                                </span>
                              )}
                              <Badge variant="outline" className="text-[9px] font-bold px-1 py-0 bg-muted/40">
                                {t.product}
                              </Badge>
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            <Badge
                              className={cn(
                                "text-[10.5px] font-bold px-2.5 py-0.5 border-0 shadow-2xs",
                                t.side === "LONG"
                                  ? "bg-blue-600 text-white"
                                  : "bg-purple-600 text-white"
                              )}
                            >
                              {t.side}
                            </Badge>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="text-xs text-foreground font-medium truncate max-w-[180px]">
                              {t.strategyName || "Intraday Strategy"}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono font-semibold text-foreground">
                            {t.qty}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono text-xs">
                            <div className="flex items-center justify-end gap-1.5">
                              <span className="text-muted-foreground font-medium">₹{t.entryPrice.toFixed(2)}</span>
                              <ArrowRight className="h-3 w-3 text-muted-foreground" />
                              <span className="font-bold text-foreground">₹{t.exitPrice.toFixed(2)}</span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono text-xs text-muted-foreground">
                            {t.holdingDuration}
                          </td>
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <div className={cn(
                              "font-mono font-black text-sm",
                              isWin ? "text-emerald-600 dark:text-emerald-400" : isLoss ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground"
                            )}>
                              {isWin ? "+" : ""}₹{t.realizedPnl.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            <div className={cn(
                              "text-[10.5px] font-mono font-bold mt-0.5",
                              isWin ? "text-emerald-600" : isLoss ? "text-rose-600" : "text-muted-foreground"
                            )}>
                              {isWin ? "+" : ""}{t.pnlPct.toFixed(2)}%
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <Badge
                              variant="secondary"
                              className={cn(
                                "text-[10.5px] font-bold px-2.5 py-0.5 inline-flex items-center gap-1",
                                isWin
                                  ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                                  : isLoss
                                    ? "bg-rose-500/10 text-rose-600 border border-rose-500/20"
                                    : "bg-muted text-muted-foreground"
                              )}
                            >
                              {isWin && <CheckCircle2 className="h-3 w-3" />}
                              {isLoss && <XCircle className="h-3 w-3" />}
                              {t.status}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── 5. Daily Aggregated Ledger Table ── */}
      <Card className="border-border bg-card shadow-xs">
        <CardHeader className="py-3.5 sm:py-4 px-4 sm:px-6 border-b border-border flex flex-row items-center justify-between bg-muted/20">
          <div>
            <CardTitle className="text-sm font-bold text-foreground">
              Daily Consolidated P&L Breakdown
            </CardTitle>
            <p className="text-[11px] text-muted-foreground">
              Day-by-day aggregate performance and cumulative financial balance curve
            </p>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {dailyLedger.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground">
              No daily ledger entries for this month.
            </div>
          ) : (
            <>
              {/* Mobile View: Daily Cards (< md) */}
              <div className="block md:hidden divide-y divide-border">
                {dailyLedger.map((d) => {
                  const isProfit = d.pnl > 0.5;
                  const isLoss = d.pnl < -0.5;
                  const isCumulProfit = d.cumulativePnl >= 0;

                  return (
                    <div
                      key={d.date}
                      onClick={() => setSelectedDateFilter(selectedDateFilter === d.date ? null : d.date)}
                      className={cn(
                        "p-3.5 space-y-2 hover:bg-muted/20 transition-colors cursor-pointer",
                        selectedDateFilter === d.date ? "bg-muted/30 border-l-4 border-l-blue-500" : ""
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-foreground">{d.formattedDate}</span>
                          <span className="text-xs text-muted-foreground">({d.dayOfWeek})</span>
                        </div>
                        <Badge
                          variant="secondary"
                          className={cn(
                            "text-[9px] font-bold px-2 py-0.5",
                            isProfit ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20" : isLoss ? "bg-rose-500/10 text-rose-600 border border-rose-500/20" : "bg-muted text-muted-foreground"
                          )}
                        >
                          {isProfit ? "GREEN DAY" : isLoss ? "RED DAY" : "FLAT"}
                        </Badge>
                      </div>

                      <div className="flex items-center justify-between text-xs bg-muted/30 p-2 rounded-xl">
                        <span className="text-muted-foreground">
                          Trades: <strong className="text-foreground">{d.tradesCount}</strong> (<span className="text-emerald-500 font-semibold">{d.wins}W</span> • <span className="text-rose-500 font-semibold">{d.losses}L</span>)
                        </span>
                        <span className="text-muted-foreground">
                          Win Rate: <strong className="text-foreground font-mono">{d.winRate}%</strong>
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs pt-0.5">
                        <div className="text-[11px] text-muted-foreground">
                          Cumul: <span className={cn("font-mono font-bold", isCumulProfit ? "text-emerald-600" : "text-rose-600")}>
                            {isCumulProfit ? "+" : ""}₹{d.cumulativePnl.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>

                        <div className={cn(
                          "font-mono font-black text-sm",
                          isProfit ? "text-emerald-600 dark:text-emerald-400" : isLoss ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground"
                        )}>
                          {isProfit ? "+" : ""}₹{d.pnl.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop View: Full Table (>= md) */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/40 text-xs font-semibold text-muted-foreground border-b border-border">
                    <tr>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Day</th>
                      <th className="py-3 px-4 text-center">Trades (Wins / Losses)</th>
                      <th className="py-3 px-4 text-right">Win Rate</th>
                      <th className="py-3 px-4 text-right">Daily P&L</th>
                      <th className="py-3 px-4 text-right">Cumulative Month P&L</th>
                      <th className="py-3 px-4 text-center">Day Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {dailyLedger.map((d) => {
                      const isProfit = d.pnl > 0.5;
                      const isLoss = d.pnl < -0.5;
                      const isCumulProfit = d.cumulativePnl >= 0;

                      return (
                        <tr
                          key={d.date}
                          onClick={() => setSelectedDateFilter(selectedDateFilter === d.date ? null : d.date)}
                          className={cn(
                            "hover:bg-muted/30 transition-colors cursor-pointer",
                            selectedDateFilter === d.date ? "bg-muted/40 font-semibold" : ""
                          )}
                        >
                          <td className="py-3.5 px-4 font-mono text-xs font-bold text-foreground">
                            {d.formattedDate}
                          </td>
                          <td className="py-3.5 px-4 text-xs text-muted-foreground">
                            {d.dayOfWeek}
                          </td>
                          <td className="py-3.5 px-4 text-center font-mono text-xs">
                            <span className="font-bold text-foreground">{d.tradesCount}</span>
                            <span className="text-muted-foreground text-[11px] ml-1.5">
                              (<span className="text-emerald-500 font-semibold">{d.wins}W</span> • <span className="text-rose-500 font-semibold">{d.losses}L</span>)
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono text-xs font-semibold text-foreground">
                            {d.winRate}%
                          </td>
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <span className={cn(
                              "font-mono font-bold text-xs sm:text-sm",
                              isProfit ? "text-emerald-600 dark:text-emerald-400" : isLoss ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground"
                            )}>
                              {isProfit ? "+" : ""}₹{d.pnl.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <span className={cn(
                              "font-mono font-bold text-xs",
                              isCumulProfit ? "text-emerald-600" : "text-rose-600"
                            )}>
                              {isCumulProfit ? "+" : ""}₹{d.cumulativePnl.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <Badge
                              variant="secondary"
                              className={cn(
                                "text-[10px] font-bold px-2.5 py-0.5",
                                isProfit
                                  ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                                  : isLoss
                                    ? "bg-rose-500/10 text-rose-600 border border-rose-500/20"
                                    : "bg-muted text-muted-foreground"
                              )}
                            >
                              {isProfit ? "GREEN DAY" : isLoss ? "RED DAY" : "FLAT"}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
