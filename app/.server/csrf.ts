import crypto from "crypto";
import { type Cookie, createCookie } from "react-router";

const csrfCookie: Cookie = createCookie("rxshare_csrf", {
  httpOnly: false, // JS needs to read this to send it in headers
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  maxAge: 60 * 60 * 24 * 7,
  path: "/",
});

/**
 * Generate a CSRF token and return the Set-Cookie header value.
 */
export async function generateCsrfToken(): Promise<{ token: string; cookie: string }> {
  const token = crypto.randomBytes(32).toString("hex");
  const cookie = await csrfCookie.serialize(token);
  return { token, cookie };
}

/**
 * Parse the CSRF token from the cookie header.
 */
export async function getCsrfFromCookie(request: Request): Promise<string | null> {
  const cookieHeader = request.headers.get("Cookie");
  const token = await csrfCookie.parse(cookieHeader);
  if (!token || typeof token !== "string") return null;
  return token;
}

/**
 * Validate CSRF for cookie-authenticated requests.
 * Skips validation for:
 * - Bearer token auth (API tokens / ShareX)
 * - GET/HEAD/OPTIONS requests
 * Returns null if valid, or a Response if invalid.
 */
export async function validateCsrf(request: Request): Promise<Response | null> {
  // Skip for safe methods
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return null;

  // Skip for Bearer token auth (API clients like ShareX)
  const auth = request.headers.get("Authorization");
  if (auth?.startsWith("Bearer ")) return null;

  const cookieToken = await getCsrfFromCookie(request);
  const headerToken = request.headers.get("X-CSRF-Token");

  if (!cookieToken || !headerToken) {
    return Response.json({ error: "Missing CSRF token" }, { status: 403 });
  }

  // Constant-time comparison
  if (cookieToken.length !== headerToken.length) {
    return Response.json({ error: "Invalid CSRF token" }, { status: 403 });
  }

  const valid = crypto.timingSafeEqual(
    Buffer.from(cookieToken),
    Buffer.from(headerToken)
  );

  if (!valid) {
    return Response.json({ error: "Invalid CSRF token" }, { status: 403 });
  }

  return null;
}
