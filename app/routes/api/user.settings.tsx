import { getSession } from "~/.server/session";
import { queryOne, execute } from "~/.server/db";

export async function loader({ request }: { request: Request }) {
  const session = await getSession(request);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const settings = queryOne<any>("SELECT * FROM user_settings WHERE user_id = ?", [session.user.id]);
  return Response.json(settings);
}

export async function action({ request }: { request: Request }) {
  if (request.method !== "PUT") return new Response("Method not allowed", { status: 405 });
  const session = await getSession(request);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const allowed = ["embed_title", "embed_description", "embed_color", "default_public", "custom_path"];
  const sets: string[] = [];
  const vals: any[] = [];

  for (const key of allowed) {
    if (body[key] !== undefined) {
      sets.push(`${key} = ?`);
      vals.push(key === "default_public" ? (body[key] ? 1 : 0) : body[key]);
    }
  }

  if (sets.length === 0) return Response.json({ error: "Nothing to update" }, { status: 400 });
  sets.push("updated_at = ?");
  vals.push(new Date().toISOString());
  vals.push(session.user.id);

  execute(`UPDATE user_settings SET ${sets.join(", ")} WHERE user_id = ?`, vals);
  return Response.json({ ok: true });
}
