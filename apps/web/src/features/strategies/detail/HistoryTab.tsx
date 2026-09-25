"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { History } from "lucide-react";
import type { DetailCtx } from "./useStrategyDetail";
import { ExecutionRow } from "./parts";

export function HistoryTab({ ctx }: { ctx: DetailCtx }) {
  const { strategy, activeTab } = ctx;
  return (
    <>
      {/* ─── TAB 4: EXECUTION HISTORY ─── */}
      {activeTab === "HISTORY" && (
        <Card className="border-border/60 bg-card rounded-2xl shadow-sm">
          <CardHeader className="p-5 border-b border-border/60">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <History className="h-4 w-4 text-blue-500" />
              Past Execution Sessions ({strategy.executions?.length ?? 0})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            {strategy.executions?.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground">
                <History className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
                No execution sessions recorded yet.
              </div>
            ) : (
              <div className="space-y-2.5">
                {strategy.executions.map((ex) => (
                  <ExecutionRow key={ex.id} execution={ex} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}
