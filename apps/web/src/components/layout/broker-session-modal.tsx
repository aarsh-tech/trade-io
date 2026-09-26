"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBrokers } from "@/hooks/useBrokers";
import { usePortfolio } from "@/hooks/usePortfolio";
import {
  Copy,
  Check,
  ExternalLink,
  Key,
  Globe,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Server,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface BrokerSessionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BrokerSessionModal({ open, onOpenChange }: BrokerSessionModalProps) {
  const { brokers, isLoading } = useBrokers();
  const zerodhaAccount = brokers.find((b: any) => b.broker === "ZERODHA");

  const {
    renewSession,
    isRenewing,
    getLoginUrl,
  } = usePortfolio(zerodhaAccount?.id);

  const [requestToken, setRequestToken] = useState("");
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyToClipboard = (text: string, fieldName: string) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      toast.success(`Copied ${fieldName} to clipboard!`);
      setTimeout(() => setCopiedField(null), 2000);
    }
  };

  const handleLoginClick = async () => {
    try {
      const url = await getLoginUrl();
      if (url) {
        window.open(url, "_blank");
        toast.info("Zerodha Kite login page opened in a new tab.", {
          description: "Log in with TOTP, and paste the redirected token/URL here.",
        });
      } else {
        toast.error("Could not fetch login URL. Please verify your Zerodha API Key.");
      }
    } catch (e: any) {
      toast.error(e?.message || "Failed to open Zerodha login page.");
    }
  };

  const handlePasteClipboard = async () => {
    try {
      if (navigator?.clipboard?.readText) {
        const text = await navigator.clipboard.readText();
        let cleaned = (text || "").trim();
        if (cleaned.includes("request_token=")) {
          const match = cleaned.match(/request_token=([a-zA-Z0-9]+)/);
          if (match && match[1]) cleaned = match[1];
        }
        if (cleaned) {
          setRequestToken(cleaned);
          toast.success("Token pasted from clipboard!");
        }
      }
    } catch {
      toast.info("Please paste the token manually into the input box.");
    }
  };

  const handleActivateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestToken.trim()) {
      toast.error("Please enter or paste your Zerodha request token.");
      return;
    }

    try {
      let tokenToUse = requestToken.trim();
      if (tokenToUse.includes("request_token=")) {
        const match = tokenToUse.match(/request_token=([a-zA-Z0-9]+)/);
        if (match && match[1]) tokenToUse = match[1];
      }

      await renewSession(tokenToUse);
      toast.success("Zerodha session successfully activated!", {
        description: "Live market streaming and strategy orders are now active.",
      });
      setRequestToken("");
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || "Failed to activate session");
    }
  };

  const isSessionValid = Boolean(
    zerodhaAccount?.accessToken &&
    zerodhaAccount?.tokenExpiry &&
    new Date(zerodhaAccount.tokenExpiry).getTime() > Date.now()
  );

  const [envMode, setEnvMode] = useState<"production" | "local">("production");

  const liveCallbackUrl = "https://tradeio.site/brokers/callback";
  const liveDashboardUrl = "https://tradeio.site/dashboard";
  const localCallbackUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/brokers/callback`
      : "http://localhost:3000/brokers/callback";
  const localDashboardUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/dashboard`
      : "http://localhost:3000/dashboard";

  const primaryCallbackUrl =
    envMode === "production" ? liveCallbackUrl : localCallbackUrl;
  const alternativeDashboardUrl =
    envMode === "production" ? liveDashboardUrl : localDashboardUrl;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-1.5rem)] sm:max-w-xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden border border-border/90 shadow-2xl rounded-xl bg-card">
        {/* Header */}
        <div className="bg--50 px-5 sm:px-6 pt-5 pb-4 border-b border-primary/60 flex items-start gap-3.5">
          <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-xl bg-primary flex items-center justify-center shrink-0 text-primary-foreground">
            <Key className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-accent-foreground bg-brand-subtle/90 border border-primary/80 px-2 py-0.5 rounded-full">
                Zerodha Kite Connect
              </span>
              <span
                className={cn(
                  "text-[10px] sm:text-[11px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1",
                  isSessionValid
                    ? "bg-profit-subtle text-profit border border-profit/30"
                    : "bg-warn-subtle text-warn border border-warn/30"
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    isSessionValid ? "bg-profit" : "bg-warn animate-pulse"
                  )}
                />
                {isSessionValid ? "Session Active" : "Daily Login Needed"}
              </span>
            </div>
            <DialogTitle className="text-base sm:text-lg font-semibold text-foreground mt-1">
              Kite Daily Session &amp; API Manager
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-0.5">
              Authenticate your daily Zerodha access token and configure developer console settings.
            </DialogDescription>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4 space-y-5 text-foreground/75">
          {/* Section 1: Daily Login & Token Activation */}
          <div className="bg-muted/40 border border-border rounded-xl p-4 space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-accent-foreground" />
                Step 1: Daily Kite Authentication
              </span>
              {zerodhaAccount?.clientId && (
                <span className="text-xs font-mono font-medium text-muted-foreground bg-border/70 px-2 py-0.5 rounded">
                  Client ID: {zerodhaAccount.clientId}
                </span>
              )}
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Zerodha Kite access tokens expire daily at 6:00 AM IST. Log in once each morning to enable live order execution and WebSocket tick feeds.
            </p>

            <Button
              type="button"
              onClick={handleLoginClick}
              className="w-full h-10 bg-primary hover:bg-primary/90 text-primary-foreground text-xs sm:text-sm font-semibold rounded-lg flex items-center justify-center gap-2 cursor-pointer transition-all"
            >
              <ExternalLink className="h-4 w-4" />
              <span>1-Click Open Zerodha Kite Login</span>
            </Button>

            {/* Token Input Form */}
            <form onSubmit={handleActivateSession} className="space-y-2.5 pt-1 border-t border-border">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-foreground/75">
                  Paste Request Token or Full Redirected URL:
                </label>
                <button
                  type="button"
                  onClick={handlePasteClipboard}
                  className="text-[11px] text-accent-foreground hover:text-accent-foreground hover:underline font-medium cursor-pointer flex items-center gap-1"
                >
                  <Copy className="h-3 w-3" />
                  <span>Paste from clipboard</span>
                </button>
              </div>

              <div className="flex gap-2">
                <Input
                  value={requestToken}
                  onChange={(e) => setRequestToken(e.target.value)}
                  placeholder="e.g. 8pM9x... or https://tradeio.site/dashboard?request_token=..."
                  className="h-10 text-xs font-mono bg-card border-border focus:border-primary"
                />
                <Button
                  type="submit"
                  disabled={isRenewing || !requestToken.trim()}
                  className="h-10 px-4 bg-foreground hover:bg-foreground/90 text-background text-xs font-semibold shrink-0 cursor-pointer disabled:opacity-50"
                >
                  {isRenewing ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  <span className="ml-1.5 hidden sm:inline">Activate</span>
                </Button>
              </div>
            </form>
          </div>

          {/* Section 2: Zerodha Developer Console Copy-Paste Settings */}
          <div className="bg-warn-subtle/50 border border-warn/80 rounded-xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-warn flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5 text-warn" />
                Step 2: Kite Developer Console URLs
              </span>
              <div className="flex items-center gap-2">
                {/* Environment Selector Toggle */}
                <div className="flex items-center bg-warn-subtle/80 p-0.5 rounded-lg text-[10px] font-semibold border border-warn/30">
                  <button
                    type="button"
                    onClick={() => setEnvMode("production")}
                    className={cn(
                      "px-2 py-0.5 rounded-md transition-all cursor-pointer",
                      envMode === "production"
                        ? "bg-card text-accent-foreground  font-semibold"
                        : "text-warn/70 hover:text-warn"
                    )}
                  >
                    Live (tradeio.site)
                  </button>
                  <button
                    type="button"
                    onClick={() => setEnvMode("local")}
                    className={cn(
                      "px-2 py-0.5 rounded-md transition-all cursor-pointer",
                      envMode === "local"
                        ? "bg-card text-accent-foreground  font-semibold"
                        : "text-warn/70 hover:text-warn"
                    )}
                  >
                    Localhost
                  </button>
                </div>

                <a
                  href="https://developers.kite.trade/apps"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] font-semibold text-accent-foreground hover:underline flex items-center gap-1"
                >
                  <span>Open Console</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>

            <p className="text-xs text-warn/80 leading-relaxed">
              Replace <strong>http://localhost:5000</strong> in your Kite Connect App settings at{" "}
              <strong>developers.kite.trade</strong> with:
            </p>

            {/* Field 1: Primary Callback URL */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] font-medium text-foreground/75">
                <span>Redirect URL (Primary):</span>
                <span className="text-[10px] text-profit font-semibold">Recommended</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="flex-1 bg-card border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground truncate select-all">
                  {primaryCallbackUrl}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => copyToClipboard(primaryCallbackUrl, "Redirect URL")}
                  className="h-9 px-3 shrink-0 cursor-pointer hover:bg-muted"
                >
                  {copiedField === "Redirect URL" ? (
                    <Check className="h-3.5 w-3.5 text-profit" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 text-foreground/75" />
                  )}
                  <span className="ml-1 text-xs">Copy</span>
                </Button>
              </div>
            </div>

            {/* Field 2: Alternative Direct Dashboard URL */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] font-medium text-foreground/75">
                <span>Alternative Redirect URL:</span>
                <span className="text-[10px] text-muted-foreground">Direct Dashboard</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="flex-1 bg-card border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground truncate select-all">
                  {alternativeDashboardUrl}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => copyToClipboard(alternativeDashboardUrl, "Dashboard URL")}
                  className="h-9 px-3 shrink-0 cursor-pointer hover:bg-muted"
                >
                  {copiedField === "Dashboard URL" ? (
                    <Check className="h-3.5 w-3.5 text-profit" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 text-foreground/75" />
                  )}
                  <span className="ml-1 text-xs">Copy</span>
                </Button>
              </div>
            </div>

            {/* Field 3: Kite Developer Static IP Notice */}
            <div className="rounded-lg border border-primary/30 bg-brand-subtle/70 p-3 space-y-1">
              <div className="flex items-center justify-between text-[11px] font-semibold text-accent-foreground">
                <span>Static IP in Kite Developer Console:</span>
                <span className="text-[10px] text-accent-foreground font-medium">Mandatory by Zerodha</span>
              </div>
              <p className="text-[11.5px] leading-relaxed text-accent-foreground/85">
                Zerodha requires each developer app to have a unique IP. Enter your designated / assigned <strong>Static IP</strong> in your Kite Connect App settings.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 py-3 bg-muted/50 border-t border-border flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground">
            Session data is securely encrypted in your database.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs h-8 cursor-pointer"
          >
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
