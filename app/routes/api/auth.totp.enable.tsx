import { getSession } from "~/.server/session";
import { enableTotp, verifyTotpToken, getTotpSetupSecret, clearTotpSetupSecret } from "~/.server/totp";
import { validateCsrf } from "~/.server/csrf";
import { rateLimit } from "~/.server/rate-limit";
import { logAudit, getClientIp } from "~/.server/audit";

/**
 * POST: Enable 2FA after verifying a token.
 * The secret and backup codes are stored server-side in totp_sessions (setup flow),
 * so the client only sends the verification token.
 */
export async function action({ request }: { request: Request }) {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const csrfError = await validateCsrf(request);
  if (csrfError) return csrfError;

  const limited = rateLimit("totp-enable", request, 10, 10 * 60 * 1000);
  if (limited) return limited;

  const session = await getSession(request);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { setupId, token } = body;

  if (!setupId || !token) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Retrieve the secret and backup codes from server-side setup session
  const setup = getTotpSetupSecret(setupId, session.user.id);
  if (!setup) {
    return Response.json({ error: "Invalid or expired setup session" }, { status: 400 });
  }

  // Verify the token before enabling
  if (!verifyTotpToken(setup.secret, token)) {
    return Response.json({ error: "Invalid verification code" }, { status: 400 });
  }

  // Enable 2FA with server-stored secret and backup codes
  enableTotp(session.user.id, setup.secret, setup.backupCodes);
  clearTotpSetupSecret(setupId);
  logAudit("2fa.enable", { userId: session.user.id, ip: getClientIp(request) });

  return Response.json({ ok: true });
}
