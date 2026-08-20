"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Mail } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { AuthLayout } from "@/components/auth/AuthLayout";

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
    <AuthLayout
      title={!sent ? "Forgot user ID or password?" : undefined}
      subtitle={
        !sent
          ? "Enter your registered email address to receive password reset instructions."
          : undefined
      }
      footerLink={{
        text: "Remember your password?",
        actionText: "Login to TradeIO",
        href: "/login",
      }}
    >
      {!sent ? (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <input
              id="email"
              type="email"
              placeholder=" "
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="peer w-full h-[46px] px-3.5 pt-1 text-sm bg-white text-[#424242] border border-[#dcdcdc] rounded-[3px] focus:outline-none focus:border-blue-600 transition-colors"
            />
            <label
              htmlFor="email"
              className="absolute left-2.5 -top-2.5 px-1 bg-white text-xs text-[#888888] transition-all peer-placeholder-shown:text-sm peer-placeholder-shown:text-[#999999] peer-placeholder-shown:top-3 peer-placeholder-shown:left-3.5 peer-focus:-top-2.5 peer-focus:left-2.5 peer-focus:text-xs peer-focus:text-blue-600 pointer-events-none"
            >
              Registered Email ID
            </label>
          </div>

          <Button
            type="submit"
            className="w-full h-[42px] bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-medium rounded-[3px] shadow-none cursor-pointer transition-colors mt-2"
            disabled={loading}
          >
            {loading ? "Sending..." : "Reset"}
          </Button>

          <div className="text-center pt-2">
            <Link
              href="/login"
              className="text-xs text-[#777777] hover:text-blue-600 transition-colors"
            >
              Back to login
            </Link>
          </div>
        </form>
      ) : (
        <div className="text-center py-2 space-y-4">
          <div className="h-12 w-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto">
            <Mail className="h-6 w-6" />
          </div>

          <div>
            <h2 className="text-base font-medium text-[#424242]">Check your email</h2>
            <p className="text-xs text-[#777777] mt-1 leading-relaxed">
              We&apos;ve sent password reset instructions to{" "}
              <span className="font-medium text-[#444444]">{email}</span>.
            </p>
          </div>

          <div className="pt-2 space-y-3">
            <Button
              variant="outline"
              className="w-full h-[40px] border-[#dcdcdc] text-[#555555] font-medium rounded-[3px] text-xs hover:bg-[#f5f5f5] cursor-pointer"
              onClick={() => setSent(false)}
            >
              Resend email
            </Button>

            <Link
              href="/login"
              className="flex items-center justify-center gap-1.5 text-xs text-[#777777] hover:text-blue-600 transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to login
            </Link>
          </div>
        </div>
      )}
    </AuthLayout>
  );
}
