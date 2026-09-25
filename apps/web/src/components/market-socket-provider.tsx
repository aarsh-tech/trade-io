"use client";

import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { getSocketBaseUrl } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { useMarketStore, type FeedStatus, type MarketTick } from "@/store/market-store";

/** Ticks are buffered and written to the store at most this often, so React renders ≤ ~8 times a second. */
const FLUSH_INTERVAL_MS = 125;

interface OrderUpdate {
  orderId: string;
  status: string;
  tradingsymbol?: string;
  transactionType?: string;
  filledQuantity?: number;
  quantity?: number;
  statusMessage?: string | null;
}

interface MarketSocketApi {
  /** Ref-counted: the server subscription is added on the first holder and dropped when the last one leaves. */
  subscribe: (symbols: string[]) => () => void;
}

const MarketSocketContext = createContext<MarketSocketApi | null>(null);

export function MarketSocketProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);
  const refCounts = useRef(new Map<string, number>());

  useEffect(() => {
    if (!localStorage.getItem("accessToken")) return;

    const socket = io(`${getSocketBaseUrl()}/market`, {
      // A function, so every (re)connect handshake uses the current token after a refresh.
      auth: (cb) => cb({ token: localStorage.getItem("accessToken") }),
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;
    const store = useMarketStore.getState();

    let pending: MarketTick[] = [];
    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      timer = null;
      if (pending.length === 0) return;
      const batch = pending;
      pending = [];
      // Later ticks for a key win; only one store write per flush.
      const latest = new Map<string, MarketTick>();
      for (const t of batch) latest.set(t.key, t);
      store.applyTicks(Array.from(latest.values()));
    };

    socket.on("connect", () => {
      store.setConnected(true);
      const symbols = Array.from(refCounts.current.keys());
      if (symbols.length > 0) socket.emit("subscribe", { symbols });
    });
    socket.on("disconnect", () => {
      store.setConnected(false);
      store.setFeed({ ...useMarketStore.getState().feed, status: "stale" });
    });
    socket.on("ticks", (batch: MarketTick[]) => {
      if (!Array.isArray(batch)) return;
      for (const t of batch) if (t?.key && typeof t.ltp === "number") pending.push(t);
      if (timer === null && pending.length > 0) timer = setTimeout(flush, FLUSH_INTERVAL_MS);
    });
    socket.on("feed:status", (status: FeedStatus) => store.setFeed(status));
    socket.on("order_update", (o: OrderUpdate) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.portfolio.all });
      const label = `${o.transactionType ?? ""} ${o.tradingsymbol ?? ""}`.trim();
      if (o.status === "COMPLETE") toast.success(`Order filled: ${label} (${o.filledQuantity ?? o.quantity ?? ""})`);
      else if (o.status === "REJECTED") toast.error(`Order rejected: ${label}${o.statusMessage ? ` - ${o.statusMessage}` : ""}`);
    });

    return () => {
      if (timer !== null) clearTimeout(timer);
      socket.disconnect();
      socketRef.current = null;
      store.setConnected(false);
      store.setFeed({ status: "closed", lastExchangeTs: null, lastMessageAt: null });
    };
  }, [queryClient]);

  const api = useMemo<MarketSocketApi>(
    () => ({
      subscribe: (symbols) => {
        const held = Array.from(new Set(symbols.filter(Boolean)));
        const added: string[] = [];
        for (const s of held) {
          const n = refCounts.current.get(s) ?? 0;
          refCounts.current.set(s, n + 1);
          if (n === 0) added.push(s);
        }
        if (added.length > 0 && socketRef.current?.connected) {
          socketRef.current.emit("subscribe", { symbols: added });
        }
        let released = false;
        return () => {
          if (released) return;
          released = true;
          const dropped: string[] = [];
          for (const s of held) {
            const n = (refCounts.current.get(s) ?? 1) - 1;
            if (n <= 0) {
              refCounts.current.delete(s);
              dropped.push(s);
            } else {
              refCounts.current.set(s, n);
            }
          }
          if (dropped.length > 0 && socketRef.current?.connected) {
            socketRef.current.emit("unsubscribe", { symbols: dropped });
          }
        };
      },
    }),
    [],
  );

  return <MarketSocketContext.Provider value={api}>{children}</MarketSocketContext.Provider>;
}

export function useMarketSocket(): MarketSocketApi {
  const ctx = useContext(MarketSocketContext);
  if (!ctx) throw new Error("useMarketSocket must be used inside <MarketSocketProvider>");
  return ctx;
}
