import crypto from "crypto";
import { query } from "~/.server/db";

export type WebhookEvent = "upload" | "delete" | "login" | "signup" | "user.create" | "user.delete";

export function dispatchWebhook(event: WebhookEvent, payload: Record<string, any>) {
  const hooks = query<any>("SELECT * FROM webhooks WHERE is_active = 1");
  for (const hook of hooks) {
    const events = (hook.events || "").split(",").map((e: string) => e.trim());
    if (!events.includes(event) && !events.includes("*")) continue;

    const body = JSON.stringify({ event, timestamp: new Date().toISOString(), data: payload });
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (hook.secret) {
      headers["X-Webhook-Signature"] = crypto.createHmac("sha256", hook.secret).update(body).digest("hex");
    }

    // Fire and forget
    fetch(hook.url, { method: "POST", headers, body }).catch(() => {});
  }
}
