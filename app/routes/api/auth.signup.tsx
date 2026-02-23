import { nanoid } from "nanoid";
import { createUser, generateToken } from "~/.server/auth";
import { createSessionHeaders } from "~/.server/session";
import { execute, queryOne } from "~/.server/db";
import { markSetupDone, isFirstRun } from "~/.server/db";

export async function action({ request }: { request: Request }) {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const body = await request.json();
  const { email, password, username, isSetup, siteName, baseUrl } = body;

  if (!email || !password || !username) return Response.json({ error: "All fields required" }, { status: 400 });

  // Check registration allowed (unless setup on first run)
  const isSetupMode = isSetup && isFirstRun();
  if (!isSetupMode) {
    const sys = queryOne<any>("SELECT allow_registration FROM system_settings LIMIT 1");
    if (sys && !sys.allow_registration) return Response.json({ error: "Registration is disabled" }, { status: 403 });
  }

  try {
    const user = await createUser(email, password, username);

    if (isSetupMode) {
      // Make admin
      execute("UPDATE user_settings SET is_admin = 1 WHERE user_id = ?", [user.id]);
      // Create system settings
      const existing = queryOne<any>("SELECT id FROM system_settings LIMIT 1");
      if (!existing) {
        execute(
          "INSERT INTO system_settings (id, site_name, base_url) VALUES (?, ?, ?)",
          [nanoid(), siteName || "RXShare", baseUrl || null]
        );
      }
      markSetupDone();
    }

    if (isSetupMode) {
      // Auto-login for setup
      const token = generateToken(user.id);
      const headers = await createSessionHeaders(token);
      return Response.json({ user }, { headers });
    }

    return Response.json({ user });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 400 });
  }
}
