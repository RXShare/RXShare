import { getSession } from "~/.server/session";
import { isAdmin, createUser } from "~/.server/auth";
import { execute } from "~/.server/db";
import { rateLimit } from "~/.server/rate-limit";
import { validateCsrf } from "~/.server/csrf";

export async function action({ request }: { request: Request }) {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const csrfError = await validateCsrf(request);
  if (csrfError) return csrfError;

  const session = await getSession(request);
  if (!session || !isAdmin(session.user.id)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const limited = rateLimit("admin-create-user", request, 20, 10 * 60 * 1000);
  if (limited) return limited;

  const { email, username, password, is_admin } = await request.json();
  if (!email || !username || !password) {
    return Response.json({ error: "Email, username, and password are required" }, { status: 400 });
  }

  try {
    const user = await createUser(email, password, username);
    if (is_admin) {
      execute("UPDATE user_settings SET is_admin = 1 WHERE user_id = ?", [user.id]);
    }
    return Response.json({ ok: true, user });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 400 });
  }
}
