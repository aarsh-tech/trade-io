"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  ShieldAlert,
  TrendingDown,
  Percent,
  CheckCircle2,
  ExternalLink,
  Cpu,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

export const RISK_DISCLOSURE_ACCEPTED_KEY = "tradeio_risk_disclosure_accepted";
export const RISK_DISCLOSURE_DATE_KEY = "tradeio_risk_disclosure_accepted_date";
export const RISK_DISCLOSURE_TIMESTAMP_KEY = "tradeio_risk_disclosure_accepted_at";
export const RISK_DISCLOSURE_LOGIN_FLAG = "tradeio_show_risk_disclosure_login";

/**
 * Programmatically opens the Risk Disclosure Modal from anywhere in the application.
 */
export function openRiskDisclosure() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("tradeio:open-risk-disclosure"));
  }
}

export function RiskDisclosureModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [agreeChecked, setAgreeChecked] = useState(true);
  const [dontShowToday, setDontShowToday] = useState(true);

  useEffect(() => {
    setMounted(true);

    const checkShouldShow = () => {
      if (typeof window === "undefined") return;

      const todayStr = new Date().toISOString().slice(0, 10);
      const isJustLoggedIn = sessionStorage.getItem(RISK_DISCLOSURE_LOGIN_FLAG) === "true";
      const lastAcceptedDate = localStorage.getItem(RISK_DISCLOSURE_DATE_KEY);
      const isEverAccepted = localStorage.getItem(RISK_DISCLOSURE_ACCEPTED_KEY) === "true";

      // Show modal on:
      // 1. Fresh user login
      // 2. New trading calendar day (first visit of today)
      // 3. First time user ever visits the platform
      if (isJustLoggedIn || !isEverAccepted || lastAcceptedDate !== todayStr) {
        // Small delay to ensure smooth page transition and pleasant entrance animation
        const timer = setTimeout(() => {
          setIsOpen(true);
        }, 350);
        return () => clearTimeout(timer);
      }
    };

    checkShouldShow();

    // Listen for manual trigger from TopBar / Sidebar / Settings
    const handleManualOpen = () => {
      setIsOpen(true);
    };

    window.addEventListener("tradeio:open-risk-disclosure", handleManualOpen);
    return () => {
      window.removeEventListener("tradeio:open-risk-disclosure", handleManualOpen);
    };
  }, []);

  const handleAcknowledge = () => {
    if (typeof window !== "undefined") {
      const todayStr = new Date().toISOString().slice(0, 10);
      localStorage.setItem(RISK_DISCLOSURE_ACCEPTED_KEY, "true");
      localStorage.setItem(RISK_DISCLOSURE_TIMESTAMP_KEY, new Date().toISOString());

      if (dontShowToday) {
        localStorage.setItem(RISK_DISCLOSURE_DATE_KEY, todayStr);
      } else {
        localStorage.removeItem(RISK_DISCLOSURE_DATE_KEY);
      }

      sessionStorage.removeItem(RISK_DISCLOSURE_LOGIN_FLAG);
    }

    setIsOpen(false);
    toast.success("Risk disclosures acknowledged", {
      description: "Trade responsibly with disciplined stop-loss risk management.",
    });
  };

  if (!mounted) return null;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent
        hideClose={true}
        className="w-[calc(100%-1.5rem)] sm:max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden border border-slate-200/90 shadow-2xl rounded-2xl bg-white"
      >
        {/* Top Header Banner */}
        <div className="bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/5 px-5 sm:px-6 pt-5 pb-4 border-b border-amber-200/60 flex items-start gap-3.5">
          <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center shrink-0 text-amber-600 shadow-xs">
            <ShieldAlert className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-amber-800 bg-amber-100/90 border border-amber-300/80 px-2 py-0.5 rounded-full">
                SEBI Mandated Disclosure
              </span>
              <span className="text-[10px] text-slate-400 font-medium">
                Kite / Exchange Standard
              </span>
            </div>
            <DialogTitle className="text-base sm:text-lg font-bold text-slate-900 mt-1 leading-snug">
              Risk disclosures on derivatives
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Mandatory risk disclosure as prescribed by Securities and Exchange Board of India (SEBI)
            </DialogDescription>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4 space-y-4 text-slate-700">
          {/* Key Stat Badges Grid */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="bg-rose-50/70 border border-rose-200/80 rounded-xl p-2.5 sm:p-3 text-center">
              <div className="text-base sm:text-xl font-extrabold text-rose-600 tracking-tight flex items-center justify-center gap-1">
                <TrendingDown className="h-4 w-4 shrink-0 text-rose-500" />
                9 / 10
              </div>
              <p className="text-[10px] sm:text-xs font-semibold text-rose-900 mt-0.5 leading-tight">
                Loss Makers
              </p>
              <p className="text-[9px] sm:text-[10px] text-rose-700/80 mt-0.5 hidden sm:block">
                ~93% F&O retail traders
              </p>
            </div>

            <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-2.5 sm:p-3 text-center">
              <div className="text-base sm:text-xl font-extrabold text-amber-600 tracking-tight">
                ₹50,000+
              </div>
              <p className="text-[10px] sm:text-xs font-semibold text-amber-900 mt-0.5 leading-tight">
                Avg Net Loss
              </p>
              <p className="text-[9px] sm:text-[10px] text-amber-700/80 mt-0.5 hidden sm:block">
                Up to ₹1.1L in 3-yr study
              </p>
            </div>

            <div className="bg-blue-50/70 border border-blue-200/80 rounded-xl p-2.5 sm:p-3 text-center">
              <div className="text-base sm:text-xl font-extrabold text-blue-600 tracking-tight flex items-center justify-center gap-0.5">
                <Percent className="h-4 w-4 shrink-0 text-blue-500" />
                28%
              </div>
              <p className="text-[10px] sm:text-xs font-semibold text-blue-900 mt-0.5 leading-tight">
                Trading Costs
              </p>
              <p className="text-[9px] sm:text-[10px] text-blue-700/80 mt-0.5 hidden sm:block">
                Additional cost over losses
              </p>
            </div>
          </div>

          {/* Official SEBI Findings Section */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 sm:p-4 space-y-2.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 uppercase tracking-wide">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
              Official SEBI Study Findings
            </div>
            <ul className="space-y-2 text-xs sm:text-[13px] text-slate-700 leading-relaxed list-none pl-0">
              <li className="flex items-start gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500 mt-2 shrink-0" />
                <span>
                  <strong className="text-slate-900 font-semibold">9 out of 10 individual traders</strong> in equity Futures and Options (F&O) Segment incurred net losses.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 mt-2 shrink-0" />
                <span>
                  <strong className="text-slate-900 font-semibold">On an average, loss makers registered net trading loss close to ₹50,000.</strong> Over 3-year aggregated SEBI data, average net loss per individual trader exceeded ₹1,10,000.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500 mt-2 shrink-0" />
                <span>
                  <strong className="text-slate-900 font-semibold">Over and above the net trading losses incurred</strong>, loss makers expended an additional <strong className="text-slate-900 font-semibold">28% of net trading losses</strong> as transaction costs (brokerage, exchange turnover charges, and STT).
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 mt-2 shrink-0" />
                <span>
                  <strong className="text-slate-900 font-semibold">Those making net trading profits</strong> incurred between <strong className="text-slate-900 font-semibold">15% to 50%</strong> of such profits as transaction costs.
                </span>
              </li>
            </ul>
            <p className="text-[10px] text-slate-400 italic pt-1 border-t border-slate-200/60 flex items-center gap-1">
              <span>Source: SEBI study on &quot;Analysis of Profit and Loss of Individual Traders dealing in equity Futures and Options (F&O) Segment&quot;.</span>
            </p>
          </div>

          {/* Algorithmic & Automated Trading Advisory */}
          <div className="bg-sky-50/60 border border-sky-200/70 rounded-xl p-3.5 sm:p-4 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-sky-950 uppercase tracking-wide">
              <Cpu className="h-3.5 w-3.5 text-sky-600 shrink-0" />
              Algorithmic Execution & System Notice
            </div>
            <div className="space-y-1.5 text-xs sm:text-[12.5px] text-sky-950 leading-relaxed">
              <p>
                • <strong>Automated Order Routing:</strong> Algorithmic strategies place market/limit orders via broker APIs based on pre-set mathematical triggers. System execution may be subject to network latency, market volatility, or exchange rate throttling.
              </p>
              <p>
                • <strong>No Guaranteed Returns:</strong> Past performance, simulated paper trading, and backtest metrics do not guarantee future profitability. Market conditions can fluctuate unpredictably.
              </p>
              <p>
                • <strong>Capital Discipline:</strong> Derivative trading involves substantial financial risk. Never trade with borrowed funds or capital you cannot afford to lose. Always configure strictly enforced stop-loss limits.
              </p>
            </div>
          </div>

          {/* Consent Checkboxes */}
          <div className="pt-1 space-y-2">
            <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={agreeChecked}
                onChange={(e) => setAgreeChecked(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer accent-blue-600"
              />
              <span>
                I have read and understood the <strong>SEBI risk disclosures on derivatives</strong> and agree that algorithmic trading involves financial market risks.
              </span>
            </label>

            <label className="flex items-center gap-2.5 text-xs text-slate-500 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={dontShowToday}
                onChange={(e) => setDontShowToday(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer accent-blue-600"
              />
              <span>Don&apos;t show this popup again today (re-appears tomorrow or upon new session login)</span>
            </label>
          </div>
        </div>

        {/* Modal Action Footer */}
        <div className="px-5 sm:px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <span className="text-[11px] text-slate-400 hidden sm:inline">
            Mandatory acknowledgment pursuant to SEBI circulars
          </span>
          <Button
            type="button"
            onClick={handleAcknowledge}
            disabled={!agreeChecked}
            className="w-full sm:w-auto min-w-[160px] h-11 bg-[#387ed1] hover:bg-[#2d6bb3] text-white font-semibold rounded-lg shadow-sm hover:shadow transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CheckCircle2 className="h-4 w-4" />
            <span>I understand</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
