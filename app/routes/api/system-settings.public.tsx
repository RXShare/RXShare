import { queryOne } from "~/.server/db";

export async function loader() {
  try {
    const settings = queryOne<any>("SELECT site_name, site_description, allow_registration, allow_login, primary_color, accent_color, logo_url, background_pattern FROM system_settings LIMIT 1");
    return Response.json(settings || { site_name: "RXShare", allow_registration: 1, allow_login: 1 });
  } catch {
    return Response.json({ site_name: "RXShare", allow_registration: 1, allow_login: 1 });
  }
}
