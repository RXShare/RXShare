import { nanoid } from "nanoid";
import { authenticateUser, generateToken } from "~/.server/auth";
import { createSessionHeaders } from "~/.server/session";
import { rateLimit } from "~/.server/rate-limit";
import { validateCsrf } from "~/.server/csrf";
import { queryOne, execute } from "~/.server/db";
import { isTotpEnabled } from "~/.server/totp";
import { logAudit, getClientIp } from "~/.server/audit";

export async function action({ request }: { request: Request }) {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  // CSRF protection
  const csrfError = await validateCsrf(request);
  if (csrfError) return csrfError;

  // Rate limit: 10 login attempts per 15 minutes per IP
  const limited = rateLimit("login", request, 10, 15 * 60 * 1000);
  if (limited) return limited;

  const { email, password } = await request.json();
  if (!email || !password) return Response.json({ error: "Email and password required" }, { status: 400 });
  
  try {
    const user = await authenticateUser(email, password);
    if (!user) return Response.json({ error: "Invalid credentials" }, { status: 401 });

    // Check if 2FA is enabled
    if (isTotpEnabled(user.id)) {
      // Create temporary session for 2FA verification (expires in 5 minutes)
      const sessionId = nanoid();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      execute(
        "INSERT INTO totp_sessions (id, user_id, expires_at) VALUES (?, ?, ?)",
        [sessionId, user.id, expiresAt]
      );

      return Response.json({
        requires2fa: true,
        sessionId,
      });
    }

    // No 2FA, proceed with normal login
    const token = generateToken(user.id);
    const headers = await createSessionHeaders(token);
    
    // Update last sign in
    execute("UPDATE users SET last_sign_in_at = ? WHERE id = ?", [new Date().toISOString(), user.id]);
    logAudit("login", { userId: user.id, ip: getClientIp(request) });

    return Response.json({ user }, { headers });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 400 });
  }
}
