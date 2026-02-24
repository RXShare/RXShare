import { query, queryOne } from "~/.server/db";
import { useLoaderData } from "react-router";
import { formatFileSize, getMimeCategory } from "~/lib/utils-format";
import { getBaseUrl } from "~/.server/base-url";
import { Icon } from "~/components/Icon";
import { cn } from "~/lib/utils";


export async function loader({ params, request }: { params: { customPath: string; fileName?: string }; request: Request }) {
  const { customPath, fileName } = params;

  // Look up user by custom_path
  const row = queryOne<any>(
    "SELECT u.id, u.username, us.embed_title, us.embed_description, us.embed_color, us.embed_author, us.embed_site_name, us.embed_logo_url FROM users u JOIN user_settings us ON u.id = us.user_id WHERE us.custom_path = ?",
    [customPath]
  );
  if (!row) throw new Response("Not Found", { status: 404 });

  const sys = queryOne<any>("SELECT primary_color, background_pattern FROM system_settings LIMIT 1");
  const baseUrl = getBaseUrl(request);

  if (fileName) {
    const upload = queryOne<any>("SELECT file_name FROM uploads WHERE user_id = ? AND file_name = ? AND is_public = 1", [row.id, fileName]);
    if (!upload) throw new Response("Not Found", { status: 404 });
    // Redirect to the main viewer so the page looks identical
    return new Response(null, { status: 302, headers: { Location: `/v/${upload.file_name}` } });
  }

  const uploads = query<any>("SELECT * FROM uploads WHERE user_id = ? AND is_public = 1 ORDER BY created_at DESC", [row.id]);
  return { type: "list" as const, uploads, user: row, baseUrl, primaryColor: sys?.primary_color || null, backgroundPattern: sys?.background_pattern || "grid" };
}

export function meta({ data }: { data: any }) {
  if (!data) return [{ title: "Not Found" }];
  if (data.type === "list" && data.user) {
    return [
      { title: `${data.user.username}'s files` },
      { name: "description", content: `${data.uploads?.length || 0} public files` },
    ];
  }
  return [{ title: "Not Found" }];
}

export default function CustomPathViewer() {
  const data = useLoaderData<typeof loader>();
  const patClass = `bg-pattern-${data.backgroundPattern}`;
  const { uploads, user } = data;

  const getFileIconName = (mimeType: string) => {
    const cat = getMimeCategory(mimeType);
    if (cat === "image") return "image";
    if (cat === "video") return "play_arrow";
    if (cat === "audio") return "music_note";
    return "folder_zip";
  };
  const getFileIconColor = (mimeType: string) => {
    const cat = getMimeCategory(mimeType);
    if (cat === "image") return "text-blue-500 drop-shadow-[0_0_15px_rgba(59,130,246,0.5)]";
    if (cat === "video") return "text-purple-500 drop-shadow-[0_0_15px_rgba(168,85,247,0.5)]";
    if (cat === "audio") return "text-pink-500 drop-shadow-[0_0_15px_rgba(236,72,153,0.5)]";
    return "text-yellow-500 drop-shadow-[0_0_15px_rgba(234,179,8,0.5)]";
  };

  return (
    <div className="min-h-screen p-4 md:p-8 relative">
      <div className={`fixed inset-0 ${patClass} opacity-40 pointer-events-none`} />
      <div className="max-w-5xl mx-auto space-y-8 relative z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => window.history.back()}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-300 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors">
            <Icon name="arrow_back" className="text-lg" /> Back
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
              <Icon name="person" className="text-white text-xl" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">{user.username}'s files</h1>
              <p className="text-sm text-gray-500">{uploads.length} public files</p>
            </div>
          </div>
        </div>
        {uploads.length === 0 ? (
          <div className="text-center py-16">
            <Icon name="cloud_off" className="text-6xl text-gray-600 mb-3" />
            <p className="text-gray-500">No public files</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {uploads.map((upload: any) => {
              const isImage = getMimeCategory(upload.mime_type) === "image";
              const ext = upload.original_name.split(".").pop()?.toUpperCase() || "FILE";
              return (
                <a key={upload.id} href={`/v/${upload.file_name}`}
                  className="glass-card rounded-2xl group relative overflow-hidden flex flex-col shadow-lg hover:-translate-y-1 cursor-pointer transition-all">
                  <div className="absolute top-3 left-3 z-20">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-black/40 text-white backdrop-blur-md border border-white/10">{ext}</span>
                  </div>
                  <div className="aspect-[4/3] w-full bg-gray-800 relative overflow-hidden">
                    {isImage && upload.thumbnail_path ? (
                      <img src={`/api/files/${upload.thumbnail_path}`} alt="" className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-700" loading="lazy" />
                    ) : isImage ? (
                      <img src={`/api/files/${upload.file_path}`} alt="" className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-700" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-[#1e1e1e] relative">
                        <div className="absolute inset-0 bg-grid-pattern opacity-10" />
                        <Icon name={getFileIconName(upload.mime_type)} className={cn("text-6xl", getFileIconColor(upload.mime_type))} />
                      </div>
                    )}
                  </div>
                  <div className="p-4 flex-1 flex flex-col bg-[#141414]/80 backdrop-blur-sm border-t border-white/5">
                    <h3 className="text-white font-medium truncate" title={upload.original_name}>{upload.original_name}</h3>
                    <div className="mt-auto flex items-center justify-between pt-2">
                      <span className="text-xs text-gray-500">{formatFileSize(upload.file_size)}</span>
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <Icon name="visibility" className="text-sm" /> {upload.views}
                      </div>
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
