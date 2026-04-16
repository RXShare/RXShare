import { nanoid } from "nanoid";
import crypto from "crypto";
import { queryOne, execute } from "~/.server/db";
import { rateLimit } from "~/.server/rate-limit";
import { validateCsrf } from "~/.server/csrf";
import { sendEmail, passwordResetEmail, isEmailConfigured } from "~/.server/email";
import { getBaseUrl } from "~/.server/base-url";

export async function action({ request }: { request: Request }) {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const csrfError = await validateCsrf(request);
  if (csrfError) return csrfError;

  // Strict rate limit: 3 per 15 minutes
  const limited = rateLimit("forgot-password", request, 3, 15 * 60 * 1000);
  if (limited) return limited;

  if (!isEmailConfigured()) {
    return Response.json({ error: "Email is not configured on this instance" }, { status: 400 });
  }

  const { email } = await request.json();
  if (!email) return Response.json({ error: "Email is required" }, { status: 400 });

  // Always return success to prevent email enumeration
  const successResponse = Response.json({ ok: true, message: "If an account with that email exists, a reset link has been sent." });

  const user = queryOne<any>("SELECT id FROM users WHERE email = ?", [email.toLowerCase().trim()]);
  if (!user) return successResponse;

  // Invalidate old tokens
  execute("UPDATE password_reset_tokens SET used = 1 WHERE user_id = ? AND used = 0", [user.id]);

  // Create token (64 char hex)
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

  execute(
    "INSERT INTO password_reset_tokens (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)",
    [nanoid(), user.id, token, expiresAt]
  );

  const baseUrl = getBaseUrl(request);
  const sys = queryOne<any>("SELECT site_name FROM system_settings LIMIT 1");
  const resetUrl = `${baseUrl}/auth/reset-password?token=${token}`;

  await sendEmail({
    to: email.toLowerCase().trim(),
    subject: `Reset your ${sys?.site_name || "RXShare"} password`,
    html: passwordResetEmail(resetUrl, sys?.site_name || "RXShare"),
  });

  return successResponse;
}
