import { query, queryOne, execute } from "./db";

export interface FeatureFlag {
  key: string;
  label: string;
  description: string;
  enabled: number;        // 1 = on, 0 = off
  members_enabled: number; // 1 = members can use, 0 = admin-only
}

// All toggleable features with defaults
const DEFAULTS: Omit<FeatureFlag, "enabled" | "members_enabled">[] = [
  { key: "folders", label: "Folders / Albums", description: "Organize files into folders" },
  { key: "short_links", label: "URL Shortener", description: "Create short links for files" },
  { key: "password_protection", label: "Password Protection", description: "Password-protect individual files" },
  { key: "file_expiration", label: "File Expiration", description: "Set auto-expiry on uploads" },
  { key: "file_notes", label: "File Notes", description: "Add descriptions to files" },
  { key: "advanced_search", label: "Advanced Search", description: "Filter by type and status" },
  { key: "duplicate_detection", label: "Duplicate Detection", description: "Block duplicate file uploads per user" },
  { key: "trash", label: "Trash / Recycle Bin", description: "Soft-delete files before permanent removal" },
  { key: "webhooks", label: "Webhooks", description: "Send HTTP callbacks on events" },
  { key: "custom_paths", label: "Custom URL Paths", description: "Users set custom vanity URLs" },
  { key: "zip_download", label: "Zip Download", description: "Download multiple files as zip" },
  { key: "qr_codes", label: "QR Codes", description: "Generate QR codes for shared files" },
];

/** Ensure all default flags exist in DB */
export function ensureFeatureFlags(): void {
  for (const d of DEFAULTS) {
    const exists = queryOne<any>("SELECT key FROM feature_flags WHERE key = ?", [d.key]);
    if (!exists) {
      execute(
        "INSERT INTO feature_flags (key, label, description, enabled, members_enabled) VALUES (?, ?, ?, 1, 1)",
        [d.key, d.label, d.description]
      );
    }
  }
}

/** Get all feature flags */
export function getFeatureFlags(): FeatureFlag[] {
  ensureFeatureFlags();
  return query<FeatureFlag>("SELECT * FROM feature_flags ORDER BY label");
}

/** Check if a feature is enabled (optionally check member access) */
export function isFeatureEnabled(key: string, isAdmin: boolean = false): boolean {
  const flag = queryOne<FeatureFlag>("SELECT enabled, members_enabled FROM feature_flags WHERE key = ?", [key]);
  if (!flag || !flag.enabled) return false;
  if (isAdmin) return true;
  return !!flag.members_enabled;
}

/** Update a feature flag */
export function updateFeatureFlag(key: string, enabled: boolean, membersEnabled: boolean): void {
  execute("UPDATE feature_flags SET enabled = ?, members_enabled = ? WHERE key = ?", [enabled ? 1 : 0, membersEnabled ? 1 : 0, key]);
}

/** Get flags as a simple map for client-side use */
export function getFeatureFlagsMap(isAdmin: boolean = false): Record<string, boolean> {
  const flags = getFeatureFlags();
  const map: Record<string, boolean> = {};
  for (const f of flags) {
    if (!f.enabled) { map[f.key] = false; continue; }
    map[f.key] = isAdmin ? true : !!f.members_enabled;
  }
  return map;
}
