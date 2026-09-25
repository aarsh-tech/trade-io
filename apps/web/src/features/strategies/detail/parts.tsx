"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Terminal } from "lucide-react";
import { useState } from "react";
import type { Execution } from "./types";

export function Field({
  label,
  value,
  editing,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  editing: boolean;
  onChange?: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
      {editing && onChange ? (
        <Input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 text-xs bg-secondary/30"
        />
      ) : (
        <p className="text-sm font-bold text-foreground">{value}</p>
      )}
    </div>
  );
}

export function ExecutionRow({ execution: ex }: { execution: Execution }) {
  const [open, setOpen] = useState(false);
  let parsedLogs: string[] = [];
  try {
    parsedLogs = JSON.parse(ex.logs || "[]");
  } catch {
    parsedLogs = [];
  }

  return (
    <div className="flex items-center justify-between p-3 rounded-xl bg-card border border-border/70 shadow-2xs hover:border-border transition-colors">
      <div>
        <p className="text-xs font-mono font-bold text-foreground">
          {ex.id.slice(0, 12)}…
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {new Date(ex.startedAt).toLocaleString("en-IN")}
          {ex.stoppedAt && ` → ${new Date(ex.stoppedAt).toLocaleString("en-IN")}`}
        </p>
        {ex.errorMsg && <p className="text-xs text-rose-500 mt-0.5 font-medium">{ex.errorMsg}</p>}
      </div>

      <div className="flex items-center gap-3">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
              <Terminal className="h-3 w-3" />
              View Logs
            </Button>
          </DialogTrigger>
          <DialogContent className="!max-w-7xl p-6 rounded-2xl max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base font-mono">
                <Terminal className="h-4 w-4 text-emerald-500" />
                Session Execution Logs
              </DialogTitle>
              <DialogDescription className="text-xs">
                Started: {new Date(ex.startedAt).toLocaleString("en-IN")}
              </DialogDescription>
            </DialogHeader>
            <div className="h-[450px] overflow-y-auto bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs text-emerald-400 space-y-1 select-text scrollbar-thin">
              {parsedLogs.length === 0 ? (
                <p className="text-slate-500 italic">No logs recorded for this session.</p>
              ) : (
                parsedLogs.map((line, i) => (
                  <div
                    key={i}
                    className={cn(
                      "leading-relaxed break-words",
                      line.includes("❌") && "text-rose-400",
                      line.includes("⚠") && "text-amber-400",
                      line.includes("🟢") && "text-emerald-300 font-bold",
                      line.includes("🔴") && "text-rose-300 font-bold",
                      line.includes("✅") && "text-emerald-400"
                    )}
                  >
                    {line}
                  </div>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>

        <Badge
          className={cn(
            "text-[10px] font-bold uppercase",
            ex.status === "RUNNING"
              ? "bg-emerald-500/15 text-emerald-600 border border-emerald-500/30"
              : ex.status === "STOPPED"
                ? "bg-amber-500/15 text-amber-600 border border-amber-500/30"
                : ex.status === "ERROR"
                  ? "bg-rose-500/15 text-rose-600 border border-rose-500/30"
                  : "bg-muted text-muted-foreground border-border"
          )}
        >
          {ex.status}
        </Badge>
      </div>
    </div>
  );
}
