/** Parsing and filtering for strategy engine log lines (`[5/10/2026, 9:31:02 am] 🟢 message`). */

export type LogKind = "PNL" | "SIGNAL" | "ORDER" | "ERROR" | "WARN" | "INFO";
export type LogFilter = "ALL" | "SIGNAL" | "ORDER" | "ERROR" | "PNL";

export interface ParsedLog {
  index: number;
  raw: string;
  /** Timestamp text as the engine wrote it, without brackets; null when absent. */
  time: string | null;
  text: string;
  kind: LogKind;
}

const STAMP = /^\[([^\]]+)\]\s*/;

export function classifyLog(text: string): LogKind {
  if (text.includes("[LIVE P&L]")) return "PNL";
  if (text.includes("❌") || /\b(error|failed|rejected|exception)\b/i.test(text)) return "ERROR";
  if (text.includes("⚠")) return "WARN";
  if (/\b(order|placed|filled|executed|square[- ]?off|stop[- ]?loss|SL (hit|trail))\b/i.test(text) || text.includes("✅")) return "ORDER";
  if (text.includes("🟢") || text.includes("🔴") || text.includes("⚡") || text.includes("🎯") || text.includes("⏰") || /\b(signal|breakout|crossover|entry|target)\b/i.test(text)) return "SIGNAL";
  return "INFO";
}

export function parseLogs(lines: string[]): ParsedLog[] {
  return lines.map((raw, index) => {
    const m = raw.match(STAMP);
    const text = m ? raw.slice(m[0].length) : raw;
    return { index, raw, time: m ? m[1] : null, text, kind: classifyLog(text) };
  });
}

const FILTER_KINDS: Record<Exclude<LogFilter, "ALL">, LogKind[]> = {
  SIGNAL: ["SIGNAL"],
  ORDER: ["ORDER"],
  ERROR: ["ERROR", "WARN"],
  PNL: ["PNL"],
};

export function countByFilter(logs: ParsedLog[]): Record<LogFilter, number> {
  const out: Record<LogFilter, number> = { ALL: logs.length, SIGNAL: 0, ORDER: 0, ERROR: 0, PNL: 0 };
  for (const l of logs) {
    for (const f of Object.keys(FILTER_KINDS) as Exclude<LogFilter, "ALL">[]) {
      if (FILTER_KINDS[f].includes(l.kind)) out[f]++;
    }
  }
  return out;
}

export function filterLogs(logs: ParsedLog[], filter: LogFilter, query: string): ParsedLog[] {
  const q = query.trim().toLowerCase();
  return logs.filter((l) => {
    if (filter !== "ALL" && !FILTER_KINDS[filter].includes(l.kind)) return false;
    return !q || l.raw.toLowerCase().includes(q);
  });
}

/** Most recent log of the given kind, newest first. */
export function lastOfKind(logs: ParsedLog[], kind: LogKind): ParsedLog | undefined {
  for (let i = logs.length - 1; i >= 0; i--) if (logs[i].kind === kind) return logs[i];
  return undefined;
}
