import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { nanoid } from "nanoid";
import { query, queryOne, execute } from "~/.server/db";

const DEFAULT_SECRET = "change-this-secret-key-in-production";
const JWT_SECRET = process.env.JWT_SECRET || DEFAULT_SECRET;
const JWT_EXPIRES_IN = "7d";

// Warn loudly if using default secret
if (JWT_SECRET === DEFAULT_SECRET && process.env.NODE_ENV === "production") {
  console.error("\n⚠️  CRITICAL: JWT_SECRET is using the default value! Set a secure JWT_SECRET in .env before running in production.\n");
}

export interface User {
  id: string;
  email: string;
  username: string | null;
  created_at: string;
  last_sign_in_at: string | null;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}
export async function verifyPassword(password: string, hashed: string): Promise<boolean> {
  return bcrypt.compare(password, hashed);
}
export function generateToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}
export function verifyToken(token: string): { userId: string } | null {
  try { return jwt.verify(token, JWT_SECRET) as { userId: string }; } catch { return null; }
}

export function sanitizeUsername(username: string | undefined | null): string {
  if (!username) return "";
  return username.toLowerCase().trim().replace(/[^a-z0-9._-]/g, "").replace(/^[._-]+|[._-]+$/g, "").slice(0, 30);
}

export function validateUsername(username: string): { valid: boolean; error?: string } {
  if (username.length < 3) return { valid: false, error: "Username must be at least 3 characters" };
  if (username.length > 30) return { valid: false, error: "Username must be less than 30 characters" };
  if (!/^[a-zA-Z0-9._-]+$/.test(username)) return { valid: false, error: "Username can only contain letters, numbers, dots, underscores, and hyphens" };
  if (/^[._-]|[._-]$/.test(username)) return { valid: false, error: "Username cannot start or end with a dot, underscore, or hyphen" };
  return { valid: true };
}

export async function createUser(email: string, password: string, username: string): Promise<User> {
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) throw new Error("Invalid email format");

  // Enforce password minimum length
  if (!password || password.length < 6) throw new Error("Password must be at least 6 characters");
  if (password.length > 128) throw new Error("Password too long");

  const sanitized = sanitizeUsername(username);
  const validation = validateUsername(sanitized);
  if (!validation.valid) throw new Error(validation.error || "Invalid username");

  const existing = queryOne<{ id: string }>("SELECT id FROM users WHERE email = ?", [email.toLowerCase().trim()]);
  if (existing) throw new Error("User already exists");
  const existingUsername = queryOne<{ id: string }>("SELECT id FROM users WHERE username = ?", [sanitized]);
  if (existingUsername) throw new Error("Username is already taken");

  const userId = nanoid();
  const passwordHash = await hashPassword(password);
  const now = new Date().toISOString();

  execute("INSERT INTO users (id, email, username, password_hash, created_at) VALUES (?, ?, ?, ?, ?)",
    [userId, email.toLowerCase().trim(), sanitized, passwordHash, now]);
  execute("INSERT INTO user_settings (id, user_id, created_at, updated_at) VALUES (?, ?, ?, ?)",
    [nanoid(), userId, now, now]);

  return { id: userId, email: email.toLowerCase().trim(), username: sanitized, created_at: now, last_sign_in_at: null };
}

export async function authenticateUser(email: string, password: string): Promise<User | null> {
  const user = queryOne<{ id: string; email: string; username: string | null; password_hash: string; created_at: string; last_sign_in_at: string | null }>(
    "SELECT id, email, username, password_hash, created_at, last_sign_in_at FROM users WHERE email = ?", [email.toLowerCase().trim()]);
  if (!user) return null;

  const settings = queryOne<{ is_active: number }>("SELECT is_active FROM user_settings WHERE user_id = ?", [user.id]);
  if (settings && settings.is_active === 0) throw new Error("Account is deactivated");

  const sys = queryOne<{ allow_login: number }>("SELECT allow_login FROM system_settings LIMIT 1");
  if (sys && sys.allow_login === 0) throw new Error("Login is currently disabled");

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) return null;

  execute("UPDATE users SET last_sign_in_at = ? WHERE id = ?", [new Date().toISOString(), user.id]);
  return { id: user.id, email: user.email, username: user.username, created_at: user.created_at, last_sign_in_at: new Date().toISOString() };
}

export function getUserById(userId: string): User | null {
  const user = queryOne<{ id: string; email: string; username: string | null; created_at: string; last_sign_in_at: string | null }>(
    "SELECT id, email, username, created_at, last_sign_in_at FROM users WHERE id = ?", [userId]);
  return user || null;
}

export function isAdmin(userId: string): boolean {
  const settings = queryOne<{ is_admin: number }>("SELECT is_admin FROM user_settings WHERE user_id = ?", [userId]);
  return settings?.is_admin === 1;
}

export function hashApiToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function verifyApiToken(token: string): { user_id: string } | null {
  const hash = hashApiToken(token);
  const row = queryOne<{ user_id: string; token: string }>(
    "SELECT user_id, token FROM api_tokens WHERE token = ?", [hash]
  );
  if (!row) {
    // Fallback: check unhashed tokens (migration support for existing tokens)
    const plain = queryOne<{ user_id: string; token: string }>(
      "SELECT user_id, token FROM api_tokens WHERE token = ?", [token]
    );
    if (!plain) return null;
    // Migrate: hash the plaintext token in-place
    try { execute("UPDATE api_tokens SET token = ? WHERE token = ?", [hash, token]); } catch {}
    return { user_id: plain.user_id };
  }
  return { user_id: row.user_id };
}
