/**
 * Typed Kite Connect errors. Kite reports failures as `error_type` strings; mapping them to
 * classes lets callers tell "session expired" from "bad input" from "network blip" instead of
 * treating every failure as "no data".
 */

export class KiteError extends Error {
  /** Only network, rate-limit and 5xx failures are safe to retry blindly. */
  readonly retryable: boolean = false;

  constructor(message: string, readonly status?: number, readonly cause?: unknown) {
    super(message);
    this.name = new.target.name;
  }
}

/** Access token missing, expired or invalid: the user must log in again. */
export class TokenException extends KiteError {}
/** Missing/invalid parameters or an unknown instrument. */
export class InputException extends KiteError {}
/** The order was rejected or could not be fetched/placed. */
export class OrderException extends KiteError {}
/** Insufficient funds or margin. */
export class MarginException extends KiteError {}
/** API key lacks permission, e.g. IP not whitelisted. */
export class PermissionException extends KiteError {}
/** Kite could not reach the OMS/exchange, or the socket failed. Retryable. */
export class NetworkException extends KiteError {
  readonly retryable = true;
}
/** Kite answered 429. Retryable after back-off. */
export class RateLimitException extends KiteError {
  readonly retryable = true;
}
/** Anything else, including 5xx responses (retryable when the status is 5xx). */
export class GeneralKiteException extends KiteError {
  readonly retryable: boolean;
  constructor(message: string, status?: number, cause?: unknown) {
    super(message, status, cause);
    this.retryable = status !== undefined && status >= 500;
  }
}

const NETWORK_CODES = new Set(['ECONNABORTED', 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE']);

/** Classifies whatever the kiteconnect client threw into a KiteError. Idempotent. */
export function toKiteError(err: any): KiteError {
  if (err instanceof KiteError) return err;
  const message = String(err?.message || err?.data?.message || err || 'Unknown Kite error');
  const status: number | undefined = err?.status ?? err?.response?.status;
  const type: string | undefined = err?.error_type ?? err?.data?.error_type;
  const lower = message.toLowerCase();

  if (status === 429 || lower.includes('too many requests')) return new RateLimitException(message, 429, err);
  if (type === 'TokenException' || status === 403 && (lower.includes('access_token') || lower.includes('api_key')) || lower.includes('incorrect `api_key` or `access_token`')) {
    return new TokenException(message, status, err);
  }
  if (type === 'PermissionException' || lower.includes('no ips configured')) return new PermissionException(message, status, err);
  if (type === 'InputException') return new InputException(message, status, err);
  if (type === 'MarginException') return new MarginException(message, status, err);
  if (type === 'OrderException') return new OrderException(message, status, err);
  if (type === 'NetworkException' || NETWORK_CODES.has(err?.code) || [...NETWORK_CODES].some(c => message.includes(c))) {
    return new NetworkException(message, status, err);
  }
  return new GeneralKiteException(message, status, err);
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/**
 * Runs a Kite read, retrying only failures that are safe to retry (network, 429, 5xx).
 * Any other failure, and the last retryable one, is thrown as a KiteError so the caller
 * decides explicitly what "could not fetch" means instead of silently treating it as "empty".
 * Use for reads only: order placement has its own idempotency rules.
 */
export async function withKiteRetry<T>(fn: () => Promise<T>, attempts = 3, baseMs = 300): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const kerr = toKiteError(err);
      if (!kerr.retryable || attempt >= attempts) throw kerr;
      await sleep(baseMs * 2 ** (attempt - 1) + Math.random() * 100);
    }
  }
}
