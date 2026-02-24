import crypto from "crypto";
import { query } from "~/.server/db";

export type WebhookEvent = "upload" | "delete" | "login" | "signup" | "user.create" | "user.delete";

/** Block SSRF: reject internal/private network URLs */
function isInternalUrl(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    const host = u.hostname.toLowerCase();
    // Block localhost, private IPs, link-local, metadata endpoints
    if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]") return true;
    if (host === "0.0.0.0" || host === "[::]") return true;
    if (host.endsWith(".local") || host.endsWith(".internal")) return true;
    // AWS metadata
    if (host === "169.254.169.254" || host === "metadata.google.internal") return true;
    // Private ranges
    const parts = host.split(".").map(Number);
    if (parts.length === 4 && parts.every(p => !isNaN(p))) {
      if (parts[0] === 10) return true;
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
      if (parts[0] === 192 && parts[1] === 168) return true;
      if (parts[0] === 169 && parts[1] === 254) return true;
    }
    return false;
  } catch {
    return true; // Invalid URL = block
  }
}

export function dispatchWebhook(event: WebhookEvent, payload: Record<string, any>) {
  const hooks = query<any>("SELECT * FROM webhooks WHERE is_active = 1");
  for (const hook of hooks) {
    const events = (hook.events || "").split(",").map((e: string) => e.trim());
    if (!events.includes(event) && !events.includes("*")) continue;

    // SSRF protection: skip internal/private network URLs
    if (isInternalUrl(hook.url)) continue;

    const body = JSON.stringify({ event, timestamp: new Date().toISOString(), data: payload });
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (hook.secret) {
      headers["X-Webhook-Signature"] = crypto.createHmac("sha256", hook.secret).update(body).digest("hex");
    }

    // Fire and forget
    fetch(hook.url, { method: "POST", headers, body }).catch(() => {});
  }
}
