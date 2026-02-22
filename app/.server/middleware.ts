import { getSession } from "~/.server/session";
import { isAdmin } from "~/.server/auth";
import { isFirstRun } from "~/.server/db";

export async function appMiddleware(
  { request }: { request: Request; context: any },
  next: () => Promise<Response>
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path.startsWith("/api/") || path.match(/\.(svg|png|jpg|jpeg|gif|webp|ico|css|js)$/)) return next();

  try {
    if (path !== "/setup" && isFirstRun()) {
      return new Response(null, { status: 302, headers: { Location: "/setup" } });
    }
    if (path === "/setup" && !isFirstRun()) {
      return new Response(null, { status: 302, headers: { Location: "/" } });
    }
  } catch {}

  if (path.startsWith("/dashboard")) {
    const session = await getSession(request);
    if (!session) return new Response(null, { status: 302, headers: { Location: "/auth/login" } });
    if (path.startsWith("/dashboard/admin") && !isAdmin(session.user.id)) {
      return new Response(null, { status: 302, headers: { Location: "/dashboard" } });
    }
  }

  if (path.startsWith("/auth/")) {
    const session = await getSession(request);
    if (session) return new Response(null, { status: 302, headers: { Location: "/dashboard" } });
  }

  return next();
}
