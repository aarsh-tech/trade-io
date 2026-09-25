import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { ThemedToaster } from "@/components/themed-toaster";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
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
      <body className={`${inter.variable} font-sans antialiased bg-background text-foreground min-h-screen`}>
        <Providers>
          {children}
          <ThemedToaster />
        </Providers>
      </body>
    </html>
  );
}

