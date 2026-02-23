import { nanoid } from "nanoid";
import { getSession } from "~/.server/session";
import { queryOne, execute } from "~/.server/db";
import { getStorage } from "~/.server/storage";
import { generateThumbnail, generatePreview } from "~/.server/thumbnails";
import { getBaseUrl } from "~/.server/base-url";
import { rateLimit } from "~/.server/rate-limit";
import { verifyApiToken } from "~/.server/auth";

async function authenticateRequest(request: Request) {
  // Check session cookie first
  const session = await getSession(request);
  if (session) return session.user;
  // Check API token
  const auth = request.headers.get("Authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7);
    const result = verifyApiToken(token);
    if (result) {
      execute("UPDATE api_tokens SET last_used_at = ? WHERE user_id = ?", [new Date().toISOString(), result.user_id]);
      const user = queryOne<any>("SELECT id, email, username FROM users WHERE id = ?", [result.user_id]);
      return user || null;
    }
  }
  return null;
}

export async function action({ request }: { request: Request }) {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  // Rate limit: 30 uploads per 10 minutes per IP
  const limited = rateLimit("upload", request, 30, 10 * 60 * 1000);
  if (limited) return limited;

  const user = await authenticateRequest(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const settings = queryOne<any>("SELECT * FROM user_settings WHERE user_id = ?", [user.id]);
  if (!settings) return Response.json({ error: "User settings not found" }, { status: 500 });
  if (!settings.is_active) return Response.json({ error: "Account deactivated" }, { status: 403 });

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return Response.json({ error: "No file provided" }, { status: 400 });

  if (file.size > settings.max_upload_size) return Response.json({ error: "File too large" }, { status: 413 });
  if (settings.disk_used + file.size > settings.disk_quota) return Response.json({ error: "Quota exceeded" }, { status: 413 });

  const ext = (file.name.split(".").pop() || "bin").replace(/[^a-zA-Z0-9]/g, "").slice(0, 10) || "bin";
  const fileName = `${nanoid(10)}.${ext}`;
  const filePath = `${user.id}/${fileName}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const storage = getStorage();
  await storage.save(filePath, buffer);

  const uploadId = nanoid();
  const now = new Date().toISOString();

  // Generate thumbnail for images
  let thumbnailPath: string | null = null;
  let previewPath: string | null = null;
  try {
    thumbnailPath = await generateThumbnail(filePath, file.type);
    previewPath = await generatePreview(filePath, file.type);
  } catch {}

  execute(
    "INSERT INTO uploads (id, user_id, file_name, original_name, mime_type, file_size, file_path, thumbnail_path, preview_path, is_public, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [uploadId, user.id, fileName, file.name, file.type || "application/octet-stream", file.size, filePath, thumbnailPath, previewPath, settings.default_public ? 1 : 0, now, now]
  );

  execute("UPDATE user_settings SET disk_used = disk_used + ? WHERE user_id = ?", [file.size, user.id]);

  const baseUrl = getBaseUrl(request);
  return Response.json({
    id: uploadId,
    url: `${baseUrl}/v/${fileName}`,
    raw_url: `${baseUrl}/r/${fileName}`,
    thumbnail_url: thumbnailPath ? `${baseUrl}/api/files/${thumbnailPath}` : null,
    delete_url: `${baseUrl}/api/delete/${uploadId}`,
    file_name: fileName,
  });
}
