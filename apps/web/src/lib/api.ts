import axios from "axios";
import { useAuthStore } from "@/store";

export function getApiBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  if (typeof window !== "undefined" && window.location.hostname) {
    return `http://${window.location.hostname}:3002/v1`;
  }
  return "http://127.0.0.1:3002/v1";
}

export function getSocketBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_WS_URL) {
    return process.env.NEXT_PUBLIC_WS_URL;
  }
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL.replace(/\/v1\/?$/, "");
  }
  if (typeof window !== "undefined" && window.location.hostname) {
    return `http://${window.location.hostname}:3002`;
  }
  return "http://127.0.0.1:3002";
}

export const api = axios.create({
  baseURL: getApiBaseUrl(),
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

// Mutex to prevent multiple concurrent refresh calls
let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

export function handleForceLogout() {
  if (typeof window !== "undefined") {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    try {
      useAuthStore.getState().clearAuth();
    } catch {}
    if (!window.location.pathname.includes("/login")) {
      window.location.href = "/login";
    }
  }
}

export async function requestTokenRefresh(): Promise<string | null> {
  if (typeof window === "undefined") return null;

  const refreshToken = localStorage.getItem("refreshToken");
  if (!refreshToken) {
    handleForceLogout();
    return null;
  }

  // If another request is currently refreshing the token, await the exact same promise
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const { data } = await axios.post(
        `${getApiBaseUrl()}/auth/refresh`,
        { refreshToken },
        { withCredentials: true }
      );

      const newAccess = data?.data?.accessToken;
      const newRefresh = data?.data?.refreshToken;
      const user = data?.data?.user;

      if (!newAccess) {
        throw new Error("No access token returned from refresh");
      }

      localStorage.setItem("accessToken", newAccess);
      if (newRefresh) localStorage.setItem("refreshToken", newRefresh);

      if (user) {
        try {
          useAuthStore.getState().setAuth(user, newAccess, newRefresh || refreshToken);
        } catch {}
      }

      return newAccess;
    } catch (err: any) {
      const status = err?.response?.status;
      // If 401 or 403 or invalid refresh token, force logout immediately
      if (status === 401 || status === 403 || !err?.response) {
        handleForceLogout();
      }
      throw err;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

// Request interceptor — attach JWT
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    if (!process.env.NEXT_PUBLIC_API_URL && config.baseURL?.includes("127.0.0.1")) {
      config.baseURL = getApiBaseUrl();
    }
    const token = localStorage.getItem("accessToken");
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor — handle 401 with synchronized single-flight token refresh
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (
      error.response?.status === 401 &&
      original &&
      !original._retry &&
      !original.url?.includes("/auth/refresh") &&
      !original.url?.includes("/auth/login") &&
      !original.url?.includes("/auth/register")
    ) {
      original._retry = true;
      try {
        const newAccess = await requestTokenRefresh();
        if (newAccess) {
          original.headers.Authorization = `Bearer ${newAccess}`;
          return api(original);
        }
      } catch (refreshErr) {
        return Promise.reject(refreshErr);
      }
    }
    return Promise.reject(error);
  }
);


// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (data: { email: string; password: string; totpCode?: string }) =>
    api.post("/auth/login", data),
  register: (data: { email: string; password: string; name: string }) =>
    api.post("/auth/register", data),
  refresh: (refreshToken: string) =>
    api.post("/auth/refresh", { refreshToken }),
  logout: () => {
    const refreshToken = typeof window !== "undefined" ? localStorage.getItem("refreshToken") : null;
    return api.post("/auth/logout", { refreshToken });
  },
  setup2fa: () => api.post("/auth/2fa/setup"),
  verify2fa: (code: string) => api.post("/auth/2fa/verify", { code }),
  disable2fa: () => api.post("/auth/2fa/disable"),
  forgotPassword: (email: string) => api.post("/auth/forgot-password", { email }),
  resetPassword: (data: { token: string; newPassword: string }) => api.post("/auth/reset-password", data),
};

// ─── Users ───────────────────────────────────────────────────────────────────
export const userApi = {
  updateProfile: (data: { email?: string; name?: string }) =>
    api.patch("/users/profile", data),
  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    api.post("/users/change-password", data),
};

// ─── Strategies ───────────────────────────────────────────────────────────────
export const strategyApi = {
  list: () => api.get("/strategies"),
  get: (id: string) => api.get(`/strategies/${id}`),
  create: (data: unknown) => api.post("/strategies", data),
  update: (id: string, data: unknown) => api.patch(`/strategies/${id}`, data),
  delete: (id: string) => api.delete(`/strategies/${id}`),
  start: (id: string) => api.post(`/strategies/${id}/start`),
  stop: (id: string) => api.post(`/strategies/${id}/stop`),
  squareOff: (id: string) => api.post(`/strategies/${id}/square-off`),
  status: (id: string) => api.get(`/strategies/${id}/status`),
  executions: (id: string) => api.get(`/strategies/${id}/executions`),
  setAutoStart: (id: string, autoStart: boolean) =>
    api.patch(`/strategies/${id}/auto-start`, { autoStart }),
};

// ─── Brokers ──────────────────────────────────────────────────────────────────
export const brokerApi = {
  list: () => api.get("/brokers"),
  connect: (data: unknown) => api.post("/brokers/connect", data),
  disconnect: (id: string) => api.delete(`/brokers/${id}`),
  setSession: (id: string, requestToken: string) => api.post(`/brokers/${id}/session`, { requestToken }),
  loginUrl: (id: string) => api.get(`/brokers/${id}/login-url`),
  positions: (id: string) => api.get(`/brokers/${id}/positions`),
  holdings: (id: string) => api.get(`/brokers/${id}/holdings`),
  margins: (id: string) => api.get(`/brokers/${id}/margins`),
  orders: (id: string) => api.get(`/brokers/${id}/orders`),
  placeOrder: (id: string, data: unknown) => api.post(`/brokers/${id}/orders`, data),
  placeGtt: (id: string, data: unknown) => api.post(`/brokers/${id}/gtt`, data),
  cancelOrder: (id: string, orderId: string) => api.delete(`/brokers/${id}/orders/${orderId}`),
  tickSize: (id: string, symbol: string, exchange: string) =>
    api.get(`/brokers/${id}/tick-size`, { params: { symbol, exchange } }),
};

// ─── Market Data ──────────────────────────────────────────────────────────────
export const marketApi = {
  marketOverview: () => api.get("/market/overview"),
  livePrices: () => api.get("/market/live-prices"),
  movers: () => api.get("/market/movers"),
  getOhlStocks: (params?: { universe?: string; tolerance?: number | string; filter?: string }) =>
    api.get("/market/ohl-stocks", { params }),
  candles: (params: {
    symbol: string; exchange: string; interval: string; from: string; to: string;
  }) => api.get("/market/candles", { params }),
  quote: (symbol: string) => api.get(`/market/quote/${symbol}`),
  search: (q: string, accountId?: string | null) => api.get("/market/search", { params: { q, accountId } }),
  searchInstruments: (q: string, accountId?: string | null) => api.get("/market/search", { params: { q, accountId } }),
  getLotSize: (symbol: string, accountId?: string | null) => api.get("/market/lot-size", { params: { symbol, accountId } }),
  addToWatchlist: (symbol: string, exchange: string = 'NSE') => api.post("/market/watchlist", { symbol, exchange }),
  removeFromWatchlist: (symbol: string, exchange: string = 'NSE') => api.delete("/market/watchlist", { params: { symbol, exchange } }),
};

// ─── Orders & P&L Ledger ────────────────────────────────────────────────────────
export const orderApi = {
  list: (params?: { limit?: number; page?: number }) =>
    api.get("/orders", { params }),
  sync: () => api.post("/orders/sync"),
  ledger: (params?: { month?: number; year?: number }) =>
    api.get("/orders/ledger", { params }),
};

export const swingApi = {
  run: () => api.post("/swing-scanner/run"),
  last: (params?: { page?: number; pageSize?: number; pattern?: string; sortBy?: string }) => 
    api.get("/swing-scanner/last", { params }),
};



