import { getSession } from "~/.server/session";
import { disableTotp, verifyTotpToken, getTotpSecret } from "~/.server/totp";
import { validateCsrf } from "~/.server/csrf";
import { logAudit, getClientIp } from "~/.server/audit";

/**
 * POST: Disable 2FA after verifying current token
 */
export async function action({ request }: { request: Request }) {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const csrfError = await validateCsrf(request);
  if (csrfError) return csrfError;

  const session = await getSession(request);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { token } = body;

  if (!token) {
    return Response.json({ error: "Verification code required" }, { status: 400 });
  }

  const secret = getTotpSecret(session.user.id);
  if (!secret) {
    return Response.json({ error: "2FA not enabled" }, { status: 400 });
  }

  // Verify token before disabling
  if (!verifyTotpToken(secret, token)) {
    return Response.json({ error: "Invalid verification code" }, { status: 400 });
  }

  disableTotp(session.user.id);
  logAudit("2fa.disable", { userId: session.user.id, ip: getClientIp(request) });

  return Response.json({ ok: true });
}
