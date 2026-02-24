import { getSession } from "~/.server/session";
import { isAdmin } from "~/.server/auth";
import { queryOne, execute, query } from "~/.server/db";
import { getStorage } from "~/.server/storage";
import { rateLimit } from "~/.server/rate-limit";
import { validateCsrf } from "~/.server/csrf";

export async function action({ request, params }: { request: Request; params: { userId: string } }) {
  // CSRF protection
  const csrfError = await validateCsrf(request);
  if (csrfError) return csrfError;

  const session = await getSession(request);
  if (!session || !isAdmin(session.user.id)) return Response.json({ error: "Forbidden" }, { status: 403 });

  // Rate limit admin actions: 30 per 10 minutes
  const limited = rateLimit("admin-users", request, 30, 10 * 60 * 1000);
  if (limited) return limited;

  const { userId } = params;

  if (request.method === "PATCH") {
    const body = await request.json();
    const allowed = ["is_admin", "is_active", "disk_quota", "max_upload_size"];
    const sets: string[] = [];
    const vals: any[] = [];
    for (const key of allowed) {
      if (body[key] !== undefined) {
        // Validate types — all must be numbers
        const val = Number(body[key]);
        if (!Number.isFinite(val)) continue;
        // Boolean fields must be 0 or 1
        if ((key === "is_admin" || key === "is_active") && val !== 0 && val !== 1) continue;
        // Size fields must be positive
        if ((key === "disk_quota" || key === "max_upload_size") && val < 0) continue;
        sets.push(`${key} = ?`);
        vals.push(val);
      }
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
    // Delete user's files from storage (parallel)
    const uploads = query<any>("SELECT file_path, thumbnail_path, preview_path FROM uploads WHERE user_id = ?", [userId]);
    const storage = await getStorage();
    const deleteOps = uploads.flatMap((u: any) => [
      storage.delete(u.file_path),
      u.thumbnail_path ? storage.delete(u.thumbnail_path) : null,
      u.preview_path ? storage.delete(u.preview_path) : null,
    ].filter(Boolean));
    await Promise.allSettled(deleteOps);
    // Delete from DB (cascades handle related tables)
    execute("DELETE FROM uploads WHERE user_id = ?", [userId]);
    execute("DELETE FROM api_tokens WHERE user_id = ?", [userId]);
    execute("DELETE FROM user_settings WHERE user_id = ?", [userId]);
    execute("DELETE FROM users WHERE id = ?", [userId]);
    return Response.json({ ok: true });
  }

  return new Response("Method not allowed", { status: 405 });
}
