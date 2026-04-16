import { getSession } from "~/.server/session";
import { queryOne, execute } from "~/.server/db";
import { rateLimit } from "~/.server/rate-limit";
import { validateCsrf } from "~/.server/csrf";
import bcrypt from "bcryptjs";

export async function action({ request, params }: { request: Request; params: { id: string } }) {
  if (request.method !== "PATCH") return new Response("Method not allowed", { status: 405 });

  // CSRF protection
  const csrfError = await validateCsrf(request);
  if (csrfError) return csrfError;

  // Rate limit: 60 visibility toggles per 10 minutes
  const limited = rateLimit("uploads-patch", request, 60, 10 * 60 * 1000);
  if (limited) return limited;

  const session = await getSession(request);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const upload = queryOne<any>("SELECT * FROM uploads WHERE id = ? AND user_id = ?", [params.id, session.user.id]);
  if (!upload) return Response.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const now = new Date().toISOString();

  if (body.is_public !== undefined) {
    execute("UPDATE uploads SET is_public = ?, updated_at = ? WHERE id = ?", [body.is_public ? 1 : 0, now, params.id]);
  }
  if (body.expires_at !== undefined) {
    // Validate expires_at is either null or a valid ISO date string in the future
    if (body.expires_at !== null) {
      const parsed = new Date(body.expires_at);
      if (isNaN(parsed.getTime())) return Response.json({ error: "Invalid expiration date" }, { status: 400 });
      if (parsed < new Date()) return Response.json({ error: "Expiration date must be in the future" }, { status: 400 });
    }
    execute("UPDATE uploads SET expires_at = ?, updated_at = ? WHERE id = ?", [body.expires_at, now, params.id]);
  }
  if (body.password !== undefined) {
    const hash = body.password ? await bcrypt.hash(body.password, 10) : null;
    execute("UPDATE uploads SET password_hash = ?, updated_at = ? WHERE id = ?", [hash, now, params.id]);
  }
  if (body.folder_id !== undefined) {
    execute("UPDATE uploads SET folder_id = ?, updated_at = ? WHERE id = ?", [body.folder_id, now, params.id]);
  }
  if (body.description !== undefined) {
    // Sanitize description — strip control chars, limit length
    const desc = typeof body.description === "string"
      ? body.description.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "").slice(0, 500) || null
      : null;
    execute("UPDATE uploads SET description = ?, updated_at = ? WHERE id = ?", [desc, now, params.id]);
  }
  return Response.json({ ok: true });
}
