/**
 * Lines an engine keeps in memory and persists per execution. Sized to hold a full trading session
 * of monitor lines, so the console on the strategy page never loses the morning's history.
 */
export const MAX_ENGINE_LOGS = 1500;

/** Appends a line and drops only the oldest lines beyond the cap (never a big chunk at once). */
export function pushEngineLog(logs: string[], line: string): void {
  logs.push(line);
  if (logs.length > MAX_ENGINE_LOGS) logs.splice(0, logs.length - MAX_ENGINE_LOGS);
}
