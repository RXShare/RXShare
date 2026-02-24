import { type Cookie, createCookie } from "react-router";
import { verifyToken, getUserById, type User } from "./auth";

const sessionCookie: Cookie = createCookie("rxshare_session", {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  maxAge: 60 * 60 * 24 * 7,
  path: "/",
});

// Cache parsed sessions per request to avoid redundant cookie parsing + DB lookups.
// Uses a WeakMap keyed by the Request object so entries are GC'd automatically.
const sessionCache = new WeakMap<Request, Promise<{ user: User } | null>>();

export async function getSession(request: Request): Promise<{ user: User } | null> {
  const cached = sessionCache.get(request);
  if (cached !== undefined) return cached;

  const promise = parseSession(request);
  sessionCache.set(request, promise);
  return promise;
}

async function parseSession(request: Request): Promise<{ user: User } | null> {
  const cookieHeader = request.headers.get("Cookie");
  const token = await sessionCookie.parse(cookieHeader);
  if (!token || typeof token !== "string") return null;
  const decoded = verifyToken(token);
  if (!decoded) return null;
  const user = getUserById(decoded.userId);
  if (!user) return null;
  return { user };
}

export async function createSessionHeaders(token: string): Promise<HeadersInit> {
  return { "Set-Cookie": await sessionCookie.serialize(token) };
}

export async function destroySessionHeaders(): Promise<HeadersInit> {
  return { "Set-Cookie": await sessionCookie.serialize("", { maxAge: 0 }) };
}
