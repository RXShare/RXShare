import { getSession } from "~/.server/session";
import { isAdmin } from "~/.server/auth";
import { query } from "~/.server/db";

export async function loader({ request }: { request: Request }) {
  const session = await getSession(request);
  if (!session || !isAdmin(session.user.id)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const uploadsPerDay = query<any>(
    "SELECT DATE(created_at) as date, COUNT(*) as count, SUM(file_size) as size FROM uploads WHERE created_at >= date('now', '-30 days') GROUP BY DATE(created_at) ORDER BY date"
  );

  const topUploaders = query<any>(
    "SELECT u.username, COUNT(up.id) as count, SUM(up.file_size) as size FROM uploads up JOIN users u ON up.user_id = u.id GROUP BY up.user_id ORDER BY count DESC LIMIT 5"
  );

  const typeDistribution = query<any>(
    "SELECT mime_type, COUNT(*) as count FROM uploads GROUP BY mime_type"
  );

  const totals = query<any>(
    "SELECT COALESCE(SUM(views), 0) as total_views, COALESCE(SUM(downloads), 0) as total_downloads FROM uploads"
  );

  return Response.json({
    uploadsPerDay,
    topUploaders,
    typeDistribution,
    totalViews: totals[0]?.total_views ?? 0,
    totalDownloads: totals[0]?.total_downloads ?? 0,
  });
}
