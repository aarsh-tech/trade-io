"use client";

import React, { useEffect } from "react";
import { AlertOctagon, RotateCcw, Home, Terminal } from "lucide-react";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error("Global Layout Error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-[#07090e] text-white min-h-screen flex items-center justify-center p-6 relative overflow-hidden font-sans">
        {/* Decorative glows */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-destructive/10 rounded-full blur-[120px] pointer-events-none" />

        {/* Outer glass panel */}
        <div className="glass max-w-xl w-full p-8 md:p-10 rounded-2xl relative z-10 border border-white/5 shadow-2xl flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center text-destructive mb-6 animate-pulse ring-4 ring-destructive/5">
            <AlertOctagon size={36} />
          </div>

          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white mb-3">
            Critical System Error
          </h1>
          <p className="text-slate-400 text-sm md:text-base mb-8 max-w-md">
            A critical error occurred in the application shell. You can try resetting the app state or return to the landing page.
          </p>

          {/* Error Message code box */}
          <div className="w-full bg-slate-950/70 border border-white/5 rounded-lg p-4 mb-8 text-left font-mono text-xs text-slate-300 overflow-x-auto max-h-40 custom-scrollbar flex items-start gap-3">
            <Terminal size={16} className="text-destructive shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="text-destructive font-semibold">Critical: </span>
              {error.message || "An unexpected system-level error occurred."}
              {error.digest && (
                <div className="text-slate-500 mt-1">
                  Digest ID: {error.digest}
                </div>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-3 w-full justify-center">
            <button
              onClick={() => reset()}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-primary hover:bg-primary/95 text-white font-medium text-sm rounded-lg transition-all shadow-lg hover:shadow-primary/20 active:scale-[0.98] cursor-pointer"
            >
              <RotateCcw size={16} />
              Reset System
            </button>
            
            <a
              href="/"
              className="flex items-center justify-center gap-2 px-6 py-3 bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 hover:border-white/20 font-medium text-sm rounded-lg transition-all active:scale-[0.98]"
            >
              <Home size={16} />
              Go to Dashboard
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
