import { useState, useEffect } from "react";
import { useLoaderData } from "react-router";
import { queryOne, execute } from "~/.server/db";
import { getBaseUrl } from "~/.server/base-url";
import { getMimeCategory, formatFileSize } from "~/lib/utils-format";
import { Icon } from "~/components/Icon";

export async function loader({ params, request }: { params: { fileName: string }; request: Request }) {
  const upload = queryOne<any>("SELECT u.*, us.embed_title, us.embed_description, us.embed_color, us.custom_path, usr.username FROM uploads u LEFT JOIN user_settings us ON u.user_id = us.user_id LEFT JOIN users usr ON u.user_id = usr.id WHERE u.file_name = ?", [params.fileName]);
  if (!upload) throw new Response("Not Found", { status: 404 });
  if (!upload.is_public) throw new Response("Not Found", { status: 404 });

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
  const fileUrl = `${baseUrl}/api/files/${upload.file_path}`;
  const previewUrl = upload.preview_path ? `${baseUrl}/api/files/${upload.preview_path}` : isImage ? fileUrl : null;
  const safeColor = (c: string) => /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : "#f97316";
  return [
    { title: upload.embed_title || upload.original_name },
    { name: "description", content: upload.embed_description || `${upload.original_name} - ${formatFileSize(upload.file_size)}` },
    { property: "og:title", content: upload.embed_title || upload.original_name },
    { property: "og:description", content: upload.embed_description || formatFileSize(upload.file_size) },
    ...(previewUrl ? [{ property: "og:image", content: previewUrl }] : []),
    { property: "og:type", content: isImage ? "image" : "website" },
    { name: "theme-color", content: safeColor(upload.embed_color || primaryColor || "#f97316") },
    ...(upload.mime_type?.startsWith("video/") ? [
      { property: "og:video", content: fileUrl },
      { property: "og:video:type", content: upload.mime_type },
    ] : []),
  ];
}

export default function Viewer() {
  const { upload, backgroundPattern } = useLoaderData<typeof loader>();
  const category = getMimeCategory(upload.mime_type);
  const fileUrl = `/api/files/${upload.file_path}`;
  const patClass = `bg-pattern-${backgroundPattern}`;

  return (
    <div className="min-h-screen flex flex-col relative">
      <div className={`fixed inset-0 ${patClass} opacity-40 pointer-events-none`} />

      {/* Top bar */}
      <div className="sticky top-0 z-20 glass border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-base sm:text-lg font-bold text-white truncate">{upload.original_name}</h1>
            <p className="text-xs sm:text-sm text-gray-500 flex items-center gap-2">
              {formatFileSize(upload.file_size)} <span>•</span>
              <Icon name="visibility" className="text-sm" /> {upload.views} views
              <span>•</span>
              <Icon name="download" className="text-sm" /> {upload.downloads || 0} downloads
            </p>
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
            {(category === "text" || category === "code") && <TextViewer url={fileUrl} />}
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

function TextViewer({ url }: { url: string }) {
  const [content, setContent] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then(r => r.text())
      .then(t => { if (!cancelled) setContent(t.slice(0, 50000)); })
      .catch(() => { if (!cancelled) setContent("Failed to load"); });
    return () => { cancelled = true; };
  }, [url]);
  return <pre className="p-4 text-sm overflow-auto max-h-[calc(100vh-8rem)] whitespace-pre-wrap font-mono text-gray-300">{content || "Loading..."}</pre>;
}
