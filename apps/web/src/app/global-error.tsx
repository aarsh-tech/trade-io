"use client";

import React, { useEffect, useState } from "react";
import "./globals.css";
import Link from "next/link";
import { AlertOctagon, RotateCcw, Home, Terminal } from "lucide-react";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  // This page replaces the root layout (and its theme provider), so apply the saved theme here.
  const [dark, setDark] = useState(false);
  useEffect(() => {
    console.error("Global Layout Error:", error);
    try {
      setDark(localStorage.getItem("theme") === "dark");
    } catch {}
  }, [error]);

  return (
    <html lang="en" className={dark ? "dark" : undefined}>
      <body className="bg-background text-foreground min-h-screen flex items-center justify-center p-6 relative overflow-hidden font-sans">

        {/* Outer glass panel */}
        <div className="max-w-xl w-full p-8 md:p-10 rounded-lg bg-card border border-border flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center text-destructive mb-6">
            <AlertOctagon size={36} />
          </div>

          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-foreground mb-3">
            Critical System Error
          </h1>
          <p className="text-muted-foreground text-sm md:text-base mb-8 max-w-md">
            A critical error occurred in the application shell. You can try resetting the app state or return to the landing page.
          </p>

          {/* Error Message code box */}
          <div className="w-full bg-muted/60 border border-border rounded-md p-4 mb-8 text-left font-code text-xs text-foreground overflow-x-auto max-h-40 custom-scrollbar flex items-start gap-3">
            <Terminal size={16} className="text-destructive shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="text-destructive font-semibold">Critical: </span>
              {error.message || "An unexpected system-level error occurred."}
              {error.digest && (
                <div className="text-muted-foreground mt-1">
                  Digest ID: {error.digest}
                </div>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-3 w-full justify-center">
            <button
              onClick={() => reset()}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-medium text-sm rounded-md transition-colors cursor-pointer"
            >
              <RotateCcw size={16} />
              Reset System
            </button>
            
            <Link
              href="/"
              className="flex items-center justify-center gap-2 px-6 py-3 bg-card hover:bg-muted text-foreground border border-border font-medium text-sm rounded-md transition-colors"
            >
              <Home size={16} />
              Go to Dashboard
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}
