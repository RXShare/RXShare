import { nanoid } from "nanoid";
import { getSession } from "~/.server/session";
import { query, execute } from "~/.server/db";
import { rateLimit } from "~/.server/rate-limit";
import { validateCsrf } from "~/.server/csrf";
import { logAudit, getClientIp } from "~/.server/audit";

export async function loader({ request }: { request: Request }) {
  const session = await getSession(request);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const folders = query<any>("SELECT * FROM folders WHERE user_id = ? ORDER BY created_at DESC", [session.user.id]);
  return Response.json({ folders });
}

export async function action({ request }: { request: Request }) {
  const csrfError = await validateCsrf(request);
  if (csrfError) return csrfError;

  const session = await getSession(request);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  if (request.method === "POST") {
    const limited = rateLimit("folder-create", request, 30, 10 * 60 * 1000);
    if (limited) return limited;
    const { name } = await request.json();
    if (!name?.trim()) return Response.json({ error: "Name required" }, { status: 400 });
    const id = nanoid();
    execute("INSERT INTO folders (id, user_id, name) VALUES (?, ?, ?)", [id, session.user.id, name.trim()]);
    logAudit("folder.create", { userId: session.user.id, targetType: "folder", targetId: id, details: name.trim(), ip: getClientIp(request) });
    return Response.json({ id, name: name.trim() });
  }

  if (request.method === "DELETE") {
    const { id } = await request.json();
    execute("UPDATE uploads SET folder_id = NULL WHERE folder_id = ? AND user_id = ?", [id, session.user.id]);
    execute("DELETE FROM folders WHERE id = ? AND user_id = ?", [id, session.user.id]);
    logAudit("folder.delete", { userId: session.user.id, targetType: "folder", targetId: id, ip: getClientIp(request) });
    return Response.json({ ok: true });
  }

  if (request.method === "PATCH") {
    const { id, fileIds } = await request.json();
    if (!id || !Array.isArray(fileIds)) return Response.json({ error: "Invalid" }, { status: 400 });
    for (const fid of fileIds) {
      execute("UPDATE uploads SET folder_id = ? WHERE id = ? AND user_id = ?", [id, fid, session.user.id]);
    }
    return Response.json({ ok: true });
  }

  return new Response("Method not allowed", { status: 405 });
}
