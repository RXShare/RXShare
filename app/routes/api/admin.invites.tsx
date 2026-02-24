import { nanoid } from "nanoid";
import { getSession } from "~/.server/session";
import { isAdmin } from "~/.server/auth";
import { query, execute } from "~/.server/db";
import { rateLimit } from "~/.server/rate-limit";
import { validateCsrf } from "~/.server/csrf";
import { logAudit, getClientIp } from "~/.server/audit";

export async function loader({ request }: { request: Request }) {
  const session = await getSession(request);
  if (!session || !isAdmin(session.user.id)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const invites = query<any>("SELECT i.*, u.username as created_by_name, u2.username as used_by_name FROM invites i LEFT JOIN users u ON i.created_by = u.id LEFT JOIN users u2 ON i.used_by = u2.id ORDER BY i.created_at DESC");
  return Response.json({ invites });
}

export async function action({ request }: { request: Request }) {
  const csrfError = await validateCsrf(request);
  if (csrfError) return csrfError;

  const session = await getSession(request);
  if (!session || !isAdmin(session.user.id)) return Response.json({ error: "Forbidden" }, { status: 403 });

  if (request.method === "POST") {
    const limited = rateLimit("invite-create", request, 20, 10 * 60 * 1000);
    if (limited) return limited;
    const { max_uses, expires_hours } = await request.json();
    const id = nanoid();
    const code = nanoid(12);
    const expiresAt = expires_hours ? new Date(Date.now() + expires_hours * 3600000).toISOString() : null;
    execute("INSERT INTO invites (id, code, created_by, max_uses, expires_at) VALUES (?, ?, ?, ?, ?)",
      [id, code, session.user.id, max_uses || 1, expiresAt]);
    logAudit("invite.create", { userId: session.user.id, targetType: "invite", targetId: id, details: code, ip: getClientIp(request) });
    return Response.json({ id, code });
  }

  if (request.method === "DELETE") {
    const { id } = await request.json();
    execute("DELETE FROM invites WHERE id = ?", [id]);
    return Response.json({ ok: true });
  }

  return new Response("Method not allowed", { status: 405 });
}
