import { type Cookie, createCookie } from "react-router";
import { verifyToken, getUserById, type User } from "./auth";

const sessionCookie: Cookie = createCookie("rxshare_session", {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  maxAge: 60 * 60 * 24 * 7,
  path: "/",
});

export async function getSession(request: Request): Promise<{ user: User } | null> {
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
