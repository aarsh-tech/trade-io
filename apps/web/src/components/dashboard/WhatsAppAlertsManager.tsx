"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { whatsappApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  MessageSquare,
  QrCode,
  CheckCircle2,
  Clock,
  Send,
  RefreshCw,
  Power,
  Users,
  Smartphone,
  Zap,
  Loader2,
  Bell,
  Check,
  Plus,
  Trash2,
  User,
  Eye,
  SlidersHorizontal,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Recipient {
  id: string;
  countryCode: string;
  number: string;
  label?: string;
}

const COUNTRY_CODES = [
  { code: "91", country: "India (+91)", flag: "🇮🇳" },
  { code: "1", country: "USA / Canada (+1)", flag: "🇺🇸" },
  { code: "44", country: "UK (+44)", flag: "🇬🇧" },
  { code: "971", country: "UAE (+971)", flag: "🇦🇪" },
  { code: "65", country: "Singapore (+65)", flag: "🇸🇬" },
  { code: "61", country: "Australia (+61)", flag: "🇦🇺" },
];

export function WhatsAppAlertsManager() {
  const queryClient = useQueryClient();
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isPollingQr, setIsPollingQr] = useState(false);
  const [activeTab, setActiveTab] = useState<"config" | "recipients" | "preview">("config");

  // Recipient Entry Form State
  const [countryCode, setCountryCode] = useState("91");
  const [inputNumber, setInputNumber] = useState("");
  const [inputLabel, setInputLabel] = useState("");
  const [recipients, setRecipients] = useState<Recipient[]>([]);

  // Settings State
  const [settings, setSettings] = useState({
    whatsappGroupId: "",
    whatsappAlertsEnabled: false,
    whatsappAlertTime: "09:20",
    whatsappUniverse: "fno",
    whatsappTolerance: 0.05,
  });

  // ─── Fetch Status ──────────────────────────────────────────────────────────
  const { data: statusData, isLoading, refetch } = useQuery({
    queryKey: ["whatsapp-status"],
    queryFn: async () => {
      const res = await whatsappApi.getStatus();
      return res.data?.data;
    },
    refetchInterval: isPollingQr ? 3000 : 15000,
  });

  useEffect(() => {
    if (statusData) {
      setIsConnected(statusData.isConnected ?? false);
      setPhone(statusData.phone ?? null);
      if (statusData.qrCode) {
        setQrCode(statusData.qrCode);
      } else if (statusData.isConnected) {
        setQrCode(null);
        setIsPollingQr(false);
      }
      if (statusData.settings) {
        setSettings({
          whatsappGroupId: statusData.settings.whatsappGroupId || "",
          whatsappAlertsEnabled: statusData.settings.whatsappAlertsEnabled ?? false,
          whatsappAlertTime: statusData.settings.whatsappAlertTime || "09:20",
          whatsappUniverse: statusData.settings.whatsappUniverse || "fno",
          whatsappTolerance: statusData.settings.whatsappTolerance ?? 0.05,
        });

        // Parse comma-separated phone numbers into recipient objects
        if (statusData.settings.whatsappNumber) {
          const rawNums = statusData.settings.whatsappNumber
            .split(",")
            .map((n: string) => n.trim())
            .filter((n: string) => n.length > 5);

          const parsedList: Recipient[] = rawNums.map((raw: string, idx: number) => {
            let cc = "91";
            let pureNum = raw;
            if (raw.startsWith("91") && raw.length === 12) {
              cc = "91";
              pureNum = raw.slice(2);
            } else if (raw.startsWith("1") && raw.length === 11) {
              cc = "1";
              pureNum = raw.slice(1);
            }
            return {
              id: `${raw}-${idx}`,
              countryCode: cc,
              number: pureNum,
              label: idx === 0 ? "Primary Mobile" : `Recipient ${idx + 1}`,
            };
          });
          setRecipients(parsedList);
        }
      }
    }
  }, [statusData]);

  // ─── Fetch Groups ──────────────────────────────────────────────────────────
  const { data: groupsData, isLoading: isLoadingGroups, refetch: refetchGroups } = useQuery({
    queryKey: ["whatsapp-groups"],
    queryFn: async () => {
      const res = await whatsappApi.getGroups();
      return res.data?.data || [];
    },
    enabled: isConnected,
  });

  // ─── Add Recipient Helper ──────────────────────────────────────────────────
  const handleAddRecipient = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNum = inputNumber.replace(/\D/g, "");
    if (cleanNum.length < 7) {
      toast.error("Please enter a valid mobile number");
      return;
    }
    if (recipients.some((r) => r.number === cleanNum && r.countryCode === countryCode)) {
      toast.error("This number is already in your recipients list");
      return;
    }

    const newRecipient: Recipient = {
      id: `${countryCode}${cleanNum}-${Date.now()}`,
      countryCode,
      number: cleanNum,
      label: inputLabel.trim() || (recipients.length === 0 ? "Primary Mobile" : `Recipient ${recipients.length + 1}`),
    };

    const updated = [...recipients, newRecipient];
    setRecipients(updated);
    setInputNumber("");
    setInputLabel("");
    toast.success(`Added ${newRecipient.label} (+${countryCode} ${cleanNum})`);
  };

  const handleRemoveRecipient = (id: string) => {
    const updated = recipients.filter((r) => r.id !== id);
    setRecipients(updated);
    toast.info("Recipient removed");
  };

  // ─── Connect / Generate QR ────────────────────────────────────────────────
  const connectMutation = useMutation({
    mutationFn: async () => {
      setIsPollingQr(true);
      const res = await whatsappApi.connect();
      return res.data?.data;
    },
    onSuccess: (data) => {
      if (data?.qrCode) {
        setQrCode(data.qrCode);
        toast.info("Scan the QR code with WhatsApp on your phone");
      }
      refetch();
    },
    onError: (err: any) => {
      setIsPollingQr(false);
      toast.error(err?.response?.data?.message || "Failed to initialize WhatsApp session");
    },
  });

  // ─── Disconnect ───────────────────────────────────────────────────────────
  const disconnectMutation = useMutation({
    mutationFn: async () => {
      await whatsappApi.disconnect();
    },
    onSuccess: () => {
      setIsConnected(false);
      setPhone(null);
      setQrCode(null);
      setIsPollingQr(false);
      toast.success("WhatsApp session disconnected");
      queryClient.invalidateQueries({ queryKey: ["whatsapp-status"] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || "Failed to disconnect session");
    },
  });

  // ─── Save Settings ────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async () => {
      // Compile recipients back into clean database format
      const compiledNumberStr = recipients
        .map((r) => `${r.countryCode}${r.number}`)
        .join(", ");

      const res = await whatsappApi.updateSettings({
        ...settings,
        whatsappNumber: compiledNumberStr,
      });
      return res.data?.data;
    },
    onSuccess: () => {
      toast.success("WhatsApp alert configuration saved successfully!");
      queryClient.invalidateQueries({ queryKey: ["whatsapp-status"] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || "Failed to save settings");
    },
  });

  // ─── Send Test Message ────────────────────────────────────────────────────
  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await whatsappApi.testAlert();
      return res.data;
    },
    onSuccess: (data) => {
      if (data?.success) {
        toast.success(data.message || "Test alert sent to your WhatsApp!");
      } else {
        toast.error(data?.message || "Failed to send test alert");
      }
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || "Failed to send test alert");
    },
  });

  // ─── Trigger Live Alert Now ───────────────────────────────────────────────
  const triggerNowMutation = useMutation({
    mutationFn: async () => {
      const res = await whatsappApi.triggerOhlNow();
      return res.data;
    },
    onSuccess: () => {
      toast.success("Live OHL Scanner alert scanned and broadcast to WhatsApp!");
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || "Failed to trigger live scan alert");
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5 animate-[fade-up_0.3s_ease_both]">
      {/* ── 1. Top Connection Banner ── */}
      <Card className="border-slate-200/90 bg-white shadow-xs rounded-2xl overflow-hidden">
        <div className="p-3.5 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 bg-gradient-to-r from-emerald-950 via-slate-900 to-slate-950 text-white relative overflow-hidden">
          <div className="absolute right-0 top-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="flex items-start sm:items-center gap-3 sm:gap-3.5 relative z-10">
            <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl sm:rounded-2xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0 shadow-inner">
              <MessageSquare className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-lg font-bold text-white tracking-tight">
                  WhatsApp Alert Terminal
                </h3>
                <Badge
                  className={cn(
                    "text-[9px] sm:text-[10px] font-bold py-0.5 px-2 tracking-wide uppercase",
                    isConnected
                      ? "bg-emerald-500 text-white border-0 shadow-sm"
                      : "bg-slate-800 text-slate-400 border border-slate-700"
                  )}
                >
                  {isConnected ? "● CONNECTED" : "○ OFFLINE"}
                </Badge>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-300 max-w-md leading-tight sm:leading-normal">
                {isConnected && phone
                  ? `Active session paired with +${phone} (Live alerts enabled)`
                  : "Pair your WhatsApp account via QR Code to broadcast automated morning OHL alerts"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 relative z-10 w-full sm:w-auto justify-end">
            {isConnected ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => disconnectMutation.mutate()}
                disabled={disconnectMutation.isPending}
                className="w-full sm:w-auto h-8.5 text-xs font-semibold text-rose-300 border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 hover:text-white rounded-xl gap-1.5"
              >
                {disconnectMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
                Disconnect
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => connectMutation.mutate()}
                disabled={connectMutation.isPending || isPollingQr}
                className="w-full sm:w-auto h-9 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-md gap-1.5 px-4"
              >
                {connectMutation.isPending || isPollingQr ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <QrCode className="h-3.5 w-3.5" />
                )}
                {qrCode ? "Regenerate QR Code" : "Pair WhatsApp QR"}
              </Button>
            )}
          </div>
        </div>

        {/* QR Code Scanner Box */}
        {!isConnected && qrCode && (
          <div className="p-4 sm:p-6 border-t border-slate-100 bg-emerald-50/20 flex flex-col items-center justify-center text-center space-y-3 animate-in fade-in">
            <div className="p-2 sm:p-3 bg-white border border-emerald-200 rounded-2xl shadow-lg">
              <img src={qrCode} alt="WhatsApp QR Code" className="w-44 h-44 sm:w-60 sm:h-60 max-w-full object-contain" />
            </div>
            <div className="space-y-1 max-w-sm">
              <p className="text-xs sm:text-sm font-bold text-slate-900 flex items-center justify-center gap-1.5">
                <Smartphone className="h-4 w-4 text-emerald-600 shrink-0" />
                Scan with WhatsApp on your Phone
              </p>
              <p className="text-[11px] sm:text-xs text-slate-500 leading-relaxed">
                Open WhatsApp → Settings → <strong>Linked Devices</strong> → <strong>Link a Device</strong> and point your camera at this QR code.
              </p>
            </div>
          </div>
        )}
      </Card>

      {/* ── 2. Navigation Tabs (Config / Recipients / Preview) ── */}
      <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100/90 border border-slate-200/80 rounded-xl sm:rounded-2xl">
        <button
          onClick={() => setActiveTab("config")}
          className={cn(
            "flex items-center justify-center gap-1 sm:gap-2 py-2 px-1.5 sm:px-3 rounded-lg text-[11px] sm:text-xs font-bold transition-all truncate",
            activeTab === "config"
              ? "bg-white text-slate-900 shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5 text-blue-600 shrink-0" />
          <span className="hidden sm:inline">Alert Configuration</span>
          <span className="sm:hidden">Config</span>
        </button>
        <button
          onClick={() => setActiveTab("recipients")}
          className={cn(
            "flex items-center justify-center gap-1 sm:gap-2 py-2 px-1.5 sm:px-3 rounded-lg text-[11px] sm:text-xs font-bold transition-all truncate",
            activeTab === "recipients"
              ? "bg-white text-slate-900 shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          )}
        >
          <Users className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
          <span className="hidden sm:inline">Recipients & Groups</span>
          <span className="sm:hidden">Recipients</span>
          <span className="text-[10px] bg-emerald-100 text-emerald-800 rounded-full px-1.5 py-0.2 font-mono">
            {recipients.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab("preview")}
          className={cn(
            "flex items-center justify-center gap-1 sm:gap-2 py-2 px-1.5 sm:px-3 rounded-lg text-[11px] sm:text-xs font-bold transition-all truncate",
            activeTab === "preview"
              ? "bg-white text-slate-900 shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          )}
        >
          <Eye className="h-3.5 w-3.5 text-amber-500 shrink-0" />
          <span className="hidden sm:inline">Message Preview</span>
          <span className="sm:hidden">Preview</span>
        </button>
      </div>

      {/* ── 3. Tab 1: Alert Configuration ── */}
      {activeTab === "config" && (
        <Card className="border-slate-200/90 bg-white shadow-xs rounded-2xl">
          <CardHeader className="p-3.5 sm:p-6 pb-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-sm sm:text-lg font-bold text-slate-900">
                  Morning OHL Scanner Parameters
                </CardTitle>
                <CardDescription className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
                  Configure momentum threshold and morning trigger schedule
                </CardDescription>
              </div>

              {/* Master Switch */}
              <div
                onClick={() => setSettings((s) => ({ ...s, whatsappAlertsEnabled: !s.whatsappAlertsEnabled }))}
                className={cn(
                  "w-12 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-300 shadow-inner shrink-0",
                  settings.whatsappAlertsEnabled ? "bg-emerald-600" : "bg-slate-300"
                )}
                title="Toggle Automated Morning WhatsApp Alerts"
              >
                <div
                  className={cn(
                    "bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-300",
                    settings.whatsappAlertsEnabled ? "translate-x-6" : "translate-x-0"
                  )}
                />
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-3.5 sm:p-6 pt-3 sm:pt-4 space-y-4 sm:space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              {/* Trigger Time */}
              <div className="space-y-1 sm:space-y-1.5">
                <label className="text-[11px] sm:text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                  <span>Morning Scan Schedule</span>
                </label>
                <select
                  value={settings.whatsappAlertTime}
                  onChange={(e) => setSettings({ ...settings, whatsappAlertTime: e.target.value })}
                  className="w-full h-10 px-3 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="09:16">09:16 AM IST (Immediate Opening Minute)</option>
                  <option value="09:18">09:18 AM IST (3-Min Momentum Confirm)</option>
                  <option value="09:20">09:20 AM IST (Recommended 5-Min Drive)</option>
                  <option value="09:25">09:25 AM IST (10-Min Stability)</option>
                  <option value="09:30">09:30 AM IST (15-Min Breakout)</option>
                </select>
                <p className="text-[10px] sm:text-[11px] text-slate-400">Time when scanner automatically broadcasts.</p>
              </div>

              {/* Universe */}
              <div className="space-y-1 sm:space-y-1.5">
                <label className="text-[11px] sm:text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                  <span>Scanning Universe</span>
                </label>
                <select
                  value={settings.whatsappUniverse}
                  onChange={(e) => setSettings({ ...settings, whatsappUniverse: e.target.value })}
                  className="w-full h-10 px-3 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="fno">F&O Liquid Universe (~200 Top Stocks)</option>
                  <option value="nifty50">Nifty 50 Large-Cap Equities Only</option>
                </select>
                <p className="text-[10px] sm:text-[11px] text-slate-400">Institutional stocks filtered for high liquidity.</p>
              </div>

              {/* Tolerance */}
              <div className="space-y-1 sm:space-y-1.5">
                <label className="text-[11px] sm:text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <span>Momentum Tolerance</span>
                </label>
                <select
                  value={settings.whatsappTolerance}
                  onChange={(e) => setSettings({ ...settings, whatsappTolerance: parseFloat(e.target.value) })}
                  className="w-full h-10 px-3 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="0.00">Exact 0.00% (Strict Open = Low / Open = High)</option>
                  <option value="0.05">0.05% Threshold (Recommended for Volatility)</option>
                  <option value="0.10">0.10% Wide Threshold</option>
                </select>
                <p className="text-[10px] sm:text-[11px] text-slate-400">Strictness of opening tick equality matching.</p>
              </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end pt-2 sm:pt-3 border-t border-slate-100">
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="w-full sm:w-auto h-9 px-6 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs gap-1.5"
              >
                {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Save Alert Settings
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── 4. Tab 2: Recipients & Groups (Interactive UI without commas!) ── */}
      {activeTab === "recipients" && (
        <div className="space-y-4 sm:space-y-5">
          {/* Add Recipient Form */}
          <Card className="border-slate-200/90 bg-white shadow-xs rounded-2xl">
            <CardHeader className="p-3.5 sm:p-5 pb-2">
              <CardTitle className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                <Plus className="h-4 w-4 text-emerald-600 shrink-0" /> Add Recipient Phone Number
              </CardTitle>
              <CardDescription className="text-[11px] sm:text-xs text-slate-500">
                Add numbers individually with international country code and optional nickname
              </CardDescription>
            </CardHeader>
            <CardContent className="p-3.5 sm:p-5 pt-2">
              <form onSubmit={handleAddRecipient} className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 sm:gap-3 items-end">
                {/* Country Code */}
                <div className="sm:col-span-3 space-y-1">
                  <label className="text-[10px] sm:text-[11px] font-bold text-slate-600 uppercase tracking-wider">Country</label>
                  <select
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value)}
                    className="w-full h-10 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {COUNTRY_CODES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.flag} {c.country}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Mobile Number */}
                <div className="sm:col-span-5 space-y-1">
                  <label className="text-[10px] sm:text-[11px] font-bold text-slate-600 uppercase tracking-wider">Mobile Number</label>
                  <Input
                    type="tel"
                    placeholder="e.g. 9876543210"
                    value={inputNumber}
                    onChange={(e) => setInputNumber(e.target.value)}
                    className="h-10 text-xs bg-slate-50 border-slate-200 text-slate-900 rounded-xl"
                  />
                </div>

                {/* Nickname / Label */}
                <div className="sm:col-span-2 space-y-1">
                  <label className="text-[10px] sm:text-[11px] font-bold text-slate-600 uppercase tracking-wider">Label (Opt)</label>
                  <Input
                    placeholder="e.g. Desk"
                    value={inputLabel}
                    onChange={(e) => setInputLabel(e.target.value)}
                    className="h-10 text-xs bg-slate-50 border-slate-200 text-slate-900 rounded-xl"
                  />
                </div>

                {/* Add Button */}
                <div className="sm:col-span-2">
                  <Button
                    type="submit"
                    className="w-full h-10 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs gap-1.5"
                  >
                    <Plus className="h-4 w-4" /> Add
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Configured Recipients Cards List */}
          <Card className="border-slate-200/90 bg-white shadow-xs rounded-2xl">
            <CardHeader className="p-3.5 sm:p-5 pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                  <Smartphone className="h-4 w-4 text-blue-600 shrink-0" /> Active Destinations ({recipients.length})
                </CardTitle>
                <Badge variant="outline" className="text-[10px] sm:text-xs font-semibold px-2 py-0.5 text-slate-500">
                  {recipients.length}/10 Max
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="p-3.5 sm:p-5 pt-2 space-y-3">
              {recipients.length === 0 ? (
                <div className="text-center py-6 sm:py-8 border-2 border-dashed border-slate-200 rounded-xl space-y-2">
                  <Smartphone className="h-7 w-7 sm:h-8 sm:w-8 mx-auto text-slate-300" />
                  <p className="text-xs font-semibold text-slate-600">No recipient numbers added yet</p>
                  <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                    Add your mobile number above so the engine knows where to send morning alerts.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-2.5">
                  {recipients.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between p-2.5 sm:p-3 rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-white hover:border-emerald-300 transition-all shadow-2xs group"
                    >
                      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                        <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs shrink-0">
                          <User className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        </div>
                        <div className="truncate">
                          <p className="text-xs font-bold text-slate-900 truncate">{r.label}</p>
                          <p className="font-mono text-[11px] sm:text-xs text-slate-600 truncate">
                            +{r.countryCode} {r.number}
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => handleRemoveRecipient(r.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors shrink-0"
                        title="Remove recipient"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* WhatsApp Group Selection */}
              <div className="pt-3 sm:pt-4 border-t border-slate-100 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] sm:text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Users className="h-4 w-4 text-blue-600 shrink-0" />
                    <span>Broadcast to WhatsApp Group (Optional)</span>
                  </label>
                  {isConnected && (
                    <button
                      onClick={() => refetchGroups()}
                      className="text-[11px] text-blue-600 hover:underline flex items-center gap-1 font-semibold"
                    >
                      <RefreshCw className={cn("h-3 w-3", isLoadingGroups && "animate-spin")} /> Refresh
                    </button>
                  )}
                </div>

                {groupsData && groupsData.length > 0 ? (
                  <select
                    value={settings.whatsappGroupId}
                    onChange={(e) => setSettings({ ...settings, whatsappGroupId: e.target.value })}
                    className="w-full h-10 px-3 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">-- No Group Selected (Send to Direct Numbers Only) --</option>
                    {groupsData.map((g: any) => (
                      <option key={g.id} value={g.id}>
                        {g.subject} ({g.size} members)
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    placeholder="e.g. 120363024859385@g.us (auto-fills when connected)"
                    value={settings.whatsappGroupId}
                    onChange={(e) => setSettings({ ...settings, whatsappGroupId: e.target.value })}
                    className="h-10 text-xs bg-slate-50 border-slate-200 text-slate-900 rounded-xl"
                  />
                )}
              </div>

              {/* Save Button */}
              <div className="flex justify-end pt-2 sm:pt-3">
                <Button
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending}
                  className="w-full sm:w-auto h-9 px-6 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs gap-1.5"
                >
                  {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Save Recipients
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── 5. Tab 3: Realistic Message Preview & Live Testing ── */}
      {activeTab === "preview" && (
        <div className="space-y-4">
          <Card className="border-slate-200/90 bg-white shadow-xs rounded-2xl overflow-hidden">
            <CardHeader className="p-3.5 sm:p-5 pb-2 bg-slate-50/50 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-sm sm:text-base font-bold text-slate-900">
                  Institutional WhatsApp Message Preview
                </CardTitle>
                <CardDescription className="text-[11px] sm:text-xs text-slate-500">
                  Live formatting simulated as rendered on WhatsApp mobile clients
                </CardDescription>
              </div>

              {/* Testing Buttons */}
              <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 w-full sm:w-auto">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => testMutation.mutate()}
                  disabled={!isConnected || testMutation.isPending}
                  className="h-8.5 text-[11px] sm:text-xs font-semibold rounded-xl border-slate-300 text-slate-700 hover:bg-slate-50 gap-1.5"
                >
                  {testMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5 text-blue-600 shrink-0" />}
                  Send Test Alert
                </Button>

                <Button
                  size="sm"
                  onClick={() => triggerNowMutation.mutate()}
                  disabled={!isConnected || triggerNowMutation.isPending}
                  className="h-8.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] sm:text-xs font-bold rounded-xl shadow-xs gap-1.5"
                >
                  {triggerNowMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5 shrink-0" />}
                  Scan & Broadcast
                </Button>
              </div>
            </CardHeader>

            <CardContent className="p-3 sm:p-6 bg-[#0b141a] flex justify-center">
              {/* WhatsApp Simulated Chat Bubble */}
              <div className="max-w-md w-full bg-[#005c4b] text-[#e9edef] rounded-2xl rounded-tr-xs p-3.5 sm:p-4 shadow-xl font-sans text-xs sm:text-[13px] leading-relaxed border border-[#025144] space-y-2.5 sm:space-y-3 break-words">
                <div className="border-b border-[#025144] pb-2 font-mono text-[10px] sm:text-[11px] text-emerald-200 whitespace-pre-wrap">
                  ━━━━━━━━━━━━━━━━━━━━{"\n"}
                  ⚡ <strong className="text-white">TRADEIO INSTITUTIONAL SCANNER</strong>{"\n"}
                  🎯 <strong>Morning Opening Drive (09:20 AM IST)</strong>{"\n"}
                  📅 <strong>Date:</strong> Sat, 29 Aug 2026{"\n"}
                  ━━━━━━━━━━━━━━━━━━━━
                </div>

                <div className="space-y-1 sm:space-y-1.5">
                  <p className="font-bold text-emerald-300 text-xs sm:text-[13px]">
                    🟢 BULLISH MOMENTUM — OPEN = LOW
                  </p>
                  <p className="text-[10px] sm:text-[11px] text-emerald-100/70 italic">
                    (Institutional Accumulation • Zero Below Open)
                  </p>
                  <div className="space-y-1 pt-1 font-mono text-[11px] sm:text-xs">
                    <p>1️⃣ <strong className="text-white">RELIANCE</strong> [Lot 250]</p>
                    <p className="text-slate-300 pl-2.5 sm:pl-3">▸ LTP: <strong className="text-emerald-400">₹2,950.40</strong> (+1.85%)</p>
                    <p className="text-slate-300 pl-2.5 sm:pl-3">▸ Open=Low: ₹2,950.40 | SL: ₹2,935.00</p>
                    <p>2️⃣ <strong className="text-white">TCS</strong> [Lot 175]</p>
                    <p className="text-slate-300 pl-2.5 sm:pl-3">▸ LTP: <strong className="text-emerald-400">₹4,180.00</strong> (+2.10%)</p>
                    <p className="text-slate-300 pl-2.5 sm:pl-3">▸ Open=Low: ₹4,180.00 | SL: ₹4,155.00</p>
                  </div>
                </div>

                <div className="border-t border-[#025144] pt-2 space-y-1 sm:space-y-1.5">
                  <p className="font-bold text-rose-300 text-xs sm:text-[13px]">
                    🔴 BEARISH MOMENTUM — OPEN = HIGH
                  </p>
                  <p className="text-[10px] sm:text-[11px] text-rose-100/70 italic">
                    (Institutional Distribution • Zero Above Open)
                  </p>
                  <div className="space-y-1 pt-1 font-mono text-[11px] sm:text-xs">
                    <p>1️⃣ <strong className="text-white">HDFCBANK</strong> [Lot 550]</p>
                    <p className="text-slate-300 pl-2.5 sm:pl-3">▸ LTP: <strong className="text-rose-400">₹1,620.50</strong> (-1.65%)</p>
                    <p className="text-slate-300 pl-2.5 sm:pl-3">▸ Open=High: ₹1,620.50 | SL: ₹1,632.00</p>
                  </div>
                </div>

                <div className="border-t border-[#025144] pt-2 text-[10px] sm:text-[11px] text-slate-300 space-y-1">
                  <p className="font-bold text-white">💡 Execution Guidance:</p>
                  <p>• Bullish: Buy on 5-min breakout with SL @ Day Low</p>
                  <p>• Bearish: Short on 5-min breakdown with SL @ Day High</p>
                  <p className="pt-1 text-emerald-200/80">🚀 TradeIO Algorithmic Trading Systems</p>
                </div>

                <div className="flex items-center justify-end gap-1 text-[10px] text-emerald-200/60 pt-1">
                  <span>09:20 AM</span>
                  <span className="text-[#53bdeb]">✓✓</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
