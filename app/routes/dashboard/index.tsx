import { useState, useRef, useCallback, useEffect } from "react";
import { useLoaderData, useRevalidator, useOutletContext } from "react-router";
import { getSession } from "~/.server/session";
import { query, queryOne, execute } from "~/.server/db";
import { formatFileSize, formatRelativeDate, getMimeCategory } from "~/lib/utils-format";
import { cn } from "~/lib/utils";
import { useToast } from "~/components/ui/use-toast";
import { Icon } from "~/components/Icon";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { getCsrfToken } from "~/lib/csrf";
import { isAdmin } from "~/.server/auth";
import { getFeatureFlagsMap } from "~/.server/features";

export async function loader({ request }: { request: Request }) {
  const session = await getSession(request);
  if (!session) throw new Response(null, { status: 302, headers: { Location: "/auth/login" } });
  const uploads = query<any>("SELECT * FROM uploads WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC", [session.user.id]);
  const settings = queryOne<any>("SELECT * FROM user_settings WHERE user_id = ?", [session.user.id]);
  const systemSettings = queryOne<any>("SELECT * FROM system_settings LIMIT 1");
  const featureFlags = getFeatureFlagsMap(isAdmin(session.user.id));

  // Reconcile disk_used with actual upload sizes to self-heal any drift
  if (settings) {
    const actual = uploads.reduce((acc: number, u: any) => acc + u.file_size, 0);
    if (settings.disk_used !== actual) {
      execute("UPDATE user_settings SET disk_used = ? WHERE user_id = ?", [actual, session.user.id]);
      settings.disk_used = actual;
    }
  }

  return { uploads, settings, systemSettings, featureFlags };
}

export default function UploadsPage() {
  const { uploads, settings, systemSettings, featureFlags } = useLoaderData<typeof loader>();
  const { user } = useOutletContext<any>();
  const { toast } = useToast();
  const revalidator = useRevalidator();
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [previewFile, setPreviewFile] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [zipping, setZipping] = useState(false);
  const [settingsFile, setSettingsFile] = useState<any>(null);
  const [filePassword, setFilePassword] = useState("");
  const [fileExpiry, setFileExpiry] = useState("");
  const [fileDescription, setFileDescription] = useState("");
  const [folders, setFolders] = useState<any[]>([]);
  const [newFolderName, setNewFolderName] = useState("");
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [moveToFolderFile, setMoveToFolderFile] = useState<any>(null);
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
  const [newFolderDialogName, setNewFolderDialogName] = useState("");
  const [focusIndex, setFocusIndex] = useState(-1);
  const [filterType, setFilterType] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === filteredUploads.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredUploads.map((u: any) => u.id)));
  };

  const downloadZip = async () => {
    if (selectedIds.size === 0) return;
    setZipping(true);
    try {
      const res = await fetch("/api/download-zip", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}) },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "rxshare-download.zip"; a.click();
      URL.revokeObjectURL(url);
      setSelectedIds(new Set());
    } catch (err: any) { toast({ title: "Zip failed", description: err.message, variant: "destructive" }); }
    finally { setZipping(false); }
  };

  const filteredUploads = uploads.filter((u: any) => {
    const matchesSearch = u.original_name.toLowerCase().includes(search.toLowerCase()) || u.file_name.toLowerCase().includes(search.toLowerCase());
    const matchesFolder = !activeFolder || u.folder_id === activeFolder;
    const matchesType = !filterType || getMimeCategory(u.mime_type) === filterType;
    const matchesStatus = !filterStatus || (filterStatus === "public" ? u.is_public : !u.is_public);
    return matchesSearch && matchesFolder && matchesType && matchesStatus;
  });

  const totalSize = uploads.reduce((acc: number, u: any) => acc + u.file_size, 0);
  const quota = settings?.disk_quota || 1073741824;
  const usagePercent = Math.min((totalSize / quota) * 100, 100);

  const handleUpload = useCallback(async (file: globalThis.File) => {
    if (!settings) return;
    if (file.size > settings.max_upload_size) {
      toast({ title: "File too large", description: `Max size: ${formatFileSize(settings.max_upload_size)}`, variant: "destructive" }); return;
    }
    if (totalSize + file.size > quota) { toast({ title: "Quota exceeded", variant: "destructive" }); return; }
    setUploading(true); setUploadProgress(0);
    try {
      const formData = new FormData(); formData.append("file", file);
      const xhr = new XMLHttpRequest();
      await new Promise<void>((resolve, reject) => {
        xhr.upload.addEventListener("progress", (e) => { if (e.lengthComputable) setUploadProgress((e.loaded / e.total) * 100); });
        xhr.addEventListener("load", () => { if (xhr.status >= 200 && xhr.status < 300) resolve(); else reject(new Error(JSON.parse(xhr.responseText)?.error || "Upload failed")); });
        xhr.addEventListener("error", () => reject(new Error("Upload failed")));
        xhr.open("POST", "/api/upload");
        const csrfToken = getCsrfToken();
        if (csrfToken) xhr.setRequestHeader("X-CSRF-Token", csrfToken);
        xhr.send(formData);
      });
      revalidator.revalidate(); toast({ title: "File uploaded!", description: file.name });
    } catch (err: any) { toast({ title: "Upload failed", description: err.message, variant: "destructive" }); }
    finally { setUploading(false); setUploadProgress(0); }
  }, [settings, totalSize, quota, revalidator, toast]);

  // Ctrl+V paste upload for images/gifs
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            const ext = file.type.split("/")[1]?.replace("jpeg", "jpg") || "png";
            const named = new File([file], `paste-${Date.now()}.${ext}`, { type: file.type });
            handleUpload(named);
          }
          return;
        }
      }
    };
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [handleUpload]);

  const copyLink = (fileName: string) => {
    const base = systemSettings?.base_url || window.location.origin;
    navigator.clipboard.writeText(`${base}/v/${fileName}`); toast({ title: "Link copied!" });
  };
  const deleteUpload = async (upload: any) => {
    const res = await fetch(`/api/delete/${upload.id}`, { method: "DELETE", headers: { ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}) } });
    if (res.ok) { revalidator.revalidate(); toast({ title: "File deleted" }); }
  };

  // Fetch folders
  useEffect(() => {
    fetch("/api/folders").then(r => r.json()).then(d => { if (d.folders) setFolders(d.folders); }).catch(() => {});
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't trigger when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === "j" || e.key === "ArrowDown") { e.preventDefault(); setFocusIndex(i => Math.min(i + 1, filteredUploads.length - 1)); }
      if (e.key === "k" || e.key === "ArrowUp") { e.preventDefault(); setFocusIndex(i => Math.max(i - 1, 0)); }
      if (e.key === "Enter" && focusIndex >= 0) { e.preventDefault(); setPreviewFile(filteredUploads[focusIndex]); }
      if (e.key === "Escape") { setPreviewFile(null); setSelectedIds(new Set()); setFocusIndex(-1); }
      if (e.key === "x" && focusIndex >= 0) { e.preventDefault(); toggleSelect(filteredUploads[focusIndex].id); }
      if (e.key === "a" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); selectAll(); }
      if (e.key === "u") { e.preventDefault(); fileInputRef.current?.click(); }
      if (e.key === "g") { e.preventDefault(); setViewMode("grid"); }
      if (e.key === "l") { e.preventDefault(); setViewMode("list"); }
      if (e.key === "Delete" && focusIndex >= 0) { e.preventDefault(); deleteUpload(filteredUploads[focusIndex]); }
      if (e.key === "c" && focusIndex >= 0) { e.preventDefault(); copyLink(filteredUploads[focusIndex].file_name); }
      if (e.key === "/" || (e.key === "k" && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('input[placeholder*="Search"]')?.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [focusIndex, filteredUploads, selectAll, toggleSelect, deleteUpload, copyLink]);

  const saveFileSettings = async () => {
    if (!settingsFile) return;
    const updates: any = {};
    if (fileExpiry) updates.expires_at = new Date(Date.now() + parseInt(fileExpiry) * 3600000).toISOString();
    if (fileExpiry === "0") updates.expires_at = null;
    if (filePassword !== undefined) updates.password = filePassword || null;
    if (fileDescription !== undefined) updates.description = fileDescription || null;
    const res = await fetch(`/api/uploads/${settingsFile.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}) },
      body: JSON.stringify(updates),
    });
    if (res.ok) { setSettingsFile(null); setFilePassword(""); setFileExpiry(""); setFileDescription(""); revalidator.revalidate(); toast({ title: "File settings updated" }); }
  };

  const createFolder = async () => {
    const name = newFolderDialogName.trim() || newFolderName.trim();
    if (!name) return;
    const res = await fetch("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}) },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      const d = await res.json();
      setFolders(prev => [d, ...prev]);
      setNewFolderName("");
      setNewFolderDialogName("");
      toast({ title: "Folder created" });
    }
  };

  const deleteFolder = async (folderId: string) => {
    const res = await fetch("/api/folders", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}) },
      body: JSON.stringify({ id: folderId }),
    });
    if (res.ok) {
      setFolders(prev => prev.filter(f => f.id !== folderId));
      if (activeFolder === folderId) setActiveFolder(null);
      toast({ title: "Folder deleted" });
    }
  };

  const moveToFolder = async (uploadId: string, folderId: string | null) => {
    await fetch(`/api/uploads/${uploadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}) },
      body: JSON.stringify({ folder_id: folderId }),
    });
    revalidator.revalidate();
    toast({ title: folderId ? "Moved to folder" : "Removed from folder" });
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragActive(false);
    const file = e.dataTransfer.files[0]; if (file) handleUpload(file);
  }, [handleUpload]);

  const createShortLink = async (uploadId: string, fileName: string) => {
    const res = await fetch("/api/short-links", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}) },
      body: JSON.stringify({ upload_id: uploadId }),
    });
    if (res.ok) {
      const d = await res.json();
      const base = systemSettings?.base_url || window.location.origin;
      navigator.clipboard.writeText(`${base}/s/${d.code}`);
      toast({ title: "Short link copied!" });
    }
  };
  const toggleVisibility = async (upload: any) => {
    const res = await fetch(`/api/uploads/${upload.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}) }, body: JSON.stringify({ is_public: upload.is_public ? 0 : 1 }) });
    if (res.ok) { revalidator.revalidate(); toast({ title: upload.is_public ? "Made private" : "Made public" }); }
  };

  // Categorize storage — exact Stitch style
  const imgSize = uploads.filter((u: any) => getMimeCategory(u.mime_type) === "image").reduce((a: number, u: any) => a + u.file_size, 0);
  const vidSize = uploads.filter((u: any) => getMimeCategory(u.mime_type) === "video").reduce((a: number, u: any) => a + u.file_size, 0);
  const docSize = uploads.filter((u: any) => ["text", "code", "pdf"].includes(getMimeCategory(u.mime_type))).reduce((a: number, u: any) => a + u.file_size, 0);
  const otherSize = totalSize - imgSize - vidSize - docSize;

  const getFileIconName = (mimeType: string) => {
    const cat = getMimeCategory(mimeType);
    if (cat === "image") return "image";
    if (cat === "video") return "play_arrow";
    if (cat === "audio") return "music_note";
    if (cat === "text" || cat === "code") return "code_blocks";
    if (cat === "pdf") return "picture_as_pdf";
    return "folder_zip";
  };
  const getFileIconColor = (mimeType: string) => {
    const cat = getMimeCategory(mimeType);
    if (cat === "image") return "text-blue-500 drop-shadow-[0_0_15px_rgba(59,130,246,0.5)]";
    if (cat === "video") return "text-purple-500 drop-shadow-[0_0_15px_rgba(168,85,247,0.5)]";
    if (cat === "audio") return "text-pink-500 drop-shadow-[0_0_15px_rgba(236,72,153,0.5)]";
    if (cat === "text" || cat === "code") return "text-blue-500 drop-shadow-[0_0_15px_rgba(59,130,246,0.5)]";
    if (cat === "pdf") return "text-red-500 drop-shadow-[0_0_15px_rgba(239,68,68,0.5)]";
    return "text-yellow-500 drop-shadow-[0_0_15px_rgba(234,179,8,0.5)]";
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="flex items-center gap-2">
        <div className="flex-1 max-w-xl">
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Icon name="search" className="text-gray-500 group-focus-within:text-primary transition-colors" />
            </div>
            <input className="block w-full pl-11 pr-3 py-3.5 border border-white/10 rounded-2xl leading-5 bg-[#0a0a0a]/60 backdrop-blur-xl text-gray-300 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary sm:text-sm transition-all shadow-[inset_0_2px_4px_rgba(0,0,0,0.3),0_0_0_1px_rgba(255,255,255,0.03)]"
              placeholder="Search files, folders, or people..." type="text" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        <button onClick={() => setShowFilters(!showFilters)}
          className={cn("p-3 rounded-xl border transition-colors", showFilters || filterType || filterStatus ? "bg-primary/20 text-primary border-primary/30" : "bg-[#0a0a0a]/60 text-gray-500 border-white/10 hover:text-gray-300")}
          title="Advanced filters">
          <Icon name="tune" className="text-lg" />
        </button>
      </header>
      {showFilters && (
        <div className="flex items-center gap-3 flex-wrap">
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
            className="px-3 py-2 border border-white/10 rounded-lg bg-[#0a0a0a] text-gray-300 focus:outline-none focus:ring-1 focus:ring-primary text-sm">
            <option value="">All Types</option>
            <option value="image">Images</option>
            <option value="video">Video</option>
            <option value="audio">Audio</option>
            <option value="text">Text</option>
            <option value="code">Code</option>
            <option value="pdf">PDF</option>
            <option value="other">Other</option>
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 border border-white/10 rounded-lg bg-[#0a0a0a] text-gray-300 focus:outline-none focus:ring-1 focus:ring-primary text-sm">
            <option value="">All Status</option>
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
          {(filterType || filterStatus) && (
            <button onClick={() => { setFilterType(""); setFilterStatus(""); }}
              className="px-3 py-2 text-xs text-gray-400 hover:text-white hover:bg-white/5 rounded-lg border border-white/10 transition-colors flex items-center gap-1">
              <Icon name="close" className="text-sm" /> Clear filters
            </button>
          )}
          <span className="text-xs text-gray-500 ml-auto">{filteredUploads.length} files</span>
        </div>
      )}
      <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ""; }} />

      {/* Storage + Upload zone — exact Stitch grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Storage overview */}
        <div className="lg:col-span-2 glass-card p-1 rounded-2xl relative overflow-hidden group">
          <div className="rounded-xl bg-[#0a0a0a]/40 p-6 h-full">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-white mb-1">Storage Overview</h2>
                <p className="text-gray-500 text-sm">You have used <span className="text-white font-medium">{formatFileSize(totalSize)}</span> of your <span className="text-white font-medium">{formatFileSize(quota)}</span> plan</p>
              </div>
              <span className="px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 text-xs font-bold">{uploads.length} files</span>
            </div>
          <div className="relative h-4 bg-gray-800 rounded-full overflow-hidden mb-6">
            <div className="absolute top-0 left-0 h-full bg-gradient-to-r from-[var(--primary-hover)] via-primary to-primary/70 rounded-full shadow-glow-primary" style={{ width: `${usagePercent}%` }} />
          </div>
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: "Images", color: "bg-blue-500", size: imgSize, pct: totalSize > 0 ? (imgSize / totalSize) * 100 : 0 },
              { label: "Video", color: "bg-purple-500", size: vidSize, pct: totalSize > 0 ? (vidSize / totalSize) * 100 : 0 },
              { label: "Docs", color: "bg-emerald-500", size: docSize, pct: totalSize > 0 ? (docSize / totalSize) * 100 : 0 },
              { label: "Other", color: "bg-gray-500", size: otherSize, pct: totalSize > 0 ? (otherSize / totalSize) * 100 : 0 },
            ].map((cat) => (
              <div key={cat.label} className="space-y-1">
                <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
                  <span className={cn("w-2 h-2 rounded-full", cat.color)} /> {cat.label}
                </div>
                <div className="h-1.5 w-full bg-gray-800 rounded-full overflow-hidden">
                  <div className={cn("h-full rounded-full", cat.color)} style={{ width: `${cat.pct}%` }} />
                </div>
                <span className="text-xs font-mono text-gray-500">{formatFileSize(cat.size)}</span>
              </div>
            ))}
          </div>
          </div>
        </div>

        {/* Upload drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            "glass-card rounded-2xl p-1 relative overflow-hidden group cursor-pointer border-dashed border-2 transition-colors",
            dragActive ? "border-primary/50" : "border-white/10 hover:border-primary/50"
          )}
        >
          <div className={cn("absolute inset-0 bg-primary/5 opacity-0 transition-opacity", dragActive && "opacity-100")} />
          <div className="h-full rounded-xl bg-[#0a0a0a]/50 flex flex-col items-center justify-center text-center p-6 relative z-10">
            {uploading ? (
              <div className="space-y-3">
                <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center shadow-glow-primary mx-auto">
                  <Icon name="cloud_upload" className="text-3xl text-primary animate-pulse !leading-none" />
                </div>
                <p className="text-sm text-gray-400">Uploading... {Math.round(uploadProgress)}%</p>
                <div className="h-1.5 w-32 bg-gray-800 rounded-full overflow-hidden mx-auto">
                  <div className="h-full bg-primary rounded-full shadow-glow-primary transition-all" style={{ width: `${uploadProgress}%` }} />
                </div>
              </div>
            ) : (
              <>
                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform group-hover:bg-primary/20 group-hover:shadow-glow-primary mx-auto">
                  <Icon name="cloud_upload" className="text-3xl text-gray-400 group-hover:text-primary transition-colors !leading-none" />
                </div>
                <h3 className="font-bold text-white text-lg">Drop files here</h3>
                <p className="text-sm text-gray-500 mt-1">or click to browse</p>
                <span className="text-xs text-gray-600 mt-4 font-mono">Max file size: {formatFileSize(settings?.max_upload_size || 104857600)}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Folders */}
      {featureFlags.folders && (
        <div className="flex items-center gap-3 overflow-x-auto pb-1">
          <button onClick={() => setActiveFolder(null)}
            className={cn("flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all shrink-0",
              !activeFolder ? "bg-primary/20 text-primary border border-primary/30" : "bg-white/5 text-gray-400 border border-white/5 hover:bg-white/10")}>
            <Icon name="folder_open" className="text-lg" /> All Files
          </button>
          {folders.map((f: any) => (
            <div key={f.id} className="flex items-center gap-1 shrink-0">
              <button onClick={() => setActiveFolder(f.id)}
                className={cn("flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all",
                  activeFolder === f.id ? "bg-primary/20 text-primary border border-primary/30" : "bg-white/5 text-gray-400 border border-white/5 hover:bg-white/10")}>
                <Icon name="folder" className="text-lg" /> {f.name}
                <span className="text-xs opacity-60">({uploads.filter((u: any) => u.folder_id === f.id).length})</span>
              </button>
              <button onClick={() => deleteFolder(f.id)} className="p-1 text-gray-600 hover:text-red-400 rounded transition-colors" title="Delete folder">
                <Icon name="close" className="text-sm" />
              </button>
            </div>
          ))}
          <button onClick={() => { setNewFolderDialogName(""); setShowNewFolderDialog(true); }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium bg-white/5 text-gray-400 border border-dashed border-white/10 hover:bg-white/10 hover:text-white transition-all shrink-0">
            <Icon name="create_new_folder" className="text-lg" /> New Folder
          </button>
        </div>
      )}

      {/* Recent Files header */}
      <div className="flex items-center justify-between glass-card rounded-2xl p-1">
        <div className="flex items-center gap-3 px-5 py-3">
          <h2 className="text-xl font-bold text-white">Recent Files</h2>
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 ml-4">
              <span className="text-xs text-gray-400">{selectedIds.size} selected</span>
              {featureFlags.zip_download && <button onClick={downloadZip} disabled={zipping}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-white bg-primary hover:bg-[var(--primary-hover)] rounded-lg shadow-glow-primary transition-all disabled:opacity-50">
                <Icon name="folder_zip" className="text-sm" /> {zipping ? "Zipping..." : "Download Zip"}
              </button>}
              <button onClick={() => setSelectedIds(new Set())}
                className="flex items-center gap-1 px-2 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
                <Icon name="close" className="text-sm" /> Clear
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 mr-2">
          <button onClick={selectAll}
            className={cn("p-2 rounded-lg transition-colors text-sm", selectedIds.size === filteredUploads.length && filteredUploads.length > 0 ? "bg-primary/20 text-primary" : "text-gray-500 hover:text-gray-300 hover:bg-white/5")}>
            <Icon name="select_all" className="text-lg" />
          </button>
          <div className="flex items-center gap-2 bg-[#0a0a0a]/60 p-1 rounded-xl border border-white/5 shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)]">
          <button onClick={() => setViewMode("grid")} className={cn("p-2 rounded-lg transition-colors", viewMode === "grid" ? "bg-white/10 text-white shadow-sm" : "text-gray-500 hover:text-gray-300 hover:bg-white/5")}>
            <Icon name="grid_view" className="text-lg" />
          </button>
          <button onClick={() => setViewMode("list")} className={cn("p-2 rounded-lg transition-colors", viewMode === "list" ? "bg-white/10 text-white shadow-sm" : "text-gray-500 hover:text-gray-300 hover:bg-white/5")}>
            <Icon name="list" className="text-lg" />
          </button>
          </div>
        </div>
      </div>

      {/* Files — exact Stitch card design */}
      {filteredUploads.length === 0 ? (
        <div className="text-center py-16">
          <Icon name="cloud_upload" className="text-6xl text-gray-600 mb-3" />
          <p className="text-gray-500 text-sm">No files yet. Upload something!</p>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-10">
          {filteredUploads.map((upload: any) => {
            const isImage = getMimeCategory(upload.mime_type) === "image";
            const ext = upload.original_name.split(".").pop()?.toUpperCase() || "FILE";
            return (
              <div key={upload.id}
                className={cn("glass-card rounded-2xl group relative overflow-hidden flex flex-col shadow-lg hover:-translate-y-1 cursor-pointer", selectedIds.has(upload.id) && "ring-2 ring-primary")}
                onClick={() => setPreviewFile(upload)}>
                {/* Selection checkbox */}
                <div className="absolute top-3 left-3 z-20 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => toggleSelect(upload.id)}
                    className={cn("w-5 h-5 rounded border flex items-center justify-center transition-all text-xs",
                      selectedIds.has(upload.id) ? "bg-primary border-primary text-white" : "border-white/20 bg-black/40 backdrop-blur-md text-transparent hover:border-white/40")}>
                    {selectedIds.has(upload.id) && <Icon name="check" className="text-xs" />}
                  </button>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-black/40 text-white backdrop-blur-md border border-white/10">{ext}</span>
                </div>
                {/* Actions — exact Stitch: hidden, show on hover */}
                <div className="absolute top-3 right-3 z-20 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="p-1.5 bg-black/60 hover:bg-primary text-white rounded-lg backdrop-blur-md transition-colors">
                        <Icon name="more_horiz" className="text-sm" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-[#141414] border-white/10 rounded-xl shadow-2xl p-1">
                      <DropdownMenuItem onClick={() => copyLink(upload.file_name)} className="flex items-center gap-3 px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/5 rounded-lg">
                        <Icon name="link" className="text-lg" /> Copy link
                      </DropdownMenuItem>
                      {featureFlags.short_links && <DropdownMenuItem onClick={() => createShortLink(upload.id, upload.file_name)} className="flex items-center gap-3 px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/5 rounded-lg">
                        <Icon name="link" className="text-lg" /> Short Link
                      </DropdownMenuItem>}
                      <DropdownMenuItem onClick={() => toggleVisibility(upload)} className="flex items-center gap-3 px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/5 rounded-lg">
                        <Icon name={upload.is_public ? "visibility_off" : "visibility"} className="text-lg" />
                        {upload.is_public ? "Make private" : "Make public"}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { setSettingsFile(upload); setFilePassword(""); setFileExpiry(""); setFileDescription(upload.description || ""); }} className="flex items-center gap-3 px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/5 rounded-lg">
                        <Icon name="settings" className="text-lg" /> Settings
                      </DropdownMenuItem>
                      {featureFlags.folders && (
                        <DropdownMenuItem onClick={() => setMoveToFolderFile(upload)} className="flex items-center gap-3 px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/5 rounded-lg">
                          <Icon name="folder" className="text-lg" /> {upload.folder_id ? "Change folder" : "Move to folder"}
                        </DropdownMenuItem>
                      )}
                      <div className="h-px bg-white/5 my-1" />
                      <DropdownMenuItem onClick={() => deleteUpload(upload)} className="flex items-center gap-3 px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg">
                        <Icon name="delete" className="text-lg" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {/* Thumbnail — exact Stitch */}
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
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                {/* Info — exact Stitch */}
                <div className="p-4 flex-1 flex flex-col bg-[#141414]/80 backdrop-blur-sm border-t border-white/5">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-white font-medium truncate pr-4" title={upload.original_name}>{upload.original_name}</h3>
                  </div>
                  <div className="mt-auto flex items-center justify-between">
                    <span className="text-xs text-gray-500">{formatFileSize(upload.file_size)}</span>
                    {upload.is_public ? (
                      <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-green-500/10 border border-green-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.6)]" />
                        <span className="text-[10px] text-green-500 font-bold uppercase tracking-wide">Public</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-gray-500/10 border border-gray-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-500" />
                        <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">Private</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* List view — exact Stitch table style */
        <div className="glass-card rounded-2xl p-1 shadow-glow-card overflow-hidden">
          <div className="bg-[#0a0a0a]/40 rounded-xl overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white/5 border-b border-white/10 text-xs font-semibold uppercase text-gray-400 tracking-wider">
                <th className="px-3 py-5 w-10" onClick={(e) => e.stopPropagation()}>
                  <button onClick={selectAll}
                    className={cn("w-5 h-5 rounded border flex items-center justify-center transition-all text-xs",
                      selectedIds.size === filteredUploads.length && filteredUploads.length > 0 ? "bg-primary border-primary text-white" : "border-white/20 bg-transparent text-transparent hover:border-white/40")}>
                    {selectedIds.size === filteredUploads.length && filteredUploads.length > 0 && <Icon name="check" className="text-xs" />}
                  </button>
                </th>
                <th className="px-6 py-5">File</th>
                <th className="px-6 py-5">Size</th>
                <th className="px-6 py-5">Status</th>
                <th className="px-6 py-5">Date</th>
                <th className="px-6 py-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredUploads.map((upload: any) => (
                <tr key={upload.id} className={cn("group hover:bg-white/[0.03] transition-colors duration-200 cursor-pointer", selectedIds.has(upload.id) && "bg-primary/5")} onClick={() => setPreviewFile(upload)}>
                  <td className="px-3 py-4" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => toggleSelect(upload.id)}
                      className={cn("w-5 h-5 rounded border flex items-center justify-center transition-all text-xs",
                        selectedIds.has(upload.id) ? "bg-primary border-primary text-white" : "border-white/20 bg-transparent text-transparent hover:border-white/40")}>
                      {selectedIds.has(upload.id) && <Icon name="check" className="text-xs" />}
                    </button>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-4">
                      <Icon name={getFileIconName(upload.mime_type)} className={cn("text-2xl", getFileIconColor(upload.mime_type))} />
                      <div>
                        <div className="font-semibold text-white">{upload.original_name}</div>
                        <div className="text-xs text-gray-500">{upload.file_name}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-400">{formatFileSize(upload.file_size)}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className={cn("w-1.5 h-1.5 rounded-full", upload.is_public ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" : "bg-gray-500")} />
                      <span className="text-sm text-gray-300">{upload.is_public ? "Public" : "Private"}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-300">{formatRelativeDate(upload.created_at)}</td>
                  <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="p-2 text-gray-500 hover:text-white hover:bg-white/10 rounded-lg transition-all">
                          <Icon name="more_vert" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-[#141414] border-white/10 rounded-xl shadow-2xl p-1">
                        <DropdownMenuItem onClick={() => copyLink(upload.file_name)} className="flex items-center gap-3 px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/5 rounded-lg">
                          <Icon name="link" className="text-lg" /> Copy link
                        </DropdownMenuItem>
                        {featureFlags.short_links && <DropdownMenuItem onClick={() => createShortLink(upload.id, upload.file_name)} className="flex items-center gap-3 px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/5 rounded-lg">
                          <Icon name="link" className="text-lg" /> Short Link
                        </DropdownMenuItem>}
                        <DropdownMenuItem onClick={() => toggleVisibility(upload)} className="flex items-center gap-3 px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/5 rounded-lg">
                          <Icon name={upload.is_public ? "visibility_off" : "visibility"} className="text-lg" />
                          {upload.is_public ? "Make private" : "Make public"}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { setSettingsFile(upload); setFilePassword(""); setFileExpiry(""); setFileDescription(upload.description || ""); }} className="flex items-center gap-3 px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/5 rounded-lg">
                          <Icon name="settings" className="text-lg" /> Settings
                        </DropdownMenuItem>
                        <div className="h-px bg-white/5 my-1" />
                        <DropdownMenuItem onClick={() => deleteUpload(upload)} className="flex items-center gap-3 px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg">
                          <Icon name="delete" className="text-lg" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-6 py-4 border-t border-white/5 flex items-center justify-between bg-white/[0.02]">
            <div className="text-xs text-gray-500">Showing <span className="text-white font-medium">{filteredUploads.length}</span> of <span className="text-white font-medium">{uploads.length}</span> files</div>
          </div>
          </div>
        </div>
      )}

      {/* Preview dialog */}
      <Dialog open={!!previewFile} onOpenChange={() => setPreviewFile(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-auto bg-[#0f0f0f] border-white/10">
          {previewFile && (
            <>
              <DialogHeader><DialogTitle className="truncate text-white">{previewFile.original_name}</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <FilePreview upload={previewFile} />
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <span>{formatFileSize(previewFile.file_size)}</span><span>•</span>
                  <span>{formatRelativeDate(previewFile.created_at)}</span><span>•</span>
                  <span>{previewFile.views} views</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setPreviewFile(null)} className="flex items-center gap-2 px-4 py-2 text-sm text-gray-300 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors">
                    <Icon name="arrow_back" className="text-lg" /> Back
                  </button>
                  <a href={`/v/${previewFile.file_name}`} className="flex items-center gap-2 px-4 py-2 text-sm text-gray-300 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors">
                    <Icon name="open_in_new" className="text-lg" /> Open
                  </a>
                  <button onClick={() => copyLink(previewFile.file_name)} className="flex items-center gap-2 px-4 py-2 text-sm text-gray-300 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors">
                    <Icon name="link" className="text-lg" /> Copy link
                  </button>
                  <a href={`/api/files/${previewFile.file_path}`} download={previewFile.original_name} className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-primary hover:bg-[var(--primary-hover)] rounded-lg shadow-glow-primary transition-all">
                    <Icon name="download" className="text-lg" /> Download
                  </a>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* File settings dialog (expiration, password, folder) */}
      <Dialog open={!!settingsFile} onOpenChange={() => setSettingsFile(null)}>
        <DialogContent className="bg-[#141414] border-white/10 max-w-md">
          <DialogHeader><DialogTitle className="text-white truncate">{settingsFile?.original_name}</DialogTitle></DialogHeader>
          <div className="space-y-5">
            {featureFlags.file_expiration && <div className="space-y-2">
              <label className="text-sm font-medium text-gray-400 flex items-center gap-2"><Icon name="timer" className="text-lg" /> Expiration</label>
              <select value={fileExpiry} onChange={(e) => setFileExpiry(e.target.value)}
                className="block w-full px-4 py-2.5 border border-white/10 rounded-lg bg-[#0a0a0a] text-gray-300 focus:outline-none focus:ring-1 focus:ring-primary text-sm">
                <option value="">No change</option>
                <option value="1">1 hour</option>
                <option value="24">24 hours</option>
                <option value="168">7 days</option>
                <option value="720">30 days</option>
                <option value="0">Remove expiration</option>
              </select>
              {settingsFile?.expires_at && <p className="text-xs text-yellow-500">Currently expires: {new Date(settingsFile.expires_at).toLocaleString()}</p>}
            </div>}
            {featureFlags.password_protection && <div className="space-y-2">
              <label className="text-sm font-medium text-gray-400 flex items-center gap-2"><Icon name="lock" className="text-lg" /> Password Protection</label>
              <input type="password" value={filePassword} onChange={(e) => setFilePassword(e.target.value)} placeholder={settingsFile?.password_hash ? "Change password (leave empty to keep)" : "Set password (optional)"}
                className="block w-full px-4 py-2.5 border border-white/10 rounded-lg bg-[#0a0a0a] text-gray-300 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-primary text-sm" />
              {settingsFile?.password_hash && <p className="text-xs text-primary">This file is password protected</p>}
            </div>}
            {featureFlags.folders && folders.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-400 flex items-center gap-2"><Icon name="folder" className="text-lg" /> Folder</label>
                <select value={settingsFile?.folder_id || ""} onChange={(e) => moveToFolder(settingsFile.id, e.target.value || null)}
                  className="block w-full px-4 py-2.5 border border-white/10 rounded-lg bg-[#0a0a0a] text-gray-300 focus:outline-none focus:ring-1 focus:ring-primary text-sm">
                  <option value="">No folder</option>
                  {folders.map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
            )}
            {featureFlags.file_notes && <div className="space-y-2">
              <label className="text-sm font-medium text-gray-400 flex items-center gap-2"><Icon name="notes" className="text-lg" /> Description</label>
              <textarea value={fileDescription} onChange={(e) => setFileDescription(e.target.value)} placeholder="Add a note or description..."
                className="block w-full px-4 py-2.5 border border-white/10 rounded-lg bg-[#0a0a0a] text-gray-300 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-primary text-sm resize-none" rows={3} />
            </div>}
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <button onClick={() => setSettingsFile(null)} className="px-4 py-2 text-sm text-gray-400 border border-white/10 rounded-lg hover:bg-white/5 transition-colors">Cancel</button>
            <button onClick={saveFileSettings} className="px-4 py-2 text-sm text-white bg-primary hover:bg-[var(--primary-hover)] rounded-lg shadow-glow-primary transition-all">Save</button>
          </div>
        </DialogContent>
      </Dialog>

      {/* New Folder dialog */}
      <Dialog open={showNewFolderDialog} onOpenChange={setShowNewFolderDialog}>
        <DialogContent className="bg-[#141414] border-white/10 max-w-sm">
          <DialogHeader><DialogTitle className="text-white">Create New Folder</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-400">Folder Name</label>
              <input value={newFolderDialogName} onChange={(e) => setNewFolderDialogName(e.target.value)}
                placeholder="My folder" autoFocus
                onKeyDown={(e) => { if (e.key === "Enter" && newFolderDialogName.trim()) { createFolder(); setShowNewFolderDialog(false); } }}
                className="block w-full px-4 py-2.5 border border-white/10 rounded-lg bg-[#0a0a0a] text-gray-300 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-primary text-sm" />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <button onClick={() => setShowNewFolderDialog(false)} className="px-4 py-2 text-sm text-gray-400 border border-white/10 rounded-lg hover:bg-white/5 transition-colors">Cancel</button>
            <button onClick={() => { createFolder(); setShowNewFolderDialog(false); }} disabled={!newFolderDialogName.trim()}
              className="px-4 py-2 text-sm text-white bg-primary hover:bg-[var(--primary-hover)] rounded-lg shadow-glow-primary transition-all disabled:opacity-50">Create</button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Move to Folder dialog */}
      <Dialog open={!!moveToFolderFile} onOpenChange={() => setMoveToFolderFile(null)}>
        <DialogContent className="bg-[#141414] border-white/10 max-w-sm">
          <DialogHeader><DialogTitle className="text-white truncate">Move "{moveToFolderFile?.original_name}"</DialogTitle></DialogHeader>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            <button onClick={() => { moveToFolder(moveToFolderFile.id, null); setMoveToFolderFile(null); }}
              className={cn("w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all",
                !moveToFolderFile?.folder_id ? "bg-primary/20 text-primary border border-primary/30" : "bg-white/5 text-gray-300 border border-white/5 hover:bg-white/10")}>
              <Icon name="folder_off" className="text-lg" /> No folder
            </button>
            {folders.map((f: any) => (
              <button key={f.id} onClick={() => { moveToFolder(moveToFolderFile.id, f.id); setMoveToFolderFile(null); }}
                className={cn("w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all",
                  moveToFolderFile?.folder_id === f.id ? "bg-primary/20 text-primary border border-primary/30" : "bg-white/5 text-gray-300 border border-white/5 hover:bg-white/10")}>
                <Icon name="folder" className="text-lg" /> {f.name}
              </button>
            ))}
          </div>
          {folders.length === 0 && <p className="text-gray-500 text-sm text-center py-2">No folders yet. Create one first.</p>}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FilePreview({ upload }: { upload: any }) {
  const url = `/api/files/${upload.file_path}`;
  const category = getMimeCategory(upload.mime_type);
  if (category === "image") return <img src={url} alt={upload.original_name} className="max-w-full max-h-[60vh] object-contain mx-auto rounded" />;
  if (category === "video") return <video src={url} controls autoPlay className="max-w-full max-h-[60vh] mx-auto rounded" />;
  if (category === "audio") return <audio src={url} controls className="w-full" />;
  if (category === "pdf") return <iframe src={url} className="w-full h-[60vh] rounded border border-white/10" />;
  return (
    <div className="text-center py-12">
      <Icon name="description" className="text-6xl text-gray-600 mb-4" />
      <p className="text-gray-500">Preview not available</p>
    </div>
  );
}
