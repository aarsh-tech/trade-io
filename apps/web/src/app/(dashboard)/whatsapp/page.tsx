"use client";

import { WhatsAppAlertsManager } from "@/components/dashboard/WhatsAppAlertsManager";
import { Smartphone, ShieldCheck, Sparkles } from "lucide-react";

export default function WhatsAppPage() {
  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12 animate-[fade-up_0.3s_ease_both]">
      {/* ── Page Header Banner ── */}
      <div className="rounded-3xl bg-gradient-to-r from-slate-950 via-slate-900 to-emerald-950 text-white p-6 sm:p-8 shadow-xl relative overflow-hidden border border-slate-800">
        <div className="absolute right-0 top-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute left-1/3 bottom-0 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 space-y-2">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="inline-flex items-center gap-1.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-3 py-1 text-[11px] font-bold tracking-wide uppercase rounded-full shadow-xs">
              <Smartphone className="h-3.5 w-3.5 fill-emerald-400 text-emerald-400" /> WHATSAPP AUTOMATION
            </span>
            <span className="inline-flex items-center gap-1.5 text-slate-300 border border-slate-700 bg-slate-800/50 px-3 py-1 text-[11px] font-semibold rounded-full shadow-xs">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> Multi-Recipient & Group Broadcasts
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
            WhatsApp Alerts & Broadcast Manager
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
            Link your WhatsApp account via QR code, configure direct subscriber phone numbers or community group IDs, and automate real-time Daily Advisory and Morning 09:20 OHL Scanner broadcasts.
          </p>
        </div>
      </div>

      {/* ── WhatsApp Manager Full Component ── */}
      <div className="bg-white rounded-3xl p-4 sm:p-6 border border-slate-200/90 shadow-xs">
        <WhatsAppAlertsManager />
      </div>
    </div>
  );
}
