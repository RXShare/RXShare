import { queryOne, execute } from "~/.server/db";
import { hashPassword } from "~/.server/auth";
import { rateLimit } from "~/.server/rate-limit";
import { validateCsrf } from "~/.server/csrf";

export async function action({ request }: { request: Request }) {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const csrfError = await validateCsrf(request);
  if (csrfError) return csrfError;

  const limited = rateLimit("reset-password", request, 5, 15 * 60 * 1000);
  if (limited) return limited;

  const { token, password } = await request.json();
  if (!token || !password) return Response.json({ error: "Token and password are required" }, { status: 400 });
  if (password.length < 6) return Response.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  if (password.length > 128) return Response.json({ error: "Password too long" }, { status: 400 });

  const resetToken = queryOne<any>(
    "SELECT * FROM password_reset_tokens WHERE token = ? AND used = 0",
    [token]
  );

  if (!resetToken) return Response.json({ error: "Invalid or expired reset link" }, { status: 400 });
  if (new Date(resetToken.expires_at) < new Date()) {
    execute("UPDATE password_reset_tokens SET used = 1 WHERE id = ?", [resetToken.id]);
    return Response.json({ error: "Reset link has expired" }, { status: 400 });
  }

  const passwordHash = await hashPassword(password);
  execute("UPDATE users SET password_hash = ? WHERE id = ?", [passwordHash, resetToken.user_id]);
  execute("UPDATE password_reset_tokens SET used = 1 WHERE id = ?", [resetToken.id]);

  return Response.json({ ok: true });
}
