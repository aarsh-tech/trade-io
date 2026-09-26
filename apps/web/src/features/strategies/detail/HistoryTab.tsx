"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { History, Terminal } from "lucide-react";
import { useState } from "react";
import type { Execution } from "./types";
import type { DetailCtx } from "./useStrategyDetail";
import { EmptyState, SectionCard } from "./shared";

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

function duration(ex: Execution): string {
  if (!ex.stoppedAt) return ex.status === "RUNNING" ? "In progress" : "—";
  const mins = Math.max(0, Math.round((new Date(ex.stoppedAt).getTime() - new Date(ex.startedAt).getTime()) / 60000));
  return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === "RUNNING" ? "bg-profit-subtle text-profit border-profit/30"
    : status === "ERROR" ? "bg-loss-subtle text-loss border-loss/30"
    : status === "COMPLETED" ? "bg-info-subtle text-info border-info/30"
    : status === "STOPPED" ? "bg-warn-subtle text-warn border-warn/30"
    : "bg-muted text-muted-foreground border-border";
  return <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide", cls)}>{status}</span>;
}

function parseLogs(raw: string): string[] {
  try {
    const v = JSON.parse(raw || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function LogsDialog({ execution, onClose }: { execution: Execution | null; onClose: () => void }) {
  const lines = execution ? parseLogs(execution.logs) : [];
  return (
    <Dialog open={Boolean(execution)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] w-[calc(100%-2rem)] !max-w-3xl flex-col rounded-lg p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Terminal className="h-4 w-4" aria-hidden /> Session logs
          </DialogTitle>
          <DialogDescription className="text-xs">{execution ? `Started ${fmt(execution.startedAt)}` : ""}</DialogDescription>
        </DialogHeader>
        <div className="h-[55vh] select-text overflow-y-auto rounded-md border border-border bg-log-bg p-3 font-code text-xs text-log-text">
          {lines.length === 0 ? (
            <p className="italic text-muted-foreground">No logs recorded for this session.</p>
          ) : (
            lines.map((l, i) => (
              <div key={i} className="break-words py-px leading-[18px]">
                {l}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function HistoryTab({ ctx }: { ctx: DetailCtx }) {
  const { strategy, activeTab } = ctx;
  const [viewing, setViewing] = useState<Execution | null>(null);
  if (activeTab !== "HISTORY") return null;

  const sessions = strategy.executions ?? [];

  return (
    <SectionCard title={`Sessions (${sessions.length})`} icon={<History className="h-3.5 w-3.5" aria-hidden />}>
      {sessions.length === 0 ? (
        <EmptyState icon={<History className="h-8 w-8" aria-hidden />} title="No sessions yet" hint="Each time you start this strategy, the run is recorded here with its logs." />
      ) : (
        <>
          {/* Phone: one card per session */}
          <ul className="divide-y divide-border md:hidden">
            {sessions.map((ex) => (
              <li key={ex.id} className="space-y-2 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-foreground">{fmt(ex.startedAt)}</span>
                  <StatusPill status={ex.status} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Duration <span className="num font-medium text-foreground">{duration(ex)}</span>
                  {ex.stoppedAt && <> · ended {fmt(ex.stoppedAt)}</>}
                </p>
                {ex.errorMsg && <p className="text-xs font-medium text-loss">{ex.errorMsg}</p>}
                <Button variant="outline" size="default" className="w-full" onClick={() => setViewing(ex)}>
                  <Terminal className="h-4 w-4" aria-hidden /> View logs
                </Button>
              </li>
            ))}
          </ul>

          {/* Tablet and up: table */}
          <div className="hidden md:block">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5 font-semibold">Started</th>
                  <th className="px-4 py-2.5 font-semibold">Ended</th>
                  <th className="px-4 py-2.5 font-semibold">Duration</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Logs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {sessions.map((ex) => (
                  <tr key={ex.id} className="hover:bg-muted/40">
                    <td className="px-4 py-2.5 font-medium text-foreground">{fmt(ex.startedAt)}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{ex.stoppedAt ? fmt(ex.stoppedAt) : "—"}</td>
                    <td className="num px-4 py-2.5 text-muted-foreground">{duration(ex)}</td>
                    <td className="px-4 py-2.5">
                      <StatusPill status={ex.status} />
                      {ex.errorMsg && <p className="mt-1 max-w-xs truncate text-xs text-loss" title={ex.errorMsg}>{ex.errorMsg}</p>}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Button variant="outline" size="sm" onClick={() => setViewing(ex)}>
                        <Terminal className="h-3.5 w-3.5" aria-hidden /> View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <LogsDialog execution={viewing} onClose={() => setViewing(null)} />
    </SectionCard>
  );
}
