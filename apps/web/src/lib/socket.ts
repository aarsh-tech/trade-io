import { getSocketBaseUrl, requestTokenRefresh } from "@/lib/api";
import { io, type ManagerOptions, type Socket, type SocketOptions } from "socket.io-client";

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 15000;

/**
 * Connects to a gateway namespace and keeps the socket alive.
 *
 * socket.io only auto-reconnects on network/transport failures. When the *server* ends the session
 * (reason "io server disconnect": our gateways do this for an expired or invalid JWT) the client stays
 * disconnected for good. So on that reason we refresh the access token and reconnect ourselves, with
 * backoff. The handshake token is read from localStorage on every attempt, so a refreshed token is
 * always the one sent. A tab returning to the foreground or the browser coming back online also
 * revives a socket that gave up while it was asleep.
 *
 * Returns the socket and a `dispose` that stops every listener and timer created here.
 */
export function connectAuthedSocket(
  namespace: string,
  options: Partial<ManagerOptions & SocketOptions> = {},
): { socket: Socket; dispose: () => void } {
  const socket = io(`${getSocketBaseUrl()}${namespace}`, {
    transports: ["websocket", "polling"],
    withCredentials: true,
    // A function, so every (re)connect handshake uses the current token after a refresh.
    auth: (cb) => cb({ token: localStorage.getItem("accessToken") }),
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: RECONNECT_BASE_MS,
    reconnectionDelayMax: RECONNECT_MAX_MS,
    timeout: 20000,
    ...options,
  });

  let disposed = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let serverDrops = 0;

  const clearRetry = () => {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
  };

  const reviveAfterServerDisconnect = () => {
    if (disposed || retryTimer) return;
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** serverDrops, RECONNECT_MAX_MS);
    serverDrops += 1;
    retryTimer = setTimeout(async () => {
      retryTimer = null;
      if (disposed || socket.connected) return;
      try {
        await requestTokenRefresh();
      } catch {
        // Offline or backend restarting: still retry below, the next handshake will tell.
      }
      if (!disposed && !socket.connected) socket.connect();
    }, delay);
  };

  const onDisconnect = (reason: string) => {
    if (reason === "io server disconnect") reviveAfterServerDisconnect();
  };
  const onConnect = () => {
    serverDrops = 0;
    clearRetry();
  };
  const wake = () => {
    if (disposed || socket.connected || socket.active) return;
    socket.connect();
  };
  const onVisible = () => {
    if (document.visibilityState === "visible") wake();
  };

  socket.on("disconnect", onDisconnect);
  socket.on("connect", onConnect);
  window.addEventListener("online", wake);
  document.addEventListener("visibilitychange", onVisible);

  return {
    socket,
    dispose: () => {
      disposed = true;
      clearRetry();
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", onVisible);
      socket.off("disconnect", onDisconnect);
      socket.off("connect", onConnect);
      socket.disconnect();
    },
  };
}
