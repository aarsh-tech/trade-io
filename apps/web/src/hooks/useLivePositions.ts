import { useMemo } from "react";
import { useMarketData } from "@/hooks/use-market-data";

export interface BrokerPosition {
  symbol: string;
  exchange?: string;
  qty: number;
  avgPrice: number;
  ltp: number;
  pnl: number;
}

/**
 * Broker positions with LTP and P&L moved by the live tick feed between the REST refreshes, like Kite's positions
 * screen. Kite's P&L is linear in the LTP (sell value - buy value + qty x LTP), so the live P&L is the broker's
 * figure plus qty x the move since its LTP: it keeps the realised part of a partly closed position, and matches
 * Kite exactly when the prices agree.
 */
export function useLivePositions<T extends BrokerPosition>(positions: T[]) {
  const keys = useMemo(
    () => positions.filter((p) => p.qty !== 0 && p.symbol).map((p) => (p.exchange ? `${p.exchange}:${p.symbol}` : p.symbol)),
    [positions],
  );
  const { getPrice, isConnected } = useMarketData(keys);

  const live = useMemo(
    () =>
      positions.map((pos) => {
        const tick = pos.qty !== 0 ? getPrice(pos.exchange ? `${pos.exchange}:${pos.symbol}` : pos.symbol) : null;
        const brokerLtp = pos.ltp || pos.avgPrice;
        // Discard a tick >50% away from the broker's LTP (a same-named instrument on another exchange).
        const sane = typeof tick === "number" && tick > 0 && (!(brokerLtp > 0) || Math.abs(tick - brokerLtp) / brokerLtp < 0.5);
        const ltp = sane ? tick : pos.ltp;
        const pnl = sane && pos.ltp > 0 ? (pos.pnl || 0) + pos.qty * (tick - pos.ltp) : pos.pnl || 0;
        const pnlPct = pos.qty !== 0 && pos.avgPrice > 0 && ltp > 0 ? ((ltp - pos.avgPrice) / pos.avgPrice) * 100 * (pos.qty > 0 ? 1 : -1) : 0;
        return { ...pos, ltp, pnl, pnlPct, hasLiveTick: sane };
      }),
    [positions, getPrice],
  );

  return { positions: live, isConnected };
}
