"use client";

import React, { useEffect } from "react";
import Link from "next/link";
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
    <div className="min-h-screen flex items-center justify-center bg-background p-6 relative overflow-hidden">

      {/* Main glassmorphic error panel */}
      <div className="max-w-xl w-full p-8 md:p-10 rounded-lg bg-card border border-border flex flex-col items-center text-center">
        {/* Animated outer red circle */}
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center text-destructive mb-6">
          <AlertOctagon size={36} />
        </div>

        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-foreground mb-3">
          Something went wrong
        </h1>
        <p className="text-muted-foreground text-sm md:text-base mb-8 max-w-md">
          The application encountered an unexpected rendering error. We've logged the detail and you can try reloading the component.
        </p>

        {/* Display Error Message inside a code snippet box */}
        <div className="w-full bg-muted/60 border border-border rounded-md p-4 mb-8 text-left font-code text-xs text-foreground overflow-x-auto max-h-40 custom-scrollbar flex items-start gap-3">
          <Terminal size={16} className="text-destructive shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="text-destructive font-semibold">Error: </span>
            {error.message || "An unknown client-side error occurred."}
            {error.digest && (
              <div className="text-muted-foreground mt-1">
                Digest ID: {error.digest}
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 w-full justify-center">
          <button
            onClick={() => reset()}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-medium text-sm rounded-md transition-colors cursor-pointer"
          >
            <RotateCcw size={16} />
            Try again
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
    </div>
  );
}
