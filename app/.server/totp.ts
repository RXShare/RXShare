import { authenticator } from "@otplib/preset-default";
import crypto from "crypto";
import QRCode from "qrcode";
import { queryOne, execute } from "./db";

// Configure TOTP (6 digits, 30 second window)
authenticator.options = {
  window: 1, // Allow 1 step before/after (90 second total window)
};

/**
 * Generate a new TOTP secret for a user
 */
export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

/**
 * Generate backup codes (10 random 8-character codes)
 */
export function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < 10; i++) {
    codes.push(crypto.randomBytes(4).toString("hex").toUpperCase());
  }
  return codes;
}

/**
 * Generate QR code data URL for TOTP setup
 */
export async function generateTotpQrCode(email: string, secret: string, issuer: string = "RXShare"): Promise<string> {
  const otpauthUrl = authenticator.keyuri(email, issuer, secret);
  return QRCode.toDataURL(otpauthUrl);
}

/**
 * Verify a TOTP token
 */
export function verifyTotpToken(secret: string, token: string): boolean {
  try {
    return authenticator.verify({ token, secret });
  } catch {
    return false;
  }
}

/**
 * Verify a backup code and mark it as used
 */
export function verifyBackupCode(userId: string, code: string): boolean {
  const user = queryOne<any>("SELECT backup_codes FROM users WHERE id = ?", [userId]);
  if (!user?.backup_codes) return false;

  const codes = JSON.parse(user.backup_codes) as string[];
  const index = codes.findIndex((c) => c === code.toUpperCase());
  
  if (index === -1) return false;

  // Remove used code
  codes.splice(index, 1);
  execute("UPDATE users SET backup_codes = ? WHERE id = ?", [JSON.stringify(codes), userId]);
  
  return true;
}

/**
 * Enable 2FA for a user
 */
export function enableTotp(userId: string, secret: string, backupCodes: string[]): void {
  execute(
    "UPDATE users SET totp_secret = ?, totp_enabled = 1, backup_codes = ? WHERE id = ?",
    [secret, JSON.stringify(backupCodes), userId]
  );
}

/**
 * Disable 2FA for a user
 */
export function disableTotp(userId: string): void {
  execute(
    "UPDATE users SET totp_secret = NULL, totp_enabled = 0, backup_codes = NULL WHERE id = ?",
    [userId]
  );
}

/**
 * Check if user has 2FA enabled
 */
export function isTotpEnabled(userId: string): boolean {
  const user = queryOne<any>("SELECT totp_enabled FROM users WHERE id = ?", [userId]);
  return user?.totp_enabled === 1;
}

/**
 * Get user's TOTP secret
 */
export function getTotpSecret(userId: string): string | null {
  const user = queryOne<any>("SELECT totp_secret FROM users WHERE id = ?", [userId]);
  return user?.totp_secret || null;
}
