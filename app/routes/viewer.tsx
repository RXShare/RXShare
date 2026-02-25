import { useState, useEffect, useRef } from "react";
import { useLoaderData } from "react-router";
import { queryOne, execute } from "~/.server/db";
import { getSession } from "~/.server/session";
import { getBaseUrl } from "~/.server/base-url";
import { getMimeCategory, formatFileSize } from "~/lib/utils-format";
import { Icon } from "~/components/Icon";
import { codeToHtml } from "shiki";
import QRCode from "qrcode";

export async function loader({ params, request }: { params: { fileName: string }; request: Request }) {
  const upload = queryOne<any>("SELECT u.*, us.embed_title, us.embed_description, us.embed_color, us.embed_author, us.embed_site_name, us.embed_logo_url, us.custom_path, usr.username FROM uploads u LEFT JOIN user_settings us ON u.user_id = us.user_id LEFT JOIN users usr ON u.user_id = usr.id WHERE u.file_name = ?", [params.fileName]);
  if (!upload) throw new Response("Not Found", { status: 404 });

  const session = await getSession(request);
  const isOwner = session && session.user.id === upload.user_id;

  // Check expiration (owner can still access)
  if (upload.expires_at && !isOwner) {
    if (new Date(upload.expires_at) < new Date()) {
      throw new Response("This link has expired", { status: 410 });
    }
  }

  if (!upload.is_public && !isOwner) {
    throw new Response("Not Found", { status: 404 });
  }

  // Check password protection (owner bypasses)
  const needsPassword = !!upload.password_hash && !isOwner;
  if (needsPassword) {
    const { verifyCookieSignature } = await import("~/routes/api/verify-password");
    const cookieHeader = request.headers.get("Cookie") || "";
    const pwCookieName = `pw_${upload.id}`;
    const pwMatch = cookieHeader.match(new RegExp(`${pwCookieName}=([^;]+)`));
    const pwCookieValid = pwMatch ? verifyCookieSignature(pwMatch[1]) : false;
    if (!pwCookieValid) {
      // Return minimal data for password gate
      const sys = queryOne<any>("SELECT primary_color, background_pattern FROM system_settings LIMIT 1");
      return { passwordRequired: true, fileName: params.fileName, originalName: upload.original_name, backgroundPattern: sys?.background_pattern || "grid" };
    }
  }

  // Deduplicate view counts: only increment once per upload per visitor per hour
  const cookieHeader = request.headers.get("Cookie") || "";
  const viewedKey = `viewed_${upload.id}`;
  const alreadyViewed = cookieHeader.includes(viewedKey);
  let setCookieHeader: string | null = null;

  if (!alreadyViewed) {
    execute("UPDATE uploads SET views = views + 1 WHERE id = ?", [upload.id]);
    upload.views = (upload.views || 0) + 1;
    // Set a cookie that expires in 1 hour to prevent re-counting
    setCookieHeader = `${viewedKey}=1; Path=/v/${params.fileName}; Max-Age=3600; HttpOnly; SameSite=Lax`;
  }

  const baseUrl = getBaseUrl(request);
  const sys = queryOne<any>("SELECT primary_color, background_pattern FROM system_settings LIMIT 1");
  const data = { upload, baseUrl, primaryColor: sys?.primary_color || null, backgroundPattern: sys?.background_pattern || "grid" };

  if (setCookieHeader) {
    return new Response(JSON.stringify(data), {
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": setCookieHeader,
      },
    });
  }

  return data;
}

export function meta({ data }: { data: any }) {
  if (!data?.upload) return [{ title: "Not Found" }];
  const { upload, baseUrl, primaryColor } = data;
  const isImage = upload.mime_type?.startsWith("image/");
  const isVideo = upload.mime_type?.startsWith("video/");
  const isGif = upload.mime_type === "image/gif";
  const fileUrl = `${baseUrl}/api/files/${upload.file_path}`;
  const ogImage = isImage ? fileUrl : upload.preview_path ? `${baseUrl}/api/files/${upload.preview_path}` : null;
  const safeColor = (c: string) => /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : "#f97316";
  const siteName = upload.embed_site_name || "RXShare";
  const author = upload.embed_author || upload.username || null;
  return [
    { title: upload.embed_title || upload.original_name },
    { name: "description", content: upload.embed_description || `${upload.original_name} - ${formatFileSize(upload.file_size)}` },
    { property: "og:title", content: upload.embed_title || upload.original_name },
    { property: "og:description", content: upload.embed_description || formatFileSize(upload.file_size) },
    { property: "og:site_name", content: siteName },
    ...(author ? [{ property: "article:author", content: author }] : []),
    ...(ogImage ? [
      { property: "og:image", content: ogImage },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
    ] : []),
    ...(upload.embed_logo_url ? [{ property: "og:image:alt", content: siteName }] : []),
    { property: "og:type", content: isImage ? "image" : "website" },
    { name: "twitter:card", content: isImage || isVideo ? "summary_large_image" : "summary" },
    ...(ogImage ? [{ name: "twitter:image", content: ogImage }] : []),
    { name: "theme-color", content: safeColor(upload.embed_color || primaryColor || "#f97316") },
    ...(isVideo ? [
      { property: "og:video", content: fileUrl },
      { property: "og:video:type", content: upload.mime_type },
    ] : []),
  ];
}

export default function Viewer() {
  const data = useLoaderData<typeof loader>() as any;

  // Password gate
  if (data.passwordRequired) {
    return <PasswordGate fileName={data.fileName} originalName={data.originalName} backgroundPattern={data.backgroundPattern} />;
  }

  const { upload, backgroundPattern } = data;
  const category = getMimeCategory(upload.mime_type);
  const fileUrl = `/api/files/${upload.file_path}`;
  const patClass = `bg-pattern-${backgroundPattern}`;

  const [showQr, setShowQr] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const qrRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const shareUrl = `${data.baseUrl}/v/${upload.file_name}`;
    QRCode.toDataURL(shareUrl, { width: 500, margin: 1, color: { dark: "#ffffff", light: "#00000000" } }).then(setQrDataUrl);
  }, [data.baseUrl, upload.file_name]);

  useEffect(() => {
    if (!showQr) return;
    const handleClick = (e: MouseEvent) => {
      if (qrRef.current && !qrRef.current.contains(e.target as Node)) setShowQr(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showQr]);

  return (
    <div className="min-h-screen flex flex-col relative">
      <div className={`fixed inset-0 ${patClass} opacity-40 pointer-events-none`} />

      {/* Top bar */}
      <div className="sticky top-0 z-20 glass border-b border-white/5 overflow-visible">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-base sm:text-lg font-bold text-white truncate">{upload.original_name}</h1>
            <p className="text-xs sm:text-sm text-gray-500 flex items-center gap-2">
              {formatFileSize(upload.file_size)} <span>•</span>
              <Icon name="visibility" className="text-sm" /> {upload.views} views
              <span>•</span>
              <Icon name="download" className="text-sm" /> {upload.downloads || 0} downloads
            </p>
            {upload.description && (
              <p className="text-xs text-gray-400 mt-0.5">{upload.description}</p>
            )}
          </div>
          <div className="flex gap-2 shrink-0">
            <button onClick={() => window.history.back()}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-300 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors">
              <Icon name="arrow_back" className="text-lg" />
              <span className="hidden sm:inline">Back</span>
            </button>
            <a href={fileUrl} target="_blank" rel="noopener"
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-300 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors">
              <Icon name="open_in_new" className="text-lg" />
              <span className="hidden sm:inline">Raw</span>
            </a>
            <div className="relative" ref={qrRef}>
              <button onClick={() => setShowQr(v => !v)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-300 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors">
                <Icon name="qr_code_2" className="text-lg" />
                <span className="hidden sm:inline">QR</span>
              </button>
              {showQr && qrDataUrl && (
                <div className="absolute right-0 top-full mt-2 p-3 bg-[#141414] rounded-xl border border-white/10 shadow-2xl z-50">
                  <img src={qrDataUrl} alt="QR Code" className="w-72 h-72" />
                </div>
              )}
            </div>
            <a href={fileUrl} download={upload.original_name}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-white bg-primary hover:bg-[var(--primary-hover)] rounded-lg shadow-glow-primary transition-all">
              <Icon name="download" className="text-lg" />
              <span className="hidden sm:inline">Download</span>
            </a>
          </div>
        </div>
      </div>

      {/* Content — fills remaining viewport */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6 relative z-10">
        <div className="w-full max-w-7xl">
          <div className="glass-card rounded-2xl overflow-hidden shadow-glow-card">
            {category === "image" && (
              <img src={fileUrl} alt={upload.original_name}
                className="w-full h-auto max-h-[calc(100vh-8rem)] object-contain mx-auto" />
            )}
            {category === "video" && (
              <video src={fileUrl} controls autoPlay
                className="w-full max-h-[calc(100vh-8rem)] mx-auto" />
            )}
            {category === "audio" && (
              <div className="p-8"><audio src={fileUrl} controls className="w-full" /></div>
            )}
            {category === "pdf" && (
              <iframe src={fileUrl} className="w-full h-[calc(100vh-8rem)]" />
            )}
            {(category === "text" || category === "code") && <TextViewer url={fileUrl} fileName={upload.original_name} />}
            {category === "other" && (
              <div className="text-center py-16">
                <Icon name="description" className="text-6xl text-gray-600 mb-4" />
                <p className="text-gray-500 mb-4">Preview not available for this file type</p>
                <a href={fileUrl} download={upload.original_name}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm text-white bg-primary hover:bg-[var(--primary-hover)] rounded-lg shadow-glow-primary transition-all">
                  <Icon name="download" className="text-lg" /> Download
                </a>
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}

function TextViewer({ url, fileName }: { url: string; fileName: string }) {
  const [content, setContent] = useState<string | null>(null);
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null);
  const codeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then(r => r.text())
      .then(t => { if (!cancelled) setContent(t.slice(0, 50000)); })
      .catch(() => { if (!cancelled) setContent("Failed to load"); });
    return () => { cancelled = true; };
  }, [url]);

  useEffect(() => {
    if (!content || content === "Failed to load") return;
    let cancelled = false;
    const ext = fileName.split(".").pop()?.toLowerCase() || "text";
    const langMap: Record<string, string> = {
      js: "javascript", ts: "typescript", tsx: "tsx", jsx: "jsx",
      py: "python", rb: "ruby", rs: "rust", go: "go", java: "java",
      c: "c", cpp: "cpp", h: "c", hpp: "cpp", cs: "csharp",
      php: "php", sh: "bash", bash: "bash", zsh: "bash",
      json: "json", yaml: "yaml", yml: "yaml", toml: "toml",
      xml: "xml", html: "html", css: "css", scss: "scss",
      sql: "sql", md: "markdown", kt: "kotlin", swift: "swift",
      lua: "lua", r: "r", pl: "perl", ex: "elixir", zig: "zig",
      dockerfile: "dockerfile", makefile: "makefile",
    };
    const lang = langMap[ext] || ext;
    codeToHtml(content, { lang, theme: "tokyo-night" })
      .then(html => { if (!cancelled) setHighlightedHtml(html); })
      .catch(() => { /* fall back to plain pre */ });
    return () => { cancelled = true; };
  }, [content, fileName]);

  // Write highlighted HTML via ref to avoid React reconciliation issues with dangerouslySetInnerHTML
  useEffect(() => {
    if (codeRef.current && highlightedHtml) {
      codeRef.current.innerHTML = highlightedHtml;
    }
  }, [highlightedHtml]);

  // Single stable container — ref-based innerHTML avoids React reconciliation issues
  return (
    <div ref={codeRef} className="p-4 text-sm overflow-auto max-h-[calc(100vh-8rem)] [&_pre]:!bg-transparent [&_code]:!font-mono">
      {!highlightedHtml && <pre className="whitespace-pre-wrap font-mono text-gray-300">{content ?? "Loading..."}</pre>}
    </div>
  );
}

function PasswordGate({ fileName, originalName, backgroundPattern }: { fileName: string; originalName: string; backgroundPattern: string }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const patClass = `bg-pattern-${backgroundPattern}`;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/verify-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName, password }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error || "Wrong password"); return; }
      window.location.reload();
    } catch { setError("Failed to verify"); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative">
      <div className={`fixed inset-0 ${patClass} opacity-40 pointer-events-none`} />
      <div className="glass-card rounded-2xl p-8 max-w-sm w-full space-y-6 relative z-10 shadow-glow-card">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4">
            <Icon name="lock" className="text-3xl text-primary" />
          </div>
          <h1 className="text-xl font-bold text-white">Password Protected</h1>
          <p className="text-sm text-gray-500 mt-1 truncate">{originalName}</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter password"
            className="block w-full px-4 py-3 border border-white/10 rounded-lg bg-[#0a0a0a] text-gray-300 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-sm" autoFocus />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button type="submit" disabled={loading || !password}
            className="w-full bg-primary hover:bg-[var(--primary-hover)] text-white py-3 rounded-lg font-bold shadow-glow-primary transition-all disabled:opacity-50">
            {loading ? "Verifying..." : "Unlock"}
          </button>
        </form>
      </div>
    </div>
  );
}
