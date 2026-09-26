"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AlarmClock, ArrowLeft, Check, Loader2, Pencil, Play, Radio, RefreshCw, Send, Square } from "lucide-react";
import Link from "next/link";
import type { DetailCtx } from "./useStrategyDetail";
import { getLotSize } from "./types";

export function HeaderBar({ ctx }: { ctx: DetailCtx }) {
  const { id, strategy, busy, isTestModalOpen, setIsTestModalOpen, testOrderLots, setTestOrderLots, testOrderBusy, testSymbol, testExchange, testProduct, setTestProduct, testPrice, setTestPrice, testOrderType, setTestOrderType, testVariety, setTestVariety, testSearchQuery, testSearchResults, isTestSearching, testLotSize, currentLiveTestPrice, load, isWsConnected, toggleEngine, toggleAutoStart, handleTestSymbolSearch, selectTestInstrument, handleTestOrder, cfg } = ctx;
  return (
    <>
      {/* ─── Breadcrumb & Top Command Header ─── */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-border/50 pb-5">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/strategies">
            <Button
              variant="outline"
              size="icon" aria-label="Back to strategies"
              className="h-10 w-10 rounded-lg bg-card border-border/80 hover:bg-accent shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>

          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl font-semibold tracking-tight truncate max-w-[320px] sm:max-w-md">
                {strategy.name}
              </h1>

              {/* Status Pill */}
              <div
                className={cn(
                  "inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ",
                  strategy.isActive
                    ? "bg-profit/15 text-profit border-profit/30"
                    : "bg-muted text-muted-foreground border-border/70"
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    strategy.isActive ? "bg-profit animate-ping" : "bg-muted-foreground"
                  )}
                />
                {strategy.isActive ? "LIVE RUNNING" : "PAUSED"}
              </div>

              {strategy.isPaperTrade && (
                <Badge
                  variant="outline"
                  className="bg-warn/10 text-warn border-warn/30 text-[10px] font-semibold"
                >
                  Paper Trade
                </Badge>
              )}

              {/* WebSocket Telemetry Status Pill */}
              <div
                className={cn(
                  "inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ",
                  isWsConnected
                    ? "bg-profit/10 text-profit border-profit/30"
                    : "bg-warn/10 text-warn border-warn/30"
                )}
                title={
                  isWsConnected
                    ? "Zero-latency WebSocket connected"
                    : "Connecting to real-time WebSocket..."
                }
              >
                <Radio className={cn("h-3 w-3", isWsConnected ? "text-profit animate-pulse" : "text-warn")} />
                <span>{isWsConnected ? "WS Live" : "Connecting..."}</span>
              </div>
            </div>

            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-foreground/80">
                {cfg.symbol || "AUTO"}
              </span>
              <span>•</span>
              <span>{cfg.exchange || "NSE"}</span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-profit inline-block" />
                {strategy.brokerAccount
                  ? `${strategy.brokerAccount.broker} (${strategy.brokerAccount.clientId})`
                  : "Virtual Paper Broker"}
              </span>
            </p>
          </div>
        </div>

        {/* Top Control Actions */}
        <div className="flex items-center gap-2 self-stretch md:self-auto justify-end flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={load}
            disabled={busy}
            className="h-9 px-3 text-xs gap-1.5 bg-card border-border/80 hover:bg-accent/60"
            title="Refresh Status & Telemetry"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>

          {/* Auto-Start Arm Button */}
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={toggleAutoStart}
            title={
              strategy.autoStart
                ? "Auto-Start Armed (Starts at 09:15 AM) — Click to disable"
                : "Auto-Start Disarmed — Click to arm for 09:15 AM"
            }
            className={cn(
              "h-9 px-3 text-xs gap-1.5 rounded-lg transition-all border font-semibold ",
              strategy.autoStart
                ? "bg-warn/15 text-warn border-warn/30 hover:bg-warn/20"
                : "text-muted-foreground hover:text-warn hover:border-warn/30 bg-card"
            )}
          >
            <AlarmClock className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">
              {strategy.autoStart ? "09:15 AM Armed" : "Auto-Start"}
            </span>
          </Button>

          {/* Test Order Trigger */}
          <Dialog open={isTestModalOpen} onOpenChange={setIsTestModalOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-9 px-3 text-xs gap-1.5 border-warn/30 bg-warn/10 text-warn hover:bg-warn/20 font-semibold rounded-lg"
              >
                <Send className="h-3.5 w-3.5" />
                <span>Test Order</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="w-[calc(100%-2rem)] sm:max-w-[480px] p-5 sm:p-6 rounded-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-lg font-semibold flex items-center gap-2">
                  <Send className="h-5 w-5 text-warn" />
                  Place Broker Test Order
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Execute an instant order test using your connected{" "}
                  <strong>{strategy.brokerAccount?.broker || "Broker"}</strong> account.
                </DialogDescription>
              </DialogHeader>

              <div className="py-3 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Search Instrument
                  </label>
                  <div className="relative">
                    <Input
                      placeholder="e.g. RELIANCE, BANKNIFTY 48000 CE..."
                      value={testSearchQuery}
                      onChange={(e) => handleTestSymbolSearch(e.target.value)}
                      className="bg-secondary/40 border-border/80 pr-10 text-xs h-9"
                    />
                    {isTestSearching && (
                      <div className="absolute right-3 top-2.5">
                        <Loader2 className="h-4 w-4 animate-spin text-warn" />
                      </div>
                    )}
                  </div>

                  {testSearchResults.length > 0 && (
                    <div className="mt-1 bg-card border border-border rounded-lg shadow-xl max-h-48 overflow-y-auto divide-y divide-border/60 z-50">
                      {testSearchResults.map((item) => {
                        const itemPrice = item.ltp || item.ltpNSE || item.price;
                        return (
                          <button
                            key={`${item.exchange}:${item.symbol}`}
                            onClick={() => selectTestInstrument(item)}
                            className="w-full flex items-center justify-between p-2.5 hover:bg-accent transition-colors text-left group text-xs"
                          >
                            <div>
                              <p className="font-semibold text-foreground group-hover:text-warn">
                                {item.symbol}
                              </p>
                              <p className="text-[10px] text-muted-foreground uppercase truncate max-w-[180px]">
                                {item.name}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              {itemPrice && (
                                <span className="font-semibold text-profit">
                                  ₹{Number(itemPrice).toFixed(2)}
                                </span>
                              )}
                              <Badge variant="outline" className="text-[9px]">
                                {item.exchange}
                              </Badge>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Selected Instrument Pill */}
                  <div className="flex items-center justify-between p-3 rounded-lg bg-warn/10 border border-warn/20">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-warn">
                        Selected Symbol
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-sm font-semibold text-foreground">
                          {testSymbol || "AUTO"}
                        </p>
                        {currentLiveTestPrice && (
                          <span className="text-xs font-semibold text-profit bg-profit/10 px-2 py-0.5 rounded-full border border-profit/20">
                            LTP ₹{Number(currentLiveTestPrice).toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>
                    <Badge className="bg-warn text-on-warn font-semibold text-[10px]">
                      {testExchange}
                    </Badge>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Product
                    </label>
                    <select
                      value={testProduct}
                      onChange={(e) => setTestProduct(e.target.value)}
                      className="flex h-9 w-full rounded-lg border border-border bg-secondary/30 px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-warn"
                    >
                      <option value="MIS">MIS (Intraday)</option>
                      <option value="NRML">NRML (Delivery)</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Order Type
                    </label>
                    <select
                      value={testOrderType}
                      onChange={(e) => setTestOrderType(e.target.value)}
                      className="flex h-9 w-full rounded-lg border border-border bg-secondary/30 px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-warn"
                    >
                      <option value="LIMIT">LIMIT Order</option>
                      <option value="MARKET">MARKET Order</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Variety
                    </label>
                    <select
                      value={testVariety}
                      onChange={(e) => setTestVariety(e.target.value)}
                      className="flex h-9 w-full rounded-lg border border-border bg-secondary/30 px-3 py-1 text-xs font-semibold text-warn focus:outline-none focus:ring-1 focus:ring-warn"
                    >
                      <option value="regular">REGULAR (Live Market)</option>
                      <option value="amo">AMO (After Market)</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Limit Price (₹)
                    </label>
                    <Input
                      type="number"
                      step="0.05"
                      disabled={testOrderType === "MARKET"}
                      value={testPrice}
                      onChange={(e) => setTestPrice(e.target.value)}
                      className="h-9 text-xs bg-secondary/30"
                    />
                  </div>
                </div>

                <div className="space-y-1 pt-2 border-t border-border/70">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Lots / Multiplier
                    </label>
                    <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
                      {(testLotSize || getLotSize(testSymbol)) > 1 && (
                        <span className="text-[10px] font-semibold text-warn bg-warn/10 px-1.5 py-0.5 rounded">
                          1 Lot = {testLotSize || getLotSize(testSymbol)}
                        </span>
                      )}
                      Total: {testOrderLots * (testLotSize || getLotSize(testSymbol))} shares
                    </span>
                  </div>
                  <Input
                    type="number"
                    min={1}
                    value={testOrderLots}
                    onChange={(e) => setTestOrderLots(Number(e.target.value))}
                    className="h-9 text-xs font-semibold bg-secondary/30"
                  />
                </div>
              </div>

              <DialogFooter className="pt-2">
                <Button
                  className="w-full h-10 text-xs font-semibold bg-profit hover:bg-profit/90 text-on-profit shadow-md"
                  disabled={testOrderBusy}
                  onClick={handleTestOrder}
                >
                  {testOrderBusy ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" /> Placing Test Order...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4 mr-1.5" /> Confirm & Submit Order
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Edit Full Strategy Button */}
          <Link href={`/strategies/${id}/edit`}>
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-3 text-xs gap-1.5 border-border/80 bg-card hover:bg-accent/60 font-semibold rounded-lg"
              title="Edit Complete Strategy Configuration"
            >
              <Pencil className="h-3.5 w-3.5 text-primary" />
              <span>Edit Strategy</span>
            </Button>
          </Link>

          {/* Primary Start / Stop Button */}
          <Button
            size="sm"
            disabled={busy}
            onClick={toggleEngine}
            className={cn(
              "h-9 px-4 text-xs font-semibold gap-2 rounded-lg transition-all shadow-md",
              strategy.isActive
                ? "bg-loss hover:bg-loss/90 text-on-loss "
                : "bg-profit hover:bg-profit/90 text-on-profit "
            )}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : strategy.isActive ? (
              <>
                <Square className="h-3.5 w-3.5 fill-white" />
                Stop Engine
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 fill-white" />
                Start Engine
              </>
            )}
          </Button>
        </div>
      </div>

    </>
  );
}
