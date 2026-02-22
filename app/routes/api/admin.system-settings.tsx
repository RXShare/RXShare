import { getSession } from "~/.server/session";
import { isAdmin } from "~/.server/auth";
import { queryOne, execute } from "~/.server/db";

export async function loader({ request }: { request: Request }) {
  const session = await getSession(request);
  if (!session || !isAdmin(session.user.id)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const settings = queryOne<any>("SELECT * FROM system_settings LIMIT 1");
  return Response.json(settings);
}

export async function action({ request }: { request: Request }) {
  if (request.method !== "PUT") return new Response("Method not allowed", { status: 405 });
  const session = await getSession(request);
  if (!session || !isAdmin(session.user.id)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const sys = queryOne<any>("SELECT id FROM system_settings LIMIT 1");
  if (!sys) return Response.json({ error: "No system settings" }, { status: 500 });

  const allowed = ["site_name", "site_description", "base_url", "allow_registration", "allow_login", "allow_email", "default_quota", "max_upload_size", "primary_color", "accent_color", "dashboard_layout", "logo_url", "background_pattern"];
  const sets: string[] = [];
  const vals: any[] = [];

  for (const key of allowed) {
    if (body[key] !== undefined) {
      sets.push(`${key} = ?`);
      vals.push(body[key]);
    }
  }

  if (sets.length === 0) return Response.json({ error: "Nothing to update" }, { status: 400 });
  sets.push("updated_at = ?");
  vals.push(new Date().toISOString());
  vals.push(sys.id);

  execute(`UPDATE system_settings SET ${sets.join(", ")} WHERE id = ?`, vals);
  return Response.json({ ok: true });
}
