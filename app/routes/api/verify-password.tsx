import crypto from "crypto";
import bcrypt from "bcryptjs";
import { queryOne } from "~/.server/db";
import { rateLimit } from "~/.server/rate-limit";
import { isFeatureEnabled } from "~/.server/features";

const PW_COOKIE_SECRET = process.env.JWT_SECRET || "pw-cookie-fallback-secret";

/** Create an HMAC-signed cookie value so it can't be forged */
function signCookieValue(uploadId: string): string {
  const payload = `${uploadId}:${Date.now()}`;
  const sig = crypto.createHmac("sha256", PW_COOKIE_SECRET).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

/** Verify an HMAC-signed cookie value */
export function verifyCookieSignature(value: string): boolean {
  const lastDot = value.lastIndexOf(".");
  if (lastDot === -1) return false;
  const payload = value.substring(0, lastDot);
  const sig = value.substring(lastDot + 1);
  const expected = crypto.createHmac("sha256", PW_COOKIE_SECRET).update(payload).digest("hex");
  if (sig.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

export async function action({ request }: { request: Request }) {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!isFeatureEnabled("password_protection")) return Response.json({ error: "Feature disabled" }, { status: 403 });

  // Stricter rate limit: 5 attempts per 5 minutes per IP to prevent brute force
  const limited = rateLimit("verify-password", request, 5, 5 * 60 * 1000);
  if (limited) return limited;

  const { fileName, password } = await request.json();
  if (!fileName || !password) return Response.json({ error: "Missing fields" }, { status: 400 });

  const upload = queryOne<any>("SELECT id, password_hash FROM uploads WHERE file_name = ?", [fileName]);
  if (!upload || !upload.password_hash) return Response.json({ error: "Not found" }, { status: 404 });

  const valid = await bcrypt.compare(password, upload.password_hash);
  if (!valid) return Response.json({ error: "Wrong password" }, { status: 403 });

  // Return an HMAC-signed cookie so it can't be forged
  const cookieName = `pw_${upload.id}`;
  const cookieValue = signCookieValue(upload.id);
  const isProduction = process.env.NODE_ENV === "production";
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": `${cookieName}=${cookieValue}; Path=/; Max-Age=3600; HttpOnly; SameSite=Lax${isProduction ? "; Secure" : ""}`,
    },
  });
}
