import { useState, useEffect } from "react";
import { useLoaderData, useOutletContext, useRevalidator } from "react-router";
import { getSession } from "~/.server/session";
import { isAdmin } from "~/.server/auth";
import { query, queryOne } from "~/.server/db";
import { formatFileSize, getAvatarUrl } from "~/lib/utils-format";
import { cn } from "~/lib/utils";
import { useToast } from "~/components/ui/use-toast";
import { Icon } from "~/components/Icon";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Switch } from "~/components/ui/switch";
import { getCsrfToken } from "~/lib/csrf";

export async function loader({ request }: { request: Request }) {
  const session = await getSession(request);
  if (!session || !isAdmin(session.user.id)) throw new Response(null, { status: 302, headers: { Location: "/dashboard" } });
  const users = query<any>("SELECT u.*, us.disk_quota, us.disk_used, us.is_admin, us.is_active, us.max_upload_size FROM users u LEFT JOIN user_settings us ON u.id = us.user_id ORDER BY u.created_at");
  const allUploads = query<any>("SELECT id, user_id, file_size FROM uploads");
  const systemSettings = queryOne<any>("SELECT * FROM system_settings LIMIT 1");
  return { users, allUploads, systemSettings, currentUserId: session.user.id };
}

export default function AdminPage() {
  const { users, allUploads, systemSettings, currentUserId } = useLoaderData<typeof loader>();
  const { toast } = useToast();
  const revalidator = useRevalidator();
  const [activeTab, setActiveTab] = useState("users");

  const totalUsers = users.length;
  const activeUsers = users.filter((u: any) => u.is_active !== 0).length;
  const totalUploads = allUploads.length;
  const totalStorage = users.reduce((acc: number, u: any) => acc + (u.disk_used || 0), 0);

  const tabs = [
    { id: "users", label: "Users", icon: "manage_accounts" },
    { id: "settings", label: "General", icon: "settings" },
    { id: "design", label: "Design", icon: "palette" },
    { id: "audit", label: "Audit Log", icon: "history" },
    { id: "webhooks", label: "Webhooks", icon: "webhook" },
    { id: "invites", label: "Invites", icon: "mail" },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white mb-1">Admin Panel</h1>
        <p className="text-gray-500 text-sm">Manage users, settings, and design</p>
      </div>

      {/* Stats — exact Stitch */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {[
          { icon: "group", label: "Total Users", value: String(totalUsers), color: "text-primary" },
          { icon: "wifi", label: "Active Users", value: String(activeUsers), color: "text-green-500" },
          { icon: "cloud_upload", label: "Total Uploads", value: String(totalUploads), color: "text-blue-500" },
          { icon: "storage", label: "Storage Used", value: formatFileSize(totalStorage), color: "text-purple-500" },
        ].map((stat) => (
          <div key={stat.label} className="bg-[#141414]/50 backdrop-blur-md border border-white/5 p-6 rounded-2xl relative overflow-hidden group hover:border-primary/30 transition-all duration-300 shadow-glow-card">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Icon name={stat.icon} className={cn("text-6xl", stat.color)} />
            </div>
            <div className="text-gray-400 text-sm font-medium mb-2">{stat.label}</div>
            <div className="text-3xl font-bold text-white tracking-tight">{stat.value}</div>
            <div className="flex items-center gap-1 text-emerald-500 text-xs mt-2 font-medium">
              <Icon name="trending_up" className="text-sm" />
              <span>Active</span>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="border-b border-white/10">
        <nav className="flex space-x-8">
          {tabs.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={cn("pb-4 px-1 font-medium flex items-center gap-2 transition-colors relative",
                activeTab === tab.id
                  ? "text-primary font-bold"
                  : "text-gray-500 hover:text-white border-b-2 border-transparent group"
              )}>
              <Icon name={tab.icon} className={activeTab === tab.id ? "" : "group-hover:scale-110 transition-transform"} />
              {tab.label}
              {activeTab === tab.id && (
                <span className="absolute -bottom-[1px] left-0 w-full h-[2px] bg-primary shadow-glow-primary" />
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {activeTab === "users" && <UsersTab users={users} allUploads={allUploads} currentUserId={currentUserId} toast={toast} revalidator={revalidator} />}
      {activeTab === "settings" && <SettingsTab systemSettings={systemSettings} toast={toast} revalidator={revalidator} />}
      {activeTab === "design" && <DesignTab systemSettings={systemSettings} toast={toast} revalidator={revalidator} />}
      {activeTab === "audit" && <AuditTab toast={toast} />}
      {activeTab === "webhooks" && <WebhooksTab toast={toast} />}
      {activeTab === "invites" && <InvitesTab toast={toast} systemSettings={systemSettings} />}
    </div>
  );
}

function UsersTab({ users, allUploads, currentUserId, toast, revalidator }: any) {
  const [search, setSearch] = useState("");
  const [deleteUser, setDeleteUser] = useState<any>(null);
  const [editUser, setEditUser] = useState<any>(null);
  const [editQuota, setEditQuota] = useState("");
  const [editMaxUpload, setEditMaxUpload] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createEmail, setCreateEmail] = useState("");
  const [createUsername, setCreateUsername] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createIsAdmin, setCreateIsAdmin] = useState(false);
  const [creating, setCreating] = useState(false);

  const filtered = users.filter((u: any) =>
    (u.username || "").toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  const getUserUploadCount = (userId: string) => allUploads.filter((u: any) => u.user_id === userId).length;

  const toggleAdmin = async (userId: string) => {
    const user = users.find((u: any) => u.id === userId);
    const res = await fetch(`/api/admin/users/${userId}`, { method: "PATCH", headers: { "Content-Type": "application/json", ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}) }, body: JSON.stringify({ is_admin: user.is_admin ? 0 : 1 }) });
    if (res.ok) { revalidator.revalidate(); toast({ title: user.is_admin ? "Admin removed" : "Admin granted" }); }
  };

  const toggleActive = async (userId: string) => {
    const user = users.find((u: any) => u.id === userId);
    const res = await fetch(`/api/admin/users/${userId}`, { method: "PATCH", headers: { "Content-Type": "application/json", ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}) }, body: JSON.stringify({ is_active: user.is_active ? 0 : 1 }) });
    if (res.ok) { revalidator.revalidate(); toast({ title: user.is_active ? "User deactivated" : "User activated" }); }
  };

  const handleDelete = async () => {
    if (!deleteUser) return;
    const res = await fetch(`/api/admin/users/${deleteUser.id}`, { method: "DELETE", headers: { ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}) } });
    if (res.ok) { setDeleteUser(null); revalidator.revalidate(); toast({ title: "User deleted" }); }
  };

  const handleEditSave = async () => {
    if (!editUser) return;
    const updates: any = {};
    if (editQuota) updates.disk_quota = parseInt(editQuota) * 1024 * 1024;
    if (editMaxUpload) updates.max_upload_size = parseInt(editMaxUpload) * 1024 * 1024;
    const res = await fetch(`/api/admin/users/${editUser.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}) }, body: JSON.stringify(updates) });
    if (res.ok) { setEditUser(null); revalidator.revalidate(); toast({ title: "User settings updated" }); }
  };

  const handleCreateUser = async () => {
    if (!createEmail || !createUsername || !createPassword) {
      toast({ title: "All fields are required", variant: "destructive" }); return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/admin/users/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}) },
        body: JSON.stringify({ email: createEmail, username: createUsername, password: createPassword, is_admin: createIsAdmin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setShowCreate(false); setCreateEmail(""); setCreateUsername(""); setCreatePassword(""); setCreateIsAdmin(false);
      revalidator.revalidate(); toast({ title: "User created" });
    } catch (err: any) { toast({ title: "Failed", description: err.message, variant: "destructive" }); }
    finally { setCreating(false); }
  };

  const inputCls = "block w-full px-4 py-2.5 border border-white/10 rounded-lg bg-[#0a0a0a] text-gray-300 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-sm transition-all";

  return (
    <div className="space-y-6 mt-6">
      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input className="block w-full pl-10 pr-4 py-2.5 border border-white/10 rounded-lg bg-[#141414] text-gray-300 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-sm shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]"
            placeholder="Search users..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <button onClick={() => setShowCreate(true)}
          className="bg-primary hover:bg-[var(--primary-hover)] text-white px-4 py-2.5 rounded-lg text-sm font-bold transition-all shadow-glow-primary flex items-center gap-2 hover:scale-105">
          <Icon name="person_add" className="text-lg" /> Create User
        </button>
      </div>

      {/* Users table */}
      <div className="bg-[#141414] border border-white/5 rounded-2xl shadow-glow-card overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-white/5 border-b border-white/10 text-xs font-semibold uppercase text-gray-400 tracking-wider">
              <th className="px-6 py-4">User</th>
              <th className="px-6 py-4">Role</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Storage</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filtered.map((u: any) => {
              const isSelf = u.id === currentUserId;
              return (
                <tr key={u.id} className="group hover:bg-white/[0.03] transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        <div className={cn("w-10 h-10 rounded-full p-0.5", u.is_admin === 1 ? "bg-gradient-to-br from-primary to-[var(--primary-hover)]" : "bg-gray-800")}>
                          <div className="w-full h-full rounded-full bg-black flex items-center justify-center overflow-hidden">
                            <img alt="" className="w-full h-full object-cover opacity-90" src={getAvatarUrl(u.username || u.email)} />
                          </div>
                        </div>
                        <div className={cn("absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#141414]",
                          u.is_active !== 0 ? "bg-green-500" : "bg-red-500")} />
                      </div>
                      <div>
                        <div className="font-semibold text-white">{u.username || u.email}</div>
                        <div className="text-xs text-gray-500">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {u.is_admin === 1 ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-primary/20 text-primary border border-primary/30 shadow-glow-primary">
                        <Icon name="verified_user" className="text-[14px]" /> Admin
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-white/5 text-gray-400 border border-white/10">
                        <Icon name="person" className="text-[14px]" /> User
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className={cn("w-1.5 h-1.5 rounded-full", u.is_active !== 0 ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" : "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]")} />
                      <span className={cn("text-sm", u.is_active !== 0 ? "text-gray-300" : "text-red-400")}>{u.is_active !== 0 ? "Active" : "Suspended"}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-300">{formatFileSize(u.disk_used || 0)}</div>
                    <div className="text-xs text-gray-600">{getUserUploadCount(u.id)} files</div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {!isSelf && (
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => { setEditUser(u); setEditQuota(String(Math.round((u.disk_quota || 0) / 1024 / 1024))); setEditMaxUpload(String(Math.round((u.max_upload_size || 0) / 1024 / 1024))); }}
                          className="p-2 text-gray-500 hover:text-white hover:bg-white/10 rounded-lg transition-all"><Icon name="edit" /></button>
                        <button onClick={() => toggleAdmin(u.id)}
                          className="p-2 text-gray-500 hover:text-white hover:bg-white/10 rounded-lg transition-all"><Icon name={u.is_admin ? "shield" : "admin_panel_settings"} /></button>
                        <button onClick={() => toggleActive(u.id)}
                          className={cn("p-2 hover:bg-white/10 rounded-lg transition-all", u.is_active !== 0 ? "text-green-500" : "text-red-500")}><Icon name={u.is_active !== 0 ? "check_circle" : "block"} /></button>
                        <button onClick={() => setDeleteUser(u)}
                          className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"><Icon name="delete" /></button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="px-6 py-4 border-t border-white/5 bg-white/[0.02]">
          <div className="text-xs text-gray-500">Showing <span className="text-white font-medium">{filtered.length}</span> of <span className="text-white font-medium">{users.length}</span> users</div>
        </div>
      </div>

      {/* Delete dialog */}
      <Dialog open={!!deleteUser} onOpenChange={() => setDeleteUser(null)}>
        <DialogContent className="bg-[#141414] border-white/10">
          <DialogHeader><DialogTitle className="text-white">Delete user?</DialogTitle><DialogDescription className="text-gray-500">This will delete all uploads and data for {deleteUser?.username || deleteUser?.email}. This cannot be undone.</DialogDescription></DialogHeader>
          <DialogFooter>
            <button onClick={() => setDeleteUser(null)} className="px-4 py-2 text-sm text-gray-400 border border-white/10 rounded-lg hover:bg-white/5 transition-colors">Cancel</button>
            <button onClick={handleDelete} className="px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors">Delete</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editUser} onOpenChange={() => setEditUser(null)}>
        <DialogContent className="bg-[#141414] border-white/10">
          <DialogHeader><DialogTitle className="text-white">Edit {editUser?.username || editUser?.email}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><label className="text-sm font-medium text-gray-400">Disk Quota (MB)</label><input type="number" value={editQuota} onChange={(e) => setEditQuota(e.target.value)} className={inputCls} /></div>
            <div className="space-y-2"><label className="text-sm font-medium text-gray-400">Max Upload Size (MB)</label><input type="number" value={editMaxUpload} onChange={(e) => setEditMaxUpload(e.target.value)} className={inputCls} /></div>
          </div>
          <DialogFooter>
            <button onClick={() => setEditUser(null)} className="px-4 py-2 text-sm text-gray-400 border border-white/10 rounded-lg hover:bg-white/5 transition-colors">Cancel</button>
            <button onClick={handleEditSave} className="px-4 py-2 text-sm text-white bg-primary hover:bg-[var(--primary-hover)] rounded-lg shadow-glow-primary transition-all">Save</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create User dialog */}
      <Dialog open={showCreate} onOpenChange={() => setShowCreate(false)}>
        <DialogContent className="bg-[#141414] border-white/10">
          <DialogHeader><DialogTitle className="text-white">Create User</DialogTitle><DialogDescription className="text-gray-500">Add a new user to the system.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><label className="text-sm font-medium text-gray-400">Email</label><input type="email" value={createEmail} onChange={(e) => setCreateEmail(e.target.value)} className={inputCls} placeholder="user@example.com" /></div>
            <div className="space-y-2"><label className="text-sm font-medium text-gray-400">Username</label><input value={createUsername} onChange={(e) => setCreateUsername(e.target.value)} className={inputCls} placeholder="username" /></div>
            <div className="space-y-2"><label className="text-sm font-medium text-gray-400">Password</label><input type="password" value={createPassword} onChange={(e) => setCreatePassword(e.target.value)} className={inputCls} placeholder="••••••••" /></div>
            <div className="flex items-center justify-between">
              <div><p className="text-sm font-medium text-white">Admin</p><p className="text-xs text-gray-500">Grant admin privileges</p></div>
              <Switch checked={createIsAdmin} onCheckedChange={setCreateIsAdmin} />
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-gray-400 border border-white/10 rounded-lg hover:bg-white/5 transition-colors">Cancel</button>
            <button onClick={handleCreateUser} disabled={creating} className="px-4 py-2 text-sm text-white bg-primary hover:bg-[var(--primary-hover)] rounded-lg shadow-glow-primary transition-all disabled:opacity-50">{creating ? "Creating..." : "Create"}</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SettingsTab({ systemSettings, toast, revalidator }: any) {
  const [siteName, setSiteName] = useState(systemSettings?.site_name || "RXShare");
  const [siteDesc, setSiteDesc] = useState(systemSettings?.site_description || "");
  const [baseUrl, setBaseUrl] = useState(systemSettings?.base_url || "");
  const [allowReg, setAllowReg] = useState(systemSettings?.allow_registration !== 0);
  const [allowLogin, setAllowLogin] = useState(systemSettings?.allow_login !== 0);
  const [defaultQuota, setDefaultQuota] = useState(String(Math.round((systemSettings?.default_quota || 1073741824) / 1024 / 1024)));
  const [maxUpload, setMaxUpload] = useState(String(Math.round((systemSettings?.max_upload_size || 104857600) / 1024 / 1024)));

  const save = async () => {
    const res = await fetch("/api/admin/system-settings", {
      method: "PUT", headers: { "Content-Type": "application/json", ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}) },
      body: JSON.stringify({
        site_name: siteName, site_description: siteDesc, base_url: baseUrl || null,
        allow_registration: allowReg ? 1 : 0, allow_login: allowLogin ? 1 : 0,
        default_quota: parseInt(defaultQuota) * 1024 * 1024, max_upload_size: parseInt(maxUpload) * 1024 * 1024,
      }),
    });
    if (res.ok) { revalidator.revalidate(); toast({ title: "Settings saved!" }); }
  };

  const inputCls = "block w-full px-4 py-2.5 border border-white/10 rounded-lg bg-[#0a0a0a] text-gray-300 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-sm transition-all";

  return (
    <div className="mt-6 max-w-xl space-y-6">
      <section className="bg-[#141414] border border-white/5 rounded-2xl p-8 shadow-glow-card space-y-6">
        <h3 className="text-xl font-bold text-white flex items-center gap-2"><span className="w-1 h-6 bg-primary rounded-full" /> General Settings</h3>
        <div className="space-y-2"><label className="text-sm font-medium text-gray-400">Site Name</label><input value={siteName} onChange={(e) => setSiteName(e.target.value)} className={inputCls} /></div>
        <div className="space-y-2"><label className="text-sm font-medium text-gray-400">Site Description</label><input value={siteDesc} onChange={(e) => setSiteDesc(e.target.value)} className={inputCls} /></div>
        <div className="space-y-2"><label className="text-sm font-medium text-gray-400">Base URL</label><input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className={inputCls} placeholder="https://share.example.com" /></div>
        <div className="h-px bg-white/5" />
        <div className="flex items-center justify-between">
          <div><p className="text-sm font-medium text-white">Allow Registration</p><p className="text-xs text-gray-500">Let new users sign up</p></div>
          <Switch checked={allowReg} onCheckedChange={setAllowReg} />
        </div>
        <div className="flex items-center justify-between">
          <div><p className="text-sm font-medium text-white">Allow Login</p><p className="text-xs text-gray-500">Enable/disable login page</p></div>
          <Switch checked={allowLogin} onCheckedChange={setAllowLogin} />
        </div>
        <div className="h-px bg-white/5" />
        <div className="space-y-2"><label className="text-sm font-medium text-gray-400">Default Quota (MB)</label><input type="number" value={defaultQuota} onChange={(e) => setDefaultQuota(e.target.value)} className={inputCls} /><p className="text-xs text-gray-600">{formatFileSize(parseInt(defaultQuota || "0") * 1024 * 1024)}</p></div>
        <div className="space-y-2"><label className="text-sm font-medium text-gray-400">Max Upload Size (MB)</label><input type="number" value={maxUpload} onChange={(e) => setMaxUpload(e.target.value)} className={inputCls} /><p className="text-xs text-gray-600">{formatFileSize(parseInt(maxUpload || "0") * 1024 * 1024)}</p></div>
        <button onClick={save} className="bg-primary hover:bg-[var(--primary-hover)] text-white px-8 py-3 rounded-xl font-bold shadow-glow-primary transition-all hover:scale-105 flex items-center gap-2">Save Configuration</button>
      </section>
    </div>
  );
}

function DesignTab({ systemSettings, toast, revalidator }: any) {
  const [layout, setLayout] = useState(systemSettings?.dashboard_layout || "sidebar");
  const [logoUrl, setLogoUrl] = useState(systemSettings?.logo_url || "");
  const [primaryColor, setPrimaryColor] = useState(systemSettings?.primary_color || "#f97316");
  const [bgPattern, setBgPattern] = useState(systemSettings?.background_pattern || "grid");
  const [uploading, setUploading] = useState(false);

  const layouts = [
    { id: "header", label: "Header Layout", icon: "monitor", desc: "Navigation on top" },
    { id: "sidebar", label: "Sidebar Layout", icon: "view_sidebar", desc: "Vertical navigation" },
    { id: "floating", label: "Floating Dock", icon: "dock_to_bottom", desc: "Modern detached nav" },
  ];

  const patterns = [
    { id: "grid", label: "Grid", icon: "grid_4x4" },
    { id: "dots", label: "Dots", icon: "blur_on" },
    { id: "triangles", label: "Triangles", icon: "change_history" },
    { id: "crosshatch", label: "Crosshatch", icon: "tag" },
    { id: "diagonal", label: "Diagonal", icon: "texture" },
    { id: "hexagons", label: "Hexagons", icon: "hexagon" },
    { id: "none", label: "None", icon: "block" },
  ];

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast({ title: "Please upload an image", variant: "destructive" }); return; }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/logo", { method: "POST", body: formData, headers: { ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}) } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setLogoUrl(data.url);
      toast({ title: "Logo uploaded!" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally { setUploading(false); }
  };

  const save = async () => {
    const res = await fetch("/api/admin/system-settings", {
      method: "PUT", headers: { "Content-Type": "application/json", ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}) },
      body: JSON.stringify({ dashboard_layout: layout, logo_url: logoUrl || null, primary_color: primaryColor, background_pattern: bgPattern }),
    });
    if (res.ok) { revalidator.revalidate(); toast({ title: "Design saved! Reload to see changes." }); }
  };

  const inputCls = "block w-full px-4 py-2.5 border border-white/10 rounded-lg bg-[#0a0a0a] text-gray-300 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-sm transition-all";

  return (
    <div className="mt-6 space-y-8 max-w-3xl">
      {/* Layout picker */}
      <section className="bg-[#141414] border border-white/5 rounded-2xl p-8 shadow-glow-card">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-white flex items-center gap-2"><span className="w-1 h-6 bg-primary rounded-full" /> Dashboard Layout</h3>
          <span className="text-xs text-gray-500 bg-white/5 px-2 py-1 rounded">Visual Config</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {layouts.map((l) => (
            <label key={l.id} className="cursor-pointer group relative">
              <input type="radio" name="layout" className="peer sr-only" checked={layout === l.id} onChange={() => setLayout(l.id)} />
              <div className={cn(
                "bg-[#1a1a1a] border rounded-2xl p-6 flex flex-col items-center justify-center gap-4 transition-all h-48 relative overflow-hidden",
                layout === l.id ? "border-primary ring-1 ring-primary/50 shadow-glow-primary" : "border-white/10 hover:border-gray-600"
              )}>
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/50 pointer-events-none" />
                <Icon name={l.icon} className={cn("text-5xl relative z-10", layout === l.id ? "text-primary" : "text-gray-500")} />
                <div className="text-center relative z-10">
                  <span className={cn("block font-bold", layout === l.id ? "text-primary" : "text-white")}>{l.label}</span>
                  <span className="text-xs text-gray-500 mt-1">{l.desc}</span>
                </div>
              </div>
              {layout === l.id && <div className="absolute top-4 right-4 text-primary z-20">✓</div>}
            </label>
          ))}
        </div>
      </section>

      {/* Branding */}
      <section className="bg-[#141414] border border-white/5 rounded-2xl p-8 shadow-glow-card space-y-6">
        <h3 className="text-xl font-bold text-white flex items-center gap-2"><span className="w-1 h-6 bg-primary rounded-full" /> Background Pattern</h3>
        <div className="grid grid-cols-3 md:grid-cols-4 gap-4">
          {patterns.map((p) => (
            <label key={p.id} className="cursor-pointer group relative">
              <input type="radio" name="bgPattern" className="peer sr-only" checked={bgPattern === p.id} onChange={() => setBgPattern(p.id)} />
              <div className={cn(
                "bg-[#1a1a1a] border rounded-xl p-4 flex flex-col items-center justify-center gap-3 transition-all h-28 relative overflow-hidden",
                bgPattern === p.id ? "border-primary ring-1 ring-primary/50 shadow-glow-primary" : "border-white/10 hover:border-gray-600"
              )}>
                <div className={cn("absolute inset-0 opacity-30", `bg-pattern-${p.id}`)} />
                <Icon name={p.icon} className={cn("text-3xl relative z-10", bgPattern === p.id ? "text-primary" : "text-gray-500")} />
                <span className={cn("text-sm font-medium relative z-10", bgPattern === p.id ? "text-primary" : "text-gray-400")}>{p.label}</span>
              </div>
            </label>
          ))}
        </div>
      </section>

      {/* Branding & Assets */}
      <section className="bg-[#141414] border border-white/5 rounded-2xl p-8 shadow-glow-card space-y-6">
        <h3 className="text-xl font-bold text-white flex items-center gap-2"><span className="w-1 h-6 bg-primary rounded-full" /> Branding & Assets</h3>
        <div>
          <label className="text-sm font-medium text-gray-400 mb-3 block">Application Logo</label>
          <div className="flex items-start gap-4">
            {logoUrl && (
              <div className="w-20 h-20 rounded-xl bg-[#1a1a1a] border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                <img src={logoUrl.startsWith("/api/logo") ? `${logoUrl}?t=${Date.now()}` : logoUrl} alt="Logo preview" className="w-full h-full object-contain p-1" />
              </div>
            )}
            <label className="w-20 h-20 rounded-xl bg-[#1a1a1a] border border-dashed border-gray-600 flex flex-col items-center justify-center text-gray-500 hover:border-primary hover:text-primary transition-colors cursor-pointer shrink-0">
              <Icon name="cloud_upload" className="text-2xl mb-1" />
              <span className="text-[10px] uppercase font-bold">{uploading ? "..." : "Upload"}</span>
              <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} disabled={uploading} />
            </label>
            <div className="flex-1 space-y-3">
              <input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} className={inputCls} placeholder="https://example.com/logo.png" />
              <p className="text-xs text-gray-500">Recommended: 512x512px. Supports PNG, SVG, JPG. Leave empty for default.</p>
              {logoUrl && <button onClick={() => setLogoUrl("")} className="text-xs text-red-400 hover:underline">Remove logo</button>}
            </div>
          </div>
        </div>
      </section>

      {/* Colors */}
      <section className="bg-[#141414] border border-white/5 rounded-2xl p-8 shadow-glow-card space-y-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
        <h3 className="text-xl font-bold text-white flex items-center gap-2 relative z-10"><span className="w-1 h-6 bg-primary rounded-full" /> Color Theme</h3>
        <div className="relative z-10">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">Primary Color</label>
            <div className="flex items-center gap-3">
              <label className="relative w-10 h-10 rounded-lg border border-white/10 shrink-0 cursor-pointer overflow-hidden group" style={{ backgroundColor: primaryColor, boxShadow: `0 0 15px ${primaryColor}40` }}>
                <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                  <Icon name="colorize" className="text-white text-sm" />
                </div>
              </label>
              <input value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className={inputCls + " w-32 font-mono"} />
            </div>
          </div>
        </div>
        {/* Live preview */}
        <div className="bg-[#0a0a0a] rounded-xl border border-white/10 p-6 flex flex-col items-center justify-center gap-4 relative overflow-hidden">
          <div className="absolute inset-0 bg-grid-pattern opacity-10" />
          <div className="text-xs text-gray-500 absolute top-3 left-3 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> Live Preview</div>
          <button className="relative text-white px-8 py-3 rounded-lg font-bold shadow-lg transition-all overflow-hidden" style={{ backgroundColor: primaryColor }}>
            <span className="relative z-10">Example Button</span>
          </button>
          <div className="flex gap-3">
            <span className="px-3 py-1 rounded-full text-xs font-semibold border" style={{ backgroundColor: `${primaryColor}20`, color: primaryColor, borderColor: `${primaryColor}30` }}>Badge</span>
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-gray-800 text-gray-400 border border-gray-700">Inactive</span>
          </div>
          <div className="w-full max-w-[200px]">
            <div className="h-1.5 w-full bg-gray-800 rounded-full overflow-hidden">
              <div className="h-full w-2/3 rounded-full" style={{ backgroundColor: primaryColor, boxShadow: `0 0 10px ${primaryColor}80` }} />
            </div>
          </div>
        </div>
      </section>

      <div className="flex items-center gap-4 pb-12">
        <button onClick={save} className="bg-primary hover:bg-[var(--primary-hover)] text-white px-8 py-3.5 rounded-xl font-bold shadow-glow-primary transition-all hover:scale-105 flex items-center gap-2">Save Configuration</button>
        <button className="text-gray-400 hover:text-white px-6 py-3.5 rounded-xl font-medium border border-transparent hover:border-white/10 transition-all">Reset to Defaults</button>
      </div>
    </div>
  );
}

function AuditTab({ toast }: any) {
  const [logs, setLogs] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/audit?page=${page}`).then(r => r.json()).then(d => { setLogs(d.logs || []); setLoading(false); }).catch(() => setLoading(false));
  }, [page]);

  const actionColors: Record<string, string> = {
    upload: "text-green-400", delete: "text-red-400", login: "text-blue-400",
    "user.create": "text-primary", "user.delete": "text-red-400",
    "folder.create": "text-yellow-400", "webhook.create": "text-purple-400",
    "invite.create": "text-pink-400", "invite.use": "text-emerald-400",
  };

  return (
    <div className="mt-6 space-y-6">
      <div className="bg-[#141414] border border-white/5 rounded-2xl shadow-glow-card overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-white/5 border-b border-white/10 text-xs font-semibold uppercase text-gray-400 tracking-wider">
              <th className="px-6 py-4">Action</th>
              <th className="px-6 py-4">User</th>
              <th className="px-6 py-4">Details</th>
              <th className="px-6 py-4">IP</th>
              <th className="px-6 py-4">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading ? (
              <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-500">Loading...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-500">No audit logs yet</td></tr>
            ) : logs.map((log: any) => (
              <tr key={log.id} className="hover:bg-white/[0.03] transition-colors">
                <td className="px-6 py-3"><span className={cn("text-sm font-medium", actionColors[log.action] || "text-gray-300")}>{log.action}</span></td>
                <td className="px-6 py-3 text-sm text-gray-300">{log.username || "system"}</td>
                <td className="px-6 py-3 text-sm text-gray-500 truncate max-w-[200px]">{log.details || "-"}</td>
                <td className="px-6 py-3 text-xs text-gray-600 font-mono">{log.ip_address || "-"}</td>
                <td className="px-6 py-3 text-xs text-gray-500">{log.created_at ? new Date(log.created_at).toLocaleString() : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-6 py-4 border-t border-white/5 flex items-center justify-between bg-white/[0.02]">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="px-3 py-1.5 text-xs text-gray-400 border border-white/10 rounded-lg hover:bg-white/5 disabled:opacity-30">Previous</button>
          <span className="text-xs text-gray-500">Page {page}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={logs.length < 50}
            className="px-3 py-1.5 text-xs text-gray-400 border border-white/10 rounded-lg hover:bg-white/5 disabled:opacity-30">Next</button>
        </div>
      </div>
    </div>
  );
}

function WebhooksTab({ toast }: any) {
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState("upload,delete");

  useEffect(() => {
    fetch("/api/admin/webhooks").then(r => r.json()).then(d => setWebhooks(d.webhooks || [])).catch(() => {});
  }, []);

  const create = async () => {
    if (!name.trim() || !url.trim()) { toast({ title: "Name and URL required", variant: "destructive" }); return; }
    const res = await fetch("/api/admin/webhooks", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}) },
      body: JSON.stringify({ name: name.trim(), url: url.trim(), events }),
    });
    const d = await res.json();
    if (res.ok) { setWebhooks(prev => [{ ...d, name: name.trim(), url: url.trim(), events, is_active: 1 }, ...prev]); setName(""); setUrl(""); toast({ title: "Webhook created" }); }
  };

  const remove = async (id: string) => {
    await fetch("/api/admin/webhooks", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}) },
      body: JSON.stringify({ id }),
    });
    setWebhooks(prev => prev.filter(w => w.id !== id));
    toast({ title: "Webhook deleted" });
  };

  const toggle = async (id: string, active: boolean) => {
    await fetch("/api/admin/webhooks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}) },
      body: JSON.stringify({ id, is_active: active ? 1 : 0 }),
    });
    setWebhooks(prev => prev.map(w => w.id === id ? { ...w, is_active: active ? 1 : 0 } : w));
  };

  const inputCls = "block w-full px-4 py-2.5 border border-white/10 rounded-lg bg-[#0a0a0a] text-gray-300 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-primary text-sm";

  return (
    <div className="mt-6 max-w-xl space-y-6">
      <section className="bg-[#141414] border border-white/5 rounded-2xl p-8 shadow-glow-card space-y-6">
        <h3 className="text-xl font-bold text-white flex items-center gap-2"><span className="w-1 h-6 bg-primary rounded-full" /> Create Webhook</h3>
        <div className="space-y-4">
          <div className="space-y-2"><label className="text-sm font-medium text-gray-400">Name</label><input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="Discord notifications" /></div>
          <div className="space-y-2"><label className="text-sm font-medium text-gray-400">URL</label><input value={url} onChange={(e) => setUrl(e.target.value)} className={inputCls} placeholder="https://discord.com/api/webhooks/..." /></div>
          <div className="space-y-2"><label className="text-sm font-medium text-gray-400">Events (comma-separated)</label><input value={events} onChange={(e) => setEvents(e.target.value)} className={inputCls} placeholder="upload,delete,login,signup" /><p className="text-xs text-gray-600">Available: upload, delete, login, signup, user.create, user.delete, * (all)</p></div>
          <button onClick={create} className="bg-primary hover:bg-[var(--primary-hover)] text-white px-6 py-2.5 rounded-xl font-bold shadow-glow-primary transition-all">Create Webhook</button>
        </div>
      </section>
      {webhooks.length > 0 && (
        <section className="space-y-3">
          {webhooks.map((w: any) => (
            <div key={w.id} className="bg-[#141414] border border-white/5 rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white">{w.name}</p>
                <p className="text-xs text-gray-500 truncate max-w-[300px]">{w.url}</p>
                <p className="text-xs text-gray-600 mt-1">Events: {w.events}</p>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={w.is_active === 1} onCheckedChange={(v) => toggle(w.id, v)} />
                <button onClick={() => remove(w.id)} className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"><Icon name="delete" /></button>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function InvitesTab({ toast, systemSettings }: any) {
  const [invites, setInvites] = useState<any[]>([]);
  const [maxUses, setMaxUses] = useState("1");
  const [expiresHours, setExpiresHours] = useState("72");

  useEffect(() => {
    fetch("/api/admin/invites").then(r => r.json()).then(d => setInvites(d.invites || [])).catch(() => {});
  }, []);

  const create = async () => {
    const res = await fetch("/api/admin/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}) },
      body: JSON.stringify({ max_uses: parseInt(maxUses) || 1, expires_hours: parseInt(expiresHours) || null }),
    });
    const d = await res.json();
    if (res.ok) {
      const base = systemSettings?.base_url || window.location.origin;
      const link = `${base}/auth/sign-up?invite=${d.code}`;
      navigator.clipboard.writeText(link);
      setInvites(prev => [{ ...d, max_uses: parseInt(maxUses) || 1, uses: 0, created_at: new Date().toISOString() }, ...prev]);
      toast({ title: "Invite created & link copied!" });
    }
  };

  const remove = async (id: string) => {
    await fetch("/api/admin/invites", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}) },
      body: JSON.stringify({ id }),
    });
    setInvites(prev => prev.filter(i => i.id !== id));
    toast({ title: "Invite deleted" });
  };

  const inputCls = "block w-full px-4 py-2.5 border border-white/10 rounded-lg bg-[#0a0a0a] text-gray-300 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-primary text-sm";

  return (
    <div className="mt-6 max-w-xl space-y-6">
      <section className="bg-[#141414] border border-white/5 rounded-2xl p-8 shadow-glow-card space-y-6">
        <h3 className="text-xl font-bold text-white flex items-center gap-2"><span className="w-1 h-6 bg-primary rounded-full" /> Create Invite</h3>
        <p className="text-sm text-gray-500 -mt-4">Invite links allow users to register even when registration is disabled.</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2"><label className="text-sm font-medium text-gray-400">Max Uses</label><input type="number" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} className={inputCls} /></div>
          <div className="space-y-2"><label className="text-sm font-medium text-gray-400">Expires (hours)</label><input type="number" value={expiresHours} onChange={(e) => setExpiresHours(e.target.value)} className={inputCls} placeholder="Leave empty for no expiry" /></div>
        </div>
        <button onClick={create} className="bg-primary hover:bg-[var(--primary-hover)] text-white px-6 py-2.5 rounded-xl font-bold shadow-glow-primary transition-all flex items-center gap-2">
          <Icon name="link" className="text-lg" /> Generate Invite Link
        </button>
      </section>
      {invites.length > 0 && (
        <section className="space-y-3">
          {invites.map((inv: any) => {
            const expired = inv.expires_at && new Date(inv.expires_at) < new Date();
            const full = inv.uses >= inv.max_uses;
            return (
              <div key={inv.id} className={cn("bg-[#141414] border border-white/5 rounded-xl p-4 flex items-center justify-between", (expired || full) && "opacity-50")}>
                <div>
                  <p className="text-sm font-mono text-white">{inv.code}</p>
                  <p className="text-xs text-gray-500">{inv.uses}/{inv.max_uses} uses{inv.created_by_name && ` • by ${inv.created_by_name}`}{inv.used_by_name && ` • used by ${inv.used_by_name}`}</p>
                  {expired && <p className="text-xs text-red-400">Expired</p>}
                  {full && !expired && <p className="text-xs text-yellow-400">Fully used</p>}
                  {inv.expires_at && !expired && <p className="text-xs text-gray-600">Expires: {new Date(inv.expires_at).toLocaleString()}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => { const base = systemSettings?.base_url || window.location.origin; navigator.clipboard.writeText(`${base}/auth/sign-up?invite=${inv.code}`); toast({ title: "Link copied!" }); }}
                    className="p-2 text-gray-500 hover:text-white hover:bg-white/10 rounded-lg transition-all"><Icon name="content_copy" /></button>
                  <button onClick={() => remove(inv.id)} className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"><Icon name="delete" /></button>
                </div>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
