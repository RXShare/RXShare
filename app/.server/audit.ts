import { nanoid } from "nanoid";
import { execute, query } from "~/.server/db";

export type AuditAction =
  | "upload" | "delete" | "view" | "download"
  | "login" | "logout" | "signup"
  | "user.create" | "user.delete" | "user.update"
  | "settings.update" | "folder.create" | "folder.delete"
  | "invite.create" | "invite.use"
  | "webhook.create" | "webhook.delete" | "webhook.update";

export function logAudit(
  action: AuditAction,
  opts: { userId?: string; targetType?: string; targetId?: string; details?: string; ip?: string } = {}
) {
  try {
    execute(
      "INSERT INTO audit_logs (id, user_id, action, target_type, target_id, details, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [nanoid(), opts.userId || null, action, opts.targetType || null, opts.targetId || null, opts.details || null, opts.ip || null]
    );
  } catch {}
}

export function getClientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "unknown";
}
