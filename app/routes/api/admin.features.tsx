import { getSession } from "~/.server/session";
import { isAdmin } from "~/.server/auth";
import { getFeatureFlags, updateFeatureFlag } from "~/.server/features";
import { validateCsrf } from "~/.server/csrf";

export async function loader({ request }: { request: Request }) {
  const session = await getSession(request);
  if (!session || !isAdmin(session.user.id)) return Response.json({ error: "Forbidden" }, { status: 403 });
  return Response.json({ flags: getFeatureFlags() });
}

export async function action({ request }: { request: Request }) {
  const csrfError = await validateCsrf(request);
  if (csrfError) return csrfError;
  const session = await getSession(request);
  if (!session || !isAdmin(session.user.id)) return Response.json({ error: "Forbidden" }, { status: 403 });

  if (request.method === "PUT") {
    const { key, enabled, members_enabled } = await request.json();
    if (!key) return Response.json({ error: "Missing key" }, { status: 400 });
    updateFeatureFlag(key, !!enabled, !!members_enabled);
    return Response.json({ ok: true });
  }

  return new Response("Method not allowed", { status: 405 });
}
