"use client";

import { useMarketData } from "@/hooks/use-market-data";
import { brokerApi, getSocketBaseUrl, marketApi, strategyApi } from "@/lib/api";
import {  } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import { toast } from "sonner";
import type { Strategy } from "./types";
import { getLotSize } from "./types";

export function useStrategyDetail(id: string) {
  const router = useRouter();
  const [strategy, setStrategy] = useState<Strategy | null>(null);
  const [liveLogs, setLiveLogs] = useState<string[]>([]);
  const [liveState, setLiveState] = useState<any>(null);
  const [activeOrders, setActiveOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [activeTab, setActiveTab] = useState<"LIVE" | "CONFIG" | "ANALYTICS" | "HISTORY">("LIVE");

  // Real-time market data subscription (clean dummy symbols like AUTO, map index aliases)
  const symbolsToSubscribe = useMemo(() => {
    const rawList = [
      strategy?.config?.symbol,
      liveState?.activeSymbol,
      liveState?.optionSymbol,
      liveState?.futureSymbol,
      liveState?.activeStockSymbol,
    ].filter(Boolean) as string[];

    const cleaned: string[] = [];
    rawList.forEach((s) => {
      const upper = s.trim().toUpperCase();
      if (!upper || upper === "AUTO") return;
      cleaned.push(s);
      if (upper === "NIFTY" || upper === "NIFTY 50") {
        cleaned.push("NIFTY 50");
        cleaned.push("NSE:NIFTY 50");
      } else if (upper === "BANKNIFTY" || upper === "NIFTY BANK") {
        cleaned.push("NIFTY BANK");
        cleaned.push("NSE:NIFTY BANK");
      }
    });

    return Array.from(new Set(cleaned));
  }, [
    strategy?.config?.symbol,
    liveState?.activeSymbol,
    liveState?.optionSymbol,
    liveState?.futureSymbol,
    liveState?.activeStockSymbol,
  ]);

  const { getPrice, isConnected: isMarketDataConnected } = useMarketData(symbolsToSubscribe);
  const tradedSymbol =
    liveState?.optionSymbol ||
    liveState?.activeSymbol ||
    liveState?.activeStockSymbol ||
    liveState?.futureSymbol ||
    strategy?.config?.symbol;
  const directLtp = tradedSymbol ? getPrice(tradedSymbol) : null;
  const ltp = directLtp || (strategy?.config?.symbol ? getPrice(strategy.config.symbol) : null);

  // Live P&L zero-latency calculations
  const currentLtp = directLtp || liveState?.currentLtp || liveState?.entryPrice || 0;
  const entryPrice = liveState?.entryPrice || 0;
  const qty = Math.abs(Number(liveState?.executedQty || liveState?.qty || strategy?.config?.qty || 1));

  // Determine trade direction:
  // For options buying strategies, traders buy CE or PE contracts (always LONG the option contract).
  // For stocks/futures (e.g. BEML, SBIN), short trades sell high first, profiting when currentLtp < entryPrice.
  const isOptionBuyingStrategy =
    strategy?.type === "NIFTY_OPTIONS_SCALPER" ||
    strategy?.type === "STOCK_OPTIONS_BUYING" ||
    strategy?.type === "GAMMA_BLAST_EXPIRY";

  const isRealOptionSymbol =
    Boolean(liveState?.optionSymbol && (liveState.optionSymbol.endsWith("CE") || liveState.optionSymbol.endsWith("PE")));

  const isOptionTrade = isOptionBuyingStrategy || isRealOptionSymbol;

  const isShort =
    !isOptionTrade &&
    (liveState?.entryTriggered === "SHORT" ||
      liveState?.signalSide === "SELL" ||
      liveState?.signalSide === "PUT" ||
      Number(liveState?.qty ?? 0) < 0 ||
      Number(liveState?.executedQty ?? 0) < 0);

  const isLong = isOptionTrade || !isShort;

  let calculatedPnlRs = liveState?.pnlRs ?? 0;
  let calculatedPnlPct = liveState?.pnlPct ?? 0;
  if (
    entryPrice > 0 &&
    currentLtp > 0 &&
    (liveState?.entryTriggered || liveState?.stateType === "ACTIVE_POSITION")
  ) {
    const pnlPoints = isLong ? currentLtp - entryPrice : entryPrice - currentLtp;
    calculatedPnlRs = pnlPoints * qty;
    calculatedPnlPct = (pnlPoints / entryPrice) * 100;
  }
  const displayPnlRs =
    liveState?.pnlRs !== undefined && !directLtp
      ? liveState.pnlRs
      : (currentLtp > 0 && entryPrice > 0 ? calculatedPnlRs : liveState?.pnlRs ?? 0);
  const displayPnlPct =
    liveState?.pnlPct !== undefined && !directLtp
      ? liveState.pnlPct
      : (currentLtp > 0 && entryPrice > 0 ? calculatedPnlPct : liveState?.pnlPct ?? 0);
  const displayLtp = currentLtp || liveState?.currentLtp || liveState?.entryPrice || 0;

  const [editConfig, setEditConfig] = useState<Record<string, any>>({});

  // Test Order Modal state
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [testOrderLots, setTestOrderLots] = useState(1);
  const [testOrderBusy, setTestOrderBusy] = useState(false);
  const [isSquareOffBusy, setIsSquareOffBusy] = useState(false);
  const [testSymbol, setTestSymbol] = useState("");
  const [testExchange, setTestExchange] = useState("NSE");
  const [testProduct, setTestProduct] = useState("MIS");
  const [testPrice, setTestPrice] = useState("1.0");
  const [testOrderType, setTestOrderType] = useState("LIMIT");
  const [testVariety, setTestVariety] = useState("regular");

  const [testSearchQuery, setTestSearchQuery] = useState("");
  const [testSearchResults, setTestSearchResults] = useState<any[]>([]);
  const [isTestSearching, setIsTestSearching] = useState(false);
  const [testSelectedPrice, setTestSelectedPrice] = useState<number | null>(null);
  const [testLotSize, setTestLotSize] = useState<number>(1);

  // Live tick subscription for test instrument
  const symbolsToSubscribeTest =
    testSymbol && testExchange ? [`${testExchange}:${testSymbol}`] : [];
  const { prices: liveTestPrices } = useMarketData(symbolsToSubscribeTest);
  const currentLiveTestPrice =
    (testSymbol && testExchange && liveTestPrices[`${testExchange}:${testSymbol}`]) ||
    testSelectedPrice;

  useEffect(() => {
    if (strategy) {
      setTestSymbol(strategy.config.symbol || "AUTO");
      setTestExchange(strategy.config.exchange || "NSE");
      setTestProduct(strategy.config.product || "MIS");
      if (strategy.config.lotSize) {
        setTestLotSize(strategy.config.lotSize);
      }
    }
  }, [strategy]);

  useEffect(() => {
    if (!testSymbol || testSymbol === "AUTO") return;
    let isMounted = true;
    marketApi.getLotSize(testSymbol, strategy?.brokerAccountId)
      .then((res: any) => {
        if (isMounted && res.data?.lotSize) {
          setTestLotSize(res.data.lotSize);
        }
      })
      .catch(() => { });
    return () => { isMounted = false; };
  }, [testSymbol, strategy?.brokerAccountId]);

  const load = useCallback(async () => {
    try {
      const [stRes, statusRes] = await Promise.all([
        strategyApi.get(id),
        strategyApi.status(id),
      ]);
      setStrategy(stRes.data?.data ?? null);
      setLiveLogs(statusRes.data?.data?.logs ?? []);
      setLiveState(statusRes.data?.data?.state ?? null);
      setActiveOrders(statusRes.data?.data?.orders ?? []);
    } catch {
      toast.error("Failed to load strategy");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const [isWsConnected, setIsWsConnected] = useState(false);

  // Real-time WebSockets for zero-latency strategy updates
  useEffect(() => {
    if (typeof window === "undefined" || !id) return;
    const token = localStorage.getItem("accessToken");
    if (!token) return;

    const socket = io(`${getSocketBaseUrl()}/strategy`, {
      transports: ["websocket", "polling"],
      withCredentials: true,
      auth: { token },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });

    socket.on("connect", () => {
      setIsWsConnected(true);
      socket.emit("subscribe", { strategyId: id });
    });

    socket.on(
      "strategy-event",
      (payload: { logs?: string[]; state?: any; orders?: any[] }) => {
        if (payload.logs) setLiveLogs(payload.logs);
        if (payload.state !== undefined) setLiveState(payload.state);
        if (payload.orders) {
          if (payload.orders.length > 0) {
            setActiveOrders(payload.orders);
          } else {
            setActiveOrders((prev) => (prev.length > 0 ? prev : []));
          }
        }
      }
    );

    socket.on("disconnect", () => {
      setIsWsConnected(false);
    });

    socket.on("connect_error", () => {
      setIsWsConnected(false);
    });

    return () => {
      socket.disconnect();
      setIsWsConnected(false);
    };
  }, [id]);

  // Periodic status & strategy synchronization to guarantee state and trades started from mobile are synced on desktop
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const [statusRes, stratRes] = await Promise.all([
          strategyApi.status(id),
          strategyApi.get(id),
        ]);
        if (stratRes.data?.data) {
          setStrategy((prev) => (prev ? { ...prev, ...stratRes.data.data } : stratRes.data.data));
        }
        if (statusRes.data?.data) {
          if (statusRes.data.data.logs) setLiveLogs(statusRes.data.data.logs);
          if (statusRes.data.data.state !== undefined) setLiveState(statusRes.data.data.state);
          if (statusRes.data.data.orders && statusRes.data.data.orders.length > 0) {
            setActiveOrders(statusRes.data.data.orders);
          }
        }
      } catch { }
    }, isWsConnected ? 20000 : 10000);
    return () => clearInterval(interval);
  }, [id, isWsConnected]);

  async function toggleEngine() {
    if (!strategy) return;
    setBusy(true);
    try {
      if (strategy.isActive) {
        await strategyApi.stop(id);
        setLiveLogs([]);
        toast.success(`"${strategy.name}" stopped`);
      } else {
        await strategyApi.start(id);
        toast.success(`"${strategy.name}" started — engine running`);
      }
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Action failed");
    } finally {
      setBusy(false);
    }
  }

  async function toggleAutoStart() {
    if (!strategy) return;
    setBusy(true);
    try {
      await strategyApi.setAutoStart(strategy.id, !strategy.autoStart);
      toast.success(
        !strategy.autoStart
          ? `✅ "${strategy.name}" will auto-start at 09:15 AM`
          : `"${strategy.name}" auto-start disabled`
      );
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Failed to update auto-start");
    } finally {
      setBusy(false);
    }
  }

  async function handleInstantSquareOff() {
    if (!strategy) return;
    setIsSquareOffBusy(true);
    try {
      const res = await strategyApi.squareOff(id);
      if (res.data?.success) {
        toast.success(res.data?.data?.message || "Position squared off successfully!");
      } else {
        toast.error(res.data?.message || "Failed to square off position");
      }
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Square off request failed");
    } finally {
      setIsSquareOffBusy(false);
    }
  }

  async function saveConfig() {
    setBusy(true);
    try {
      const merged = { ...strategy!.config, ...editConfig };
      await strategyApi.update(id, { config: JSON.stringify(merged) });
      toast.success("Configuration updated successfully!");
      setEditing(false);
      await load();
    } catch {
      toast.error("Failed to save config");
    } finally {
      setBusy(false);
    }
  }

  async function handleTestSymbolSearch(q: string) {
    setTestSearchQuery(q);
  }

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (testSearchQuery.length < 2) {
        setTestSearchResults([]);
        return;
      }
      setIsTestSearching(true);
      try {
        const res = await marketApi.search(testSearchQuery, strategy?.brokerAccountId);
        setTestSearchResults(res.data?.data ?? []);
      } catch {
        setTestSearchResults([]);
      } finally {
        setIsTestSearching(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [testSearchQuery, strategy?.brokerAccountId]);

  function selectTestInstrument(item: any) {
    setTestSymbol(item.symbol);
    setTestExchange(item.exchange);
    if (item.lotSize && item.lotSize > 0) {
      setTestLotSize(item.lotSize);
    }
    const itemPrice = item.ltp || item.ltpNSE || item.price || null;
    setTestSelectedPrice(itemPrice);
    if (itemPrice) {
      setTestPrice(itemPrice.toString());
    }
    setTestSearchQuery("");
    setTestSearchResults([]);
  }

  async function handleTestOrder() {
    if (!strategy?.brokerAccountId) {
      toast.error("No broker account connected");
      return;
    }
    setTestOrderBusy(true);
    try {
      const lotSize = testLotSize || getLotSize(testSymbol);
      const qty = testOrderLots * lotSize;
      await brokerApi.placeOrder(strategy.brokerAccountId, {
        symbol: testSymbol,
        exchange: testExchange,
        side: "BUY",
        orderType: testOrderType,
        product: testProduct || strategy.config.product,
        qty: qty,
        price: testOrderType === "LIMIT" ? Number(testPrice) : undefined,
        variety: testVariety,
      });
      toast.success("Test order submitted successfully!");
      setIsTestModalOpen(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Test order failed");
    } finally {
      setTestOrderBusy(false);
    }
  }


  return {
    id,
    router,
    strategy,
    setStrategy,
    liveLogs,
    setLiveLogs,
    liveState,
    setLiveState,
    activeOrders,
    setActiveOrders,
    loading,
    setLoading,
    busy,
    setBusy,
    editing,
    setEditing,
    showHistory,
    setShowHistory,
    activeTab,
    setActiveTab,
    symbolsToSubscribe,
    getPrice,
    isMarketDataConnected,
    tradedSymbol,
    directLtp,
    ltp,
    currentLtp,
    entryPrice,
    qty,
    isOptionBuyingStrategy,
    isRealOptionSymbol,
    isOptionTrade,
    isShort,
    isLong,
    calculatedPnlRs,
    calculatedPnlPct,
    displayPnlRs,
    displayPnlPct,
    displayLtp,
    editConfig,
    setEditConfig,
    isTestModalOpen,
    setIsTestModalOpen,
    testOrderLots,
    setTestOrderLots,
    testOrderBusy,
    setTestOrderBusy,
    isSquareOffBusy,
    setIsSquareOffBusy,
    testSymbol,
    setTestSymbol,
    testExchange,
    setTestExchange,
    testProduct,
    setTestProduct,
    testPrice,
    setTestPrice,
    testOrderType,
    setTestOrderType,
    testVariety,
    setTestVariety,
    testSearchQuery,
    setTestSearchQuery,
    testSearchResults,
    setTestSearchResults,
    isTestSearching,
    setIsTestSearching,
    testSelectedPrice,
    setTestSelectedPrice,
    testLotSize,
    setTestLotSize,
    symbolsToSubscribeTest,
    liveTestPrices,
    currentLiveTestPrice,
    load,
    isWsConnected,
    setIsWsConnected,
    toggleEngine,
    toggleAutoStart,
    handleInstantSquareOff,
    saveConfig,
    handleTestSymbolSearch,
    selectTestInstrument,
    handleTestOrder,
  };
}

export type StrategyDetail = ReturnType<typeof useStrategyDetail>;

/** Everything a section needs once the strategy has loaded (`strategy` is non-null). */
export type DetailCtx = Omit<StrategyDetail, "strategy"> & {
  strategy: Strategy;
  cfg: any;
  is15Min: any;
  isEmaVwap: any;
  isNiftyScalper: any;
  isStockOptions: any;
  isGammaBlast: any;
  isDailyScalper: any;
};

export function withStrategy(detail: StrategyDetail): DetailCtx | null {
  const { strategy } = detail;
  if (!strategy) return null;
  const cfg = strategy.config;
  const is15Min = strategy.type === "BREAKOUT_15MIN";
  const isEmaVwap = strategy.type === "EMA_VWAP_CROSSOVER";
  const isNiftyScalper = strategy.type === "NIFTY_OPTIONS_SCALPER";
  const isStockOptions = strategy.type === "STOCK_OPTIONS_BUYING";
  const isGammaBlast = strategy.type === "GAMMA_BLAST_EXPIRY";
  const isDailyScalper = strategy.type === "DAILY_SCALPER";

  return { ...detail, strategy, cfg, is15Min, isEmaVwap, isNiftyScalper, isStockOptions, isGammaBlast, isDailyScalper };
}
