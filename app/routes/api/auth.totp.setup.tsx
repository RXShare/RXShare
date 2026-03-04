import { getSession } from "~/.server/session";
import { generateTotpSecret, generateTotpQrCode, generateBackupCodes } from "~/.server/totp";
import { queryOne } from "~/.server/db";

/**
 * GET: Generate TOTP secret and QR code for setup
 */
export async function loader({ request }: { request: Request }) {
  const session = await getSession(request);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Check if already enabled
  const user = queryOne<any>("SELECT totp_enabled FROM users WHERE id = ?", [session.user.id]);
  if (user?.totp_enabled) {
    return Response.json({ error: "2FA already enabled" }, { status: 400 });
  }

  const secret = generateTotpSecret();
  const qrCode = await generateTotpQrCode(session.user.email, secret);
  const backupCodes = generateBackupCodes();

  return Response.json({
    secret,
    qrCode,
    backupCodes,
  });
}
