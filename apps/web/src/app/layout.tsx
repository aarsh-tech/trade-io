import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "@/components/providers";
import { ThemedToaster } from "@/components/themed-toaster";

// Self-hosted (latin subset from Google Fonts): next/font/google fetches at build
// time and intermittently fails the Cloudflare Pages build under Turbopack.
const plexSans = localFont({
  src: [{ path: "./fonts/ibm-plex-sans-latin-var.woff2", weight: "400 600", style: "normal" }],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexMono = localFont({
  src: [
    { path: "./fonts/ibm-plex-mono-latin-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/ibm-plex-mono-latin-500.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Tradeio.site - Algorithmic Trading Platform",
    template: "%s | Tradeio.site",
  },
  description:
    "Professional algorithmic trading platform. Build, and deploy trading strategies.",
  keywords: ["algo trading", "zerodha", "backtesting", "EMA crossover", "breakout strategy"],
  metadataBase: new URL("https://tradeio.site"),
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${plexSans.variable} ${plexMono.variable} font-sans antialiased bg-background text-foreground min-h-screen`}>
        <Providers>
          {children}
          <ThemedToaster />
        </Providers>
      </body>
    </html>
  );
}

