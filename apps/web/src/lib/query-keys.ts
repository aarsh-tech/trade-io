/**
 * Centralized Query Key Factory
 * 
 * Provides strongly-typed, hierarchical query keys for all server state queries,
 * cache priming, and cache invalidations across the trading platform.
 */

export const queryKeys = {
  // Brokers
  brokers: {
    all: ["brokers"] as const,
    lists: () => [...queryKeys.brokers.all, "list"] as const,
    detail: (id: string) => [...queryKeys.brokers.all, "detail", id] as const,
  },

  // Portfolio & Broker Sessions
  portfolio: {
    all: ["portfolio"] as const,
    holdings: (brokerId?: string | null) =>
      [...queryKeys.portfolio.all, "holdings", brokerId ?? "default"] as const,
    positions: (brokerId?: string | null) =>
      [...queryKeys.portfolio.all, "positions", brokerId ?? "default"] as const,
    margins: (brokerId?: string | null) =>
      [...queryKeys.portfolio.all, "margins", brokerId ?? "default"] as const,
  },

  // Orders
  orders: {
    all: ["orders"] as const,
    lists: () => [...queryKeys.orders.all, "list"] as const,
    list: (scope?: string) => [...queryKeys.orders.all, "list", scope ?? "all"] as const,
    detail: (id: string) => [...queryKeys.orders.all, "detail", id] as const,
  },

  // Strategies & Executions
  strategies: {
    all: ["strategies"] as const,
    lists: () => [...queryKeys.strategies.all, "list"] as const,
    detail: (id: string) => [...queryKeys.strategies.all, "detail", id] as const,
    status: (id: string) => [...queryKeys.strategies.all, "status", id] as const,
    executions: (id: string) => [...queryKeys.strategies.all, "executions", id] as const,
  },

  // Market Data & Screeners
  market: {
    all: ["market"] as const,
    overview: () => [...queryKeys.market.all, "overview"] as const,
    stats: () => [...queryKeys.market.all, "stats"] as const,
    livePrices: () => [...queryKeys.market.all, "live-prices"] as const,
    movers: () => [...queryKeys.market.all, "movers"] as const,
    candles: (symbol: string, interval: string) =>
      [...queryKeys.market.all, "candles", symbol, interval] as const,
    quote: (symbol: string) => [...queryKeys.market.all, "quote", symbol] as const,
    screener: (filters?: Record<string, unknown>) =>
      [...queryKeys.market.all, "screener", filters] as const,
    ohlStocks: (params?: Record<string, unknown>) =>
      [...queryKeys.market.all, "ohl-stocks", params] as const,
  },

  // Financial Ledger
  ledger: {
    all: ["ledger"] as const,
    lists: () => [...queryKeys.ledger.all, "list"] as const,
    list: (filters?: Record<string, unknown>) =>
      [...queryKeys.ledger.all, "list", filters] as const,
  },

  // User & Authentication
  users: {
    all: ["users"] as const,
    profile: () => [...queryKeys.users.all, "profile"] as const,
  },
} as const;

export type QueryKeys = typeof queryKeys;
