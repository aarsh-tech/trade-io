/**
 * useTokenRefresh — Proactive silent token refresh
 *
 * Runs every REFRESH_INTERVAL_MS (default 12 min) and silently exchanges the
 * refresh token for a new access token BEFORE the current one expires.
 * This prevents 401 logouts during idle periods (no user-triggered API calls).
 *
 * The access token is currently issued for 8h, but this hook refreshes every
 * 12 min as a belt-and-suspenders measure, ensuring the token is always fresh.
 */

"use client";

import { useEffect, useRef } from "react";
import axios from "axios";
import { useAuthStore } from "@/store";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3002/v1";

// Refresh 12 minutes — well before any reasonable access-token expiry
const REFRESH_INTERVAL_MS = 12 * 60 * 1000;

export function useTokenRefresh() {
  const { isAuthenticated, setAuth, clearAuth, user } = useAuthStore();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isRefreshingRef = useRef(false);

  const silentRefresh = async () => {
    // Don't run if not authenticated or already in progress
    if (!isAuthenticated || isRefreshingRef.current) return;

    const refreshToken = localStorage.getItem("refreshToken");
    if (!refreshToken) return;

    isRefreshingRef.current = true;
    try {
      const { data } = await axios.post(
        `${API_BASE}/auth/refresh`,
        { refreshToken },
        { withCredentials: true }
      );

      const newAccess = data?.data?.accessToken;
      const newRefresh = data?.data?.refreshToken;
      const refreshedUser = data?.data?.user ?? user;

      if (newAccess && refreshedUser) {
        // Update localStorage + zustand store
        localStorage.setItem("accessToken", newAccess);
        if (newRefresh) localStorage.setItem("refreshToken", newRefresh);
        setAuth(refreshedUser, newAccess, newRefresh ?? refreshToken);
      }
    } catch (err: any) {
      // Only log out if it's a real auth error (401/403), not a network glitch
      const status = err?.response?.status;
      if (status === 401 || status === 403) {
        console.warn("[TokenRefresh] Refresh token invalid/expired — logging out");
        clearAuth();
      } else {
        // Network error, server restart etc. — stay logged in, retry next interval
        console.warn("[TokenRefresh] Refresh failed (network?), will retry:", err?.message);
      }
    } finally {
      isRefreshingRef.current = false;
    }
  };

  useEffect(() => {
    if (!isAuthenticated) {
      // Clear any running timer when logged out
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    // Run once immediately on mount (catches tokens close to expiry after page reload)
    silentRefresh();

    // Then refresh on schedule
    timerRef.current = setInterval(silentRefresh, REFRESH_INTERVAL_MS);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);
}
