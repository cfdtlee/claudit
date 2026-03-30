import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'crypto';

/**
 * Generate a new pairing identity: UUID + 32-byte AES-256-GCM key.
 */
export function generateKeyPair(): { pairingId: string; secretKey: Uint8Array } {
  return {
    pairingId: randomUUID(),
    secretKey: new Uint8Array(randomBytes(32)),
  };
}

/**
 * Encrypt plaintext with AES-256-GCM.
 * Returns base64-encoded: nonce (12 bytes) + ciphertext + authTag (16 bytes).
 * Compatible with iOS CryptoKit AES.GCM.SealedBox(combined:).
 */
export function encrypt(message: string, secretKey: Uint8Array): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', secretKey, nonce);
  const encrypted = Buffer.concat([cipher.update(message, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Combined format: nonce (12) + ciphertext + tag (16)
  const combined = Buffer.concat([nonce, encrypted, authTag]);
  return combined.toString('base64');
}

/**
 * Decrypt a base64-encoded AES-256-GCM ciphertext.
 * Expects combined format: nonce (12 bytes) + ciphertext + tag (16 bytes).
 * Compatible with iOS CryptoKit AES.GCM.seal().combined.
 */
export function decrypt(encrypted: string, secretKey: Uint8Array): string | null {
  try {
    const combined = Buffer.from(encrypted, 'base64');
    if (combined.length < 28) return null; // 12 nonce + 16 tag minimum

    const nonce = combined.subarray(0, 12);
    const authTag = combined.subarray(combined.length - 16);
    const ciphertext = combined.subarray(12, combined.length - 16);

    const decipher = createDecipheriv('aes-256-gcm', secretKey, nonce);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}

/**
 * Encode the secret key as base64url (URL-safe, no padding).
 */
export function keyToBase64Url(key: Uint8Array): string {
  return Buffer.from(key)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Decode a base64url-encoded secret key back to Uint8Array.
 */
export function keyFromBase64Url(encoded: string): Uint8Array {
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  return new Uint8Array(Buffer.from(base64, 'base64'));
}
