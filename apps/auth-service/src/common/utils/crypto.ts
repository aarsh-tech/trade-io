import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const SALT_LENGTH = 16;
const VERSION_PREFIX = 'v1:';
const MIN_SECRET_LENGTH = 32;
// Legacy (pre-v1) records were derived with this constant salt.
const LEGACY_SALT = 'salt';

/**
 * Formats:
 *   v1:<salt>:<iv>:<authTag>:<ciphertext>   (hex, per-record salt) - written by encrypt()
 *   <iv>:<authTag>:<ciphertext>             (legacy, constant salt) - still readable
 *   anything else                           (legacy plaintext) - returned unchanged
 */

/** Throws if ENCRYPTION_SECRET is missing or too short. Call at boot. */
export function assertEncryptionConfigured(): string {
  const secret = process.env.ENCRYPTION_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `ENCRYPTION_SECRET must be set to a random string of at least ${MIN_SECRET_LENGTH} characters ` +
      `(generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")`,
    );
  }
  return secret;
}

// Old secrets, only used to read legacy records during key rotation/migration.
// Comma-separated LEGACY_ENCRYPTION_SECRETS; remove once the migration has run.
function getLegacySecrets(): string[] {
  const extra = (process.env.LEGACY_ENCRYPTION_SECRETS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  return Array.from(new Set([assertEncryptionConfigured(), ...extra]));
}

const keyCache = new Map<string, Buffer>();
function deriveKey(secret: string, salt: string | Buffer): Buffer {
  const saltId = Buffer.isBuffer(salt) ? salt.toString('hex') : `s:${salt}`;
  const cacheKey = `${secret}\u0000${saltId}`;
  let key = keyCache.get(cacheKey);
  if (!key) {
    key = scryptSync(secret, salt, 32);
    keyCache.set(cacheKey, key);
  }
  return key;
}

export function encrypt(text: string): string {
  const secret = assertEncryptionConfigured();
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  // Fresh salt per record: derive without caching so the cache doesn't grow unbounded.
  const key = scryptSync(secret, salt, 32);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${VERSION_PREFIX}${salt.toString('hex')}:${iv.toString('hex')}:${authTag}:${encrypted}`;
}

function decipher(key: Buffer, ivHex: string, authTagHex: string, cipherHex: string): string {
  const d = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
  d.setAuthTag(Buffer.from(authTagHex, 'hex'));
  return d.update(cipherHex, 'hex', 'utf8') + d.final('utf8');
}

/** True if the value is in the current versioned format. */
export function isCurrentFormat(value: string | null | undefined): boolean {
  return !!value && value.startsWith(VERSION_PREFIX);
}

export function decrypt(hash: string): string {
  if (!hash) return hash;

  if (hash.startsWith(VERSION_PREFIX)) {
    const [saltHex, ivHex, authTagHex, encrypted] = hash.slice(VERSION_PREFIX.length).split(':');
    if (!saltHex || !ivHex || !authTagHex || encrypted === undefined) {
      throw new Error('Malformed v1 ciphertext');
    }
    const salt = Buffer.from(saltHex, 'hex');
    // Current secret first, then legacy secrets (covers a rotation window).
    for (const secret of getLegacySecrets()) {
      try {
        return decipher(deriveKey(secret, salt), ivHex, authTagHex, encrypted);
      } catch {
        // try next secret
      }
    }
    throw new Error('Unable to decrypt data with configured encryption secrets');
  }

  const parts = hash.split(':');
  if (parts.length !== 3 || !parts.every(p => /^[0-9a-f]+$/i.test(p))) {
    return hash; // legacy plaintext
  }

  const [ivHex, authTagHex, encrypted] = parts;
  for (const secret of getLegacySecrets()) {
    try {
      return decipher(deriveKey(secret, LEGACY_SALT), ivHex, authTagHex, encrypted);
    } catch {
      // try next secret
    }
  }
  throw new Error('Unable to decrypt data with configured encryption secrets');
}
