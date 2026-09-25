const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const KITE_TS = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/;

/**
 * Kite timestamps are IST wall-clock times with no zone ("2026-09-26 09:16:39"), and the kiteconnect client turns
 * them into Dates using the *server's* zone. Reading the local components back and treating them as IST gives the
 * right instant on any server timezone. Values that already carry a zone (ISO with Z/offset) are used as they are.
 */
export function parseKiteTime(value: unknown): Date | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    return new Date(
      Date.UTC(value.getFullYear(), value.getMonth(), value.getDate(), value.getHours(), value.getMinutes(), value.getSeconds()) -
        IST_OFFSET_MS,
    );
  }
  const str = String(value).trim();
  const m = KITE_TS.exec(str);
  if (m) {
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) - IST_OFFSET_MS);
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}
