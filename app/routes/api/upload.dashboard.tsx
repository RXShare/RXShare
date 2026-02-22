import { getSession } from "~/.server/session";
import { query } from "~/.server/db";

export async function loader({ request }: { request: Request }) {
  const session = await getSession(request);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const uploads = query<any>("SELECT * FROM uploads WHERE user_id = ? ORDER BY created_at DESC", [session.user.id]);
  return Response.json(uploads);
}
