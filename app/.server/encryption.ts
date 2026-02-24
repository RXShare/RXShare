import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const IV_LENGTH = 12; // 12 bytes for AES-GCM
const AUTH_TAG_LENGTH = 16; // 16 bytes for GCM auth tag
export const ENCRYPTION_HEADER_LENGTH = IV_LENGTH + AUTH_TAG_LENGTH; // 28 bytes prepended to encrypted files

let cachedKey: Buffer | null = null;

/**
 * Returns the encryption key from ENCRYPTION_KEY env var (64-char hex string = 32 bytes).
 * Returns null if ENCRYPTION_KEY is not set (encryption disabled).
 */
export function getEncryptionKey(): Buffer | null {
  if (cachedKey) return cachedKey;

  const hex = process.env.ENCRYPTION_KEY;
  if (!hex) {
    return null;
  }

  if (hex.length !== 64 || !/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error("ENCRYPTION_KEY must be a 64-character hex string (32 bytes). Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"");
  }

  cachedKey = Buffer.from(hex, "hex");
  return cachedKey;
}

/**
 * Returns true if encryption is enabled (ENCRYPTION_KEY is set).
 */
export function isEncryptionEnabled(): boolean {
  return getEncryptionKey() !== null;
}

/**
 * Encrypts a buffer using AES-256-GCM.
 * Returns a buffer with format: [12-byte IV][16-byte AuthTag][ciphertext]
 */
export function encryptBuffer(data: Buffer): Buffer {
  const key = getEncryptionKey();
  if (!key) return data;

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Prepend IV + AuthTag to ciphertext
  return Buffer.concat([iv, authTag, encrypted]);
}

/**
 * Decrypts a buffer that was encrypted with encryptBuffer().
 * Expects format: [12-byte IV][16-byte AuthTag][ciphertext]
 * If decryption fails (e.g. legacy unencrypted file), returns the original data.
 */
export function decryptBuffer(data: Buffer): Buffer {
  const key = getEncryptionKey();
  if (!key) return data;

  // Too small to be an encrypted file — must be legacy unencrypted
  if (data.length < ENCRYPTION_HEADER_LENGTH) {
    return data;
  }

  try {
    const iv = data.subarray(0, IV_LENGTH);
    const authTag = data.subarray(IV_LENGTH, ENCRYPTION_HEADER_LENGTH);
    const ciphertext = data.subarray(ENCRYPTION_HEADER_LENGTH);

    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    // Decryption failed — likely a legacy unencrypted file
    return data;
  }
}

/**
 * Returns the decrypted content size for a given on-disk (encrypted) size.
 * If encryption is disabled, returns the size as-is.
 * Subtracts the 28-byte header (IV + AuthTag) from encrypted files.
 */
export function getDecryptedSize(onDiskSize: number): number {
  const key = getEncryptionKey();
  if (!key) return onDiskSize;

  // If file is smaller than the header, it's not encrypted (legacy)
  if (onDiskSize < ENCRYPTION_HEADER_LENGTH) {
    return onDiskSize;
  }

  return onDiskSize - ENCRYPTION_HEADER_LENGTH;
}
