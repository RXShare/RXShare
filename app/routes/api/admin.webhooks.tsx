import { nanoid } from "nanoid";
import crypto from "crypto";
import { getSession } from "~/.server/session";
import { isAdmin } from "~/.server/auth";
import { query, execute } from "~/.server/db";
import { rateLimit } from "~/.server/rate-limit";
import { validateCsrf } from "~/.server/csrf";
import { logAudit, getClientIp } from "~/.server/audit";

export async function loader({ request }: { request: Request }) {
  const session = await getSession(request);
  if (!session || !isAdmin(session.user.id)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const webhooks = query<any>("SELECT * FROM webhooks ORDER BY created_at DESC");
  return Response.json({ webhooks });
}

export async function action({ request }: { request: Request }) {
  const csrfError = await validateCsrf(request);
  if (csrfError) return csrfError;

  const session = await getSession(request);
  if (!session || !isAdmin(session.user.id)) return Response.json({ error: "Forbidden" }, { status: 403 });

  if (request.method === "POST") {
    const limited = rateLimit("webhook-create", request, 20, 10 * 60 * 1000);
    if (limited) return limited;
    const { name, url, events } = await request.json();
    if (!name?.trim() || !url?.trim()) return Response.json({ error: "Name and URL required" }, { status: 400 });
    // Validate URL format and block internal addresses (SSRF)
    try {
      const parsed = new URL(url.trim());
      if (!["http:", "https:"].includes(parsed.protocol)) return Response.json({ error: "URL must use http or https" }, { status: 400 });
      const host = parsed.hostname.toLowerCase();
      const blocked = ["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0", "169.254.169.254", "metadata.google.internal"];
      if (blocked.includes(host) || host.endsWith(".local") || host.endsWith(".internal")) {
        return Response.json({ error: "Internal URLs are not allowed" }, { status: 400 });
      }
      const parts = host.split(".").map(Number);
      if (parts.length === 4 && parts.every(p => !isNaN(p))) {
        if (parts[0] === 10 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168) || (parts[0] === 169 && parts[1] === 254)) {
          return Response.json({ error: "Private network URLs are not allowed" }, { status: 400 });
        }
      }
    } catch { return Response.json({ error: "Invalid URL" }, { status: 400 }); }
    const id = nanoid();
    const secret = crypto.randomBytes(32).toString("hex");
    execute("INSERT INTO webhooks (id, name, url, events, secret) VALUES (?, ?, ?, ?, ?)",
      [id, name.trim(), url.trim(), events || "upload,delete", secret]);
    logAudit("webhook.create", { userId: session.user.id, targetType: "webhook", targetId: id, details: name.trim(), ip: getClientIp(request) });
    return Response.json({ id, secret });
  }

  if (request.method === "DELETE") {
    const { id } = await request.json();
    execute("DELETE FROM webhooks WHERE id = ?", [id]);
    logAudit("webhook.delete", { userId: session.user.id, targetType: "webhook", targetId: id, ip: getClientIp(request) });
    return Response.json({ ok: true });
  }

  if (request.method === "PATCH") {
    const { id, is_active, events } = await request.json();
    if (is_active !== undefined) execute("UPDATE webhooks SET is_active = ? WHERE id = ?", [is_active ? 1 : 0, id]);
    if (events !== undefined) execute("UPDATE webhooks SET events = ? WHERE id = ?", [events, id]);
    logAudit("webhook.update", { userId: session.user.id, targetType: "webhook", targetId: id, ip: getClientIp(request) });
    return Response.json({ ok: true });
  }

  return new Response("Method not allowed", { status: 405 });
}
