import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface User {
  id: string;
  email: string;
  name: string;
  role?: "ADMIN" | "USER";
  isActive?: boolean;
  twoFaEnabled: boolean;
}

interface AuthStore {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;

  setAuth: (user: User, accessToken: string, refreshToken: string) => void;
  clearAuth: () => void;
  updateUser: (user: Partial<User>) => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,

      setAuth: (user, accessToken, refreshToken) => {
        if (typeof window !== "undefined") {
          localStorage.setItem("accessToken", accessToken);
          localStorage.setItem("refreshToken", refreshToken);
        }
        set({ user, accessToken, refreshToken, isAuthenticated: true });
      },

      clearAuth: () => {
        if (typeof window !== "undefined") {
          localStorage.removeItem("accessToken");
          localStorage.removeItem("refreshToken");
        }
        set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false });
      },

      updateUser: (partial) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...partial } : null,
        })),
    }),
    {
      name: "algo-trade-auth",
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        if (typeof window !== "undefined") {
          const access = localStorage.getItem("accessToken");
          const refresh = localStorage.getItem("refreshToken");
          if (access || refresh) {
            if (state) {
              state.isAuthenticated = true;
              if (access) state.accessToken = access;
              if (refresh) state.refreshToken = refresh;
            }
          } else {
            state?.clearAuth();
          }
        }
      },
    }
  )
);

// ─── UI Store ─────────────────────────────────────────────────────────────────
interface UIStore {
  sidebarCollapsed: boolean;
  activeBrokerId: string | null;
  toggleSidebar: () => void;
  setActiveBroker: (id: string) => void;
}

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      activeBrokerId: null,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setActiveBroker: (id) => set({ activeBrokerId: id }),
    }),
    { name: "algo-trade-ui", partialize: (state) => ({ sidebarCollapsed: state.sidebarCollapsed }) },
  ),
);
