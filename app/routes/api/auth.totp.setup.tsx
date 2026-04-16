import { getSession } from "~/.server/session";
import { generateTotpSecret, generateTotpQrCode, generateBackupCodes, storeTotpSetupSecret } from "~/.server/totp";
import { queryOne } from "~/.server/db";
import { rateLimit } from "~/.server/rate-limit";

/**
 * GET: Generate TOTP secret and QR code for setup.
 * The secret is stored server-side and only the QR code + setupId are returned.
 */
export async function loader({ request }: { request: Request }) {
  const session = await getSession(request);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const limited = rateLimit("totp-setup", request, 10, 10 * 60 * 1000);
  if (limited) return limited;

  // Check if already enabled
  const user = queryOne<any>("SELECT totp_enabled FROM users WHERE id = ?", [session.user.id]);
  if (user?.totp_enabled) {
    return Response.json({ error: "2FA already enabled" }, { status: 400 });
  }

  const secret = generateTotpSecret();
  const qrCode = await generateTotpQrCode(session.user.email, secret);
  const backupCodes = generateBackupCodes();

  // Store secret and backup codes server-side, return only setupId
  const setupId = storeTotpSetupSecret(session.user.id, secret, backupCodes);

  return Response.json({
    setupId,
    qrCode,
    backupCodes,
  });
}
