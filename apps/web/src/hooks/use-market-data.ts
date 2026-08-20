import { useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

const SOCKET_URL =
  process.env.NEXT_PUBLIC_WS_URL ||
  (process.env.NEXT_PUBLIC_API_URL
    ? `${process.env.NEXT_PUBLIC_API_URL.replace(/\/v1\/?$/, '')}/market`
    : 'http://127.0.0.1:3002/market');

export interface MarketTick {
  symbol: string;
  ltp: number;
  timestamp: string;
}

export function useMarketData(symbols: string[]) {
  const [prices, setPrices] = useState<Record<string, number>>({});
  const socketRef = useRef<Socket | null>(null);

  // Normalize symbols for stable comparison
  const symbolsKey = symbols.slice().sort().join(',');

  useEffect(() => {
    if (symbols.length === 0) return;

    // Connect to market namespace
    const socket = io(SOCKET_URL, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      // Send both raw and prefixed symbol variants to ensure complete matching
      const allSubscriptions: string[] = [];
      symbols.forEach((sym) => {
        const raw = sym.includes(':') ? sym.split(':')[1] : sym;
        allSubscriptions.push(sym);
        allSubscriptions.push(raw);
        allSubscriptions.push(`NSE:${raw}`);
        allSubscriptions.push(`BSE:${raw}`);
        allSubscriptions.push(`NFO:${raw}`);
      });
      const uniqueSymbols = Array.from(new Set(allSubscriptions));
      socket.emit('subscribe', { symbols: uniqueSymbols });
    });

    socket.on('ltp', (tick: MarketTick) => {
      if (!tick || !tick.symbol || typeof tick.ltp !== 'number') return;
      const rawSym = tick.symbol.includes(':') ? tick.symbol.split(':')[1] : tick.symbol;

      setPrices((prev) => ({
        ...prev,
        [tick.symbol]: tick.ltp,
        [rawSym]: tick.ltp,
        [`NSE:${rawSym}`]: tick.ltp,
        [`BSE:${rawSym}`]: tick.ltp,
        [`NFO:${rawSym}`]: tick.ltp,
      }));
    });

    socket.on('disconnect', () => {
      // Reconnection handled automatically by socket.io
    });

    return () => {
      if (socket) {
        socket.emit('unsubscribe', { symbols });
        socket.disconnect();
      }
    };
  }, [symbolsKey]);

  const getPrice = useCallback((symbol: string) => {
    if (!symbol) return null;
    const rawSym = symbol.includes(':') ? symbol.split(':')[1] : symbol;
    return prices[symbol] ?? prices[rawSym] ?? prices[`NSE:${rawSym}`] ?? prices[`NFO:${rawSym}`] ?? prices[`BSE:${rawSym}`] ?? null;
  }, [prices]);

  return { prices, getPrice };
}
