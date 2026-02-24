import { queryOne, execute } from "~/.server/db";
import { getSession } from "~/.server/session";
import { getStorage } from "~/.server/storage";

const dangerousTypes = ["text/html", "image/svg+xml", "text/javascript", "application/javascript"];

function parseRange(rangeHeader: string, totalSize: number): { start: number; end: number } | null {
  const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
  if (!match) return null;
  let start = match[1] ? parseInt(match[1], 10) : 0;
  let end = match[2] ? parseInt(match[2], 10) : totalSize - 1;
  if (!match[1] && match[2]) {
    start = Math.max(0, totalSize - parseInt(match[2], 10));
    end = totalSize - 1;
  }
  if (start > end || start >= totalSize) return null;
  end = Math.min(end, totalSize - 1);
  return { start, end };
}

export async function loader({ params, request }: { params: { fileName: string }; request: Request }) {
  const upload = queryOne<any>("SELECT * FROM uploads WHERE file_name = ?", [params.fileName]);
  if (!upload) throw new Response("Not Found", { status: 404 });

  const session = await getSession(request);
  const isOwner = session && session.user.id === upload.user_id;

  // Check expiration
  if (upload.expires_at && !isOwner && new Date(upload.expires_at) < new Date()) {
    throw new Response("This link has expired", { status: 410 });
  }

  if (!upload.is_public && !isOwner) {
    throw new Response("Not Found", { status: 404 });
  }

  // Check password protection
  if (upload.password_hash && !isOwner) {
    const cookieHeader = request.headers.get("Cookie") || "";
    if (!cookieHeader.includes(`pw_${upload.id}`)) {
      throw new Response("Password required", { status: 403 });
    }
  }

  const storage = await getStorage();
  const safeName = upload.original_name.replace(/["\r\n]/g, "_");
  const safeType = dangerousTypes.includes(upload.mime_type) ? "application/octet-stream" : upload.mime_type;
  const rangeHeader = request.headers.get("Range");

  // Track downloads (only on initial full request, not range continuations)
  if (!rangeHeader) {
    try { execute("UPDATE uploads SET downloads = downloads + 1 WHERE id = ?", [upload.id]); } catch {}
  }

  if (rangeHeader) {
    const totalSize = await storage.getSize(upload.file_path);
    const range = parseRange(rangeHeader, totalSize);
    if (!range) {
      return new Response("Range Not Satisfiable", {
        status: 416,
        headers: { "Content-Range": `bytes */${totalSize}` },
      });
    }
    const { start, end } = range;
    const { stream } = await storage.readRangeStream(upload.file_path, start, end);
    return new Response(stream, {
      status: 206,
      headers: {
        "Content-Type": safeType,
        "Content-Disposition": `inline; filename="${safeName}"`,
        "Content-Range": `bytes ${start}-${end}/${totalSize}`,
        "Content-Length": String(end - start + 1),
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  const { stream, size } = await storage.readStream(upload.file_path);
  return new Response(stream, {
    headers: {
      "Content-Type": safeType,
      "Content-Disposition": `inline; filename="${safeName}"`,
      "Content-Length": String(size),
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export default function RawViewer() {
  return null;
}
