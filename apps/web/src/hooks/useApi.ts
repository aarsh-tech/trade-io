import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { strategyApi, brokerApi, marketApi, backtestApi, orderApi } from "@/lib/api";

// ─── Strategies ─────────────────────────────────────────────────────────────

export const strategyKeys = {
  all: ["strategies"] as const,
  lists: () => [...strategyKeys.all, "list"] as const,
  detail: (id: string) => [...strategyKeys.all, "detail", id] as const,
  executions: (id: string) => [...strategyKeys.all, "executions", id] as const,
};

export function useStrategies() {
  return useQuery({
    queryKey: strategyKeys.lists(),
    queryFn: async () => {
      const res = await strategyApi.list();
      return res.data;
    },
  });
}

export function useStrategy(id: string) {
  return useQuery({
    queryKey: strategyKeys.detail(id),
    queryFn: async () => {
      const res = await strategyApi.get(id);
      return res.data;
    },
    enabled: !!id,
  });
}

// ─── Brokers ────────────────────────────────────────────────────────────────

export const brokerKeys = {
  all: ["brokers"] as const,
  lists: () => [...brokerKeys.all, "list"] as const,
  positions: (id: string) => [...brokerKeys.all, "positions", id] as const,
  holdings: (id: string) => [...brokerKeys.all, "holdings", id] as const,
  orders: (id: string) => [...brokerKeys.all, "orders", id] as const,
};

export function useBrokers() {
  return useQuery({
    queryKey: brokerKeys.lists(),
    queryFn: async () => {
      const res = await brokerApi.list();
      return res.data;
    },
  });
}

export function useBrokerPositions(id: string | null) {
  return useQuery({
    queryKey: brokerKeys.positions(id!),
    queryFn: async () => {
      const res = await brokerApi.positions(id!);
      return res.data;
    },
    enabled: !!id,
  });
}

// ─── Market Data ────────────────────────────────────────────────────────────

export const marketKeys = {
  all: ["market"] as const,
  quote: (symbol: string) => [...marketKeys.all, "quote", symbol] as const,
  search: (q: string) => [...marketKeys.all, "search", q] as const,
};

export function useMarketQuote(symbol: string) {
  return useQuery({
    queryKey: marketKeys.quote(symbol),
    queryFn: async () => {
      const res = await marketApi.quote(symbol);
      return res.data;
    },
    enabled: !!symbol,
  });
}

// ─── Orders ─────────────────────────────────────────────────────────────────

export const orderKeys = {
  all: ["orders"] as const,
  lists: (params?: any) => [...orderKeys.all, "list", params] as const,
};

export function useOrders(params?: { limit?: number; page?: number }) {
  return useQuery({
    queryKey: orderKeys.lists(params),
    queryFn: async () => {
      const res = await orderApi.list(params);
      return res.data;
    },
  });
}
