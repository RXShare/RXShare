import { queryOne, execute } from "~/.server/db";

export async function loader({ params }: { params: { code: string } }) {
  const link = queryOne<any>("SELECT sl.*, u.file_name FROM short_links sl JOIN uploads u ON sl.upload_id = u.id WHERE sl.code = ?", [params.code]);
  if (!link) throw new Response("Not Found", { status: 404 });
  // Increment clicks
  execute("UPDATE short_links SET clicks = clicks + 1 WHERE id = ?", [link.id]);
  // Redirect to viewer
  return new Response(null, { status: 302, headers: { Location: `/v/${link.file_name}` } });
}

export default function ShortRedirect() { return null; }
