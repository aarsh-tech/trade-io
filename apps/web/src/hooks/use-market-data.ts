import { useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { getSocketBaseUrl } from '@/lib/api';

export interface MarketTick {
  key: string;
  symbol: string;
  exchange: string;
  ltp: number;
  close: number | null;
  change: number | null;
  changePct: number | null;
  volume: number | null;
  exchangeTs: string | null;
  ts: string;
  source: 'ws' | 'rest';
}

export function useMarketData(symbols: string[]) {
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  // Normalize symbols for stable comparison
  const symbolsKey = symbols.slice().sort().join(',');

  useEffect(() => {
    if (symbols.length === 0) return;

    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
    if (!token) return;

    // Connect to market namespace
    const socket = io(`${getSocketBaseUrl()}/market`, {
      withCredentials: true,
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      // The server matches a bare symbol on any exchange and `EXCH:SYMBOL` exactly, and delivers each tick once.
      socket.emit('subscribe', { symbols: Array.from(new Set(symbols)) });
    });

    socket.on('ticks', (batch: MarketTick[]) => {
      if (!Array.isArray(batch) || batch.length === 0) return;
      setPrices((prev) => {
        const next = { ...prev };
        for (const tick of batch) {
          if (!tick?.symbol || typeof tick.ltp !== 'number') continue;
          next[tick.key] = tick.ltp;
          next[tick.symbol] = tick.ltp;
        }
        return next;
      });
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      // Reconnection handled automatically by socket.io
    });

    return () => {
      if (socket) {
        socket.emit('unsubscribe', { symbols });
        socket.disconnect();
      }
      setIsConnected(false);
    };
  }, [symbolsKey]);

  const getPrice = useCallback((symbol: string) => {
    if (!symbol) return null;
    const rawSym = symbol.includes(':') ? symbol.split(':')[1] : symbol;
    return prices[symbol] ?? prices[rawSym] ?? prices[`NSE:${rawSym}`] ?? prices[`NFO:${rawSym}`] ?? prices[`BSE:${rawSym}`] ?? null;
  }, [prices]);

  return { prices, getPrice, isConnected };
}
