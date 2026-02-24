import { getSession } from "~/.server/session";
import { isAdmin } from "~/.server/auth";
import { query, execute } from "~/.server/db";
import { getStorage } from "~/.server/storage";

export async function loader({ request }: { request: Request }) {
  const session = await getSession(request);
  if (!session || !isAdmin(session.user.id)) return Response.json({ error: "Forbidden" }, { status: 403 });

  // Find all uploads trashed more than 30 days ago
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const expired = query<any>("SELECT * FROM uploads WHERE deleted_at IS NOT NULL AND deleted_at < ?", [cutoff]);

  const storage = await getStorage();
  let deleted = 0;

  // Group by user_id to batch disk_used updates
  const freedByUser: Record<string, number> = {};

  for (const upload of expired) {
    try { await storage.delete(upload.file_path); } catch {}
    if (upload.thumbnail_path) try { await storage.delete(upload.thumbnail_path); } catch {}
    if (upload.preview_path) try { await storage.delete(upload.preview_path); } catch {}
    execute("DELETE FROM uploads WHERE id = ?", [upload.id]);
    freedByUser[upload.user_id] = (freedByUser[upload.user_id] || 0) + upload.file_size;
    deleted++;
  }

  for (const [userId, freed] of Object.entries(freedByUser)) {
    execute("UPDATE user_settings SET disk_used = MAX(0, disk_used - ?) WHERE user_id = ?", [freed, userId]);
  }

  return Response.json({ ok: true, deleted });
}
