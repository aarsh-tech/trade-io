"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AlertCircle, Loader2, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { marketApi } from "@/lib/api";
import { cn } from "@/lib/utils";

export interface InstrumentHit {
  symbol: string;
  exchange: string;
  name?: string;
  segment?: string;
  lotSize?: number;
  ltp?: number;
  ltpNSE?: number;
  price?: number;
}

/** Debounced instrument search with keyboard navigation and explicit loading / empty / error states. */
export function InstrumentSearch({
  onSelect,
  label = "Search instrument",
  placeholder = "Type at least 2 letters, e.g. RELIANCE or NIFTY",
}: {
  onSelect: (item: InstrumentHit) => void;
  label?: string;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<InstrumentHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const reqId = useRef(0);
  const box = useRef<HTMLDivElement>(null);
  const listId = useId();
  const inputId = useId();

  const run = (q: string) => {
    const id = ++reqId.current;
    setLoading(true);
    setFailed(false);
    marketApi
      .search(q)
      .then((res) => {
        if (id !== reqId.current) return; // a newer keystroke superseded this request
        setResults(res.data?.data || []);
        setActive(0);
      })
      .catch(() => {
        if (id !== reqId.current) return;
        setResults([]);
        setFailed(true);
      })
      .finally(() => {
        if (id === reqId.current) setLoading(false);
      });
  };

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      reqId.current++;
      setResults([]);
      setLoading(false);
      setFailed(false);
      return;
    }
    const t = setTimeout(() => run(q), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const pick = (item: InstrumentHit) => {
    onSelect(item);
    setQuery("");
    setResults([]);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      // Never let Enter bubble up and advance the wizard while searching.
      e.preventDefault();
      e.stopPropagation();
      if (open && results[active]) pick(results[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const q = query.trim();
  const showPanel = open && q.length >= 2;

  return (
    <div ref={box} className="relative">
      <label htmlFor={inputId} className="mb-1.5 block text-xs font-semibold text-foreground">{label}</label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          id={inputId}
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showPanel && results[active] ? `${listId}-${active}` : undefined}
          autoComplete="off"
          value={query}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          className="pl-9 pr-10 font-semibold"
        />
        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Searching" />
          ) : query ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>

      {showPanel && (
        <div
          id={listId}
          role="listbox"
          className="absolute z-40 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-border bg-popover shadow-lg"
        >
          {failed ? (
            <div role="alert" className="flex items-center justify-between gap-3 p-3 text-xs text-loss">
              <span className="flex items-center gap-1.5"><AlertCircle className="h-4 w-4" /> Search failed. Check your connection.</span>
              <button type="button" onClick={() => run(q)} className="min-h-9 rounded-md px-2 font-semibold text-foreground hover:bg-muted">Retry</button>
            </div>
          ) : loading && results.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">Searching...</p>
          ) : results.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">No instruments match &ldquo;{q}&rdquo;.</p>
          ) : (
            results.map((item, i) => {
              const price = item.ltp || item.ltpNSE || item.price;
              return (
                <div
                  key={`${item.exchange}:${item.symbol}`}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(item)}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center justify-between gap-3 border-b border-border px-3 py-2 last:border-b-0",
                    i === active && "bg-muted",
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{item.symbol}</p>
                    {item.name && <p className="truncate text-xs uppercase text-muted-foreground">{item.name}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {item.lotSize && item.lotSize > 1 ? (
                      <Badge variant="warning" className="text-[10px]">Lot {item.lotSize}</Badge>
                    ) : null}
                    {price ? (
                      <span className="text-xs font-semibold tabular-nums text-foreground">
                        {"₹"}{Number(price).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </span>
                    ) : null}
                    <Badge variant="secondary" className="text-[10px]">{item.exchange}</Badge>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
