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

/**
 * A `RUNNING` execution row that `start()` finds still open means the previous run never
 * stopped cleanly — the process crashed, hit its memory cap, or was redeployed — not that the
 * user asked for a fresh session. Without this, `start()` always spins up a brand-new execution
 * with an empty in-memory log buffer, so the console the user is watching suddenly loses the
 * whole day's history the moment the engine reconnects. Reusing that row's persisted lines lets
 * the console resume where it left off instead of silently truncating mid-session.
 */
export async function loadResumableLogs(
  prisma: { strategyExecution: { findFirst: (args: any) => Promise<{ logs: string | null } | null> } },
  strategyId: string,
): Promise<string[]> {
  const stale = await prisma.strategyExecution
    .findFirst({ where: { strategyId, status: 'RUNNING' }, orderBy: { startedAt: 'desc' } })
    .catch(() => null);
  if (!stale?.logs) return [];
  try {
    const parsed = JSON.parse(stale.logs);
    return Array.isArray(parsed) ? parsed.slice(-MAX_ENGINE_LOGS) : [];
  } catch {
    return [];
  }
}
