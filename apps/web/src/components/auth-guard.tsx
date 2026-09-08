"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store";
import { useTokenRefresh } from "@/hooks/useTokenRefresh";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, clearAuth } = useAuthStore();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  // ── Proactive token refresh — keeps session alive across the full trading day
  useTokenRefresh();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) {
      const access = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
      const refresh = typeof window !== "undefined" ? localStorage.getItem("refreshToken") : null;

      if (!isAuthenticated || (!access && !refresh)) {
        clearAuth();
        router.replace("/login");
      }
    }
  }, [mounted, isAuthenticated, clearAuth, router]);

  const hasTokens =
    typeof window !== "undefined"
      ? !!(localStorage.getItem("accessToken") || localStorage.getItem("refreshToken"))
      : false;

  // Don't render until we've checked authentication and verified token existence
  if (!mounted || !isAuthenticated || !hasTokens) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin" />
          <p className="text-sm font-medium text-slate-500">Checking session...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

