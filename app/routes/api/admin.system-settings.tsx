import { getSession } from "~/.server/session";
import { isAdmin } from "~/.server/auth";
import { queryOne, execute } from "~/.server/db";
import { rateLimit } from "~/.server/rate-limit";
import { validateCsrf } from "~/.server/csrf";

export async function loader({ request }: { request: Request }) {
  const session = await getSession(request);
  if (!session || !isAdmin(session.user.id)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const settings = queryOne<any>("SELECT * FROM system_settings LIMIT 1");
  return Response.json(settings);
}

export async function action({ request }: { request: Request }) {
  if (request.method !== "PUT") return new Response("Method not allowed", { status: 405 });

  // CSRF protection
  const csrfError = await validateCsrf(request);
  if (csrfError) return csrfError;

  // Rate limit: 30 settings changes per 10 minutes
  const limited = rateLimit("admin-settings", request, 30, 10 * 60 * 1000);
  if (limited) return limited;

  const session = await getSession(request);
  if (!session || !isAdmin(session.user.id)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const sys = queryOne<any>("SELECT id FROM system_settings LIMIT 1");
  if (!sys) return Response.json({ error: "No system settings" }, { status: 500 });

  const allowed = ["site_name", "site_description", "base_url", "allow_registration", "allow_login", "allow_email", "default_quota", "max_upload_size", "primary_color", "accent_color", "dashboard_layout", "logo_url", "background_pattern"];
  const colorFields = ["primary_color", "accent_color"];
  const sets: string[] = [];
  const vals: any[] = [];

  for (const key of allowed) {
    if (body[key] !== undefined) {
      let val = body[key];
      // Validate color fields
      if (colorFields.includes(key) && typeof val === "string") {
        if (!/^#[0-9a-fA-F]{3,8}$/.test(val)) continue;
      }
      // Sanitize string values — strip control chars
      if (typeof val === "string") val = val.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
      sets.push(`${key} = ?`);
      vals.push(val);
    }
  }

  if (sets.length === 0) return Response.json({ error: "Nothing to update" }, { status: 400 });
  sets.push("updated_at = ?");
  vals.push(new Date().toISOString());
  vals.push(sys.id);

  execute(`UPDATE system_settings SET ${sets.join(", ")} WHERE id = ?`, vals);
  return Response.json({ ok: true });
}
