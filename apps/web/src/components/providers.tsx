"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useEffect, useState } from "react";
import { ThemeProvider } from "next-themes";
import { queryKeys } from "@/lib/query-keys";
import { BROKER_SESSION_SYNC_KEY } from "@/lib/broker-sync";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,
            retry: 1,
            refetchOnWindowFocus: false, // Prevents request storm on tab switch / window click
            refetchOnReconnect: false,   // Prevents sudden simultaneous barrage on network reconnect
          },
        },
      })
  );

  useEffect(() => {
    // See broker-sync.ts: a Zerodha login completed in another tab broadcasts here so this tab's
    // broker/portfolio state (session status bar, margins, positions) updates without a manual reload.
    const onStorage = (e: StorageEvent) => {
      if (e.key !== BROKER_SESSION_SYNC_KEY || !e.newValue) return;
      queryClient.refetchQueries({ queryKey: queryKeys.brokers.all, exact: false });
      queryClient.refetchQueries({ queryKey: queryKeys.portfolio.all, exact: false });
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [queryClient]);

  return (
    // Light by default; the user's last explicit choice is kept in localStorage ("theme") across sessions.
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} themes={["light", "dark"]} storageKey="theme" disableTransitionOnChange>
    <QueryClientProvider client={queryClient}>
      {children}
      {/* <ReactQueryDevtools initialIsOpen={false} /> */}
    </QueryClientProvider>
    </ThemeProvider>
  );
}
