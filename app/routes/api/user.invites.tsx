import { nanoid } from "nanoid";
import { getSession } from "~/.server/session";
import { query, queryOne, execute } from "~/.server/db";
import { rateLimit } from "~/.server/rate-limit";
import { validateCsrf } from "~/.server/csrf";
import { logAudit, getClientIp } from "~/.server/audit";

export async function loader({ request }: { request: Request }) {
  const session = await getSession(request);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const settings = queryOne<any>("SELECT invite_quota, invites_used FROM user_settings WHERE user_id = ?", [session.user.id]);
  const invites = query<any>(
    "SELECT i.*, u2.username as used_by_name FROM invites i LEFT JOIN users u2 ON i.used_by = u2.id WHERE i.created_by = ? ORDER BY i.created_at DESC",
    [session.user.id]
  );

  return Response.json({
    invites,
    quota: settings?.invite_quota || 0,
    used: settings?.invites_used || 0,
  });
}

export async function action({ request }: { request: Request }) {
  const csrfError = await validateCsrf(request);
  if (csrfError) return csrfError;

  const session = await getSession(request);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  if (request.method === "POST") {
    const limited = rateLimit("user-invite-create", request, 10, 10 * 60 * 1000);
    if (limited) return limited;

    const settings = queryOne<any>("SELECT invite_quota, invites_used FROM user_settings WHERE user_id = ?", [session.user.id]);
    const quota = settings?.invite_quota || 0;
    const used = settings?.invites_used || 0;

    if (used >= quota) {
      return Response.json({ error: "No invites remaining" }, { status: 403 });
    }

    const id = nanoid();
    const code = nanoid(12);
    const expiresAt = new Date(Date.now() + 72 * 3600000).toISOString(); // 72h default

    execute("INSERT INTO invites (id, code, created_by, max_uses, expires_at) VALUES (?, ?, ?, ?, ?)",
      [id, code, session.user.id, 1, expiresAt]);
    execute("UPDATE user_settings SET invites_used = invites_used + 1 WHERE user_id = ?", [session.user.id]);

    logAudit("invite.create", { userId: session.user.id, targetType: "invite", targetId: id, details: code, ip: getClientIp(request) });

    return Response.json({ id, code });
  }

  if (request.method === "DELETE") {
    const { id } = await request.json();
    // Only allow deleting own invites
    const invite = queryOne<any>("SELECT id FROM invites WHERE id = ? AND created_by = ?", [id, session.user.id]);
    if (!invite) return Response.json({ error: "Not found" }, { status: 404 });
    execute("DELETE FROM invites WHERE id = ?", [id]);
    return Response.json({ ok: true });
  }

  return new Response("Method not allowed", { status: 405 });
}
