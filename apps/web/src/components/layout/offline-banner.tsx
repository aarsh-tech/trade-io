"use client";

import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

/** Shown whenever the browser is offline, so stale prices and positions are never mistaken for live ones. */
export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div role="alert" className="flex items-center gap-2 px-3 sm:px-6 py-1.5 bg-loss/10 border-b border-loss/30 text-xs font-medium text-loss shrink-0">
      <WifiOff className="h-3.5 w-3.5" aria-hidden />
      You are offline. Prices, positions and orders are not updating, and new orders are blocked until the connection returns.
    </div>
  );
}
