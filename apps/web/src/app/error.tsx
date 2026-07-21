"use client";

import React, { useEffect } from "react";
import { AlertOctagon, RotateCcw, Home, Terminal } from "lucide-react";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorBoundary({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log the error to an error reporting service if needed
    console.error("Root Application Error:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#07090e] p-6 relative overflow-hidden">
      {/* Sleek background decoration */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-destructive/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Main glassmorphic error panel */}
      <div className="glass max-w-xl w-full p-8 md:p-10 rounded-2xl relative z-10 border border-white/5 shadow-2xl flex flex-col items-center text-center">
        {/* Animated outer red circle */}
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center text-destructive mb-6 animate-pulse ring-4 ring-destructive/5">
          <AlertOctagon size={36} />
        </div>

        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white mb-3">
          Something went wrong
        </h1>
        <p className="text-slate-400 text-sm md:text-base mb-8 max-w-md">
          The application encountered an unexpected rendering error. We've logged the detail and you can try reloading the component.
        </p>

        {/* Display Error Message inside a code snippet box */}
        <div className="w-full bg-slate-950/70 border border-white/5 rounded-lg p-4 mb-8 text-left font-mono text-xs text-slate-300 overflow-x-auto max-h-40 custom-scrollbar flex items-start gap-3">
          <Terminal size={16} className="text-destructive shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="text-destructive font-semibold">Error: </span>
            {error.message || "An unknown client-side error occurred."}
            {error.digest && (
              <div className="text-slate-500 mt-1">
                Digest ID: {error.digest}
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 w-full justify-center">
          <button
            onClick={() => reset()}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-primary hover:bg-primary/95 text-white font-medium text-sm rounded-lg transition-all shadow-lg hover:shadow-primary/20 active:scale-[0.98] cursor-pointer"
          >
            <RotateCcw size={16} />
            Try again
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
    </div>
  );
}
