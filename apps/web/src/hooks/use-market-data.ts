import { useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3002/market';

export interface MarketTick {
  symbol: string;
  ltp: number;
  timestamp: string;
}

export function useMarketData(symbols: string[]) {
  const [prices, setPrices] = useState<Record<string, number>>({});
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (symbols.length === 0) return;

    // Connect to market namespace
    const socket = io(SOCKET_URL, {
      withCredentials: true,
      transports: ['websocket'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected to Market WebSocket');
      // Subscribe to symbols
      socket.emit('subscribe', { symbols });
    });

    socket.on('ltp', (tick: MarketTick) => {
      setPrices((prev) => ({
        ...prev,
        [tick.symbol]: tick.ltp,
      }));
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from Market WebSocket');
    });

    return () => {
      if (socket) {
        socket.emit('unsubscribe', { symbols });
        socket.disconnect();
      }
    };
  }, [symbols.join(',')]);

  const getPrice = useCallback((symbol: string) => {
    return prices[symbol] || null;
  }, [prices]);

  return { prices, getPrice };
}
