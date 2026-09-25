import { randomBytes } from 'crypto';
import { Logger } from '@nestjs/common';

let devSecret: string | undefined;

/**
 * Resolves the JWT signing secret. Production must set JWT_SECRET (boot fails
 * otherwise). Outside production a random per-process secret is used, so no
 * secret literal lives in the repo; tokens simply reset on restart.
 */
export function resolveJwtSecret(value: string | undefined): string {
  if (value && value.trim()) return value;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set in production');
  }
  if (!devSecret) {
    devSecret = randomBytes(48).toString('hex');
    new Logger('JwtSecret').warn('JWT_SECRET not set; using a random per-process secret (dev only)');
  }
  return devSecret;
}
