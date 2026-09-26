"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Activity, BarChart2, History, SlidersHorizontal } from "lucide-react";
import type { DetailCtx } from "./useStrategyDetail";

export function TabsBar({ ctx }: { ctx: DetailCtx }) {
  const { strategy, activeTab, setActiveTab } = ctx;
  return (
    <>
      {/* ─── Navigation Tabs Bar ─── */}
      <div className="flex items-center gap-2 border-b border-border/60 pb-2 overflow-x-auto scrollbar-none">
        <Button
          variant={activeTab === "LIVE" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("LIVE")}
          className={cn(
            "text-xs h-8 px-3.5 rounded-lg font-semibold gap-1.5",
            activeTab === "LIVE" && "bg-primary text-primary-foreground hover:bg-brand-hover"
          )}
        >
          <Activity className="h-3.5 w-3.5" />
          Live Engine & Telemetry
        </Button>
        <Button
          variant={activeTab === "CONFIG" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("CONFIG")}
          className={cn(
            "text-xs h-8 px-3.5 rounded-lg font-semibold gap-1.5",
            activeTab === "CONFIG" && "bg-primary text-primary-foreground hover:bg-brand-hover"
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Parameters & Risk Rules
        </Button>
        <Button
          variant={activeTab === "ANALYTICS" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("ANALYTICS")}
          className={cn(
            "text-xs h-8 px-3.5 rounded-lg font-semibold gap-1.5",
            activeTab === "ANALYTICS" && "bg-primary text-primary-foreground hover:bg-brand-hover"
          )}
        >
          <BarChart2 className="h-3.5 w-3.5" />
          Performance Analytics
        </Button>
        <Button
          variant={activeTab === "HISTORY" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("HISTORY")}
          className={cn(
            "text-xs h-8 px-3.5 rounded-lg font-semibold gap-1.5",
            activeTab === "HISTORY" && "bg-primary text-primary-foreground hover:bg-brand-hover"
          )}
        >
          <History className="h-3.5 w-3.5" />
          Execution History ({strategy.executions?.length ?? 0})
        </Button>
      </div>

    </>
  );
}
