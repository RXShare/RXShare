import { getStorage } from "~/.server/storage";

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
    const data = await storage.read(filePath);

    // Guess content type from extension
    const ext = filePath.split(".").pop()?.toLowerCase() || "";
    const mimeMap: Record<string, string> = {
      jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
      webp: "image/webp", svg: "image/svg+xml", mp4: "video/mp4", webm: "video/webm",
      mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", pdf: "application/pdf",
      json: "application/json", js: "text/javascript", css: "text/css",
      html: "text/html", txt: "text/plain", md: "text/plain",
    };
    const contentType = mimeMap[ext] || "application/octet-stream";

    // Prevent XSS: never serve HTML/SVG as executable content from same origin
    const dangerousTypes = ["text/html", "image/svg+xml", "text/javascript", "application/javascript"];
    const finalType = dangerousTypes.includes(contentType) ? "application/octet-stream" : contentType;

    return new Response(data, {
      headers: {
        "Content-Type": finalType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Length": String(data.length),
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Not Found", { status: 404 });
  }
}
