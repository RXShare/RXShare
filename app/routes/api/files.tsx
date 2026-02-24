import { getStorage } from "~/.server/storage";
import { queryOne } from "~/.server/db";
import { getSession } from "~/.server/session";
import crypto from "crypto";

const mimeMap: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
  webp: "image/webp", svg: "image/svg+xml", mp4: "video/mp4", webm: "video/webm",
  mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", pdf: "application/pdf",
  json: "application/json", js: "text/javascript", css: "text/css",
  html: "text/html", txt: "text/plain", md: "text/plain",
};

const dangerousTypes = ["text/html", "image/svg+xml", "text/javascript", "application/javascript"];

function getContentType(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  const contentType = mimeMap[ext] || "application/octet-stream";
  return dangerousTypes.includes(contentType) ? "application/octet-stream" : contentType;
}

function parseRange(rangeHeader: string, totalSize: number): { start: number; end: number } | null {
  const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
  if (!match) return null;
  let start = match[1] ? parseInt(match[1], 10) : 0;
  let end = match[2] ? parseInt(match[2], 10) : totalSize - 1;
  if (!match[1] && match[2]) {
    // suffix range: bytes=-500 means last 500 bytes
    start = Math.max(0, totalSize - parseInt(match[2], 10));
    end = totalSize - 1;
  }
  if (start > end || start >= totalSize) return null;
  end = Math.min(end, totalSize - 1);
  return { start, end };
}

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  let filePath = url.pathname.replace("/api/files/", "");
  if (!filePath) return new Response("Not Found", { status: 404 });

  // Prevent path traversal
  filePath = filePath.replace(/\.\./g, "").replace(/\/\//g, "/");
  if (filePath.startsWith("/")) filePath = filePath.slice(1);
  if (!filePath || filePath.includes("..")) return new Response("Forbidden", { status: 403 });

  const storage = await getStorage();
  try {
    const exists = await storage.exists(filePath);
    if (!exists) return new Response("Not Found", { status: 404 });

    // Check private file access control
    const accessCheck = queryOne<any>("SELECT user_id, is_public FROM uploads WHERE file_path = ? OR thumbnail_path = ?", [filePath, filePath]);
    if (accessCheck && !accessCheck.is_public) {
      const session = await getSession(request);
      if (!session || session.user.id !== accessCheck.user_id) {
        return new Response("Not Found", { status: 404 });
      }
    }

    const contentType = getContentType(filePath);
    const rangeHeader = request.headers.get("Range");

    // Generate ETag from file path + size for conditional requests
    const fileSize = await storage.getSize(filePath);
    const etag = `"${crypto.createHash("md5").update(`${filePath}-${fileSize}`).digest("hex")}"`;

    // Check If-None-Match for conditional requests
    const ifNoneMatch = request.headers.get("If-None-Match");
    if (ifNoneMatch === etag) {
      return new Response(null, { status: 304 });
    }

    // Look up original filename for Content-Disposition
    const fileName = filePath.split("/").pop() || "";
    const upload = queryOne<any>("SELECT original_name FROM uploads WHERE file_path = ? OR file_name = ?", [filePath, fileName]);
    const originalName = upload?.original_name?.replace(/["\r\n]/g, "_");

    // Range request (for video/audio seeking)
    if (rangeHeader) {
      const range = parseRange(rangeHeader, fileSize);
      if (!range) {
        return new Response("Range Not Satisfiable", {
          status: 416,
          headers: { "Content-Range": `bytes */${fileSize}` },
        });
      }
      const { start, end } = range;
      const { stream } = await storage.readRangeStream(filePath, start, end);
      return new Response(stream, {
        status: 206,
        headers: {
          "Content-Type": contentType,
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Content-Length": String(end - start + 1),
          "Accept-Ranges": "bytes",
          "Cache-Control": "public, max-age=31536000, immutable",
          "ETag": etag,
          ...(originalName ? { "Content-Disposition": `inline; filename="${originalName}"` } : {}),
          "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    // Full response
    const { stream } = await storage.readStream(filePath);
    return new Response(stream, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Length": String(fileSize),
        "Accept-Ranges": "bytes",
        "ETag": etag,
        ...(originalName ? { "Content-Disposition": `inline; filename="${originalName}"` } : {}),
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Not Found", { status: 404 });
  }
}
