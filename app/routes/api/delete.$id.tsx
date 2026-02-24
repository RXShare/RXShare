import { getSession } from "~/.server/session";
import { queryOne, execute } from "~/.server/db";
import { rateLimit } from "~/.server/rate-limit";
import { validateCsrf } from "~/.server/csrf";
import { logAudit, getClientIp } from "~/.server/audit";
import { dispatchWebhook } from "~/.server/webhooks";

export async function action({ request, params }: { request: Request; params: { id: string } }) {
  if (request.method !== "DELETE") return new Response("Method not allowed", { status: 405 });

  // CSRF protection
  const csrfError = await validateCsrf(request);
  if (csrfError) return csrfError;

  // Rate limit: 60 deletes per 10 minutes
  const limited = rateLimit("delete", request, 60, 10 * 60 * 1000);
  if (limited) return limited;

  const session = await getSession(request);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const upload = queryOne<any>("SELECT * FROM uploads WHERE id = ? AND user_id = ?", [params.id, session.user.id]);
  if (!upload) return Response.json({ error: "Not found" }, { status: 404 });

  // Soft delete: move to trash instead of permanent deletion
  execute("UPDATE uploads SET deleted_at = ? WHERE id = ?", [new Date().toISOString(), params.id]);

  logAudit("delete", { userId: session.user.id, targetType: "upload", targetId: params.id, details: upload.original_name, ip: getClientIp(request) });
  dispatchWebhook("delete", { id: params.id, fileName: upload.file_name, originalName: upload.original_name });

  return Response.json({ ok: true });
}
