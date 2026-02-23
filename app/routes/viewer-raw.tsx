import { queryOne } from "~/.server/db";
import { getStorage } from "~/.server/storage";

export async function loader({ params }: { params: { fileName: string } }) {
  const upload = queryOne<any>("SELECT * FROM uploads WHERE file_name = ?", [params.fileName]);
  if (!upload || !upload.is_public) throw new Response("Not Found", { status: 404 });
  const storage = getStorage();
  const data = await storage.read(upload.file_path);
  const safeName = upload.original_name.replace(/["\r\n]/g, "_");
  // Prevent XSS: force download for dangerous content types
  const dangerousTypes = ["text/html", "image/svg+xml", "text/javascript", "application/javascript"];
  const safeType = dangerousTypes.includes(upload.mime_type) ? "application/octet-stream" : upload.mime_type;
  return new Response(data, {
    headers: {
      "Content-Type": safeType,
      "Content-Disposition": `inline; filename="${safeName}"`,
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export default function RawViewer() {
  return null;
}
