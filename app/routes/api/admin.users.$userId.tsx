import { getSession } from "~/.server/session";
import { isAdmin } from "~/.server/auth";
import { queryOne, execute, query } from "~/.server/db";
import { getStorage } from "~/.server/storage";

export async function action({ request, params }: { request: Request; params: { userId: string } }) {
  const session = await getSession(request);
  if (!session || !isAdmin(session.user.id)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { userId } = params;

  if (request.method === "PATCH") {
    const body = await request.json();
    const allowed = ["is_admin", "is_active", "disk_quota", "max_upload_size"];
    const sets: string[] = [];
    const vals: any[] = [];
    for (const key of allowed) {
      if (body[key] !== undefined) { sets.push(`${key} = ?`); vals.push(body[key]); }
    }
    if (sets.length === 0) return Response.json({ error: "Nothing to update" }, { status: 400 });
    sets.push("updated_at = ?");
    vals.push(new Date().toISOString());
    vals.push(userId);
    execute(`UPDATE user_settings SET ${sets.join(", ")} WHERE user_id = ?`, vals);
    return Response.json({ ok: true });
  }

  if (request.method === "DELETE") {
    if (userId === session.user.id) return Response.json({ error: "Cannot delete yourself" }, { status: 400 });
    // Delete user's files from storage
    const uploads = query<any>("SELECT file_path, thumbnail_path, preview_path FROM uploads WHERE user_id = ?", [userId]);
    const storage = getStorage();
    for (const u of uploads) {
      await storage.delete(u.file_path);
      if (u.thumbnail_path) await storage.delete(u.thumbnail_path);
      if (u.preview_path) await storage.delete(u.preview_path);
    }
    // Delete from DB (cascades handle related tables)
    execute("DELETE FROM uploads WHERE user_id = ?", [userId]);
    execute("DELETE FROM api_tokens WHERE user_id = ?", [userId]);
    execute("DELETE FROM user_settings WHERE user_id = ?", [userId]);
    execute("DELETE FROM users WHERE id = ?", [userId]);
    return Response.json({ ok: true });
  }

  return new Response("Method not allowed", { status: 405 });
}
