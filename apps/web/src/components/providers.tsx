"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState } from "react";
import { ThemeProvider } from "next-themes";

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
