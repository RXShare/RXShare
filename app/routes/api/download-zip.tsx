import archiver from "archiver";
import { PassThrough, Readable } from "stream";
import { getSession } from "~/.server/session";
import { query } from "~/.server/db";
import { getStorage } from "~/.server/storage";
import { rateLimit } from "~/.server/rate-limit";
import { validateCsrf } from "~/.server/csrf";
import { isFeatureEnabled } from "~/.server/features";
import { isAdmin } from "~/.server/auth";

export async function action({ request }: { request: Request }) {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const csrfError = await validateCsrf(request);
  if (csrfError) return csrfError;

  const limited = rateLimit("zip-download", request, 10, 10 * 60 * 1000);
  if (limited) return limited;

  const session = await getSession(request);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isFeatureEnabled("zip_download", isAdmin(session.user.id))) return Response.json({ error: "Feature disabled" }, { status: 403 });

  const { ids } = await request.json();
  if (!Array.isArray(ids) || ids.length === 0) return Response.json({ error: "No files selected" }, { status: 400 });
  if (ids.length > 100) return Response.json({ error: "Max 100 files per zip" }, { status: 400 });

  // Fetch uploads owned by this user
  const placeholders = ids.map(() => "?").join(",");
  const uploads = query<any>(
    `SELECT id, file_path, original_name FROM uploads WHERE id IN (${placeholders}) AND user_id = ?`,
    [...ids, session.user.id]
  );
  if (uploads.length === 0) return Response.json({ error: "No files found" }, { status: 404 });

  const storage = await getStorage();
  const archive = archiver("zip", { zlib: { level: 1 } }); // fast compression
  const passthrough = new PassThrough();
  archive.pipe(passthrough);

  // Track used filenames to avoid duplicates in zip
  const usedNames = new Map<string, number>();
  for (const upload of uploads) {
    let name = upload.original_name || "file";
    const count = usedNames.get(name) || 0;
    if (count > 0) {
      const ext = name.includes(".") ? "." + name.split(".").pop() : "";
      const base = ext ? name.slice(0, -ext.length) : name;
      name = `${base} (${count})${ext}`;
    }
    usedNames.set(upload.original_name || "file", count + 1);

    try {
      const data = await storage.read(upload.file_path);
      archive.append(data, { name });
    } catch {}
  }

  archive.finalize();

  const webStream = Readable.toWeb(passthrough) as ReadableStream<Uint8Array>;
  return new Response(webStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="rxshare-download.zip"`,
    },
  });
}
