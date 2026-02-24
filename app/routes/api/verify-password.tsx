import bcrypt from "bcryptjs";
import { queryOne } from "~/.server/db";
import { rateLimit } from "~/.server/rate-limit";

export async function action({ request }: { request: Request }) {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const limited = rateLimit("verify-password", request, 20, 10 * 60 * 1000);
  if (limited) return limited;

  const { fileName, password } = await request.json();
  if (!fileName || !password) return Response.json({ error: "Missing fields" }, { status: 400 });

  const upload = queryOne<any>("SELECT id, password_hash FROM uploads WHERE file_name = ?", [fileName]);
  if (!upload || !upload.password_hash) return Response.json({ error: "Not found" }, { status: 404 });

  const valid = await bcrypt.compare(password, upload.password_hash);
  if (!valid) return Response.json({ error: "Wrong password" }, { status: 403 });

  // Return a short-lived token cookie so the viewer can access the file
  const token = `pw_${upload.id}`;
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": `${token}=1; Path=/; Max-Age=3600; HttpOnly; SameSite=Lax`,
    },
  });
}
