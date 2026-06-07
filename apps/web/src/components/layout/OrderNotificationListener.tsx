"use client";

import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { orderKeys } from "@/hooks/useApi";

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL?.replace('/v1', '') || "http://127.0.0.1:3002";

export function OrderNotificationListener() {
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const token = localStorage.getItem("accessToken");
    if (!token) return;

    // Establish WebSocket connection to /orders namespace
    const socket = io(`${SOCKET_URL}/orders`, {
      transports: ["websocket"],
      auth: { token },
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("Connected to Orders WebSocket");
    });

    socket.on("order-event", (data: { order: any; eventType: string }) => {
      const { order, eventType } = data;

      // 1. Play sweet synth audio chimes
      if (order.status === "COMPLETE") {
        playOrderSound("executed");
      } else if (order.status === "REJECTED") {
        playOrderSound("rejected");
      } else if (order.status === "CANCELLED") {
        playOrderSound("cancelled");
      } else if (eventType === "created") {
        playOrderSound("placed");
      }

      // 2. Show Zerodha-style toast in bottom left
      showZerodhaToast(order, eventType);

      // 3. Proactively refresh React Query cache
      queryClient.invalidateQueries({ queryKey: orderKeys.all });
    });

    socket.on("disconnect", () => {
      console.log("Disconnected from Orders WebSocket");
    });

    return () => {
      socket.disconnect();
    };
  }, [queryClient]);

  return null;
}

let globalAudioCtx: AudioContext | null = null;

if (typeof window !== "undefined") {
  const initAudio = () => {
    if (!globalAudioCtx) {
      globalAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (globalAudioCtx.state === "suspended") {
      globalAudioCtx.resume();
    }
    
    // Play a silent buffer to unlock audio context in Safari, Chrome & Edge
    try {
      const buffer = globalAudioCtx.createBuffer(1, 1, 22050);
      const source = globalAudioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(globalAudioCtx.destination);
      source.start(0);
    } catch (e) {
      console.warn("Failed to play silent buffer:", e);
    }

    if (globalAudioCtx?.state === "running") {
      window.removeEventListener("click", initAudio);
      window.removeEventListener("keydown", initAudio);
    }
  };
  window.addEventListener("click", initAudio);
  window.addEventListener("keydown", initAudio);
}

function playOrderSound(type: "placed" | "executed" | "cancelled" | "rejected") {
  if (typeof window === "undefined") return;

  try {
    let ctx = globalAudioCtx;
    if (!ctx) {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (ctx.state === "suspended") {
      ctx.resume();
    }
    const now = ctx.currentTime;

    if (type === "executed") {
      // Ascending double chime (sweet chimes for completed/filled trades: E6 -> A6)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(1318.51, now); // E6
      gain1.gain.setValueAtTime(0.08, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.15);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(1760.00, now + 0.08); // A6
      gain2.gain.setValueAtTime(0.08, now + 0.08);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.08);
      osc2.stop(now + 0.3);
    } else if (type === "placed") {
      // Clean single chime (placed: C6)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(1046.50, now); // C6
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.25);
    } else if (type === "cancelled" || type === "rejected") {
      // Warning descending chimes (C5 -> G4)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "triangle";
      osc1.frequency.setValueAtTime(523.25, now); // C5
      gain1.gain.setValueAtTime(0.05, now);
      gain1.gain.linearRampToValueAtTime(0.001, now + 0.15);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.15);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "triangle";
      osc2.frequency.setValueAtTime(392.00, now + 0.08); // G4
      gain2.gain.setValueAtTime(0.05, now + 0.08);
      gain2.gain.linearRampToValueAtTime(0.001, now + 0.25);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.08);
      osc2.stop(now + 0.25);
    }
  } catch (err) {
    console.error("Failed to play synthesized sound:", err);
  }
}

function showZerodhaToast(order: any, eventType: string) {
  const isBuy = order.side === "BUY";
  const status = order.status;

  let title = "Order Placed";
  let statusColor = "text-blue-600";
  let borderColor = "border-blue-500";

  if (status === "COMPLETE") {
    title = "Order Executed";
    statusColor = "text-emerald-600";
    borderColor = "border-emerald-500";
  } else if (status === "REJECTED") {
    title = "Order Rejected";
    statusColor = "text-rose-600";
    borderColor = "border-rose-500";
  } else if (status === "CANCELLED") {
    title = "Order Cancelled";
    statusColor = "text-slate-500";
    borderColor = "border-slate-400";
  } else if (eventType === "updated") {
    title = "Order Updated";
    statusColor = "text-amber-600";
    borderColor = "border-amber-500";
  }

  const timeStr = new Date(order.createdAt).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const sideColor = isBuy ? "text-blue-600 font-extrabold" : "text-orange-500 font-extrabold";
  const displayPrice = order.avgPrice ?? order.price ?? 0;

  toast.custom(
    (t) => (
      <div
        className={`flex flex-col bg-white text-slate-800 rounded-xl p-4 shadow-lg border-l-4 ${borderColor} border-y border-r border-slate-100 w-80 animate-[slide-in_0.2s_ease-out] font-sans pointer-events-auto`}
      >
        <div className="flex justify-between items-center border-b border-slate-100 pb-1.5 mb-2">
          <span className={`font-bold text-xs uppercase tracking-wider ${statusColor}`}>
            {title}
          </span>
          <span className="text-[10px] text-slate-400 font-mono">{timeStr}</span>
        </div>
        <div className="text-xs text-slate-600 font-medium leading-relaxed">
          <span className={sideColor}>{order.side}</span>{" "}
          <span className="font-bold text-slate-950">{order.qty}</span> qty of{" "}
          <span className="font-bold text-slate-950">{order.symbol}</span> ({order.exchange})
        </div>
        <div className="mt-1.5 flex justify-between items-center text-[10px] text-slate-500">
          <span>Product: {order.productType || "MIS"}</span>
          <span className="font-mono text-slate-700 font-semibold">
            {status === "COMPLETE" ? "Avg. Price" : "Price"}: ₹
            {displayPrice.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>
    ),
    {
      duration: 5000,
    }
  );
}
