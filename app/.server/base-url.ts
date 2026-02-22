import { queryOne } from "~/.server/db";

export function getBaseUrl(request?: Request): string {
  try {
    const sys = queryOne<{ base_url: string | null }>("SELECT base_url FROM system_settings LIMIT 1");
    if (sys?.base_url?.trim()) return sys.base_url.trim();
  } catch {}
  if (process.env.BASE_URL) return process.env.BASE_URL.trim();
  if (request) {
    const url = new URL(request.url);
    if (!url.origin.includes("localhost") && !url.origin.includes("127.0.0.1")) return url.origin;
  }
  return `http://localhost:${process.env.PORT || "3000"}`;
}
