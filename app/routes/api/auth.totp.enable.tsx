import { getSession } from "~/.server/session";
import { enableTotp, verifyTotpToken } from "~/.server/totp";
import { validateCsrf } from "~/.server/csrf";
import { logAudit, getClientIp } from "~/.server/audit";

/**
 * POST: Enable 2FA after verifying a token
 */
export async function action({ request }: { request: Request }) {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const csrfError = await validateCsrf(request);
  if (csrfError) return csrfError;

  const session = await getSession(request);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { secret, token, backupCodes } = body;

  if (!secret || !token || !backupCodes) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Verify the token before enabling
  if (!verifyTotpToken(secret, token)) {
    return Response.json({ error: "Invalid verification code" }, { status: 400 });
  }

  enableTotp(session.user.id, secret, backupCodes);
  logAudit("2fa.enable", { userId: session.user.id, ip: getClientIp(request) });

  return Response.json({ ok: true });
}
