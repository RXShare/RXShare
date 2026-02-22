import { getStorage } from "~/.server/storage";

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const filePath = url.pathname.replace("/api/files/", "");
  if (!filePath) return new Response("Not Found", { status: 404 });

  const storage = getStorage();
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

    return new Response(data, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Length": String(data.length),
      },
    });
  } catch {
    return new Response("Not Found", { status: 404 });
  }
}
