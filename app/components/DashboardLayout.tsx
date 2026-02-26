import { useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router";
import { Icon } from "~/components/Icon";
import { getAvatarUrl } from "~/lib/utils-format";
import { cn } from "~/lib/utils";

const DEFAULT_LOGO = "https://cdn.rxss.click/rexsystems/logo-transparent.svg";

interface NavItem { label: string; path: string; icon: string; adminOnly?: boolean; }
const mainNav: NavItem[] = [
  { label: "Dashboard", path: "/dashboard", icon: "dashboard" },
  { label: "Short Links", path: "/dashboard/short-links", icon: "link" },
  { label: "Settings", path: "/dashboard/settings", icon: "settings" },
];
const systemNav: NavItem[] = [
  { label: "Admin Panel", path: "/dashboard/admin", icon: "admin_panel_settings", adminOnly: true },
];

function getLogo(s: any) { return s?.logo_url?.trim() || DEFAULT_LOGO; }

function isActive(itemPath: string, currentPath: string) {
  return itemPath === "/dashboard" ? currentPath === "/dashboard" : currentPath.startsWith(itemPath);
}

function getBgPatternClass(systemSettings: any): string {
  const pat = systemSettings?.background_pattern || "grid";
  return `bg-pattern-${pat}`;
}

function PageContent({ children, path, center }: { children: React.ReactNode; path: string; center?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const prevPath = useRef(path);
  useEffect(() => {
    if (prevPath.current !== path && ref.current) {
      const el = ref.current;
      el.style.opacity = "0"; el.style.transform = "translateY(6px)";
      requestAnimationFrame(() => {
        el.style.transition = "opacity 0.2s ease, transform 0.2s ease";
        el.style.opacity = "1"; el.style.transform = "translateY(0)";
      });
      prevPath.current = path;
    }
  }, [path]);
  return <div ref={ref} className={center ? "[&>*]:mx-auto" : ""}>{children}</div>;
}

// ========== SIDEBAR LAYOUT ==========
export function SidebarLayout({ children, user, systemSettings, isAdmin: admin }: { children: React.ReactNode; user: any; systemSettings: any; isAdmin: boolean }) {
  const location = useLocation();
  const navigate = useNavigate();
  const pat = getBgPatternClass(systemSettings);

  return (
    <div className="text-gray-300 antialiased h-screen flex overflow-hidden font-sans relative">
      <div className={cn("fixed inset-0 opacity-40 pointer-events-none z-0", pat)} />
      <aside className="w-72 flex-shrink-0 glass flex flex-col justify-between z-30 relative ml-4 my-4 rounded-2xl shadow-2xl" style={{ height: "calc(100vh - 2rem)" }}>
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="h-20 flex items-center px-8 border-b border-white/5 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent opacity-50" />
            <button onClick={() => navigate("/dashboard")} className="flex items-center gap-3 font-bold text-2xl tracking-tight text-white relative z-10 hover:opacity-80 transition-opacity">
              <img src={getLogo(systemSettings)} alt="" className="h-12 w-12 object-contain" />
              <span>{systemSettings?.site_name || "RXShare"}</span>
            </button>
          </div>
          <nav className="p-4 space-y-2 mt-2">
            <div className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Main</div>
            {mainNav.map((item) => {
              const active = isActive(item.path, location.pathname);
              return (
                <a key={item.path} onClick={() => navigate(item.path)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl transition-all cursor-pointer",
                    active
                      ? "bg-gradient-to-r from-primary/20 to-transparent border-l-2 border-primary text-white rounded-r-xl"
                      : "text-gray-400 hover:text-white hover:bg-white/5 group"
                  )}>
                  <Icon name={item.icon} className={cn(active ? "text-primary" : "group-hover:text-primary transition-colors")} />
                  <span className="font-medium">{item.label}</span>
                </a>
              );
            })}
            {admin && (
              <>
                <div className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 mt-6">System</div>
                {systemNav.filter(i => !i.adminOnly || admin).map((item) => {
                  const active = isActive(item.path, location.pathname);
                  return (
                    <a key={item.path} onClick={() => navigate(item.path)}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3 rounded-xl transition-all cursor-pointer",
                        active
                          ? "bg-gradient-to-r from-primary/20 to-transparent border-l-2 border-primary text-white rounded-r-xl"
                          : "text-gray-400 hover:text-white hover:bg-white/5 group"
                      )}>
                      <Icon name={item.icon} className={cn(active ? "text-primary" : "group-hover:text-primary transition-colors")} />
                      <span className="font-medium">{item.label}</span>
                    </a>
                  );
                })}
              </>
            )}
          </nav>
        </div>
        <div className="p-4 m-4 rounded-xl bg-gradient-to-b from-white/5 to-transparent border border-white/5 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-white overflow-hidden ring-2 ring-primary/50">
                <img alt="User" className="w-full h-full object-cover" src={getAvatarUrl(user?.username || user?.email || "", 80, user?.avatar_url)} />
              </div>
              <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-[#1a1a1a]" />
            </div>
            <div className="flex flex-col overflow-hidden">
              <span className="text-sm font-semibold text-white truncate">{user?.username || "User"}</span>
              <span className="text-xs text-gray-500 truncate">{user?.email}</span>
            </div>
            <button onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); navigate("/auth/login"); }}
              className="ml-auto text-gray-500 hover:text-white transition-colors">
              <Icon name="logout" className="text-xl" />
            </button>
          </div>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 lg:p-8 relative" style={{ scrollbarGutter: "stable" }}>
        <div className="relative z-10">
          <PageContent path={location.pathname}>{children}</PageContent>
        </div>
      </main>
    </div>
  );
}

// ========== HEADER LAYOUT ==========
export function HeaderLayout({ children, user, systemSettings, isAdmin: admin }: { children: React.ReactNode; user: any; systemSettings: any; isAdmin: boolean }) {
  const location = useLocation();
  const navigate = useNavigate();
  const items = [...mainNav, ...systemNav].filter((i) => !i.adminOnly || admin);
  const pat = getBgPatternClass(systemSettings);

  return (
    <div className="min-h-screen text-gray-300 antialiased font-sans relative">
      <div className={cn("fixed inset-0 opacity-40 pointer-events-none z-0", pat)} />
      <header className="sticky top-0 z-50 glass border-b border-white/5">
        <div className="container mx-auto flex items-center justify-between h-16 px-6">
          <div className="flex items-center gap-6">
            <button onClick={() => navigate("/dashboard")} className="flex items-center gap-3 font-bold text-xl tracking-tight text-white hover:opacity-80 transition-opacity">
              <img src={getLogo(systemSettings)} alt="" className="h-10 w-10 object-contain" />
              <span>{systemSettings?.site_name || "RXShare"}</span>
            </button>
            <nav className="flex items-center gap-1">
              {items.map((item) => {
                const active = isActive(item.path, location.pathname);
                return (
                  <a key={item.path} onClick={() => navigate(item.path)}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer relative",
                      active
                        ? "bg-white/10 text-white"
                        : "text-gray-400 hover:text-white hover:bg-white/5"
                    )}>
                    <Icon name={item.icon} className={cn("text-lg", active && "text-primary")} />
                    <span>{item.label}</span>
                    {active && <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-full shadow-glow-primary" />}
                  </a>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-8 h-8 rounded-full overflow-hidden ring-2 ring-primary/50">
                <img src={getAvatarUrl(user?.username || user?.email || "", 80, user?.avatar_url)} alt="" className="w-full h-full object-cover" />
              </div>
            </div>
            <button onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); navigate("/auth/login"); }}
              className="text-gray-500 hover:text-white transition-colors">
              <Icon name="logout" className="text-xl" />
            </button>
          </div>
        </div>
      </header>
      <main className="container mx-auto p-4 md:p-8 relative z-10">
        <PageContent path={location.pathname} center>{children}</PageContent>
      </main>
    </div>
  );
}

// ========== FLOATING DOCK LAYOUT ==========
export function FloatingLayout({ children, user, systemSettings, isAdmin: admin }: { children: React.ReactNode; user: any; systemSettings: any; isAdmin: boolean }) {
  const location = useLocation();
  const navigate = useNavigate();
  const items = [...mainNav, ...systemNav].filter((i) => !i.adminOnly || admin);
  const pat = getBgPatternClass(systemSettings);

  return (
    <div className="min-h-screen pb-24 text-gray-300 antialiased font-sans relative" style={{ scrollbarGutter: "stable" }}>
      <div className={cn("fixed inset-0 opacity-40 pointer-events-none z-0", pat)} />
      <main className="container mx-auto p-4 md:p-8 relative z-10">
        <PageContent path={location.pathname} center>{children}</PageContent>
      </main>
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
        <div className="glass flex items-center gap-1 rounded-2xl px-3 py-2 shadow-2xl">
          <button onClick={() => navigate("/dashboard")} className="flex items-center gap-2 px-3 py-2 mr-1 hover:opacity-80 transition-opacity">
            <img src={getLogo(systemSettings)} alt="" className="h-9 w-9 object-contain" />
          </button>
          <div className="w-px h-8 bg-white/10 mx-1" />
          {items.map((item) => {
            const active = isActive(item.path, location.pathname);
            return (
              <a key={item.path} onClick={() => navigate(item.path)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer relative",
                  active
                    ? "bg-white/10 text-white"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                )}>
                <Icon name={item.icon} className={cn("text-lg", active && "text-primary")} />
                <span>{item.label}</span>
                {active && <span className="absolute bottom-0.5 left-3 right-3 h-0.5 bg-primary rounded-full shadow-glow-primary" />}
              </a>
            );
          })}
          <div className="w-px h-8 bg-white/10 mx-1" />
          <div className="flex items-center gap-2 px-2">
            <div className="relative">
              <div className="w-8 h-8 rounded-full overflow-hidden ring-2 ring-primary/50">
                <img src={getAvatarUrl(user?.username || user?.email || "", 80, user?.avatar_url)} alt="" className="w-full h-full object-cover" />
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-[#1a1a1a]" />
            </div>
            <button onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); navigate("/auth/login"); }}
              className="p-1.5 text-gray-500 hover:text-white hover:bg-white/10 rounded-lg transition-all">
              <Icon name="logout" className="text-lg" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ========== MAIN EXPORT ==========
export function DashboardLayout({ children, user, systemSettings, isAdmin }: { children: React.ReactNode; user: any; systemSettings: any; isAdmin: boolean }) {
  const layout = systemSettings?.dashboard_layout || "sidebar";
  const props = { children, user, systemSettings, isAdmin };
  if (layout === "header") return <HeaderLayout {...props} />;
  if (layout === "floating") return <FloatingLayout {...props} />;
  return <SidebarLayout {...props} />;
}
