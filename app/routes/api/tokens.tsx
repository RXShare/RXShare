import { nanoid } from "nanoid";
import { getSession } from "~/.server/session";
import { query, queryOne, execute } from "~/.server/db";
import { generateToken } from "~/lib/utils-format";
import { hashApiToken } from "~/.server/auth";
import { rateLimit } from "~/.server/rate-limit";

export async function loader({ request }: { request: Request }) {
  const session = await getSession(request);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const tokens = query<any>("SELECT id, name, created_at, last_used_at FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC", [session.user.id]);
  return Response.json(tokens);
}

export async function action({ request }: { request: Request }) {
  const session = await getSession(request);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  if (request.method === "POST") {
    // Rate limit: 10 token creations per hour
    const limited = rateLimit("tokens", request, 10, 60 * 60 * 1000);
    if (limited) return limited;

    const { name } = await request.json();
    if (!name?.trim()) return Response.json({ error: "Name required" }, { status: 400 });
    const token = generateToken();
    const tokenHash = hashApiToken(token);
    execute("INSERT INTO api_tokens (id, user_id, token, name, created_at) VALUES (?, ?, ?, ?, ?)",
      [nanoid(), session.user.id, tokenHash, name.trim(), new Date().toISOString()]);
    return Response.json({ token });
  }

  if (request.method === "DELETE") {
    const { id } = await request.json();
    execute("DELETE FROM api_tokens WHERE id = ? AND user_id = ?", [id, session.user.id]);
    return Response.json({ ok: true });
  }

  return new Response("Method not allowed", { status: 405 });
}
