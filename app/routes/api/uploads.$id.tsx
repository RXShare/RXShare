import { getSession } from "~/.server/session";
import { queryOne, execute } from "~/.server/db";
import { rateLimit } from "~/.server/rate-limit";
import { validateCsrf } from "~/.server/csrf";

export async function action({ request, params }: { request: Request; params: { id: string } }) {
  if (request.method !== "PATCH") return new Response("Method not allowed", { status: 405 });

  // CSRF protection
  const csrfError = await validateCsrf(request);
  if (csrfError) return csrfError;

  // Rate limit: 60 visibility toggles per 10 minutes
  const limited = rateLimit("uploads-patch", request, 60, 10 * 60 * 1000);
  if (limited) return limited;

  const session = await getSession(request);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const upload = queryOne<any>("SELECT * FROM uploads WHERE id = ? AND user_id = ?", [params.id, session.user.id]);
  if (!upload) return Response.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  if (body.is_public !== undefined) {
    execute("UPDATE uploads SET is_public = ?, updated_at = ? WHERE id = ?", [body.is_public ? 1 : 0, new Date().toISOString(), params.id]);
  }
  return Response.json({ ok: true });
}
