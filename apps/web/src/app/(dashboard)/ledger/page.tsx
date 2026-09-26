"use client";

import { Badge } from "@/components/ui/badge";
import { pressable } from "@/lib/a11y";
import { QueryError } from "@/components/shared/query-state";
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
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { formatINR } from "@/lib/format";

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
  grossPnl: number;
  charges: number;
  /** Net of charges. */
  realizedPnl: number;
  pnlPct: number;
  status: "PROFIT" | "LOSS" | "BREAKEVEN";
  source: "ALGO" | "MANUAL";
  strategyName?: string;
}

interface DailyLedgerItem {
  date: string;
  formattedDate: string;
  dayOfWeek: string;
  tradesCount: number;
  pnl: number;
  grossPnl: number;
  charges: number;
  algoPnl: number;
  manualPnl: number;
  wins: number;
  losses: number;
  winRate: number;
  status: "PROFIT" | "LOSS" | "BREAKEVEN";
  cumulativePnl: number;
}

interface MonthlyLedgerData {
  selectedMonth: number;
  selectedYear: number;
  availableMonths: Array<{ month: number; year: number; label: string }>;
  summary: {
    totalRealizedPnl: number;
    totalGrossPnl: number;
    totalCharges: number;
    algo: { pnl: number; trades: number; wins: number };
    manual: { pnl: number; trades: number; wins: number };
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
  counts: {
    segment: { all: number; equity: number; fno: number };
    status: { all: number; wins: number; losses: number };
  };
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

const JOURNAL_PAGE_SIZE = 100;

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

  const [page, setPage] = useState(1);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(searchSymbol.trim()), 300);
    return () => clearTimeout(id);
  }, [searchSymbol]);

  // Any change to what the journal shows starts it back at page 1.
  useEffect(() => {
    setPage(1);
  }, [selectedMonth, selectedYear, tradeFilter, segmentFilter, selectedDateFilter, debouncedSearch]);

  const journalParams = {
    month: selectedMonth,
    year: selectedYear,
    status: tradeFilter,
    segment: segmentFilter,
    date: selectedDateFilter ?? undefined,
    q: debouncedSearch || undefined,
  };

  const { data: ledgerResponse, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["ledger", journalParams, page],
    queryFn: async () => {
      const res = await orderApi.ledger({ ...journalParams, page, pageSize: JOURNAL_PAGE_SIZE });
      return res.data?.data as MonthlyLedgerData;
    },
    placeholderData: (previous) => previous,
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
    totalGrossPnl: 0,
    totalCharges: 0,
    algo: { pnl: 0, trades: 0, wins: 0 },
    manual: { pnl: 0, trades: 0, wins: 0 },
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

  // The server filters and paginates the journal; these are one page of it.
  const filteredTrades = closedTrades;
  const pagination = ledgerResponse?.pagination ?? { page: 1, pageSize: JOURNAL_PAGE_SIZE, total: 0, totalPages: 1 };
  const segmentCounts = ledgerResponse?.counts.segment ?? { all: 0, equity: 0, fno: 0 };
  const statusCounts = ledgerResponse?.counts.status ?? { all: 0, wins: 0, losses: 0 };

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

  // CSV Export Handler (exports every trade matching the current filters, not just the visible page)
  const handleExportCSV = async () => {
    let exportTrades: ClosedTrade[] = [];
    try {
      const res = await orderApi.ledger({ ...journalParams, page: 1, pageSize: 1000 });
      exportTrades = (res.data?.data as MonthlyLedgerData).closedTrades;
    } catch {
      toast.error("Could not load trades to export");
      return;
    }
    if (exportTrades.length === 0) {
      toast.error("No trades available to export for this month");
      return;
    }

    const headers = ["Date", "Time", "Symbol", "Exchange", "Product", "Side", "Qty", "Entry Price", "Exit Price", "Duration", "Gross PnL (INR)", "Charges (INR)", "Net PnL (INR)", "PnL %", "Status", "Source", "Strategy"];
    const rows = exportTrades.map((t) => [
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
      t.grossPnl,
      t.charges,
      t.realizedPnl,
      t.pnlPct,
      t.status,
      t.source,
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
            <h1 className="text-lg sm:text-xl font-semibold tracking-tight text-foreground flex items-center gap-2">
              <BookOpen className="h-5 w-5 sm:h-6 sm:w-6 text-profit shrink-0" />
              <span>Monthly P&L Ledger & Journal</span>
            </h1>
            <Badge variant="outline" className="text-[10px] sm:text-xs bg-profit/10 text-profit border-profit/20 font-medium">
              Verified Executions
            </Badge>
          </div>
          <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">
            Round-trip trade analytics, calendar heat-matrix, and FIFO realized P&L journal
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-2.5">
          {/* Month Navigation Toolbar */}
          <div className="flex items-center justify-between sm:justify-start bg-card border border-border rounded-lg p-1">
            <Button
              variant="ghost"
              size="icon" aria-label="Previous month"
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
                className="bg-transparent text-xs font-semibold text-foreground focus:outline-none cursor-pointer"
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
                className="bg-transparent text-xs font-semibold text-foreground focus:outline-none cursor-pointer"
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
              size="icon" aria-label="Next month"
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
              disabled={summary.totalTrades === 0}
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
              className="gap-1.5 border-profit/30 text-profit bg-profit-subtle/50 hover:bg-profit-subtle/50 text-xs h-9"
            >
              <RefreshCcw className={cn("h-3.5 w-3.5 shrink-0", syncMutation.isPending && "animate-spin text-profit")} />
              <span>{syncMutation.isPending ? "Syncing..." : "Sync"}</span>
            </Button>

            <Button
              variant="default"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="gap-1.5 bg-primary hover:bg-brand-hover text-primary-foreground text-xs h-9"
            >
              <RefreshCcw className={cn("h-3.5 w-3.5 shrink-0", isFetching && "animate-spin")} />
              <span>Refresh</span>
            </Button>
          </div>
        </div>
      </div>

      {/* ── 2. Top Summary Metric Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: Net Realized P&L */}
        <Card className={cn(
          "border relative overflow-hidden  ",
          isNetProfit ? "border-profit/30 bg-profit/5" : "border-loss/30 bg-loss/5"
        )}>
          <CardHeader className="p-4 sm:p-6 pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-[11px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Net Realized P&L ({MONTH_NAMES[selectedMonth - 1]})
            </CardTitle>
            <div className={cn(
              "h-6 w-6 rounded-md flex items-center justify-center shrink-0",
              isNetProfit ? "bg-profit/15 text-profit" : "bg-loss/15 text-loss"
            )}>
              {isNetProfit ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0">
            <div className={cn(
              "text-2xl sm:text-3xl font-semibold font-mono tracking-tight",
              isNetProfit ? "text-profit " : "text-loss "
            )}>
              {isNetProfit ? "+" : ""}{formatINR(summary.totalRealizedPnl)}
            </div>
            <div className="flex items-center gap-2 mt-2 text-[11px] sm:text-xs text-muted-foreground flex-wrap">
              <span>Gross Profit: <span className="text-profit font-mono font-semibold">+₹{summary.totalGrossProfit.toFixed(0)}</span></span>
              <span>•</span>
              <span>Loss: <span className="text-loss font-mono font-semibold">-₹{summary.totalGrossLoss.toFixed(0)}</span></span>
            </div>
            <div className="flex items-center gap-2 mt-1 text-[11px] sm:text-xs text-muted-foreground flex-wrap">
              <span>Gross: <span className="font-mono font-semibold">₹{summary.totalGrossPnl.toFixed(0)}</span></span>
              <span>•</span>
              <span>Charges: <span className="text-warn font-mono font-semibold">-₹{summary.totalCharges.toFixed(0)}</span></span>
              <span>•</span>
              <span>Algo: <span className="font-mono font-semibold">₹{summary.algo.pnl.toFixed(0)}</span> ({summary.algo.trades})</span>
              <span>•</span>
              <span>Manual: <span className="font-mono font-semibold">₹{summary.manual.pnl.toFixed(0)}</span> ({summary.manual.trades})</span>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Win Rate & Profit Factor */}
        <Card className="border-border bg-card/60">
          <CardHeader className="p-4 sm:p-6 pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-[11px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Win Rate & Profit Factor
            </CardTitle>
            <div className="h-6 w-6 rounded-md bg-primary/15 text-accent-foreground flex items-center justify-center shrink-0">
              <Award className="h-3.5 w-3.5" />
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0">
            <div className="text-2xl sm:text-3xl font-semibold font-mono text-foreground flex items-baseline gap-2">
              <span>{summary.winRate}%</span>
              <Badge variant="outline" className="text-[10px] font-semibold border-primary/30 text-accent-foreground bg-primary/5">
                PF: {summary.profitFactor}x
              </Badge>
            </div>
            <div className="flex items-center gap-2 mt-2 text-[11px] sm:text-xs text-muted-foreground flex-wrap">
              <span>Wins: <strong className="text-profit font-mono">{summary.winningTrades}</strong></span>
              <span>•</span>
              <span>Losses: <strong className="text-loss font-mono">{summary.losingTrades}</strong></span>
              <span>•</span>
              <span>Total: <strong className="text-foreground font-mono">{summary.totalTrades}</strong></span>
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Trading Days Breakdown */}
        <Card className="border-border bg-card/60">
          <CardHeader className="p-4 sm:p-6 pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-[11px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Sessions Result
            </CardTitle>
            <div className="h-6 w-6 rounded-md bg-signal/15 text-signal flex items-center justify-center shrink-0">
              <CalendarDays className="h-3.5 w-3.5" />
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0">
            <div className="text-2xl sm:text-3xl font-semibold font-mono text-foreground flex items-baseline gap-1.5 flex-wrap">
              <span className="text-profit">{summary.profitableDays}G</span>
              <span className="text-muted-foreground text-sm font-normal">/</span>
              <span className="text-loss">{summary.lossDays}R</span>
              <span className="text-[11px] sm:text-xs font-normal text-muted-foreground">({summary.tradingDaysCount} Active)</span>
            </div>
            <div className="w-full bg-muted rounded-full h-1.5 mt-3 flex overflow-hidden">
              <div
                className="bg-profit h-full transition-all"
                style={{
                  width: `${summary.tradingDaysCount > 0 ? (summary.profitableDays / summary.tradingDaysCount) * 100 : 0}%`,
                }}
              />
              <div
                className="bg-loss h-full transition-all"
                style={{
                  width: `${summary.tradingDaysCount > 0 ? (summary.lossDays / summary.tradingDaysCount) * 100 : 0}%`,
                }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Card 4: Trade Performance Metrics */}
        <Card className="border-border bg-card/60">
          <CardHeader className="p-4 sm:p-6 pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-[11px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Avg Win vs Avg Loss
            </CardTitle>
            <div className="h-6 w-6 rounded-md bg-warn/15 text-warn flex items-center justify-center shrink-0">
              <Flame className="h-3.5 w-3.5" />
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0">
            <div className="text-xs sm:text-sm font-semibold font-mono text-foreground flex items-center justify-between">
              <span className="text-profit">+₹{summary.avgWin.toFixed(0)} <span className="text-[10px] text-muted-foreground font-normal">avg win</span></span>
              <span className="text-loss">-₹{summary.avgLoss.toFixed(0)} <span className="text-[10px] text-muted-foreground font-normal">avg loss</span></span>
            </div>
            <div className="text-[11px] sm:text-xs text-muted-foreground mt-2 flex items-center justify-between border-t border-border pt-2">
              <span>Best: <strong className="text-profit font-mono">+{summary.bestTrade ? `₹${summary.bestTrade.realizedPnl.toFixed(2)}` : "₹0"}</strong></span>
              <span>Worst: <strong className="text-loss font-mono">{summary.worstTrade ? `₹${summary.worstTrade.realizedPnl.toFixed(2)}` : "₹0"}</strong></span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── 3. Interactive Monthly P&L Calendar Matrix ── */}
      <Card className="border-border bg-card overflow-hidden">
        <CardHeader className="py-3.5 sm:py-4 px-4 sm:px-6 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/20">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-profit/10 text-profit flex items-center justify-center shrink-0">
              <Calendar className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold text-foreground">
                {MONTH_NAMES[selectedMonth - 1]} {selectedYear} Day-by-Day P&L Heat-Matrix
              </CardTitle>
              <p className="text-[11px] text-muted-foreground">
                Click any trading day to isolate and analyze its individual executions in the journal below
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {selectedDateFilter && (
              <Badge variant="outline" className="text-[11px] sm:text-xs bg-primary/10 text-accent-foreground border-primary/20 gap-1.5 py-1">
                Filtered Day: <strong>{selectedDateFilter}</strong>
                <button onClick={() => setSelectedDateFilter(null)} className="ml-1 text-muted-foreground hover:text-foreground font-semibold">
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
            <div className="grid grid-cols-7 gap-1.5 sm:gap-2.5 text-center text-[10px] sm:text-xs font-semibold text-muted-foreground mb-2 sm:mb-3">
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
                      className="h-16 sm:h-24 rounded-lg bg-muted/10 border border-border/20 opacity-30"
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
                    {...pressable(() => {
                      if (hasData) {
                        setSelectedDateFilter(isSelected ? null : cell.dateStr);
                      }
                    }, { pressed: isSelected })}
                    className={cn(
                      "h-16 sm:h-24 p-1.5 sm:p-2.5 rounded-lg border flex flex-col justify-between transition-all select-none relative group",
                      hasData ? "cursor-pointer  " : "bg-card/40 border-border/40 opacity-70",
                      isSelected ? "ring-2 ring-primary border-primary z-10 shadow-md" : "",
                      cell.isToday && !isSelected ? "ring-1 ring-profit/50" : "",
                      hasData && isProfit
                        ? "bg-profit/10 border-profit/30 hover:border-profit "
                        : hasData && isLoss
                          ? "bg-loss/10 border-loss/30 hover:border-loss "
                          : hasData
                            ? "bg-muted/40 border-border"
                            : ""
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] sm:text-xs font-semibold text-foreground font-mono">
                          {cell.dayNum}
                        </span>
                        {cell.isToday && (
                          <span className="text-[7.5px] sm:text-[8.5px] font-semibold uppercase tracking-wider text-profit bg-profit/15 px-1 py-0.2 rounded">
                            Today
                          </span>
                        )}
                      </div>
                      {hasData && (
                        <span className={cn(
                          "text-[8px] sm:text-[9px] font-semibold px-1 sm:px-1.5 py-0.2 rounded-full truncate",
                          isProfit ? "bg-profit text-on-profit" : isLoss ? "bg-loss text-on-loss" : "bg-muted text-muted-foreground"
                        )}>
                          {cell.item?.tradesCount}T
                        </span>
                      )}
                    </div>

                    {hasData ? (
                      <div>
                        <div className={cn(
                          "text-[11px] sm:text-sm font-semibold font-mono text-right truncate",
                          isProfit ? "text-profit " : isLoss ? "text-loss " : "text-muted-foreground"
                        )}>
                          {isProfit ? "+" : ""}{formatINR((cell.item?.pnl || 0), { decimals: 0 })}
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
      <Card className="border-border bg-card">
        <CardHeader className="border-b border-border py-3.5 sm:py-4 px-4 sm:px-6 flex flex-col gap-3 sm:gap-4">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary/10 text-accent-foreground flex items-center justify-center shrink-0">
              <BarChart3 className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold text-foreground">
                Round-Trip Closed Trades Journal ({pagination.total})
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
              <div className="grid grid-cols-3 sm:flex items-center gap-1 bg-muted/80 dark:bg-muted/40 p-1 rounded-lg border border-border">
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
                          ? "bg-card text-foreground  ring-1 ring-border/80 font-semibold dark:bg-accent dark:text-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-card/40"
                      )}
                    >
                      <span>{seg.label}</span>
                      <span
                        className={cn(
                          "text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0.2 rounded-full font-mono font-semibold transition-colors",
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
              <div className="grid grid-cols-3 sm:flex items-center gap-1 bg-muted/80 dark:bg-muted/40 p-1 rounded-lg border border-border">
                {(
                  [
                    {
                      id: "ALL",
                      label: "All",
                      count: statusCounts.all,
                      activeClass: "bg-primary text-primary-foreground  font-semibold",
                      activeBadge: "bg-primary-foreground/25 text-primary-foreground",
                    },
                    {
                      id: "PROFIT",
                      label: "Wins",
                      count: statusCounts.wins,
                      activeClass: "bg-profit text-on-profit  font-semibold",
                      activeBadge: "bg-on-profit/25 text-on-profit",
                    },
                    {
                      id: "LOSS",
                      label: "Losses",
                      count: statusCounts.losses,
                      activeClass: "bg-loss text-on-loss  font-semibold",
                      activeBadge: "bg-on-loss/25 text-on-loss",
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
                          "text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0.2 rounded-full font-mono font-semibold transition-colors",
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
                className="w-full bg-background border border-border text-foreground text-xs rounded-lg pl-8 pr-7 py-2 focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/60"
              />
              {searchSymbol && (
                <button
                  onClick={() => setSearchSymbol("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs font-semibold"
                  title="Clear search"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isError && !ledgerResponse ? (
            <QueryError what="the ledger" error={error} onRetry={() => refetch()} retrying={isFetching} />
          ) : isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3">
              <Loader2 className="h-8 w-8 text-accent-foreground animate-spin" />
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
                          <span className="font-semibold text-xs sm:text-sm text-foreground truncate">
                            {formatted.displayName}
                          </span>
                          <span className="text-[9px] font-semibold text-muted-foreground bg-muted px-1.5 py-0.2 rounded shrink-0">
                            {t.exchange}
                          </span>
                          <Badge variant="outline" className="text-[8.5px] font-semibold px-1 py-0 bg-muted/40 shrink-0">
                            {t.product}
                          </Badge>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <Badge
                            className={cn(
                              "text-[10px] font-semibold px-2 py-0.5 border-0 ",
                              t.side === "LONG" ? "bg-primary text-primary-foreground" : "bg-signal text-on-signal"
                            )}
                          >
                            {t.side}
                          </Badge>
                          <Badge
                            variant="secondary"
                            className={cn(
                              "text-[10px] font-semibold px-1.5 py-0.5 inline-flex items-center gap-1",
                              isWin
                                ? "bg-profit/10 text-profit border border-profit/20"
                                : isLoss
                                  ? "bg-loss/10 text-loss border border-loss/20"
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
                      <div className="flex items-center justify-between text-xs bg-muted/30 p-2 rounded-lg">
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <span>Qty: <strong className="text-foreground font-mono">{t.qty}</strong></span>
                          <span>•</span>
                          <span>{t.holdingDuration}</span>
                        </div>
                        <div className="flex items-center gap-1 font-mono text-[11px]">
                          <span className="text-muted-foreground">₹{t.entryPrice.toFixed(2)}</span>
                          <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          <span className="font-semibold text-foreground">₹{t.exitPrice.toFixed(2)}</span>
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
                            "font-mono font-semibold text-sm",
                            isWin ? "text-profit " : isLoss ? "text-loss " : "text-muted-foreground"
                          )}>
                            {isWin ? "+" : ""}{formatINR(t.realizedPnl)}
                          </div>
                          <span className={cn(
                            "text-[10px] font-mono font-semibold",
                            isWin ? "text-profit" : isLoss ? "text-loss" : "text-muted-foreground"
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
                            <div className="font-mono text-xs font-semibold text-foreground">{t.date}</div>
                            <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                              <Clock className="h-3 w-3" />
                              {formattedExitTime} IST
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-foreground flex items-center gap-1.5">
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
                              <Badge variant="outline" className="text-[9px] font-semibold px-1 py-0 bg-muted/40">
                                {t.product}
                              </Badge>
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            <Badge
                              className={cn(
                                "text-[10.5px] font-semibold px-2.5 py-0.5 border-0 ",
                                t.side === "LONG"
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-signal text-on-signal"
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
                              <span className="font-semibold text-foreground">₹{t.exitPrice.toFixed(2)}</span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono text-xs text-muted-foreground">
                            {t.holdingDuration}
                          </td>
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <div className={cn(
                              "font-mono font-semibold text-sm",
                              isWin ? "text-profit " : isLoss ? "text-loss " : "text-muted-foreground"
                            )}>
                              {isWin ? "+" : ""}{formatINR(t.realizedPnl)}
                            </div>
                            <div className={cn(
                              "text-[10.5px] font-mono font-semibold mt-0.5",
                              isWin ? "text-profit" : isLoss ? "text-loss" : "text-muted-foreground"
                            )}>
                              {isWin ? "+" : ""}{t.pnlPct.toFixed(2)}%
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <Badge
                              variant="secondary"
                              className={cn(
                                "text-[10.5px] font-semibold px-2.5 py-0.5 inline-flex items-center gap-1",
                                isWin
                                  ? "bg-profit/10 text-profit border border-profit/20"
                                  : isLoss
                                    ? "bg-loss/10 text-loss border border-loss/20"
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
              {pagination.totalPages > 1 && (
                <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-t border-border text-xs text-muted-foreground">
                  <span>
                    Page {pagination.page} of {pagination.totalPages} · {pagination.total} trades
                  </span>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={pagination.page <= 1 || isFetching} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                      Previous
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={pagination.page >= pagination.totalPages || isFetching} onClick={() => setPage((p) => p + 1)}>
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ── 5. Daily Aggregated Ledger Table ── */}
      <Card className="border-border bg-card">
        <CardHeader className="py-3.5 sm:py-4 px-4 sm:px-6 border-b border-border flex flex-row items-center justify-between bg-muted/20">
          <div>
            <CardTitle className="text-sm font-semibold text-foreground">
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
                      {...pressable(() => setSelectedDateFilter(selectedDateFilter === d.date ? null : d.date), { pressed: selectedDateFilter === d.date })}
                      className={cn(
                        "p-3.5 space-y-2 hover:bg-muted/20 transition-colors cursor-pointer",
                        selectedDateFilter === d.date ? "bg-muted/30 border-l-4 border-l-primary" : ""
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-foreground">{d.formattedDate}</span>
                          <span className="text-xs text-muted-foreground">({d.dayOfWeek})</span>
                        </div>
                        <Badge
                          variant="secondary"
                          className={cn(
                            "text-[9px] font-semibold px-2 py-0.5",
                            isProfit ? "bg-profit/10 text-profit border border-profit/20" : isLoss ? "bg-loss/10 text-loss border border-loss/20" : "bg-muted text-muted-foreground"
                          )}
                        >
                          {isProfit ? "GREEN DAY" : isLoss ? "RED DAY" : "FLAT"}
                        </Badge>
                      </div>

                      <div className="flex items-center justify-between text-xs bg-muted/30 p-2 rounded-lg">
                        <span className="text-muted-foreground">
                          Trades: <strong className="text-foreground">{d.tradesCount}</strong> (<span className="text-profit font-semibold">{d.wins}W</span> • <span className="text-loss font-semibold">{d.losses}L</span>)
                        </span>
                        <span className="text-muted-foreground">
                          Win Rate: <strong className="text-foreground font-mono">{d.winRate}%</strong>
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs pt-0.5">
                        <div className="text-[11px] text-muted-foreground">
                          Cumul: <span className={cn("font-mono font-semibold", isCumulProfit ? "text-profit" : "text-loss")}>
                            {isCumulProfit ? "+" : ""}{formatINR(d.cumulativePnl)}
                          </span>
                        </div>

                        <div className={cn(
                          "font-mono font-semibold text-sm",
                          isProfit ? "text-profit " : isLoss ? "text-loss " : "text-muted-foreground"
                        )}>
                          {isProfit ? "+" : ""}{formatINR(d.pnl)}
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
                          {...pressable(() => setSelectedDateFilter(selectedDateFilter === d.date ? null : d.date), { role: null })}
                          className={cn(
                            "hover:bg-muted/30 transition-colors cursor-pointer",
                            selectedDateFilter === d.date ? "bg-muted/40 font-semibold" : ""
                          )}
                        >
                          <td className="py-3.5 px-4 font-mono text-xs font-semibold text-foreground">
                            {d.formattedDate}
                          </td>
                          <td className="py-3.5 px-4 text-xs text-muted-foreground">
                            {d.dayOfWeek}
                          </td>
                          <td className="py-3.5 px-4 text-center font-mono text-xs">
                            <span className="font-semibold text-foreground">{d.tradesCount}</span>
                            <span className="text-muted-foreground text-[11px] ml-1.5">
                              (<span className="text-profit font-semibold">{d.wins}W</span> • <span className="text-loss font-semibold">{d.losses}L</span>)
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono text-xs font-semibold text-foreground">
                            {d.winRate}%
                          </td>
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <span className={cn(
                              "font-mono font-semibold text-xs sm:text-sm",
                              isProfit ? "text-profit " : isLoss ? "text-loss " : "text-muted-foreground"
                            )}>
                              {isProfit ? "+" : ""}{formatINR(d.pnl)}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <span className={cn(
                              "font-mono font-semibold text-xs",
                              isCumulProfit ? "text-profit" : "text-loss"
                            )}>
                              {isCumulProfit ? "+" : ""}{formatINR(d.cumulativePnl)}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <Badge
                              variant="secondary"
                              className={cn(
                                "text-[10px] font-semibold px-2.5 py-0.5",
                                isProfit
                                  ? "bg-profit/10 text-profit border border-profit/20"
                                  : isLoss
                                    ? "bg-loss/10 text-loss border border-loss/20"
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
