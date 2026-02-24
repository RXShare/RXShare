import { queryOne } from "~/.server/db";
import { getStorage } from "~/.server/storage";
import { getSession } from "~/.server/session";

export async function loader({ params, request }: { params: { id: string }; request: Request }) {
  const upload = queryOne<any>("SELECT thumbnail_path, user_id, is_public FROM uploads WHERE id = ?", [params.id]);
  if (!upload?.thumbnail_path) return new Response("Not Found", { status: 404 });

  // Check private file access control
  if (!upload.is_public) {
    const session = await getSession(request);
    if (!session || session.user.id !== upload.user_id) {
      return new Response("Not Found", { status: 404 });
    }
  }

  const storage = await getStorage();
  try {
    const { stream, size } = await storage.readStream(upload.thumbnail_path);
    return new Response(stream, {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Length": String(size),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Not Found", { status: 404 });
  }
}
