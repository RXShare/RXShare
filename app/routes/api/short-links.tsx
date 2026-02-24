import { nanoid } from "nanoid";
import { getSession } from "~/.server/session";
import { query, queryOne, execute } from "~/.server/db";
import { validateCsrf } from "~/.server/csrf";
import { isFeatureEnabled } from "~/.server/features";
import { isAdmin } from "~/.server/auth";

export async function loader({ request }: { request: Request }) {
  const session = await getSession(request);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isFeatureEnabled("short_links", isAdmin(session.user.id))) return Response.json({ error: "Feature disabled" }, { status: 403 });
  const links = query<any>("SELECT sl.*, u.original_name, u.file_name FROM short_links sl LEFT JOIN uploads u ON sl.upload_id = u.id WHERE sl.user_id = ? ORDER BY sl.created_at DESC", [session.user.id]);
  return Response.json({ links });
}

export async function action({ request }: { request: Request }) {
  const csrfError = await validateCsrf(request);
  if (csrfError) return csrfError;
  const session = await getSession(request);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isFeatureEnabled("short_links", isAdmin(session.user.id))) return Response.json({ error: "Feature disabled" }, { status: 403 });

  if (request.method === "POST") {
    const body = await request.json();
    const { upload_id, external_url } = body;
    
    if (external_url) {
      // External URL short link
      const url = external_url.trim();
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        return Response.json({ error: "URL must start with http:// or https://" }, { status: 400 });
      }
      const id = nanoid();
      const code = nanoid(6);
      execute("INSERT INTO short_links (id, code, upload_id, user_id, external_url) VALUES (?, ?, ?, ?, ?)", [id, code, "", session.user.id, url]);
      return Response.json({ id, code });
    }
    
    if (upload_id) {
      const upload = queryOne<any>("SELECT id FROM uploads WHERE id = ? AND user_id = ?", [upload_id, session.user.id]);
      if (!upload) return Response.json({ error: "Not found" }, { status: 404 });
      const existing = queryOne<any>("SELECT * FROM short_links WHERE upload_id = ? AND user_id = ?", [upload_id, session.user.id]);
      if (existing) return Response.json({ id: existing.id, code: existing.code });
      const id = nanoid();
      const code = nanoid(6);
      execute("INSERT INTO short_links (id, code, upload_id, user_id) VALUES (?, ?, ?, ?)", [id, code, upload_id, session.user.id]);
      return Response.json({ id, code });
    }
    
    return Response.json({ error: "Missing upload_id or external_url" }, { status: 400 });
  }

  if (request.method === "DELETE") {
    const { id } = await request.json();
    execute("DELETE FROM short_links WHERE id = ? AND user_id = ?", [id, session.user.id]);
    return Response.json({ ok: true });
  }

  return new Response("Method not allowed", { status: 405 });
}
