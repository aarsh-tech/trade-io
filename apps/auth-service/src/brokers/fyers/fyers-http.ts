import axios, { AxiosInstance } from 'axios';
import { createHash } from 'crypto';
import { TokenBucket } from '../kite-rate-limiter';

/**
 * FYERS API v3 REST transport: auth header, rate limiting, and errors shaped like kiteconnect's
 * (`{ message, status, error_type }`) so `toKiteError` / `isKiteAuthError` classify them unchanged.
 *
 * Limits (FYERS v3, per app + user): 10 req/s, 200 req/min, 100,000 req/day, counted across every endpoint
 * including history and quotes. Repeated breaches can block the user for the day, so the buckets stay under them:
 * 8/s burst and ~180/min sustained.
 */
export const FYERS_API = 'https://api-t1.fyers.in/api/v3';
export const FYERS_DATA = 'https://api-t1.fyers.in/data';

/** `appIdHash` for validate-authcode / validate-refresh-token: sha256 of `app_id:app_secret`. */
export function fyersAppIdHash(appId: string, secret: string): string {
  return createHash('sha256').update(`${appId}:${secret}`).digest('hex');
}

/** The login page the user is sent to; FYERS redirects back with `auth_code` and our `state`. */
export function fyersLoginUrl(appId: string, redirectUri: string, state: string): string {
  const q = new URLSearchParams({ client_id: appId, redirect_uri: redirectUri, response_type: 'code', state });
  return `${FYERS_API}/generate-authcode?${q.toString()}`;
}

/** Exchanges an auth code for `{ access_token, refresh_token }`. */
export async function fyersValidateAuthCode(appId: string, secret: string, authCode: string): Promise<{ access_token: string; refresh_token?: string }> {
  try {
    const res = await axios.post(`${FYERS_API}/validate-authcode`, {
      grant_type: 'authorization_code',
      appIdHash: fyersAppIdHash(appId, secret),
      code: authCode,
    }, { timeout: 15000 });
    const data = res.data || {};
    if (data.s !== 'ok' || !data.access_token) throw fyersError(data, res.status);
    return { access_token: data.access_token, refresh_token: data.refresh_token };
  } catch (err: any) {
    throw err?.error_type ? err : fyersError(err?.response?.data, err?.response?.status, err);
  }
}

/** FYERS codes that mean the session is gone (expired, invalid or revoked token). */
const TOKEN_CODES = new Set([-8, -15, -16, -17, -300]);

/** Turns a FYERS error body into a kiteconnect-shaped error. */
export function fyersError(body: any, status?: number, cause?: any): Error & { status?: number; error_type: string; code?: any; data?: any } {
  const code = Number(body?.code);
  const message = String(body?.message || cause?.message || `FYERS request failed${status ? ` (HTTP ${status})` : ''}`);
  const lower = message.toLowerCase();
  let error_type = 'GeneralException';
  let outStatus = status;
  if (status === 429 || code === 429 || lower.includes('limit exceeded') || lower.includes('too many')) {
    error_type = 'GeneralException';
    outStatus = 429;
  } else if (status === 401 || TOKEN_CODES.has(code) || lower.includes('token') && (lower.includes('expired') || lower.includes('invalid'))
    || lower.includes('could not authenticate')) {
    error_type = 'TokenException';
    outStatus = 403;
  } else if (lower.includes('margin') || lower.includes('insufficient') || lower.includes('funds')) {
    error_type = 'MarginException';
  } else if (code === -50 || code === -51 || code === -53 || lower.includes('invalid') || lower.includes('symbol')) {
    error_type = 'InputException';
  } else if (lower.includes('order') || lower.includes('reject')) {
    error_type = 'OrderException';
  }
  const err: any = new Error(message);
  err.status = outStatus;
  err.error_type = error_type;
  err.code = cause?.code ?? body?.code;
  err.data = body;
  return err;
}

interface Buckets { second: TokenBucket; minute: TokenBucket }
const bucketsByApp = new Map<string, Buckets>();

function bucketsFor(appId: string): Buckets {
  let b = bucketsByApp.get(appId);
  if (!b) {
    // Second: 8 burst, 8/s. Minute: 20 burst + 3/s refill keeps any 60s window at or below ~200.
    b = { second: new TokenBucket(8, 8), minute: new TokenBucket(20, 3) };
    bucketsByApp.set(appId, b);
  }
  return b;
}

export class FyersHttp {
  private readonly http: AxiosInstance;
  readonly stats = { requests: 0, rateLimited: 0 };

  constructor(readonly appId: string, private readonly accessToken: string | null) {
    this.http = axios.create({ timeout: 15000 });
  }

  get hasSession(): boolean {
    return !!this.accessToken;
  }

  private async request<T = any>(method: 'get' | 'post' | 'patch' | 'delete', url: string, opts: { params?: any; data?: any } = {}): Promise<T> {
    if (!this.accessToken) throw fyersError({ code: -16, message: 'FYERS access token missing: log in to FYERS first' }, 401);
    const buckets = bucketsFor(this.appId);
    for (let attempt = 0; ; attempt++) {
      await buckets.second.acquire();
      await buckets.minute.acquire();
      this.stats.requests++;
      try {
        const res = await this.http.request({
          method,
          url,
          params: opts.params,
          data: opts.data,
          headers: { Authorization: `${this.appId}:${this.accessToken}`, 'Content-Type': 'application/json' },
        });
        const body = res.data;
        if (body && body.s && body.s !== 'ok' && body.s !== 'no_data') throw fyersError(body, res.status);
        return body as T;
      } catch (err: any) {
        const shaped = err?.error_type ? err : fyersError(err?.response?.data, err?.response?.status, err);
        if (shaped.status === 429 && attempt < 2) {
          this.stats.rateLimited++;
          buckets.second.drain();
          buckets.minute.drain();
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        throw shaped;
      }
    }
  }

  get<T = any>(url: string, params?: any) { return this.request<T>('get', url, { params }); }
  post<T = any>(url: string, data?: any) { return this.request<T>('post', url, { data }); }
  patch<T = any>(url: string, data?: any) { return this.request<T>('patch', url, { data }); }
  delete<T = any>(url: string, data?: any) { return this.request<T>('delete', url, { data }); }
}
