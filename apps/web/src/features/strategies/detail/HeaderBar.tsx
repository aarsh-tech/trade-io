"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { strategyApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { AlarmClock, ArrowLeft, Check, Copy, Loader2, Pencil, Play, Radio, RefreshCw, Send, Square, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import type { DetailCtx } from "./useStrategyDetail";
import { getLotSize } from "./types";
import { MenuItem, ModeBadge, OverflowMenu, StatusBadge, getRunStatus, isInPosition, typeLabel } from "./shared";

export function HeaderBar({ ctx }: { ctx: DetailCtx }) {
  const { id, router, strategy, liveState, busy, isTestModalOpen, setIsTestModalOpen, testOrderLots, setTestOrderLots, testOrderBusy, testSymbol, testExchange, testProduct, setTestProduct, testPrice, setTestPrice, testOrderType, setTestOrderType, testVariety, setTestVariety, testSearchQuery, testSearchResults, isTestSearching, testLotSize, currentLiveTestPrice, load, isWsConnected, toggleEngine, toggleAutoStart, handleTestSymbolSearch, selectTestInstrument, handleTestOrder, cfg } = ctx;
  const [confirmStop, setConfirmStop] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [menuBusy, setMenuBusy] = useState(false);

  const status = getRunStatus(strategy);
  const running = strategy.isActive;
  const inPosition = isInPosition(liveState);
  const positionLabel = [liveState?.entryTriggered, liveState?.optionSymbol || liveState?.activeSymbol || cfg.symbol]
    .filter((v) => typeof v === "string" && v)
    .join(" ");

  async function duplicate() {
    setMenuBusy(true);
    try {
      const res = await strategyApi.create({
        name: `${strategy.name} (copy)`,
        type: strategy.type,
        brokerAccountId: strategy.brokerAccountId,
        isPaperTrade: strategy.isPaperTrade,
        config: JSON.stringify(strategy.config),
      });
      const newId = res.data?.data?.id || res.data?.id;
      toast.success("Strategy duplicated");
      if (newId) router.push(`/strategies/${newId}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Failed to duplicate strategy");
    } finally {
      setMenuBusy(false);
    }
  }

  async function remove() {
    setMenuBusy(true);
    try {
      await strategyApi.delete(id);
      toast.success("Strategy deleted");
      router.push("/strategies");
    } catch {
      toast.error("Failed to delete strategy");
      setMenuBusy(false);
    }
  }

  return (
    <>
      <header className="space-y-3">
        <div className="flex items-start gap-3">
          <Link href="/strategies" aria-label="Back to strategies" className="shrink-0">
            <Button variant="outline" size="icon" aria-label="Back to strategies">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{strategy.name}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <ModeBadge paper={strategy.isPaperTrade} />
              <StatusBadge status={status} />
              <span className="text-xs font-medium text-muted-foreground">{typeLabel(strategy.type)}</span>
              <span className="text-xs text-muted-foreground" aria-hidden>·</span>
              <span className="text-xs font-semibold text-foreground">{cfg.symbol || "AUTO"}</span>
              <span className="text-xs text-muted-foreground">{cfg.exchange || "NSE"}</span>
              {strategy.autoStart && (
                <Badge variant="warning" className="gap-1">
                  <AlarmClock className="h-3 w-3" aria-hidden /> 09:15 auto-start
                </Badge>
              )}
            </div>
            <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Radio className={cn("h-3 w-3", isWsConnected ? "text-profit" : "text-warn")} aria-hidden />
              {isWsConnected ? "Live feed connected" : "Reconnecting to live feed"}
              <span aria-hidden>·</span>
              {strategy.brokerAccount ? `${strategy.brokerAccount.broker} (${strategy.brokerAccount.clientId})` : "Virtual paper broker"}
            </p>
          </div>

          {/* Desktop actions sit beside the title; mobile gets a full-width row below. */}
          <div className="hidden shrink-0 items-center gap-2 md:flex">
            {primaryAction()}
            {menu()}
          </div>
        </div>

        <div className="flex items-center gap-2 md:hidden">
          {primaryAction(true)}
          {menu()}
        </div>
      </header>

      <ConfirmDialog
        open={confirmStop}
        onOpenChange={setConfirmStop}
        onConfirm={toggleEngine}
        title={`Stop "${strategy.name}"?`}
        description={
          inPosition
            ? `You have an open position${positionLabel ? ` (${positionLabel})` : ""}. Stopping the engine will square it off at market price right away.`
            : "Stopping the engine will square off any open position and end the current session."
        }
        confirmText="Stop and square off"
        variant="destructive"
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        onConfirm={remove}
        title={`Delete "${strategy.name}"?`}
        description="This permanently deletes the strategy and all its execution logs. This cannot be undone."
        confirmText="Delete strategy"
        variant="destructive"
      />

      <Dialog open={isTestModalOpen} onOpenChange={setIsTestModalOpen}>
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
    </>
  );

  function primaryAction(full?: boolean) {
    return running ? (
      <Button variant="danger" size="lg" disabled={busy} onClick={() => setConfirmStop(true)} className={cn(full && "flex-1")}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4 fill-current" />}
        Stop strategy
      </Button>
    ) : (
      <Button variant="success" size="lg" disabled={busy} onClick={toggleEngine} className={cn(full && "flex-1")}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-current" />}
        Start strategy
      </Button>
    );
  }

  function menu() {
    return (
      <OverflowMenu>
        {(close) => (
          <>
            <MenuItem icon={<Pencil className="h-4 w-4" />} onClick={() => { close(); router.push(`/strategies/${id}/edit`); }}>
              Edit strategy
            </MenuItem>
            <MenuItem icon={<Copy className="h-4 w-4" />} disabled={menuBusy} onClick={() => { close(); duplicate(); }}>
              Duplicate
            </MenuItem>
            <MenuItem icon={<AlarmClock className="h-4 w-4" />} disabled={busy} onClick={() => { close(); toggleAutoStart(); }}>
              {strategy.autoStart ? "Disable 09:15 auto-start" : "Arm 09:15 auto-start"}
            </MenuItem>
            <MenuItem icon={<RefreshCw className="h-4 w-4" />} disabled={busy} onClick={() => { close(); load(); }}>
              Refresh
            </MenuItem>
            <MenuItem icon={<Send className="h-4 w-4" />} onClick={() => { close(); setIsTestModalOpen(true); }}>
              Send test order
            </MenuItem>
            <div className="my-1 h-px bg-border" role="separator" />
            <MenuItem icon={<Trash2 className="h-4 w-4" />} danger disabled={menuBusy} onClick={() => { close(); setConfirmDelete(true); }}>
              Delete
            </MenuItem>
          </>
        )}
      </OverflowMenu>
    );
  }
}
