"use client";

import { OrderWindow } from "@/components/dashboard/OrderWindow";
import { LiveAlgoPositionsCard } from "@/components/dashboard/LiveAlgoPositionsCard";
import { MoversCard } from "@/components/dashboard/MoversCard";
import { TodaySummary } from "@/components/dashboard/TodaySummary";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useBrokers } from "@/hooks/useBrokers";
import { useDashboard } from "@/hooks/useDashboard";
import { FeedStatusBadge } from "@/components/dashboard/FeedStatusBadge";
import { usePortfolio } from "@/hooks/usePortfolio";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store";
import {
  ChevronRight,
  ExternalLink,
  History,
  LayoutGrid,
  Loader2,
  PieChart as PieChartIcon,
  RefreshCcw,
  ShoppingCart,
  Sparkles,
  Zap
} from "lucide-react";
import Link from "next/link";
import React, { useMemo, useState, useEffect } from "react";
import { EMPTY, formatINR, formatPct, pnlClass } from "@/lib/format";
interface Holding {
  symbol: string;
  qty: number;
  avgPrice: number;
  ltp: number;
  pnl: number;
}

interface MarginSegment {
  enabled?: boolean;
  net?: number;
  available?: {
    cash?: number;
    live_balance?: number;
    opening_balance?: number;
    collateral?: number;
    intraday_payin?: number;
    adhoc_margin?: number;
    [key: string]: any;
  };
  utilised?: {
    debits?: number;
    exposure?: number;
    m2m_realised?: number;
    m2m_unrealised?: number;
    option_premium?: number;
    pnl?: number;
    span?: number;
    [key: string]: any;
  };
}

interface Margin {
  equity?: MarginSegment;
  commodity?: MarginSegment;
}

interface Broker {
  id: string;
  broker: string;
  clientId: string;
  isActive: boolean;
}

function FundsCard({
  icon,
  title,
  href,
  linkLabel,
  primaryLabel,
  primary,
  rows,
}: {
  icon: React.ReactNode;
  title: string;
  href: string;
  linkLabel: string;
  primaryLabel: string;
  primary: React.ReactNode;
  rows: { label: string; value: string }[];
}) {
  return (
    <Card className="p-0 overflow-hidden">
      <CardHeader className="mb-0 py-2.5 px-4 border-b border-border flex flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-muted-foreground">
          {icon}
          <CardTitle className="text-[13px] font-semibold">{title}</CardTitle>
        </div>
        <Link href={href} className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-0.5">
          {linkLabel}
          <ChevronRight className="h-3 w-3" aria-hidden />
        </Link>
      </CardHeader>
      <CardContent className="p-4">
        <span className="text-[11px] text-muted-foreground">{primaryLabel}</span>
        <div className="text-xl font-semibold num tracking-tight text-foreground mt-0.5">{primary}</div>
        <dl className="mt-3 pt-3 border-t border-border grid grid-cols-2 gap-3">
          {rows.map((r) => (
            <div key={r.label}>
              <dt className="text-[11px] text-muted-foreground">{r.label}</dt>
              <dd className="text-[13px] font-medium num text-foreground mt-0.5">{r.value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { user } = useAuthStore();
  const { movers, feed, isLoading: isDashboardLoading, refresh: refreshDashboard } = useDashboard();
  const { brokers } = useBrokers();

  const [showRenewModal, setShowRenewModal] = useState(false);
  const [requestToken, setRequestToken] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Order Window State (Kite Style)
  const [orderState, setOrderState] = React.useState<{
    isOpen: boolean;
    type: "BUY" | "SELL";
    symbol: string;
    ltp: number;
  }>({
    isOpen: false,
    type: "BUY",
    symbol: "",
    ltp: 0,
  });

  const openOrderFor = (symbol: string, ltp: number) =>
    setOrderState({ isOpen: true, type: "BUY", symbol, ltp });

  // Pick active broker
  const activeBroker = useMemo(() => {
    const brokerList = (brokers || []) as Broker[];
    return (
      brokerList.find((b) => b.isActive && b.broker === "ZERODHA") ||
      brokerList.find((b) => b.isActive) ||
      brokerList[0]
    );
  }, [brokers]);

  const {
    holdings = [],
    margins,
    isLoading: isPortfolioLoading,
    refreshHoldings,
    renewSession,
    isRenewing,
    getLoginUrl,
  } = usePortfolio(activeBroker?.id);

  // Auto-detect Zerodha request_token on desktop redirect
  useEffect(() => {
    if (typeof window === "undefined" || !activeBroker?.id) return;
    const params = new URLSearchParams(window.location.search);
    const token = params.get("request_token") || params.get("requestToken");

    // Only auto-submit redirect tokens that carry our signed login state (see getLoginUrl).
    const state = params.get("state");
    if (token && state && (!params.get("status") || params.get("status") === "success")) {
      renewSession({ token, state })
        .then(() => {
          const url = new URL(window.location.href);
          url.searchParams.delete("request_token");
          url.searchParams.delete("requestToken");
          url.searchParams.delete("state");
          url.searchParams.delete("action");
          url.searchParams.delete("status");
          url.searchParams.delete("type");
          const nextUrl = url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : "");
          window.history.replaceState({}, document.title, nextUrl);
        })
        .catch((err) => {
          console.error("Auto token renewal failed:", err);
        });
    }
  }, [activeBroker?.id, renewSession]);

  const handleOpenLogin = async () => {
    const url = await getLoginUrl();
    if (url) window.open(url, "_blank");
  };

  const handleAutomatedLogin = async () => {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const urlToken = urlParams.get("request_token") || urlParams.get("requestToken");
      const urlState = urlParams.get("state");
      if (urlToken && urlState) {
        try {
          await renewSession({ token: urlToken, state: urlState });
          setShowRenewModal(false);
          setRequestToken("");
          return;
        } catch { }
      }

      try {
        if (navigator?.clipboard?.readText) {
          const clipText = await navigator.clipboard.readText();
          let token = (clipText || "").trim();
          if (token.includes("request_token=")) {
            const match = token.match(/request_token=([a-zA-Z0-9]+)/);
            if (match && match[1]) token = match[1];
          }
          if (token && token.length >= 10 && !token.includes(" ")) {
            setRequestToken(token);
            await renewSession(token);
            setShowRenewModal(false);
            setRequestToken("");
            return;
          }
        }
      } catch { }
    }

    await handleOpenLogin();
  };

  const handleRenewSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestToken) return;
    try {
      await renewSession(requestToken);
      setShowRenewModal(false);
      setRequestToken("");
    } catch { }
  };

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([refreshDashboard(), refreshHoldings()]);
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  // Calculate Real Portfolio Stats
  const stats = useMemo(() => {
    const safeHoldings = (holdings || []) as Holding[];
    const safeMargins = margins as Margin | null;

    const totalInvestment = safeHoldings.reduce(
      (acc, h) => acc + Number(h.avgPrice || 0) * Number(h.qty || 0),
      0
    );
    const currentValue = safeHoldings.reduce(
      (acc, h) => acc + Number(h.ltp || 0) * Number(h.qty || 0),
      0
    );
    const pnl = currentValue - totalInvestment;
    const pnlPercent = totalInvestment > 0 ? (pnl / totalInvestment) * 100 : 0;

    const marginAvailable =
      safeMargins?.equity?.available?.live_balance ??
      safeMargins?.equity?.available?.cash ??
      safeMargins?.equity?.net ??
      0;
    const marginsUsed = safeMargins?.equity?.utilised?.debits ?? 0;
    const openingBalance =
      safeMargins?.equity?.available?.opening_balance ?? marginAvailable;

    const commodityMarginAvailable =
      safeMargins?.commodity?.available?.live_balance ??
      safeMargins?.commodity?.available?.cash ??
      safeMargins?.commodity?.net ??
      0;
    const commodityMarginsUsed = safeMargins?.commodity?.utilised?.debits ?? 0;
    const commodityOpeningBalance =
      safeMargins?.commodity?.available?.opening_balance ?? commodityMarginAvailable;

    return {
      totalInvestment,
      currentValue,
      pnl,
      pnlPercent,
      marginAvailable,
      marginsUsed,
      openingBalance,
      commodityMarginAvailable,
      commodityMarginsUsed,
      commodityOpeningBalance,
      holdingsCount: safeHoldings.length,
    };
  }, [holdings, margins]);

  const firstName = user?.name?.split(" ")[0] ?? "";
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
  // Broker funds are only real once the margins call has answered; before that we show "—", never ₹0.
  const hasMargins = Boolean(margins);
  const hasHoldings = !isPortfolioLoading && Boolean(activeBroker) && stats.holdingsCount > 0;

  if (isDashboardLoading && isPortfolioLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center" role="status">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
          <p className="text-xs text-muted-foreground">Loading dashboard…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-4 pb-8">
      {/* ── 1. Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-semibold tracking-tight text-foreground">
            {firstName ? `Hi, ${firstName}` : "Dashboard"}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">{today} · Funds, live algo positions and market movers</p>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          <FeedStatusBadge feed={feed} />
          {activeBroker && (
            <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setShowRenewModal(true)}>
              <Zap className="h-3.5 w-3.5 text-warn" aria-hidden /> Daily login
            </Button>
          )}
          <Button
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => setOrderState({ isOpen: true, type: "BUY", symbol: "", ltp: 0 })}
          >
            <ShoppingCart className="h-3.5 w-3.5" aria-hidden /> Place order
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Refresh dashboard"
            title="Refresh"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
          >
            <RefreshCcw className={cn("h-3.5 w-3.5 text-muted-foreground", isRefreshing && "animate-spin text-primary")} aria-hidden />
          </Button>
        </div>
      </div>

      {/* ── 1b. Today: day P&L, loss-limit meter, funds, running strategies ── */}
      <TodaySummary
        marginAvailable={hasMargins ? stats.marginAvailable : undefined}
        marginsUsed={hasMargins ? stats.marginsUsed : undefined}
      />

      {/* ── 2. Live Algo Execution & Positions Card ── */}
      <LiveAlgoPositionsCard activeBroker={activeBroker} />

      {/* ── 3. Funds & holdings ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
        <FundsCard
          icon={<LayoutGrid className="h-3.5 w-3.5" aria-hidden />}
          title="Equity"
          href="/portfolio"
          linkLabel="Funds"
          primaryLabel="Margin available"
          primary={hasMargins ? formatINR(stats.marginAvailable) : EMPTY}
          rows={[
            { label: "Margin used", value: hasMargins ? formatINR(stats.marginsUsed) : EMPTY },
            { label: "Opening balance", value: hasMargins ? formatINR(stats.openingBalance) : EMPTY },
          ]}
        />
        <FundsCard
          icon={<History className="h-3.5 w-3.5" aria-hidden />}
          title="Commodity"
          href="/portfolio"
          linkLabel="Funds"
          primaryLabel="Margin available"
          primary={hasMargins ? formatINR(stats.commodityMarginAvailable) : EMPTY}
          rows={[
            { label: "Margin used", value: hasMargins ? formatINR(stats.commodityMarginsUsed) : EMPTY },
            { label: "Opening balance", value: hasMargins ? formatINR(stats.commodityOpeningBalance) : EMPTY },
          ]}
        />
        <FundsCard
          icon={<PieChartIcon className="h-3.5 w-3.5" aria-hidden />}
          title={activeBroker && !isPortfolioLoading ? `Holdings (${stats.holdingsCount})` : "Holdings"}
          href="/portfolio"
          linkLabel="Portfolio"
          primaryLabel="Unrealised P&L"
          primary={
            hasHoldings ? (
              <span className={pnlClass(stats.pnl)}>
                {formatINR(stats.pnl, { signed: true })}
                <span className="ml-1.5 text-xs font-medium">{formatPct(stats.pnlPercent)}</span>
              </span>
            ) : (
              EMPTY
            )
          }
          rows={[
            { label: "Current value", value: hasHoldings ? formatINR(stats.currentValue) : EMPTY },
            { label: "Invested", value: hasHoldings ? formatINR(stats.totalInvestment) : EMPTY },
          ]}
        />
      </div>

      {/* ── 4. Market Movers: Top Gainers & Top Losers (2-Grid) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        <MoversCard kind="gainers" items={movers?.topGainers || []} onSelect={openOrderFor} />
        <MoversCard kind="losers" items={movers?.topLosers || []} onSelect={openOrderFor} />
      </div>

      {/* ── 5. Renew Session Modal (Pure White Background) ── */}
      <Dialog open={showRenewModal} onOpenChange={setShowRenewModal}>
        <DialogContent className="max-w-md p-0 overflow-hidden bg-card text-foreground border border-border shadow-2xl">
          <div className="p-6 pb-2 bg-card">
            <div className="flex items-start gap-3.5 mb-1">
              <div className="h-10 w-10 rounded-lg bg-warn-subtle border border-warn/30 flex items-center justify-center shrink-0">
                <Zap className="h-5 w-5 text-warn" />
              </div>
              <div className="pr-6">
                <DialogTitle className="text-lg font-semibold text-foreground">
                  Broker Daily Login
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Brokers require a fresh daily authentication token. Follow these quick steps to sync your account:
                </DialogDescription>
              </div>
            </div>
          </div>

          <div className="px-6 py-3 space-y-3.5 bg-card">
            {/* Step 1 Card */}
            <div className="rounded-lg border border-border bg-muted/40 p-3.5 space-y-2.5">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-warn text-[10px] font-semibold text-on-warn">
                  1
                </span>
                <span className="text-xs font-semibold text-foreground">
                  Authenticate on Broker Portal
                </span>
              </div>
              <Button
                onClick={handleOpenLogin}
                className="w-full h-9 bg-warn hover:bg-warn/90 text-on-warn font-semibold text-xs gap-1.5"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Open Broker Login Page
              </Button>
            </div>

            {/* Step 2 Card */}
            <div className="rounded-lg border border-border bg-muted/40 p-3.5 space-y-3">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                  2
                </span>
                <span className="text-xs font-semibold text-foreground">
                  Sync Session Token
                </span>
              </div>

              <form onSubmit={handleRenewSession} className="space-y-3">
                <Button
                  type="button"
                  onClick={handleAutomatedLogin}
                  disabled={isRenewing}
                  className="w-full h-9 bg-primary hover:bg-brand-hover text-primary-foreground font-semibold text-xs gap-1.5"
                >
                  {isRenewing ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Logging in...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5" /> Run Automated Login
                    </>
                  )}
                </Button>

                <div className="flex items-center gap-2 py-0.5">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    OR PASTE MANUALLY
                  </span>
                  <div className="h-px flex-1 bg-border" />
                </div>

                <Input
                  value={requestToken}
                  onChange={(e) => {
                    let val = e.target.value.trim();
                    if (val.includes("request_token=")) {
                      const match = val.match(/request_token=([a-zA-Z0-9]+)/);
                      if (match && match[1]) val = match[1];
                    }
                    setRequestToken(val);
                  }}
                  placeholder="Paste token or redirect URL here..."
                  className="h-9 border-border bg-card text-foreground text-xs focus:ring-1 focus:ring-primary placeholder:text-muted-foreground"
                />

                <Button
                  type="submit"
                  disabled={isRenewing || !requestToken}
                  className="w-full h-9 bg-foreground hover:bg-foreground/90 text-background font-semibold text-xs disabled:opacity-50"
                >
                  {isRenewing ? "Activating..." : "Activate Manual Session"}
                </Button>
              </form>
            </div>
          </div>

          <div className="bg-muted/50 px-6 py-3 border-t border-border flex justify-end">
            <Button
              type="button"
              variant="ghost"
              className="text-muted-foreground hover:text-foreground text-xs h-8"
              onClick={() => setShowRenewModal(false)}
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── 6. Zerodha Kite Style Order Window ── */}
      <OrderWindow
        isOpen={orderState.isOpen}
        onClose={() => setOrderState((prev) => ({ ...prev, isOpen: false }))}
        symbol={orderState.symbol}
        type={orderState.type}
        ltp={orderState.ltp}
        availableMargin={stats.marginAvailable}
        brokerId={activeBroker?.id}
        onTypeChange={(newType) => setOrderState((prev) => ({ ...prev, type: newType }))}
      />
    </div>
  );
}
