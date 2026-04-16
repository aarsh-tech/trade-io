"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plug, Plus, X, CheckCircle2, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

import { useBrokers } from "@/hooks/useBrokers";

const BROKERS_CONFIG = [
  { key: "ZERODHA", name: "Zerodha", logo: "Z", color: "#387ED1", desc: "Kite Connect API" },
  { key: "ANGEL", name: "Angel One", logo: "A", color: "#F36B21", desc: "SmartAPI" },
  { key: "UPSTOX", name: "Upstox", logo: "U", color: "#6C5CE7", desc: "Upstox API v2" },
  { key: "FIVEPAISA", name: "5paisa", logo: "5", color: "#E84542", desc: "5paisa Trade API" },
];

export default function BrokersPage() {
  const { brokers, isLoading, connect, isConnecting, disconnect } = useBrokers();
  const [showModal, setShowModal] = useState(false);
  const [selectedBroker, setSelectedBroker] = useState<typeof BROKERS_CONFIG[0] | null>(null);
  const [form, setForm] = useState({ apiKey: "", apiSecret: "", clientId: "" });

  function openConnect(broker: typeof BROKERS_CONFIG[0]) {
    setSelectedBroker(broker);
    setForm({ apiKey: "", apiSecret: "", clientId: "" });
    setShowModal(true);
  }

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedBroker) return;
    
    try {
      await connect({
        broker: selectedBroker.key as any,
        ...form,
      });
      setShowModal(false);
    } catch {
      // toast in hook
    }
  }

  async function handleDisconnect(id: string) {
    if (confirm("Are you sure you want to disconnect this broker?")) {
      await disconnect(id);
    }
  }

  return (
    <div className="space-y-6 animate-[fade-up_0.4s_ease_both]">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Broker Accounts</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Connect your broker APIs to enable live trading
        </p>
      </div>

      {/* Connected accounts */}
      {/* Connected accounts */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2].map(i => <div key={i} className="h-40 rounded-xl bg-slate-100 animate-pulse" />)}
        </div>
      ) : brokers.length > 0 ? (
        <div>
          <h2 className="text-sm font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-3">
            Connected
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {brokers.map((acc: any) => {
              const config = BROKERS_CONFIG.find(b => b.key === acc.broker) || BROKERS_CONFIG[0];
              return (
                <Card key={acc.id} className="relative">
                  <div className="absolute top-0 left-0 right-0 h-1 rounded-t-xl" style={{ background: config.color }} />
                  <CardContent className="pt-5">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div
                          className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold text-lg shadow-sm"
                          style={{ background: config.color }}
                        >
                          {config.logo}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">{config.name}</p>
                          <p className="text-xs text-slate-500">
                            Client: {acc.clientId}
                          </p>
                        </div>
                      </div>
                      <Badge variant="running" dot>Active</Badge>
                    </div>
                    <div className="text-xs text-slate-500 mb-4">
                      Token expires: {acc.tokenExpiry ? new Date(acc.tokenExpiry).toLocaleDateString("en-IN") : "No token"}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1 gap-1 text-slate-700 bg-white border-slate-200 hover:bg-slate-50">
                        <ExternalLink className="h-3 w-3" /> Renew Token
                      </Button>
                      <Button 
                        variant="outline" 
                        size="icon-sm" 
                        className="text-red-500 bg-white border-slate-200 hover:bg-red-50 hover:border-red-200"
                        onClick={() => handleDisconnect(acc.id)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="p-8 border-2 border-dashed border-slate-100 rounded-2xl text-center bg-slate-50/50">
           <Plug className="h-10 w-10 text-slate-300 mx-auto mb-3" />
           <p className="text-slate-500 text-sm font-medium">No brokers connected yet</p>
        </div>
      )}

      {/* Available brokers */}
      <div>
        <h2 className="text-sm font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-3">
          Available Brokers
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {BROKERS_CONFIG.map((b) => {
            const isConnected = brokers.some((c: any) => c.broker === b.key);
            return (
              <Card
                key={b.key}
                className={cn(
                  "transition-all",
                  isConnected ? "opacity-60 grayscale-[0.5]" : "cursor-pointer hover:scale-[1.02] hover:shadow-md"
                )}
                onClick={() => !isConnected && openConnect(b)}
              >
                <CardContent className="flex flex-col items-center text-center gap-3 py-8">
                  <div
                    className="h-14 w-14 rounded-2xl flex items-center justify-center text-white font-bold text-2xl shadow-sm"
                    style={{ background: b.color }}
                  >
                    {b.logo}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">{b.name}</p>
                    <p className="text-xs text-slate-500">{b.desc}</p>
                  </div>
                  {isConnected ? (
                    <Badge variant="running" dot>Connected</Badge>
                  ) : (
                    <Button size="sm" variant="outline" className="gap-1 border-slate-200 bg-white text-slate-700 hover:bg-slate-50">
                      <Plus className="h-3 w-3" /> Connect
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Connect modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="p-0 border-slate-100 overflow-hidden max-w-[440px] gap-0">
          {selectedBroker && (
            <>
              {/* Header */}
              <div className="px-7 py-6 border-b border-slate-100 flex justify-between bg-slate-50/50">
                <div className="flex items-center gap-4">
                  <div
                    className="h-11 w-11 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-sm"
                    style={{ background: selectedBroker.color }}
                  >
                    {selectedBroker.logo}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 leading-tight">Connect {selectedBroker.name}</h3>
                    <p className="text-xs text-slate-500 font-medium">Link your trading account securely</p>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="p-7">
                <form onSubmit={handleConnect} className="space-y-5">
                  <div className="space-y-4 pt-1">
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">Client ID</label>
                      <Input
                        className="border-slate-200 bg-slate-50 hover:bg-white focus:bg-white h-11 text-slate-900 placeholder:text-slate-400 transition-all rounded-xl focus:ring-2 focus:ring-offset-0 focus:border-transparent"
                        style={{ '--tw-ring-color': selectedBroker.color } as React.CSSProperties}
                        placeholder="e.g. AB1234"
                        value={form.clientId}
                        onChange={(e) => setForm({ ...form, clientId: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">API Key</label>
                      <Input
                        className="border-slate-200 bg-slate-50 hover:bg-white focus:bg-white h-11 text-slate-900 placeholder:text-slate-400 transition-all rounded-xl focus:ring-2 focus:ring-offset-0 focus:border-transparent"
                        style={{ '--tw-ring-color': selectedBroker.color } as React.CSSProperties}
                        placeholder="Your App API Key"
                        value={form.apiKey}
                        onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">API Secret</label>
                      <Input
                        className="border-slate-200 bg-slate-50 hover:bg-white focus:bg-white h-11 text-slate-900 placeholder:text-slate-400 transition-all rounded-xl focus:ring-2 focus:ring-offset-0 focus:border-transparent"
                        style={{ '--tw-ring-color': selectedBroker.color } as React.CSSProperties}
                        type="password"
                        placeholder="••••••••••••••••"
                        value={form.apiSecret}
                        onChange={(e) => setForm({ ...form, apiSecret: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-4 rounded-xl bg-slate-50 border border-slate-100">
                    <div className="pt-0.5 text-slate-400">🔒</div>
                    <p className="text-[11.5px] leading-relaxed text-slate-600 font-medium">
                      Credentials are encrypted with bank-grade AES-256-GCM. We never store them in plain text or share them with third parties.
                    </p>
                  </div>

                  <div className="flex gap-3 pt-3">
                    <Button
                      variant="outline"
                      className="flex-1 h-12 rounded-xl border-slate-200 text-slate-700 font-semibold hover:bg-slate-50"
                      onClick={() => setShowModal(false)}
                      type="button"
                    >
                      Cancel
                    </Button>
                      <Button
                      className="flex-1 h-12 rounded-xl text-white font-semibold transition-all hover:opacity-90 hover:scale-[1.02] shadow-md"
                      style={{ backgroundColor: selectedBroker.color }}
                      disabled={isConnecting}
                      type="submit"
                    >
                      {isConnecting ? "Connecting..." : (
                        <><CheckCircle2 className="h-5 w-5 mr-2" /> Connect Account</>
                      )}
                    </Button>
                  </div>
                </form>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
