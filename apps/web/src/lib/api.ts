import axios from "axios";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3002/v1";

export const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

// Request interceptor — attach JWT
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("accessToken");
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor — handle 401 / token refresh
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const refreshToken = localStorage.getItem("refreshToken");
        const { data } = await axios.post(`${API_BASE}/auth/refresh`, { refreshToken });
        localStorage.setItem("accessToken", data.data.accessToken);
        original.headers.Authorization = `Bearer ${data.data.accessToken}`;
        return api(original);
      } catch {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("refreshToken");
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  login:    (data: { email: string; password: string; totpCode?: string }) =>
    api.post("/auth/login", data),
  register: (data: { email: string; password: string; name: string }) =>
    api.post("/auth/register", data),
  refresh:  (refreshToken: string) =>
    api.post("/auth/refresh", { refreshToken }),
  logout:   () => api.post("/auth/logout"),
  setup2fa: () => api.post("/auth/2fa/setup"),
  verify2fa:(code: string) => api.post("/auth/2fa/verify", { code }),
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
  list:         () => api.get("/strategies"),
  get:          (id: string) => api.get(`/strategies/${id}`),
  create:       (data: unknown) => api.post("/strategies", data),
  update:       (id: string, data: unknown) => api.patch(`/strategies/${id}`, data),
  delete:       (id: string) => api.delete(`/strategies/${id}`),
  start:        (id: string) => api.post(`/strategies/${id}/start`),
  stop:         (id: string) => api.post(`/strategies/${id}/stop`),
  status:       (id: string) => api.get(`/strategies/${id}/status`),
  executions:   (id: string) => api.get(`/strategies/${id}/executions`),
  setAutoStart: (id: string, autoStart: boolean) =>
    api.patch(`/strategies/${id}/auto-start`, { autoStart }),
};

// ─── Brokers ──────────────────────────────────────────────────────────────────
export const brokerApi = {
  list:       () => api.get("/brokers"),
  connect:    (data: unknown) => api.post("/brokers/connect", data),
  disconnect: (id: string) => api.delete(`/brokers/${id}`),
  setSession: (id: string, requestToken: string) => api.post(`/brokers/${id}/session`, { requestToken }),
  loginUrl:   (id: string) => api.get(`/brokers/${id}/login-url`),
  positions:  (id: string) => api.get(`/brokers/${id}/positions`),
  holdings:   (id: string) => api.get(`/brokers/${id}/holdings`),
  orders:     (id: string) => api.get(`/brokers/${id}/orders`),
  placeOrder: (id: string, data: unknown) => api.post(`/brokers/${id}/orders`, data),
  cancelOrder:(id: string, orderId: string) => api.delete(`/brokers/${id}/orders/${orderId}`),
};

// ─── Market Data ──────────────────────────────────────────────────────────────
export const marketApi = {
  marketOverview: () => api.get("/market/overview"),
  livePrices:     () => api.get("/market/live-prices"),
  candles: (params: {
    symbol: string; exchange: string; interval: string; from: string; to: string;
  }) => api.get("/market/candles", { params }),
  quote:  (symbol: string) => api.get(`/market/quote/${symbol}`),
  search: (q: string, accountId?: string | null) => api.get("/market/search", { params: { q, accountId } }),
  addToWatchlist: (symbol: string, exchange: string = 'NSE') => api.post("/market/watchlist", { symbol, exchange }),
  removeFromWatchlist: (symbol: string, exchange: string = 'NSE') => api.delete("/market/watchlist", { params: { symbol, exchange } }),
};


// ─── Backtesting ──────────────────────────────────────────────────────────────
export const backtestApi = {
  run:    (data: any) => api.post("/backtest/run", data),
  history: () => api.get("/backtest/history"),
};

// ─── Orders ───────────────────────────────────────────────────────────────────
export const orderApi = {
  list: (params?: { limit?: number; page?: number }) =>
    api.get("/orders", { params }),
};

// ─── Swing Scanner ────────────────────────────────────────────────────────────
export const swingApi = {
  run:  () => api.post("/swing-scanner/run"),
  last: () => api.get("/swing-scanner/last"),
};
