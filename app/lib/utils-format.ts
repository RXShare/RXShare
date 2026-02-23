export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffSecs < 60) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function getAvatarUrl(seed: string, size = 80): string {
  const initials = seed
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() || "")
    .join("") || "?";
  // Generate a consistent color from the seed
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  const bg = `hsl(${hue}, 45%, 25%)`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="${bg}"/><text x="50%" y="50%" dy=".1em" fill="#fff" font-family="system-ui,sans-serif" font-size="${size * 0.4}" font-weight="600" text-anchor="middle" dominant-baseline="central">${initials}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function generateToken(): string {
  // Use crypto.getRandomValues for secure token generation
  const bytes = new Uint8Array(30);
  crypto.getRandomValues(bytes);
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "rxshare_";
  for (let i = 0; i < 30; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

export function getMimeCategory(mimeType: string): "image" | "video" | "audio" | "pdf" | "text" | "code" | "other" {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("text/")) return "text";
  if (["application/json", "application/javascript", "application/xml", "application/typescript"].includes(mimeType)) return "code";
  return "other";
}

export function getLanguageFromFilename(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    js: "javascript", ts: "typescript", tsx: "tsx", jsx: "jsx",
    py: "python", rb: "ruby", go: "go", rs: "rust",
    java: "java", kt: "kotlin", cs: "csharp", cpp: "cpp",
    c: "c", h: "c", php: "php", swift: "swift",
    html: "html", css: "css", scss: "scss", less: "less",
    json: "json", yaml: "yaml", yml: "yaml", xml: "xml",
    md: "markdown", sql: "sql", sh: "bash", bash: "bash",
    dockerfile: "dockerfile", toml: "toml", ini: "ini",
  };
  return map[ext] || "plaintext";
}
