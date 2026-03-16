import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

function getKey(): Buffer {
  const secret = process['env']['CONNECTOR_SECRET'] || 'docatflow-default-key-32-chars!!';
  return crypto.scryptSync(secret, 'salt-docatflow', 32);
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns format: ivHex:authTagHex:ciphertextHex
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt a string encrypted with encrypt().
 * Expects format: ivHex:authTagHex:ciphertextHex
 */
export function decrypt(encrypted: string): string {
  const key = getKey();
  const parts = encrypted.split(':');

  if (parts.length !== 3) {
    throw new Error('Invalid encrypted format: expected ivHex:authTagHex:ciphertextHex');
  }

  const [ivHex, authTagHex, ciphertextHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertextHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Check if a string looks like an encrypted value (ivHex:authTagHex:ciphertextHex).
 */
export function isEncrypted(value: string): boolean {
  if (!value || typeof value !== 'string') return false;

  const parts = value.split(':');
  if (parts.length !== 3) return false;

  const hexPattern = /^[0-9a-f]+$/i;
  return parts.every(part => part.length > 0 && hexPattern.test(part));
}
