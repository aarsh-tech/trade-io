/**
 * Zerodha login is opened in a new tab (`window.open`), so a successful login there only updates
 * that tab's own React Query cache. Writing this localStorage key fires a `storage` event in every
 * other open tab on the same origin, letting them refetch broker/portfolio state immediately instead
 * of waiting on `refetchOnWindowFocus` (which only fires once that tab regains focus, and only if its
 * cached data has gone stale).
 */
export const BROKER_SESSION_SYNC_KEY = "broker-session-sync";

export function broadcastBrokerSessionRenewed() {
  try {
    localStorage.setItem(BROKER_SESSION_SYNC_KEY, String(Date.now()));
  } catch {
    // Storage can be unavailable (private browsing, disabled cookies); the writing tab already
    // refetched its own cache, so this broadcast is a best-effort convenience for other tabs.
  }
}
