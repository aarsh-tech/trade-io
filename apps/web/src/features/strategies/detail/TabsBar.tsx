"use client";

import { cn } from "@/lib/utils";
import { Activity, BarChart2, History, SlidersHorizontal } from "lucide-react";
import type { DetailCtx } from "./useStrategyDetail";

const TABS = [
  { id: "LIVE", label: "Live", icon: Activity },
  { id: "CONFIG", label: "Config", icon: SlidersHorizontal },
  { id: "ANALYTICS", label: "Analytics", icon: BarChart2 },
  { id: "HISTORY", label: "History", icon: History },
] as const;

export function TabsBar({ ctx }: { ctx: DetailCtx }) {
  const { strategy, activeTab, setActiveTab } = ctx;
  const sessions = strategy.executions?.length ?? 0;
  return (
    // Sticks under the top bar while the page scrolls; negative margins let the border run edge to edge.
    <div className="sticky top-0 z-20 -mx-3 border-b border-border bg-background/95 px-3 backdrop-blur sm:-mx-4 sm:px-4 lg:-mx-5 lg:px-5">
      <div role="tablist" aria-label="Strategy sections" className="grid grid-cols-4 gap-1 md:flex md:gap-2">
        {TABS.map(({ id, label, icon: Icon }) => {
          const selected = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setActiveTab(id)}
              className={cn(
                "relative flex h-11 items-center justify-center gap-1.5 px-1 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:px-4",
                selected ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="hidden h-4 w-4 sm:block" aria-hidden />
              {label}
              {id === "HISTORY" && sessions > 0 && <span className="num text-xs text-muted-foreground">{sessions}</span>}
              {selected && <span className="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-primary" aria-hidden />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
