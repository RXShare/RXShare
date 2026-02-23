import { authenticateUser, generateToken } from "~/.server/auth";
import { createSessionHeaders } from "~/.server/session";
import { rateLimit } from "~/.server/rate-limit";

export async function action({ request }: { request: Request }) {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  // Rate limit: 10 login attempts per 15 minutes per IP
  const limited = rateLimit("login", request, 10, 15 * 60 * 1000);
  if (limited) return limited;

  const { email, password } = await request.json();
  if (!email || !password) return Response.json({ error: "Email and password required" }, { status: 400 });
  try {
    const user = await authenticateUser(email, password);
    if (!user) return Response.json({ error: "Invalid credentials" }, { status: 401 });
    const token = generateToken(user.id);
    const headers = await createSessionHeaders(token);
    return Response.json({ user }, { headers });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 400 });
  }
}
