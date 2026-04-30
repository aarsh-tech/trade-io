"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Zap, ArrowLeft, Mail } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const { forgotPassword } = useAuth();
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await forgotPassword(email);
      setSent(true);
    } catch {
      // toast handled in hook
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-[400px] bg-white p-8 rounded-2xl shadow-sm border border-slate-100 animate-[fade-up_0.5s_ease_both]">
        <div className="flex items-center gap-2 mb-8 justify-center">
          <div className="h-10 w-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-md">
            <Zap className="h-5 w-5 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-2xl font-extrabold text-slate-900">TradeIO</span>
        </div>

        {!sent ? (
          <>
            <div className="mb-8 text-center">
              <h1 className="text-2xl font-bold text-slate-900">Forgot password?</h1>
              <p className="text-sm text-slate-500 mt-2">
                No worries, we'll send you reset instructions.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-700 block">Email Address</label>
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full h-11 px-3 rounded-lg border border-slate-200 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-slate-400"
                />
              </div>

              <Button type="submit" className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg" disabled={loading}>
                {loading ? "Sending link..." : "Reset password"}
              </Button>

              <Link 
                href="/login" 
                className="flex items-center justify-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors pt-2"
              >
                <ArrowLeft className="h-4 w-4" /> Back to log in
              </Link>
            </form>
          </>
        ) : (
          <div className="text-center py-4">
             <div className="h-16 w-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <Mail className="h-8 w-8" />
             </div>
             <h1 className="text-2xl font-bold text-slate-900 mb-2">Check your email</h1>
             <p className="text-sm text-slate-500 mb-8 leading-relaxed">
               We've sent a password reset link to <span className="font-semibold text-slate-900">{email}</span>. Please check your inbox.
             </p>
             <Button 
                variant="outline" 
                className="w-full h-11 border-slate-200 text-slate-700 font-medium rounded-lg mb-4"
                onClick={() => setSent(false)}
             >
               Resend email
             </Button>
             <Link 
                href="/login" 
                className="flex items-center justify-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" /> Back to log in
              </Link>
          </div>
        )}
      </div>
    </div>
  );
}

