import { getSession } from "~/.server/session";
import { queryOne, execute } from "~/.server/db";
import { rateLimit } from "~/.server/rate-limit";

export async function loader({ request }: { request: Request }) {
  const session = await getSession(request);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const settings = queryOne<any>("SELECT * FROM user_settings WHERE user_id = ?", [session.user.id]);
  return Response.json(settings);
}

export async function action({ request }: { request: Request }) {
  if (request.method !== "PUT") return new Response("Method not allowed", { status: 405 });

  // Rate limit: 30 settings changes per 10 minutes
  const limited = rateLimit("user-settings", request, 30, 10 * 60 * 1000);
  if (limited) return limited;

  const session = await getSession(request);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const allowed = ["embed_title", "embed_description", "embed_color", "default_public", "custom_path"];
  const sets: string[] = [];
  const vals: any[] = [];

  for (const key of allowed) {
    if (body[key] !== undefined) {
      let val = body[key];
      // Validate color
      if (key === "embed_color" && typeof val === "string" && !/^#[0-9a-fA-F]{3,8}$/.test(val)) continue;
      // Block reserved custom_path values
      if (key === "custom_path" && typeof val === "string") {
        const reserved = ["dashboard", "admin", "api", "auth", "setup", "v", "r", "public", "assets", "build", "data"];
        const cleaned = val.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 30);
        if (reserved.includes(cleaned)) return Response.json({ error: "That custom path is reserved" }, { status: 400 });
        val = cleaned || null;
      }
      // Sanitize strings
      if (typeof val === "string") val = val.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
      sets.push(`${key} = ?`);
      vals.push(key === "default_public" ? (val ? 1 : 0) : val);
    }
  }

  if (sets.length === 0) return Response.json({ error: "Nothing to update" }, { status: 400 });
  sets.push("updated_at = ?");
  vals.push(new Date().toISOString());
  vals.push(session.user.id);

  execute(`UPDATE user_settings SET ${sets.join(", ")} WHERE user_id = ?`, vals);
  return Response.json({ ok: true });
}
