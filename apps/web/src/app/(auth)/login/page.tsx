"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff } from "lucide-react";
import { useAuthStore } from "@/store";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { AuthLayout } from "@/components/auth/AuthLayout";

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [form, setForm] = useState({ email: "", password: "", totpCode: "" });
  const [showPass, setShowPass] = useState(false);
  const { login, isLoggingIn } = useAuth();
  const [show2fa, setShow2fa] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const { data } = await login(form);
      if (data.data.requireTotp) {
        setShow2fa(true);
        return;
      }
      setAuth(data.data.user, data.data.accessToken, data.data.refreshToken);
      toast.success("Welcome back!", { description: data.data.user.email });
      router.replace("/dashboard");
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message ||
          err?.response?.data?.error ||
          "Login failed. Please check your credentials."
      );
    }
  }

  return (
    <AuthLayout
      title={show2fa ? "Two-factor authentication" : "Login to TradeIO"}
      footerLink={{
        text: "Don't have an account?",
        actionText: "Sign up for free!",
        href: "/register",
      }}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {!show2fa ? (
          <>
            {/* Phone number or User ID / Email Input */}
            <div className="relative">
              <input
                id="email"
                type="text"
                placeholder=" "
                autoComplete="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
                className="peer w-full h-[46px] px-3.5 pt-1 text-sm bg-white text-[#424242] border border-[#dcdcdc] rounded-[3px] focus:outline-none focus:border-blue-600 transition-colors"
              />
              <label
                htmlFor="email"
                className="absolute left-2.5 -top-2.5 px-1 bg-white text-xs text-[#888888] transition-all peer-placeholder-shown:text-sm peer-placeholder-shown:text-[#999999] peer-placeholder-shown:top-3 peer-placeholder-shown:left-3.5 peer-focus:-top-2.5 peer-focus:left-2.5 peer-focus:text-xs peer-focus:text-blue-600 pointer-events-none"
              >
                Phone number or User ID
              </label>
            </div>

            {/* Password Input */}
            <div className="relative">
              <input
                id="password"
                type={showPass ? "text" : "password"}
                placeholder="Password"
                autoComplete="current-password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
                className="w-full h-[46px] px-3.5 pr-10 text-sm bg-white text-[#424242] border border-[#dcdcdc] rounded-[3px] focus:outline-none focus:border-blue-600 transition-colors placeholder:text-[#999999]"
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#999999] hover:text-[#555555] p-1 cursor-pointer"
                tabIndex={-1}
                aria-label={showPass ? "Hide password" : "Show password"}
              >
                {showPass ? (
                  <EyeOff className="h-4 w-4 stroke-[1.75]" />
                ) : (
                  <Eye className="h-4 w-4 stroke-[1.75]" />
                )}
              </button>
            </div>
          </>
        ) : (
          /* 2FA TOTP View */
          <div className="space-y-3 py-1">
            <div className="relative">
              <input
                id="totpCode"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="6-digit TOTP / App Code"
                value={form.totpCode}
                onChange={(e) =>
                  setForm({ ...form, totpCode: e.target.value.replace(/\D/g, "") })
                }
                className="w-full h-[46px] px-3.5 text-center tracking-[0.3em] font-mono text-base bg-white text-[#424242] border border-[#dcdcdc] rounded-[3px] focus:outline-none focus:border-blue-600 transition-colors"
                autoFocus
              />
            </div>
            <button
              type="button"
              onClick={() => setShow2fa(false)}
              className="text-xs text-[#777777] hover:text-blue-600 text-center block w-full hover:underline pt-1 cursor-pointer"
            >
              Back to password
            </button>
          </div>
        )}

        {/* Login Blue CTA */}
        <Button
          type="submit"
          className="w-full h-[42px] bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-medium rounded-[3px] shadow-none cursor-pointer transition-colors mt-2"
          disabled={isLoggingIn}
        >
          {isLoggingIn
            ? "Logging in..."
            : show2fa
            ? "Continue"
            : "Login"}
        </Button>

        {/* Forgot user ID or password link */}
        <div className="text-center pt-2">
          <Link
            href="/forgot-password"
            className="text-xs text-[#777777] hover:text-blue-600 transition-colors"
          >
            Forgot user ID or password?
          </Link>
        </div>
      </form>
    </AuthLayout>
  );
}
