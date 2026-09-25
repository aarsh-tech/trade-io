/**
 * Kite Connect v3 error classification.
 *
 * Per the Kite docs, an expired/invalid session is reported as `TokenException`
 * (HTTP 403). Everything else (network errors, 429 rate limits, 5xx, order or
 * input errors) is NOT a session problem and must never flip a broker account
 * to EXPIRED.
 */
export function isKiteAuthError(err: any): boolean {
  if (!err) return false;
  const errType = String(err?.error_type ?? err?.data?.error_type ?? '').toLowerCase();
  const status = Number(err?.status ?? err?.response?.status ?? err?.data?.status_code ?? 0);
  if (errType === 'tokenexception') return true;
  if (status === 403) return true;
  // Kite's TokenException message: "Incorrect `api_key` or `access_token`."
  const msg = String(err?.message ?? '').toLowerCase();
  return msg.includes('incorrect `api_key` or `access_token`') || msg.includes('incorrect api_key or access_token');
}

/** True for errors that are worth a retry: network drops, timeouts, 429, 5xx. */
export function isKiteTransientError(err: any): boolean {
  if (!err) return false;
  const code = String(err?.code ?? '');
  const status = Number(err?.status ?? err?.response?.status ?? 0);
  return (
    ['ECONNABORTED', 'ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN'].includes(code) ||
    status === 429 ||
    status >= 500
  );
}
