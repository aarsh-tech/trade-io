type OriginCallback = (err: Error | null, allow?: boolean) => void;

const LOCAL_OR_LAN =
  /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/;

/**
 * Origin check shared by the socket.io gateways. Allows the origins listed in
 * FRONTEND_URL (comma separated); localhost / LAN origins are only allowed
 * outside production. Requests without an Origin header (non-browser clients)
 * are allowed here because the gateways authenticate every connection via JWT.
 */
export function socketOriginCheck(origin: string | undefined, callback: OriginCallback) {
  if (!origin) return callback(null, true);

  const clean = origin.replace(/\/$/, '');
  const allowed = (process.env.FRONTEND_URL || '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
  if (allowed.includes(clean)) return callback(null, true);

  if (process.env.NODE_ENV !== 'production' && LOCAL_OR_LAN.test(clean)) {
    return callback(null, true);
  }
  return callback(new Error(`Blocked by CORS: ${origin}`), false);
}
