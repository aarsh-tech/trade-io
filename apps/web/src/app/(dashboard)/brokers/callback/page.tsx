"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useBrokers } from "@/hooks/useBrokers";
import { usePortfolio } from "@/hooks/usePortfolio";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CheckCircle2,
  RefreshCw,
  AlertCircle,
  Key,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { brokers, isLoading: isBrokersLoading } = useBrokers();
  const zerodhaAccount = brokers.find((b: any) => b.broker === "ZERODHA");

  const { renewSession, isRenewing } = usePortfolio(zerodhaAccount?.id);

  const [status, setStatus] = useState<"idle" | "processing" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [manualToken, setManualToken] = useState("");

  // Auto-detect and process token from URL
  useEffect(() => {
    const rawToken = searchParams.get("request_token") || searchParams.get("requestToken");
    if (!rawToken || !zerodhaAccount?.id) return;

    let token = rawToken.trim();
    if (token.includes("request_token=")) {
      const match = token.match(/request_token=([a-zA-Z0-9]+)/);
      if (match && match[1]) token = match[1];
    }

    if (!token) return;

    // Kite echoes the signed state from our login URL; a redirect without it (or with a failed
    // login status) is never auto-submitted. The user can still paste a token below.
    const state = searchParams.get("state");
    const loginStatus = searchParams.get("status");
    if (!state || (loginStatus && loginStatus !== "success")) {
      setStatus("error");
      setErrorMessage("This login link is missing its verification state. Start the login from the dashboard again, or paste the request token below.");
      return;
    }

    setStatus("processing");
    renewSession({ token, state })
      .then(() => {
        setStatus("success");
        toast.success("Zerodha session connected successfully!");
        setTimeout(() => {
          router.replace("/dashboard");
        }, 2200);
      })
      .catch((err: any) => {
        setStatus("error");
        setErrorMessage(err?.response?.data?.message || err?.message || "Token exchange failed");
        toast.error("Failed to authenticate Zerodha session");
      });
  }, [searchParams, zerodhaAccount?.id, renewSession, router]);

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualToken.trim()) {
      toast.error("Please enter a request token");
      return;
    }

    let token = manualToken.trim();
    if (token.includes("request_token=")) {
      const match = token.match(/request_token=([a-zA-Z0-9]+)/);
      if (match && match[1]) token = match[1];
    }

    setStatus("processing");
    try {
      await renewSession(token);
      setStatus("success");
      toast.success("Zerodha session connected successfully!");
      setTimeout(() => {
        router.replace("/dashboard");
      }, 2000);
    } catch (err: any) {
      setStatus("error");
      setErrorMessage(err?.response?.data?.message || err?.message || "Manual token activation failed");
      toast.error("Invalid or expired token");
    }
  };

  return (
    <div className="min-h-[75vh] flex items-center justify-center p-4">
      <Card className="w-full max-w-lg border-slate-200 shadow-xl rounded-2xl overflow-hidden bg-white">
        <CardHeader className="bg-slate-50 border-b border-slate-100 text-center pb-5">
          <div className="mx-auto h-12 w-12 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm mb-3">
            <Key className="h-6 w-6" />
          </div>
          <CardTitle className="text-xl font-bold text-slate-900">
            Zerodha Kite Session Gateway
          </CardTitle>
          <p className="text-xs text-slate-500 mt-1">
            Automatic Request Token Verification &amp; Session Activation
          </p>
        </CardHeader>

        <CardContent className="p-6 space-y-6">
          {/* State: Processing */}
          {status === "processing" && (
            <div className="py-8 text-center space-y-4">
              <RefreshCw className="h-10 w-10 text-blue-600 animate-spin mx-auto" />
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Verifying Token with Zerodha...
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Exchanging request token for live access credentials.
                </p>
              </div>
            </div>
          )}

          {/* State: Success */}
          {status === "success" && (
            <div className="py-8 text-center space-y-4 animate-[fade-up_0.3s_ease_both]">
              <div className="h-14 w-14 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Authentication Successful!
                </h3>
                <p className="text-xs text-emerald-700 font-medium mt-1">
                  Your Zerodha broker account is now live and synchronized.
                </p>
                <p className="text-[11px] text-slate-400 mt-2">
                  Redirecting to your trading dashboard...
                </p>
              </div>
              <Link href="/dashboard" className="inline-block pt-2">
                <Button className="h-9 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-5">
                  <span>Go to Dashboard Now</span>
                  <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                </Button>
              </Link>
            </div>
          )}

          {/* State: Error or Idle (Manual Paste) */}
          {status !== "processing" && status !== "success" && (
            <div className="space-y-5">
              {status === "error" && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-rose-800 text-xs">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
                  <div>
                    <strong className="font-semibold block">Authentication Error</strong>
                    <span>{errorMessage || "Token invalid or expired. Please generate a fresh token."}</span>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700">
                  <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                  Manual Request Token Activation
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  If the automatic redirect did not capture your token, paste the token or the full redirected URL from your browser address bar below:
                </p>
              </div>

              <form onSubmit={handleManualSubmit} className="space-y-3">
                <Input
                  value={manualToken}
                  onChange={(e) => setManualToken(e.target.value)}
                  placeholder="Paste request_token or full redirected URL..."
                  className="h-11 text-xs font-mono bg-slate-50 border-slate-200 focus:bg-white focus:border-blue-500"
                />

                <Button
                  type="submit"
                  disabled={isRenewing || isBrokersLoading || !manualToken.trim()}
                  className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs sm:text-sm rounded-lg shadow-sm disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isRenewing ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>Authenticating...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Activate Session</span>
                    </>
                  )}
                </Button>
              </form>

              <div className="pt-2 text-center">
                <Link href="/dashboard" className="text-xs text-slate-400 hover:text-slate-600 hover:underline">
                  Skip &amp; return to Dashboard
                </Link>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function BrokerCallbackPage() {
  return (
    <Suspense fallback={<div className="h-96 flex items-center justify-center text-xs text-slate-400">Loading gateway...</div>}>
      <CallbackContent />
    </Suspense>
  );
}
