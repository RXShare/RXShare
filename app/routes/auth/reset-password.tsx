import { useState } from "react";
import { Link, useNavigate, useLoaderData } from "react-router";
import { useToast } from "~/components/ui/use-toast";
import { getCsrfToken } from "~/lib/csrf";

const DEFAULT_LOGO = "https://cdn.rxss.click/rexsystems/logo-transparent.svg";

export async function loader({ request }: { request: Request }) {
  const { queryOne, isFirstRun } = await import("~/.server/db");
  const { getSession } = await import("~/.server/session");
  const session = await getSession(request);
  if (session) throw new Response(null, { status: 302, headers: { Location: "/dashboard" } });
  if (isFirstRun()) throw new Response(null, { status: 302, headers: { Location: "/setup" } });

  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token) throw new Response(null, { status: 302, headers: { Location: "/auth/login" } });

  // Validate token exists and not expired
  const resetToken = queryOne<any>("SELECT id, expires_at FROM password_reset_tokens WHERE token = ? AND used = 0", [token]);
  const valid = resetToken && new Date(resetToken.expires_at) > new Date();

  const settings = queryOne<any>("SELECT site_name, logo_url FROM system_settings LIMIT 1");
  return { settings, token, valid: !!valid };
}

export default function ResetPassword() {
  const { settings, token, valid } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const logo = settings?.logo_url?.trim() || DEFAULT_LOGO;
  const inputCls = "block w-full px-4 py-3.5 border border-white/10 rounded-xl bg-[#0a0a0a] text-gray-300 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-sm transition-all shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) { toast({ title: "Passwords don't match", variant: "destructive" }); return; }
    if (password.length < 6) { toast({ title: "Password must be at least 6 characters", variant: "destructive" }); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}) },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast({ title: "Password reset successfully!" });
      navigate("/auth/login");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative">
      <div className="absolute top-0 left-0 w-full h-full bg-grid-pattern opacity-10 pointer-events-none" />
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 relative z-10 w-full max-w-lg">
        <div className="glass-card rounded-2xl shadow-glow-card overflow-hidden">
          <div className="p-10 pb-6 text-center relative">
            <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />
            <div className="relative z-10">
              <div className="flex items-center justify-center gap-3 mb-4">
                <img src={logo} alt="" className="h-12 w-12 object-contain" />
                <span className="text-2xl font-bold text-white tracking-tight">{settings?.site_name || "RXShare"}</span>
              </div>
              <h2 className="text-xl font-bold text-white">Reset Password</h2>
              <p className="text-gray-500 text-sm mt-1">Enter your new password</p>
            </div>
          </div>
          <div className="px-10 pb-10">
            {!valid ? (
              <div className="text-center space-y-4">
                <p className="text-sm text-red-400">This reset link is invalid or has expired.</p>
                <Link to="/auth/forgot-password" className="text-sm text-primary hover:text-[var(--primary-hover)] font-medium transition-colors">Request a new one →</Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-400">New Password</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className={inputCls} placeholder="Min 6 characters" autoFocus />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-400">Confirm Password</label>
                  <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required className={inputCls} />
                </div>
                <button type="submit" disabled={loading || !password || !confirmPassword}
                  className="w-full bg-primary hover:bg-[var(--primary-hover)] text-white py-3.5 rounded-xl font-bold shadow-glow-primary transition-all hover:scale-[1.02] disabled:opacity-50 relative overflow-hidden text-base">
                  <span className="relative z-10">{loading ? "Resetting..." : "Reset Password"}</span>
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
