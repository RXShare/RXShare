import { getSession } from "~/.server/session";
import { query, queryOne, execute } from "~/.server/db";
import { getStorage } from "~/.server/storage";
import { rateLimit } from "~/.server/rate-limit";
import { validateCsrf } from "~/.server/csrf";
import { isFeatureEnabled } from "~/.server/features";
import { isAdmin } from "~/.server/auth";

export async function loader({ request }: { request: Request }) {
  const session = await getSession(request);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isFeatureEnabled("trash", isAdmin(session.user.id))) return Response.json({ error: "Feature disabled", files: [] }, { status: 200 });

  const trashed = query<any>(
    "SELECT * FROM uploads WHERE user_id = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC",
    [session.user.id]
  );
  return Response.json({ files: trashed });
}

export async function action({ request }: { request: Request }) {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const csrfError = await validateCsrf(request);
  if (csrfError) return csrfError;

  const limited = rateLimit("trash", request, 60, 10 * 60 * 1000);
  if (limited) return limited;

  const session = await getSession(request);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isFeatureEnabled("trash", isAdmin(session.user.id))) return Response.json({ error: "Feature disabled" }, { status: 403 });

  const body = await request.json();
  const { action, id } = body;

  if (action === "restore") {
    if (!id) return Response.json({ error: "Missing id" }, { status: 400 });
    const upload = queryOne<any>("SELECT * FROM uploads WHERE id = ? AND user_id = ? AND deleted_at IS NOT NULL", [id, session.user.id]);
    if (!upload) return Response.json({ error: "Not found" }, { status: 404 });
    execute("UPDATE uploads SET deleted_at = NULL WHERE id = ?", [id]);
    return Response.json({ ok: true });
  }

  if (action === "permanent") {
    if (!id) return Response.json({ error: "Missing id" }, { status: 400 });
    const upload = queryOne<any>("SELECT * FROM uploads WHERE id = ? AND user_id = ? AND deleted_at IS NOT NULL", [id, session.user.id]);
    if (!upload) return Response.json({ error: "Not found" }, { status: 404 });
    const storage = await getStorage();
    await storage.delete(upload.file_path);
    if (upload.thumbnail_path) await storage.delete(upload.thumbnail_path);
    if (upload.preview_path) await storage.delete(upload.preview_path);
    execute("DELETE FROM uploads WHERE id = ?", [id]);
    execute("UPDATE user_settings SET disk_used = MAX(0, disk_used - ?) WHERE user_id = ?", [upload.file_size, session.user.id]);
    return Response.json({ ok: true });
  }

  if (action === "empty") {
    const trashed = query<any>("SELECT * FROM uploads WHERE user_id = ? AND deleted_at IS NOT NULL", [session.user.id]);
    const storage = await getStorage();
    let freedSize = 0;
    for (const upload of trashed) {
      try { await storage.delete(upload.file_path); } catch {}
      if (upload.thumbnail_path) try { await storage.delete(upload.thumbnail_path); } catch {}
      if (upload.preview_path) try { await storage.delete(upload.preview_path); } catch {}
      freedSize += upload.file_size;
    }
    execute("DELETE FROM uploads WHERE user_id = ? AND deleted_at IS NOT NULL", [session.user.id]);
    execute("UPDATE user_settings SET disk_used = MAX(0, disk_used - ?) WHERE user_id = ?", [freedSize, session.user.id]);
    return Response.json({ ok: true, deleted: trashed.length });
  }

  return Response.json({ error: "Invalid action" }, { status: 400 });
}
