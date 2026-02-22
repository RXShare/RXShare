import { initDatabase, queryOne, execute, markSetupDone } from "../app/.server/db";
import { hashPassword, sanitizeUsername, validateUsername } from "../app/.server/auth";
import { nanoid } from "nanoid";

async function main() {
  const email = process.argv[2];
  const password = process.argv[3];
  const username = process.argv[4];

  if (!email || !password || !username) {
    console.error("Usage: tsx scripts/create-admin.ts <email> <password> <username>");
    process.exit(1);
  }

  initDatabase();

  const existing = queryOne<any>("SELECT id FROM users WHERE email = ?", [email.toLowerCase()]);
  if (existing) {
    console.error("User with this email already exists");
    process.exit(1);
  }

  const sanitized = sanitizeUsername(username);
  const validation = validateUsername(sanitized);
  if (!validation.valid) {
    console.error("Invalid username:", validation.error);
    process.exit(1);
  }

  const userId = nanoid();
  const passwordHash = await hashPassword(password);
  const now = new Date().toISOString();

  execute("INSERT INTO users (id, email, username, password_hash, created_at) VALUES (?, ?, ?, ?, ?)",
    [userId, email.toLowerCase(), sanitized, passwordHash, now]);
  execute("INSERT INTO user_settings (id, user_id, is_admin, created_at, updated_at) VALUES (?, ?, 1, ?, ?)",
    [nanoid(), userId, now, now]);

  markSetupDone();
  console.log(`Admin user created: ${email} (${sanitized})`);
}

main().catch((err) => { console.error(err); process.exit(1); });
