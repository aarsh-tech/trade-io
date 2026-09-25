/**
 * Live trading data (positions, orders, margins, risk, strategies) must catch up the moment the trader
 * returns to the tab or the network comes back, e.g. after a laptop sleep. Only stale queries refetch,
 * so each query's own staleTime still prevents a request storm. Static data keeps the global default (off).
 */
export const TRADING_QUERY = {
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
} as const;
