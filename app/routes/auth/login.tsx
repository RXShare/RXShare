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

export default function Login() {
  const { settings } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  
  // 2FA state
  const [requires2fa, setRequires2fa] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [useBackupCode, setUseBackupCode] = useState(false);

  const logo = settings?.logo_url?.trim() || DEFAULT_LOGO;

  if (settings && !settings.allow_login) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="glass-card rounded-2xl p-8 w-full max-w-md text-center shadow-glow-card">
          <div className="flex items-center justify-center gap-3 mb-4">
            <img src={logo} alt="" className="h-12 w-12 object-contain" />
            <span className="text-2xl font-bold text-white">{settings?.site_name || "RXShare"}</span>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Login Disabled</h2>
          <p className="text-gray-500 text-sm">Login is currently disabled by the administrator.</p>
        </div>
      </div>
    );
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json", ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}) },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
      
      // Check if 2FA is required
      if (data.requires2fa) {
        setRequires2fa(true);
        setSessionId(data.sessionId);
        setLoading(false);
        return;
      }
      
      navigate("/dashboard");
    } catch (err: any) {
      toast({ title: "Login failed", description: err.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const handleVerify2fa = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/totp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}) },
        body: JSON.stringify({ sessionId, token: totpCode, useBackupCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verification failed");
      navigate("/dashboard");
    } catch (err: any) {
      toast({ title: "Verification failed", description: err.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative">
      <div className="absolute top-0 left-0 w-full h-full bg-grid-pattern opacity-10 pointer-events-none" />
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 relative z-10 w-full max-w-lg">
        <div className="glass-card rounded-2xl shadow-glow-card overflow-hidden">
          {/* Header with gradient */}
          <div className="p-10 pb-6 text-center relative">
            <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />
            <div className="relative z-10">
              <div className="flex items-center justify-center gap-3 mb-4">
                <img src={logo} alt="" className="h-12 w-12 object-contain" />
                <span className="text-2xl font-bold text-white tracking-tight">{settings?.site_name || "RXShare"}</span>
              </div>
              <h2 className="text-xl font-bold text-white">Welcome back</h2>
              <p className="text-gray-500 text-sm mt-1">Sign in to your account</p>
            </div>
          </div>
          {/* Form */}
          <div className="px-10 pb-10">
            {!requires2fa ? (
              <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-400">Email</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                    className="block w-full px-4 py-3.5 border border-white/10 rounded-xl bg-[#0a0a0a] text-gray-300 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-sm transition-all shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]"
                    placeholder="you@example.com" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-400">Password</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
                    className="block w-full px-4 py-3.5 border border-white/10 rounded-xl bg-[#0a0a0a] text-gray-300 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-sm transition-all shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]"
                    placeholder="••••••••" />
                </div>
                <button type="submit" disabled={loading}
                  className="w-full bg-primary hover:bg-[var(--primary-hover)] text-white py-3.5 rounded-xl font-bold shadow-glow-primary transition-all hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100 relative overflow-hidden text-base">
                  <span className="relative z-10">{loading ? "Signing in..." : "Sign In"}</span>
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent skew-x-12 translate-x-[-150%] animate-[shimmer_3s_infinite]" />
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerify2fa} className="space-y-5">
                <div className="text-center mb-6">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 border border-primary/20 mb-4">
                    <span className="text-3xl">🔐</span>
                  </div>
                  <h3 className="text-lg font-bold text-white mb-1">Two-Factor Authentication</h3>
                  <p className="text-sm text-gray-500">Enter the {useBackupCode ? "backup code" : "6-digit code"} from your authenticator app</p>
                </div>
                
                <div className="space-y-2">
                  <input
                    type="text"
                    value={totpCode}
                    onChange={(e) => setTotpCode(useBackupCode ? e.target.value.toUpperCase().slice(0, 8) : e.target.value.replace(/\D/g, "").slice(0, 6))}
                    required
                    placeholder={useBackupCode ? "ABCD1234" : "000000"}
                    className="block w-full px-4 py-3.5 border border-white/10 rounded-xl bg-[#0a0a0a] text-gray-300 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-2xl text-center tracking-widest font-mono transition-all shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]"
                    maxLength={useBackupCode ? 8 : 6}
                    autoFocus
                  />
                </div>

                <button type="submit" disabled={loading || (useBackupCode ? totpCode.length !== 8 : totpCode.length !== 6)}
                  className="w-full bg-primary hover:bg-[var(--primary-hover)] text-white py-3.5 rounded-xl font-bold shadow-glow-primary transition-all hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100 relative overflow-hidden text-base">
                  <span className="relative z-10">{loading ? "Verifying..." : "Verify"}</span>
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent skew-x-12 translate-x-[-150%] animate-[shimmer_3s_infinite]" />
                </button>

                <button
                  type="button"
                  onClick={() => { setUseBackupCode(!useBackupCode); setTotpCode(""); }}
                  className="w-full text-sm text-gray-400 hover:text-white transition-colors"
                >
                  {useBackupCode ? "Use authenticator code" : "Use backup code"}
                </button>

                <button
                  type="button"
                  onClick={() => { setRequires2fa(false); setSessionId(""); setTotpCode(""); setUseBackupCode(false); }}
                  className="w-full text-sm text-gray-500 hover:text-gray-400 transition-colors"
                >
                  ← Back to login
                </button>
              </form>
            )}
            {settings?.allow_registration === 1 && !requires2fa && (
              <p className="text-center text-sm text-gray-500 mt-6">
                Don't have an account?{" "}
                <Link to="/auth/sign-up" className="text-primary hover:text-[var(--primary-hover)] font-medium transition-colors">Sign up</Link>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
