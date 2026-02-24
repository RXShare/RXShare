import { useState } from "react";
import { useLoaderData, useOutletContext, useRevalidator } from "react-router";
import { getSession } from "~/.server/session";
import { query, queryOne } from "~/.server/db";
import { formatRelativeDate, generateToken } from "~/lib/utils-format";
import { useToast } from "~/components/ui/use-toast";
import { Switch } from "~/components/ui/switch";
import { Icon } from "~/components/Icon";
import { getCsrfToken } from "~/lib/csrf";

export async function loader({ request }: { request: Request }) {
  const session = await getSession(request);
  if (!session) throw new Response(null, { status: 302, headers: { Location: "/auth/login" } });
  const settings = queryOne<any>("SELECT * FROM user_settings WHERE user_id = ?", [session.user.id]);
  const tokens = query<any>("SELECT id, name, created_at, last_used_at FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC", [session.user.id]);
  return { settings, tokens };
}

export default function SettingsPage() {
  const { settings, tokens } = useLoaderData<typeof loader>();
  const { user, systemSettings } = useOutletContext<any>();
  const { toast } = useToast();
  const revalidator = useRevalidator();

  const [embedTitle, setEmbedTitle] = useState(settings?.embed_title || "File Upload");
  const [embedDescription, setEmbedDescription] = useState(settings?.embed_description || "");
  const [embedColor, setEmbedColor] = useState(settings?.embed_color || "#f97316");
  const [embedAuthor, setEmbedAuthor] = useState(settings?.embed_author || "");
  const [embedSiteName, setEmbedSiteName] = useState(settings?.embed_site_name || "");
  const [embedLogoUrl, setEmbedLogoUrl] = useState(settings?.embed_logo_url || "");
  const [defaultPublic, setDefaultPublic] = useState(settings?.default_public !== 0);
  const [customPath, setCustomPath] = useState(settings?.custom_path || "");
  const [sharexFolderName, setSharexFolderName] = useState(settings?.sharex_folder_name ?? "ShareX");
  const [tokenName, setTokenName] = useState("");
  const [newToken, setNewToken] = useState<string | null>(null);

  const saveSettings = async () => {
    const res = await fetch("/api/user/settings", {
      method: "PUT", headers: { "Content-Type": "application/json", ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}) },
      body: JSON.stringify({ embed_title: embedTitle, embed_description: embedDescription || null, embed_color: embedColor, embed_author: embedAuthor || null, embed_site_name: embedSiteName || null, embed_logo_url: embedLogoUrl || null, default_public: defaultPublic, custom_path: customPath || null, sharex_folder_name: sharexFolderName || "ShareX" }),
    });
    if (res.ok) { revalidator.revalidate(); toast({ title: "Settings saved!" }); }
    else { const d = await res.json(); toast({ title: "Error", description: d.error, variant: "destructive" }); }
  };

  const createToken = async () => {
    if (!tokenName.trim()) { toast({ title: "Enter a token name", variant: "destructive" }); return; }
    const res = await fetch("/api/tokens", { method: "POST", headers: { "Content-Type": "application/json", ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}) }, body: JSON.stringify({ name: tokenName.trim() }) });
    const data = await res.json();
    if (res.ok) { setNewToken(data.token); setTokenName(""); revalidator.revalidate(); toast({ title: "Token created! Copy it now." }); }
  };

  const deleteToken = async (id: string) => {
    await fetch("/api/tokens", { method: "DELETE", headers: { "Content-Type": "application/json", ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}) }, body: JSON.stringify({ id }) });
    revalidator.revalidate(); toast({ title: "Token deleted" });
  };

  const downloadShareXConfig = () => {
    const base = systemSettings?.base_url || window.location.origin;
    const config = {
      Version: "14.0.0", Name: systemSettings?.site_name || "RXShare",
      DestinationType: "ImageUploader, TextUploader, FileUploader",
      RequestMethod: "POST", RequestURL: `${base}/api/upload`,
      Headers: { Authorization: "Bearer YOUR_API_TOKEN" },
      Body: "MultipartFormData", FileFormName: "file",
      URL: "{json:url}", ThumbnailURL: "{json:thumbnail_url}", DeletionURL: "{json:delete_url}",
    };
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `${(systemSettings?.site_name || "RXShare").replace(/\s/g, "")}.sxcu`;
    a.click(); URL.revokeObjectURL(a.href);
  };

  const inputCls = "block w-full px-4 py-2.5 border border-white/10 rounded-lg bg-[#0a0a0a] text-gray-300 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-sm transition-all";

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold text-white mb-1">Settings</h1>
        <p className="text-gray-500 text-sm">Customize your upload preferences and API access</p>
      </div>

      {/* Embed settings */}
      <section className="bg-[#141414] border border-white/5 rounded-2xl p-8 shadow-glow-card space-y-6">
        <h3 className="text-xl font-bold text-white flex items-center gap-2"><span className="w-1 h-6 bg-primary rounded-full" /> Embed Settings</h3>
        <p className="text-sm text-gray-500 -mt-4">Customize how your shared links appear on Discord, Telegram, etc.</p>
        <div className="space-y-2"><label className="text-sm font-medium text-gray-400">Embed Title</label><input value={embedTitle} onChange={(e) => setEmbedTitle(e.target.value)} className={inputCls} placeholder="File Upload" /></div>
        <div className="space-y-2"><label className="text-sm font-medium text-gray-400">Embed Description (optional)</label><input value={embedDescription} onChange={(e) => setEmbedDescription(e.target.value)} className={inputCls} placeholder="Shown below the title in embeds" /></div>
        <div className="space-y-2"><label className="text-sm font-medium text-gray-400">Embed Author (optional)</label><input value={embedAuthor} onChange={(e) => setEmbedAuthor(e.target.value)} className={inputCls} placeholder="Your name or brand" /></div>
        <div className="space-y-2"><label className="text-sm font-medium text-gray-400">Embed Site Name (optional)</label><input value={embedSiteName} onChange={(e) => setEmbedSiteName(e.target.value)} className={inputCls} placeholder="RXShare" /><p className="text-xs text-gray-600">Shown as the provider name above the title in Discord</p></div>
        <div className="space-y-2"><label className="text-sm font-medium text-gray-400">Embed Logo URL (optional)</label><input value={embedLogoUrl} onChange={(e) => setEmbedLogoUrl(e.target.value)} className={inputCls} placeholder="https://example.com/logo.png" /><p className="text-xs text-gray-600">Small icon shown next to the site name</p></div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-400">Theme Color</label>
          <div className="flex items-center gap-3">
            <label className="relative w-10 h-10 rounded-lg border border-white/10 shrink-0 cursor-pointer overflow-hidden group" style={{ backgroundColor: embedColor, boxShadow: `0 0 10px ${embedColor}40` }}>
              <input type="color" value={embedColor} onChange={(e) => setEmbedColor(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                <Icon name="colorize" className="text-white text-sm" />
              </div>
            </label>
            <input value={embedColor} onChange={(e) => setEmbedColor(e.target.value)} className={inputCls + " w-28 font-mono"} />
          </div>
        </div>
        <div className="h-px bg-white/5" />
        <div className="flex items-center justify-between">
          <div><p className="text-sm font-medium text-white">Default Visibility</p><p className="text-xs text-gray-500">New uploads are {defaultPublic ? "public" : "private"} by default</p></div>
          <Switch checked={defaultPublic} onCheckedChange={setDefaultPublic} />
        </div>
        <div className="h-px bg-white/5" />
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-400">Custom URL Path (optional)</label>
          <input value={customPath} onChange={(e) => setCustomPath(e.target.value.toLowerCase())} className={inputCls} placeholder="my-files" />
          <p className="text-xs text-gray-600">Use instead of your username in URLs</p>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-400">ShareX Auto-Folder</label>
          <input value={sharexFolderName} onChange={(e) => setSharexFolderName(e.target.value)} className={inputCls} placeholder="ShareX" />
          <p className="text-xs text-gray-600">Uploads via API token are automatically placed in this folder</p>
        </div>
        <button onClick={saveSettings} className="bg-primary hover:bg-[var(--primary-hover)] text-white px-6 py-2.5 rounded-xl font-bold shadow-glow-primary transition-all hover:scale-105">Save Settings</button>
      </section>

      {/* API Tokens */}
      <section className="bg-[#141414] border border-white/5 rounded-2xl p-8 shadow-glow-card space-y-6">
        <h3 className="text-xl font-bold text-white flex items-center gap-2"><span className="w-1 h-6 bg-primary rounded-full" /><Icon name="vpn_key" className="text-xl" /> API Tokens</h3>
        <p className="text-sm text-gray-500 -mt-4">Create tokens for ShareX or API access</p>
        <div className="flex gap-2">
          <input placeholder="Token name (e.g. ShareX)" value={tokenName} onChange={(e) => setTokenName(e.target.value)} className={inputCls} />
          <button onClick={createToken} className="bg-primary hover:bg-[var(--primary-hover)] text-white px-4 py-2.5 rounded-lg text-sm font-bold transition-all shadow-glow-primary flex items-center gap-2 shrink-0">
            <Icon name="add" className="text-lg" /> Create
          </button>
        </div>
        {newToken && (
          <div className="bg-primary/10 border border-primary/20 p-4 rounded-xl space-y-2">
            <p className="text-sm font-medium text-primary">Copy your token now — it won't be shown again!</p>
            <div className="flex items-center gap-2">
              <code className="text-xs bg-[#0a0a0a] text-gray-300 p-2 rounded-lg flex-1 break-all border border-white/10">{newToken}</code>
              <button onClick={() => { navigator.clipboard.writeText(newToken); toast({ title: "Copied!" }); }}
                className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-all"><Icon name="content_copy" /></button>
            </div>
          </div>
        )}
        {tokens.length > 0 && (
          <div className="space-y-2">
            {tokens.map((t: any) => (
              <div key={t.id} className="flex items-center justify-between p-4 bg-white/[0.03] border border-white/5 rounded-xl">
                <div>
                  <p className="text-sm font-medium text-white">{t.name}</p>
                  <p className="text-xs text-gray-500">Created {formatRelativeDate(t.created_at)}{t.last_used_at && ` • Last used ${formatRelativeDate(t.last_used_at)}`}</p>
                </div>
                <button onClick={() => deleteToken(t.id)} className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"><Icon name="delete" /></button>
              </div>
            ))}
          </div>
        )}
        <div className="h-px bg-white/5" />
        <button onClick={downloadShareXConfig} className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-300 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors">
          <Icon name="download" className="text-lg" /> Download ShareX Config
        </button>
      </section>
    </div>
  );
}
