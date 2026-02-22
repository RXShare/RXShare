import { queryOne } from "~/.server/db";
import { getStorage } from "~/.server/storage";

export async function loader({ params }: { params: { fileName: string } }) {
  const upload = queryOne<any>("SELECT * FROM uploads WHERE file_name = ?", [params.fileName]);
  if (!upload || !upload.is_public) throw new Response("Not Found", { status: 404 });
  const storage = getStorage();
  const data = await storage.read(upload.file_path);
  return new Response(data, {
    headers: {
      "Content-Type": upload.mime_type,
      "Content-Disposition": `inline; filename="${upload.original_name}"`,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

export default function RawViewer() {
  return null;
}
