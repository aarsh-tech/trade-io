import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Toaster } from "sonner";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "AlgoTrade — Algorithmic Trading Platform",
    template: "%s | AlgoTrade",
  },
  description:
    "Professional algorithmic trading platform. Build, backtest, and deploy trading strategies across multiple brokers.",
  keywords: ["algo trading", "zerodha", "backtesting", "EMA crossover", "breakout strategy"],
  metadataBase: new URL("https://algotrade.io"),
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className={`${inter.variable} font-sans antialiased bg-background text-foreground min-h-screen`}>
        <Providers>
          {children}
          <Toaster
            theme="light"
            position="bottom-right"
            richColors
          />
        </Providers>
      </body>
    </html>
  );
}
