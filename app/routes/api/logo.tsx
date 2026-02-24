import { getSession } from "~/.server/session";
import { queryOne } from "~/.server/db";
import { mkdir } from "fs/promises";
import { existsSync, createReadStream, createWriteStream } from "fs";
import { join, extname } from "path";
import { Readable } from "stream";
import { stat } from "fs/promises";
import { rateLimit } from "~/.server/rate-limit";
import { validateCsrf } from "~/.server/csrf";

const logoDir = join(process.cwd(), "data");
const allowedExts = [".svg", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico"];
const mimeMap: Record<string, string> = {
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".ico": "image/x-icon",
};

function findLogoFile(): { path: string; ext: string } | null {
  for (const ext of allowedExts) {
    const filePath = join(logoDir, `logo${ext}`);
    if (existsSync(filePath)) return { path: filePath, ext };
  }
  return null;
}

export async function action({ request }: { request: Request }) {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  // CSRF protection
  const csrfError = await validateCsrf(request);
  if (csrfError) return csrfError;

  // Rate limit: 10 logo uploads per 10 minutes
  const limited = rateLimit("logo", request, 10, 10 * 60 * 1000);
  if (limited) return limited;

  const session = await getSession(request);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const settings = queryOne<any>("SELECT is_admin FROM user_settings WHERE user_id = ?", [session.user.id]);
  if (!settings?.is_admin) return Response.json({ error: "Admin only" }, { status: 403 });

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return Response.json({ error: "No file provided" }, { status: 400 });
  if (!file.type.startsWith("image/")) return Response.json({ error: "Images only" }, { status: 400 });
  if (file.size > 5 * 1024 * 1024) return Response.json({ error: "Logo must be under 5MB" }, { status: 400 });

  const ext = extname(file.name).toLowerCase().replace(/[^a-z.]/g, "");
  const safeExt = allowedExts.includes(ext) ? ext : ".png";
  const fileName = `logo${safeExt}`;
  const filePath = join(logoDir, fileName);

  if (!existsSync(logoDir)) await mkdir(logoDir, { recursive: true });

  // Stream the upload to disk instead of buffering
  const fileStream = file.stream() as ReadableStream<Uint8Array>;
  const nodeReadable = Readable.fromWeb(fileStream as any);
  const nodeWritable = createWriteStream(filePath);
  await new Promise<void>((resolve, reject) => {
    nodeReadable.pipe(nodeWritable);
    nodeWritable.on("finish", resolve);
    nodeWritable.on("error", reject);
    nodeReadable.on("error", reject);
  });

  return Response.json({ url: `/api/logo` });
}

export async function loader() {
  const logo = findLogoFile();
  if (!logo) return new Response("Not found", { status: 404 });

  const info = await stat(logo.path);
  const nodeStream = createReadStream(logo.path);
  const stream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
  const contentType = mimeMap[logo.ext] || "application/octet-stream";

  return new Response(stream, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(info.size),
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
    },
  });
}
