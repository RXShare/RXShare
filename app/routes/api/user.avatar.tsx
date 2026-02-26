import { getSession } from "~/.server/session";
import { queryOne, execute } from "~/.server/db";
import { getStorage } from "~/.server/storage";
import { rateLimit } from "~/.server/rate-limit";
import { validateCsrf } from "~/.server/csrf";

const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

export async function action({ request }: { request: Request }) {
  const csrfError = await validateCsrf(request);
  if (csrfError) return csrfError;

  const session = await getSession(request);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const limited = rateLimit("user-avatar", request, 10, 10 * 60 * 1000);
  if (limited) return limited;

  // DELETE = remove avatar
  if (request.method === "DELETE") {
    const settings = queryOne<any>("SELECT avatar_url FROM user_settings WHERE user_id = ?", [session.user.id]);
    if (settings?.avatar_url) {
      const storage = await getStorage();
      try { await storage.delete(settings.avatar_url); } catch {}
    }
    execute("UPDATE user_settings SET avatar_url = NULL, updated_at = ? WHERE user_id = ?", [new Date().toISOString(), session.user.id]);
    return Response.json({ ok: true });
  }

  // POST = upload avatar
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const formData = await request.formData();
  const file = formData.get("avatar") as File | null;
  if (!file || !file.size) return Response.json({ error: "No file provided" }, { status: 400 });
  if (!ALLOWED_TYPES.includes(file.type)) return Response.json({ error: "Only JPEG, PNG, GIF, and WebP are allowed" }, { status: 400 });
  if (file.size > MAX_AVATAR_SIZE) return Response.json({ error: "Avatar must be under 5MB" }, { status: 400 });

  // Delete old avatar if exists
  const settings = queryOne<any>("SELECT avatar_url FROM user_settings WHERE user_id = ?", [session.user.id]);
  if (settings?.avatar_url) {
    const storage = await getStorage();
    try { await storage.delete(settings.avatar_url); } catch {}
  }

  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  const filePath = `avatars/${session.user.id}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const storage = await getStorage();
  await storage.save(filePath, buffer);

  execute("UPDATE user_settings SET avatar_url = ?, updated_at = ? WHERE user_id = ?", [filePath, new Date().toISOString(), session.user.id]);
  return Response.json({ ok: true, avatar_url: filePath });
}
