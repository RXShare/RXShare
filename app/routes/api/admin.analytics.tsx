import { getSession } from "~/.server/session";
import { isAdmin } from "~/.server/auth";
import { query } from "~/.server/db";

export async function loader({ request }: { request: Request }) {
  const session = await getSession(request);
  if (!session || !isAdmin(session.user.id)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const range = url.searchParams.get("range") || "month"; // day, week, month, lifetime

  // Calculate date filter
  let dateFilter = "";
  let days = 30;
  switch (range) {
    case "day": days = 1; dateFilter = "AND created_at >= date('now', '-1 day')"; break;
    case "week": days = 7; dateFilter = "AND created_at >= date('now', '-7 days')"; break;
    case "month": days = 30; dateFilter = "AND created_at >= date('now', '-30 days')"; break;
    case "lifetime": days = 0; dateFilter = ""; break;
  }

  const uploadsPerDay = query<any>(
    `SELECT DATE(created_at) as date, COUNT(*) as count, SUM(file_size) as size FROM uploads WHERE 1=1 ${dateFilter} GROUP BY DATE(created_at) ORDER BY date`
  );

  const topUploaders = query<any>(
    `SELECT u.username, COUNT(up.id) as count, SUM(up.file_size) as size FROM uploads up JOIN users u ON up.user_id = u.id WHERE 1=1 ${dateFilter.replace('created_at', 'up.created_at')} GROUP BY up.user_id ORDER BY count DESC LIMIT 5`
  );

  const typeDistribution = query<any>(
    `SELECT mime_type, COUNT(*) as count FROM uploads WHERE 1=1 ${dateFilter} GROUP BY mime_type`
  );

  const totals = query<any>(
    `SELECT COALESCE(SUM(views), 0) as total_views, COALESCE(SUM(downloads), 0) as total_downloads FROM uploads WHERE 1=1 ${dateFilter}`
  );

  // Total counts (always lifetime for the stat cards)
  const lifetimeTotals = query<any>(
    "SELECT COALESCE(SUM(views), 0) as total_views, COALESCE(SUM(downloads), 0) as total_downloads, COUNT(*) as total_uploads FROM uploads"
  );

  return Response.json({
    uploadsPerDay,
    topUploaders,
    typeDistribution,
    totalViews: totals[0]?.total_views ?? 0,
    totalDownloads: totals[0]?.total_downloads ?? 0,
    lifetimeViews: lifetimeTotals[0]?.total_views ?? 0,
    lifetimeDownloads: lifetimeTotals[0]?.total_downloads ?? 0,
    lifetimeUploads: lifetimeTotals[0]?.total_uploads ?? 0,
    range,
    days,
  });
}
