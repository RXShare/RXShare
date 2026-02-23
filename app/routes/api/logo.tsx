import { getSession } from "~/.server/session";
import { queryOne } from "~/.server/db";
import { writeFile, mkdir, readFile } from "fs/promises";
import { existsSync } from "fs";
import { join, extname } from "path";

const logoDir = join(process.cwd(), "data");

export async function action({ request }: { request: Request }) {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const session = await getSession(request);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const settings = queryOne<any>("SELECT is_admin FROM user_settings WHERE user_id = ?", [session.user.id]);
  if (!settings?.is_admin) return Response.json({ error: "Admin only" }, { status: 403 });

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return Response.json({ error: "No file provided" }, { status: 400 });
  if (!file.type.startsWith("image/")) return Response.json({ error: "Images only" }, { status: 400 });

  const ext = extname(file.name) || ".png";
  const fileName = `logo${ext}`;
  const filePath = join(logoDir, fileName);

  if (!existsSync(logoDir)) await mkdir(logoDir, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buffer);

  return Response.json({ url: `/api/logo` });
}

export async function loader({ request }: { request: Request }) {
  // Serve the logo file
  const extensions = [".svg", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico"];
  for (const ext of extensions) {
    const filePath = join(logoDir, `logo${ext}`);
    if (existsSync(filePath)) {
      const data = await readFile(filePath);
      const mimeMap: Record<string, string> = {
        ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".ico": "image/x-icon",
      };
      return new Response(data, {
        headers: {
          "Content-Type": mimeMap[ext] || "application/octet-stream",
          "Cache-Control": "public, max-age=3600",
        },
      });
    }
  }
  return new Response("Not found", { status: 404 });
}
