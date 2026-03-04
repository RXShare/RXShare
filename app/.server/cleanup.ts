import { execute } from "./db";

/**
 * Cleanup expired 2FA sessions (runs every 10 minutes)
 */
function cleanup2faSessions() {
  const now = new Date().toISOString();
  execute("DELETE FROM totp_sessions WHERE expires_at < ?", [now]);
}

// Run cleanup every 10 minutes
const cleanupInterval = setInterval(cleanup2faSessions, 10 * 60 * 1000);
cleanupInterval.unref();

// Run once on startup
cleanup2faSessions();

export { cleanup2faSessions };
