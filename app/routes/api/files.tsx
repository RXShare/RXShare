import { getStorage } from "~/.server/storage";

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

    const contentType = getContentType(filePath);
    const rangeHeader = request.headers.get("Range");

    // Range request (for video/audio seeking)
    if (rangeHeader) {
      const totalSize = await storage.getSize(filePath);
      const range = parseRange(rangeHeader, totalSize);
      if (!range) {
        return new Response("Range Not Satisfiable", {
          status: 416,
          headers: { "Content-Range": `bytes */${totalSize}` },
        });
      }
      const { start, end } = range;
      const { stream } = await storage.readRangeStream(filePath, start, end);
      return new Response(stream, {
        status: 206,
        headers: {
          "Content-Type": contentType,
          "Content-Range": `bytes ${start}-${end}/${totalSize}`,
          "Content-Length": String(end - start + 1),
          "Accept-Ranges": "bytes",
          "Cache-Control": "public, max-age=31536000, immutable",
          "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    // Full response
    const { stream, size } = await storage.readStream(filePath);
    return new Response(stream, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Length": String(size),
        "Accept-Ranges": "bytes",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Not Found", { status: 404 });
  }
}
