/**
 * useTokenRefresh — Proactive silent token refresh
 *
 * Exchanges the refresh token for a new access token shortly BEFORE the current one expires, so an idle tab
 * never hits a 401 logout. It reads the token's own `exp`, so it only calls the server when a refresh is due
 * (the access token lasts 8h); a check every few minutes and on tab focus costs nothing.
 */

"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/store";
import { requestTokenRefresh } from "@/lib/api";

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
/** Refresh once the access token has less than this left. Comfortably above the check interval. */
const REFRESH_BEFORE_EXPIRY_MS = 30 * 60 * 1000;

/** The access token's expiry in ms, or null if it can't be read (then we refresh, as before). */
function accessTokenExpiryMs(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json.exp === "number" ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function useTokenRefresh() {
  const { isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated) return;

    const refreshIfDue = async () => {
      if (!localStorage.getItem("refreshToken")) return;
      const access = localStorage.getItem("accessToken");
      const exp = access ? accessTokenExpiryMs(access) : null;
      if (exp !== null && exp - Date.now() > REFRESH_BEFORE_EXPIRY_MS) return;
      try {
        await requestTokenRefresh();
      } catch (err: any) {
        console.warn("[TokenRefresh] Silent refresh noticed:", err?.message);
      }
    };

    // Once on mount (a reload near expiry), on a schedule, and when the tab comes back after being idle.
    refreshIfDue();
    const timer = setInterval(refreshIfDue, CHECK_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshIfDue();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [isAuthenticated]);
}
