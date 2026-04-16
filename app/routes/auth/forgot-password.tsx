import { useState } from "react";
import { Link, useLoaderData } from "react-router";
import { useToast } from "~/components/ui/use-toast";
import { Icon } from "~/components/Icon";
import { getCsrfToken } from "~/lib/csrf";

const DEFAULT_LOGO = "https://cdn.rxss.click/rexsystems/logo-transparent.svg";

export async function loader({ request }: { request: Request }) {
  const { queryOne, isFirstRun } = await import("~/.server/db");
  const { getSession } = await import("~/.server/session");
  const session = await getSession(request);
  if (session) throw new Response(null, { status: 302, headers: { Location: "/dashboard" } });
  if (isFirstRun()) throw new Response(null, { status: 302, headers: { Location: "/setup" } });
  const { isEmailConfigured } = await import("~/.server/email");
  const settings = queryOne<any>("SELECT site_name, logo_url FROM system_settings LIMIT 1");
  return { settings, emailConfigured: isEmailConfigured() };
}

export default function ForgotPassword() {
  const { settings, emailConfigured } = useLoaderData<typeof loader>();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const logo = settings?.logo_url?.trim() || DEFAULT_LOGO;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}) },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setSent(true);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
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
              <h2 className="text-xl font-bold text-white">Forgot Password</h2>
              <p className="text-gray-500 text-sm mt-1">We'll send you a reset link</p>
            </div>
          </div>
          <div className="px-10 pb-10">
            {!emailConfigured ? (
              <div className="text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto">
                  <Icon name="mail_off" className="text-3xl text-red-400" />
                </div>
                <p className="text-sm text-gray-400">Email is not configured on this instance. Contact your administrator to reset your password.</p>
                <Link to="/auth/login" className="text-sm text-primary hover:text-[var(--primary-hover)] font-medium transition-colors">← Back to login</Link>
              </div>
            ) : sent ? (
              <div className="text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
                  <Icon name="mark_email_read" className="text-3xl text-green-400" />
                </div>
                <p className="text-sm text-gray-400">If an account with that email exists, we've sent a password reset link. Check your inbox.</p>
                <Link to="/auth/login" className="text-sm text-primary hover:text-[var(--primary-hover)] font-medium transition-colors">← Back to login</Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-400">Email</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className={inputCls} placeholder="you@example.com" autoFocus />
                </div>
                <button type="submit" disabled={loading || !email}
                  className="w-full bg-primary hover:bg-[var(--primary-hover)] text-white py-3.5 rounded-xl font-bold shadow-glow-primary transition-all hover:scale-[1.02] disabled:opacity-50 relative overflow-hidden text-base">
                  <span className="relative z-10">{loading ? "Sending..." : "Send Reset Link"}</span>
                </button>
                <p className="text-center text-sm text-gray-500">
                  <Link to="/auth/login" className="text-primary hover:text-[var(--primary-hover)] font-medium transition-colors">← Back to login</Link>
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
