import { getSession } from "~/.server/session";
import { queryOne, execute } from "~/.server/db";
import { getStorage } from "~/.server/storage";
import { rateLimit } from "~/.server/rate-limit";

export async function action({ request, params }: { request: Request; params: { id: string } }) {
  if (request.method !== "DELETE") return new Response("Method not allowed", { status: 405 });

  // Rate limit: 60 deletes per 10 minutes
  const limited = rateLimit("delete", request, 60, 10 * 60 * 1000);
  if (limited) return limited;

  const session = await getSession(request);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const upload = queryOne<any>("SELECT * FROM uploads WHERE id = ? AND user_id = ?", [params.id, session.user.id]);
  if (!upload) return Response.json({ error: "Not found" }, { status: 404 });

  const storage = getStorage();
  await storage.delete(upload.file_path);
  if (upload.thumbnail_path) await storage.delete(upload.thumbnail_path);
  if (upload.preview_path) await storage.delete(upload.preview_path);

  execute("DELETE FROM uploads WHERE id = ?", [params.id]);
  execute("UPDATE user_settings SET disk_used = MAX(0, disk_used - ?) WHERE user_id = ?", [upload.file_size, session.user.id]);

  return Response.json({ ok: true });
}
