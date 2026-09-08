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
import { useAuthStore } from "@/store";
import { requestTokenRefresh } from "@/lib/api";

// Refresh 12 minutes — well before any reasonable access-token expiry
const REFRESH_INTERVAL_MS = 12 * 60 * 1000;

export function useTokenRefresh() {
  const { isAuthenticated, clearAuth } = useAuthStore();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const silentRefresh = async () => {
    // Don't run if not authenticated
    if (!isAuthenticated) return;

    const refreshToken = typeof window !== "undefined" ? localStorage.getItem("refreshToken") : null;
    if (!refreshToken) {
      clearAuth();
      return;
    }

    try {
      await requestTokenRefresh();
    } catch (err: any) {
      console.warn("[TokenRefresh] Silent refresh noticed:", err?.message);
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

    // Refresh automatically when tab becomes visible again after being idle
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        silentRefresh();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);
}
