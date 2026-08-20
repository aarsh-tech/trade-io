import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

// In production, ENCRYPTION_KEY should be a 32-byte hex string in .env
const getEncryptionKeys = (): Buffer[] => {
  const secrets = Array.from(new Set([
    process.env.ENCRYPTION_SECRET,
    '8a7c2e4f1b9d3e5a0c6f7b8d9e2a1c4f5b6a7d8e9f0a1b2c3d4e5f6a7b8c9d0e',
    'fallback-secret-for-dev-only-change-it',
  ].filter(Boolean) as string[]));

  return secrets.map(secret => scryptSync(secret, 'salt', 32));
};

export function encrypt(text: string): string {
  const iv = randomBytes(IV_LENGTH);
  const key = getEncryptionKeys()[0];
  const cipher = createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag().toString('hex');
  
  // Format: iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decrypt(hash: string): string {
  if (!hash || !hash.includes(':')) {
    return hash;
  }

  const [ivHex, authTagHex, encryptedText] = hash.split(':');
  if (!ivHex || !authTagHex || !encryptedText) {
    return hash;
  }
  
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const keys = getEncryptionKeys();

  for (const key of keys) {
    try {
      const decipher = createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      if (decrypted) {
        return decrypted;
      }
    } catch {
      // try next key
    }
  }

  throw new Error('Unable to decrypt data with configured encryption secrets');
}
