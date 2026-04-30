"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Zap, Eye, EyeOff, TrendingUp, Shield, BarChart2 } from "lucide-react";
import { useAuthStore } from "@/store";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const features = [
  { icon: TrendingUp, title: "Live Strategy Execution", desc: "Fire orders in real-time across multiple brokers" },
  { icon: BarChart2, title: "Advanced Backtesting", desc: "Simulate 3-month historical data with detailed analytics" },
  { icon: Shield, title: "Secure & Encrypted", desc: "AES-256 encryption for all broker credentials" },
];

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
      toast.error(err?.response?.data?.message || err?.response?.data?.error || "Login failed");
    }
  }

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      {/* Left panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative flex-col justify-between p-12 bg-white border-r border-slate-200">
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: `linear-gradient(#2563eb 1px, transparent 1px), linear-gradient(90deg, #2563eb 1px, transparent 1px)`, backgroundSize: "40px 40px" }} />
        <div className="relative z-10 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-md">
            <Zap className="h-5 w-5 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-2xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">TradeIO</span>
        </div>

        <div className="relative z-10 space-y-8">
          <div>
            <h2 className="text-4xl font-bold leading-tight mb-4 text-slate-900">
              Institutional-grade <br />
              <span className="text-blue-600">algo trading</span> <br />
              for everyone.
            </h2>
            <p className="text-slate-500 text-lg max-w-md">
              Build, backtest, and deploy your strategies across major brokers from one unified professional interface.
            </p>
          </div>

          <div className="space-y-5">
            {features.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex items-start gap-4">
                <div className="h-10 w-10 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                  <Icon className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">{title}</p>
                  <p className="text-sm text-slate-500">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 text-sm text-slate-400 font-medium">
          Â© {new Date().getFullYear()} TradeIO Â· SEBI-compliant
        </div>
      </div>

      {/* Right panel - Auth Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-slate-50">
        <div className="w-full max-w-[400px] space-y-8 bg-white p-8 rounded-2xl shadow-sm border border-slate-100">

          <div className="flex lg:hidden items-center gap-2 mb-2 justify-center">
            <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-sm">
              <Zap className="h-4 w-4 text-white" strokeWidth={2.5} />
            </div>
            <span className="text-xl font-bold text-slate-900">TradeIO</span>
          </div>

          <div className="text-center lg:text-left">
            <h1 className="text-2xl font-bold text-slate-900">Sign in</h1>
            <p className="text-sm text-slate-500 mt-2">
              Don't have an account? <Link href="/register" className="text-blue-600 hover:text-blue-700 font-medium hover:underline">Create one</Link>
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {!show2fa ? (
              <>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700 block">Email</label>
                  <input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    autoComplete="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    required
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all placeholder:text-slate-400"
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-semibold text-slate-700">Password</label>
                    <Link href="/forgot-password" className="text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline">
                      Forgot Password ?
                    </Link>
                  </div>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPass ? "text" : "password"}
                      placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
                      autoComplete="current-password"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      required
                      className="w-full h-10 px-3 pr-10 rounded-lg border border-slate-200 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all placeholder:text-slate-400"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      tabIndex={-1}
                    >
                      {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-700 block text-center">
                  2FA Code (Authenticator)
                </label>
                <input
                  id="totpCode"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  placeholder="000000"
                  value={form.totpCode}
                  onChange={(e) => setForm({ ...form, totpCode: e.target.value })}
                  className="w-full h-14 rounded-xl border border-slate-200 bg-white text-slate-900 text-center text-3xl tracking-[0.3em] font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  autoFocus
                />
              </div>
            )}

            <Button type="submit" className="w-full h-10 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg" disabled={isLoggingIn}>
              {isLoggingIn ? "Signing In..." : show2fa ? "Verify & Sign In" : "Sign In"}
            </Button>
          </form>


        </div>
      </div>
    </div>
  );
}

