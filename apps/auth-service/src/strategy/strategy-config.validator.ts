import { BadRequestException } from '@nestjs/common';

/**
 * Server-side guard for the JSON `config` a strategy is saved with. The engines read these values
 * straight into order sizing and risk, so a NaN/negative/inverted value must be refused here rather
 * than discovered mid-session. Mirrored in apps/web/src/lib/strategy-config.ts (keep them in sync).
 *
 * `null` counts as "not set": the wizard serialises an empty numeric input as null (JSON.stringify(NaN)).
 */

type Cfg = Record<string, unknown>;

const isSet = (v: unknown) => v !== undefined && v !== null && v !== '';
const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** [key, label, min, max, integer] — bounds are inclusive. */
const RANGES: [string, string, number, number, boolean][] = [
  ['lots', 'Lots', 1, 500, true],
  ['qty', 'Quantity', 1, 1_000_000, true],
  ['maxTradesPerDay', 'Max trades per day', 1, 100, true],
  ['maxLossesPerDay', 'Max losses per day', 1, 50, true],
  ['maxWinsPerDay', 'Max wins per day', 1, 50, true],
  ['maxConvictionLots', 'Max conviction lots', 1, 500, true],
  ['maxLots', 'Max lots', 1, 500, true],
  ['emaPeriod', 'EMA period', 2, 500, true],
  ['emaFast', 'Fast EMA', 2, 500, true],
  ['emaSlow', 'Slow EMA', 2, 500, true],
  ['rsiPeriod', 'RSI period', 2, 200, true],
  ['stopLossRs', 'Stop-loss (₹)', 0.01, 100_000_000, false],
  ['targetRs', 'Target (₹)', 0.01, 100_000_000, false],
  ['dailyTargetRs', 'Daily target (₹)', 0.01, 100_000_000, false],
  ['dailyMaxLossRs', 'Daily max loss (₹)', 0.01, 100_000_000, false],
  ['maxCapital', 'Max capital (₹)', 1, 1_000_000_000, false],
  ['riskRewardRatio', 'Risk:reward ratio', 0.1, 50, false],
  ['target1RR', 'Target 1 R-multiple', 0.1, 50, false],
  ['target2RR', 'Target 2 R-multiple', 0.1, 50, false],
  ['partialBookingPct', 'Partial booking %', 1, 99, false],
  ['initialSlPct', 'Initial SL %', 1, 99, false],
  ['protectionBufferPct', 'Protection buffer %', 0, 50, false],
  ['minPremium', 'Min premium', 0, 1_000_000, false],
  ['maxPremium', 'Max premium', 0, 1_000_000, false],
];

const TIME_FIELDS: [string, string][] = [
  ['startTime', 'Start time'],
  ['endTime', 'End time'],
  ['primeWindowEndTime', 'Prime window end'],
  ['middayDeadZoneStart', 'Midday dead-zone start'],
  ['middayDeadZoneEnd', 'Midday dead-zone end'],
  ['entryCutoffTime', 'Entry cutoff'],
];

const REQUIRED_BY_TYPE: Record<string, string[]> = {
  BREAKOUT_15MIN: ['symbol', 'stopLossRs', 'targetRs'],
  EMA_VWAP_CROSSOVER: ['symbol', 'stopLossRs', 'targetRs'],
  EMA_RSI_OPTIONS: ['symbol', 'stopLossRs', 'targetRs'],
  STOCK_OPTIONS_BUYING: ['maxCapital', 'riskRewardRatio'],
  DAILY_SCALPER: ['symbol'],
  NIFTY_OPTIONS_SCALPER: ['symbol'],
  GAMMA_BLAST_EXPIRY: [],
};

const PRODUCTS = ['MIS', 'NRML', 'CNC'];

export function validateStrategyConfig(type: string, config: Cfg): string[] {
  const errors: string[] = [];

  for (const key of REQUIRED_BY_TYPE[type] ?? []) {
    if (!isSet(config[key])) errors.push(`${key} is required for ${type}`);
  }

  for (const [key, label, min, max, integer] of RANGES) {
    const raw = config[key];
    if (!isSet(raw)) continue;
    const n = num(raw);
    if (!Number.isFinite(n)) errors.push(`${label} must be a number`);
    else if (integer && !Number.isInteger(n)) errors.push(`${label} must be a whole number`);
    else if (n < min || n > max) errors.push(`${label} must be between ${min} and ${max}`);
  }

  if (isSet(config.product) && !PRODUCTS.includes(String(config.product))) {
    errors.push(`Product must be one of ${PRODUCTS.join(', ')}`);
  }
  if (isSet(config.symbol) && String(config.symbol).trim() === '') errors.push('Symbol must not be blank');

  const times: Record<string, number> = {};
  for (const [key, label] of TIME_FIELDS) {
    if (!isSet(config[key])) continue;
    const t = String(config[key]);
    if (!TIME_RE.test(t)) errors.push(`${label} must be a time as HH:MM (24-hour)`);
    else times[key] = toMinutes(t);
  }
  if (times.startTime !== undefined && times.endTime !== undefined && times.startTime >= times.endTime) {
    errors.push('Start time must be before end time');
  }
  if (times.middayDeadZoneStart !== undefined && times.middayDeadZoneEnd !== undefined && times.middayDeadZoneStart >= times.middayDeadZoneEnd) {
    errors.push('Midday dead-zone start must be before its end');
  }

  const pair = (lo: string, hi: string, label: string) => {
    if (isSet(config[lo]) && isSet(config[hi]) && num(config[lo]) > num(config[hi])) errors.push(label);
  };
  pair('minPremium', 'maxPremium', 'Min premium must not exceed max premium');
  pair('minPremiumNifty', 'maxPremiumNifty', 'Min NIFTY premium must not exceed max NIFTY premium');
  pair('minPremiumSensex', 'maxPremiumSensex', 'Min SENSEX premium must not exceed max SENSEX premium');
  if (isSet(config.target1RR) && isSet(config.target2RR) && num(config.target2RR) <= num(config.target1RR)) {
    errors.push('Target 2 R-multiple must be greater than Target 1');
  }
  if (isSet(config.emaFast) && isSet(config.emaSlow) && num(config.emaFast) >= num(config.emaSlow)) {
    errors.push('Fast EMA must be shorter than slow EMA');
  }
  if (isSet(config.rsiEntryMin) && isSet(config.rsiEntryMax) && num(config.rsiEntryMin) >= num(config.rsiEntryMax)) {
    errors.push('RSI entry minimum must be below the maximum');
  }

  return errors;
}

/** Parses the stored JSON string and validates it; throws 400 listing every problem. */
export function assertValidStrategyConfig(type: string, rawConfig: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawConfig);
  } catch {
    throw new BadRequestException('Strategy config is not valid JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new BadRequestException('Strategy config must be a JSON object');
  }
  const errors = validateStrategyConfig(type, parsed as Cfg);
  if (errors.length > 0) throw new BadRequestException({ message: errors, error: 'Invalid strategy config' });
}
