import { useState } from "react";
import { useNavigate, Link, useLoaderData } from "react-router";
import { useToast } from "~/components/ui/use-toast";
import { getCsrfToken } from "~/lib/csrf";

const DEFAULT_LOGO = "https://cdn.rxss.click/rexsystems/logo-transparent.svg";

export async function loader() {
  const { queryOne, isFirstRun } = await import("~/.server/db");
  if (isFirstRun()) return { settings: null };
  try {
    const settings = queryOne<any>("SELECT site_name, site_description, allow_registration, allow_login, primary_color, accent_color, logo_url, background_pattern FROM system_settings LIMIT 1");
    return { settings: settings || null };
  } catch {
    return { settings: null };
  }
}

export default function SignUp() {
  const { settings } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const logo = settings?.logo_url?.trim() || DEFAULT_LOGO;

  if (settings && !settings.allow_registration) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="glass-card rounded-2xl p-8 w-full max-w-md text-center shadow-glow-card">
          <div className="flex items-center justify-center gap-3 mb-4">
            <img src={logo} alt="" className="h-12 w-12 object-contain" />
            <span className="text-2xl font-bold text-white">{settings?.site_name || "RXShare"}</span>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Registration Closed</h2>
          <p className="text-gray-500 text-sm">Registration is currently disabled by the administrator.</p>
        </div>
      </div>
    );
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) { toast({ title: "Passwords don't match", variant: "destructive" }); return; }
    if (password.length < 6) { toast({ title: "Password must be at least 6 characters", variant: "destructive" }); return; }
    const usernameRegex = /^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$/;
    if (!usernameRegex.test(username)) { toast({ title: "Invalid username", description: "3-30 chars, lowercase alphanumeric with . _ -", variant: "destructive" }); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST", headers: { "Content-Type": "application/json", ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}) },
        body: JSON.stringify({ email, password, username }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sign up failed");
      toast({ title: "Account created!", description: "You can now sign in." });
      navigate("/auth/login");
    } catch (err: any) {
      toast({ title: "Sign up failed", description: err.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const inputCls = "block w-full px-4 py-3.5 border border-white/10 rounded-xl bg-[#0a0a0a] text-gray-300 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-sm transition-all shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]";

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
              <h2 className="text-xl font-bold text-white">Create Account</h2>
              <p className="text-gray-500 text-sm mt-1">Sign up to start sharing files</p>
            </div>
          </div>
          <div className="px-10 pb-10">
            <form onSubmit={handleSignUp} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-400">Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className={inputCls} placeholder="you@example.com" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-400">Username</label>
                <input value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} required className={inputCls} placeholder="cooluser" />
                <p className="text-xs text-gray-600">3-30 chars, lowercase, a-z 0-9 . _ -</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-400">Password</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className={inputCls} placeholder="Min 6 characters" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-400">Confirm Password</label>
                <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required className={inputCls} />
              </div>
              <button type="submit" disabled={loading}
                className="w-full bg-primary hover:bg-[var(--primary-hover)] text-white py-3.5 rounded-xl font-bold shadow-glow-primary transition-all hover:scale-[1.02] disabled:opacity-50 relative overflow-hidden text-base">
                <span className="relative z-10">{loading ? "Creating..." : "Sign Up"}</span>
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent skew-x-12 translate-x-[-150%] animate-[shimmer_3s_infinite]" />
              </button>
            </form>
            <p className="text-center text-sm text-gray-500 mt-6">
              Already have an account?{" "}
              <Link to="/auth/login" className="text-primary hover:text-[var(--primary-hover)] font-medium transition-colors">Sign in</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
