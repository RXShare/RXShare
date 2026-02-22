import { Outlet, useLoaderData } from "react-router";
import { getSession } from "~/.server/session";
import { isAdmin } from "~/.server/auth";
import { queryOne } from "~/.server/db";
import { DashboardLayout } from "~/components/DashboardLayout";

export async function loader({ request }: { request: Request }) {
  const session = await getSession(request);
  if (!session) throw new Response(null, { status: 302, headers: { Location: "/auth/login" } });
  const systemSettings = queryOne<any>("SELECT * FROM system_settings LIMIT 1");
  return {
    user: session.user,
    isAdmin: isAdmin(session.user.id),
    systemSettings: systemSettings || null,
  };
}

export default function DashboardLayoutRoute() {
  const { user, isAdmin: admin, systemSettings } = useLoaderData<typeof loader>();
  return (
    <DashboardLayout user={user} systemSettings={systemSettings} isAdmin={admin}>
      <Outlet context={{ user, systemSettings, isAdmin: admin }} />
    </DashboardLayout>
  );
}
