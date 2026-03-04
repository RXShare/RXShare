import { nanoid } from "nanoid";
import { queryOne, execute } from "~/.server/db";
import { verifyTotpToken, verifyBackupCode, getTotpSecret } from "~/.server/totp";
import { createSession } from "~/.server/session";
import { validateCsrf } from "~/.server/csrf";
import { logAudit, getClientIp } from "~/.server/audit";

/**
 * POST: Verify 2FA token during login
 */
export async function action({ request }: { request: Request }) {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const csrfError = await validateCsrf(request);
  if (csrfError) return csrfError;

  const body = await request.json();
  const { sessionId, token, useBackupCode } = body;

  if (!sessionId || !token) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Get temporary session
  const tempSession = queryOne<any>(
    "SELECT user_id, expires_at FROM totp_sessions WHERE id = ?",
    [sessionId]
  );

  if (!tempSession) {
    return Response.json({ error: "Invalid or expired session" }, { status: 400 });
  }

  // Check expiration (5 minutes)
  if (new Date(tempSession.expires_at) < new Date()) {
    execute("DELETE FROM totp_sessions WHERE id = ?", [sessionId]);
    return Response.json({ error: "Session expired" }, { status: 400 });
  }

  const userId = tempSession.user_id;
  let verified = false;

  if (useBackupCode) {
    // Verify backup code
    verified = verifyBackupCode(userId, token);
  } else {
    // Verify TOTP token
    const secret = getTotpSecret(userId);
    if (!secret) {
      return Response.json({ error: "2FA not configured" }, { status: 400 });
    }
    verified = verifyTotpToken(secret, token);
  }

  if (!verified) {
    return Response.json({ error: "Invalid verification code" }, { status: 400 });
  }

  // Delete temporary session
  execute("DELETE FROM totp_sessions WHERE id = ?", [sessionId]);

  // Get user data
  const user = queryOne<any>("SELECT id, email, username FROM users WHERE id = ?", [userId]);
  if (!user) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  // Update last sign in
  execute("UPDATE users SET last_sign_in_at = ? WHERE id = ?", [new Date().toISOString(), userId]);

  // Create real session
  const { cookie } = await createSession(user);
  logAudit("login.2fa", { userId, ip: getClientIp(request) });

  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      "Set-Cookie": cookie,
      "Content-Type": "application/json",
    },
  });
}
