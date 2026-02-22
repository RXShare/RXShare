import { useState } from "react";
import { useNavigate } from "react-router";
import { useToast } from "~/components/ui/use-toast";
import { Icon } from "~/components/Icon";

const DEFAULT_LOGO = "https://cdn.rxss.click/rexsystems/logo-transparent.svg";

export default function Setup() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [siteName, setSiteName] = useState("XShare");
  const [baseUrl, setBaseUrl] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const handleSubmit = async () => {
    if (password !== confirmPassword) { toast({ title: "Passwords don't match", variant: "destructive" }); return; }
    if (password.length < 6) { toast({ title: "Password must be at least 6 characters", variant: "destructive" }); return; }
    const usernameRegex = /^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$/;
    if (!usernameRegex.test(username)) { toast({ title: "Invalid username format", description: "3-30 chars, lowercase alphanumeric with . _ -", variant: "destructive" }); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, username, isSetup: true, siteName, baseUrl: baseUrl || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Setup failed");
      toast({ title: "Setup complete!", description: "Welcome to XShare." });
      navigate("/dashboard");
    } catch (err: any) {
      toast({ title: "Setup failed", description: err.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const inputCls = "block w-full px-4 py-3 border border-white/10 rounded-xl bg-[#0a0a0a] text-gray-300 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-sm transition-all shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]";

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative">
      <div className="absolute top-0 left-0 w-full h-full bg-grid-pattern opacity-10 pointer-events-none" />
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 relative z-10">
        <div className="glass-card rounded-2xl w-full max-w-lg shadow-glow-card overflow-hidden">
          <div className="p-8 pb-6 text-center relative">
            <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />
            <div className="relative z-10">
              <div className="flex items-center justify-center gap-3 mb-4">
                <img src={DEFAULT_LOGO} alt="" className="h-12 w-12 object-contain" />
                <span className="text-2xl font-bold text-white tracking-tight">XShare</span>
              </div>
              <h2 className="text-xl font-bold text-white">Initial Setup</h2>
              <p className="text-gray-500 text-sm mt-1">{step === 1 ? "Configure your site" : "Create admin account"}</p>
              {/* Step indicators */}
              <div className="flex gap-2 justify-center mt-4">
                <div className={`h-1.5 w-12 rounded-full transition-colors duration-300 ${step >= 1 ? "bg-primary shadow-glow-primary" : "bg-gray-800"}`} />
                <div className={`h-1.5 w-12 rounded-full transition-colors duration-300 ${step >= 2 ? "bg-primary shadow-glow-primary" : "bg-gray-800"}`} />
              </div>
            </div>
          </div>
          <div className="px-8 pb-8">
            {step === 1 ? (
              <div key="step1" className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-200">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-400">Site Name</label>
                  <input value={siteName} onChange={(e) => setSiteName(e.target.value)} className={inputCls} placeholder="XShare" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-400">Base URL (optional)</label>
                  <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className={inputCls} placeholder="https://share.example.com" />
                </div>
                <button onClick={() => setStep(2)}
                  className="w-full bg-primary hover:bg-[var(--primary-hover)] text-white py-3 rounded-xl font-bold shadow-glow-primary transition-all hover:scale-[1.02] flex items-center justify-center gap-2">
                  Next <Icon name="arrow_forward" className="text-lg" />
                </button>
              </div>
            ) : (
              <div key="step2" className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-200">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-400">Email</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="admin@example.com" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-400">Username</label>
                  <input value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} className={inputCls} placeholder="admin" />
                  <p className="text-xs text-gray-600">3-30 chars, lowercase, a-z 0-9 . _ -</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-400">Password</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} placeholder="Min 6 characters" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-400">Confirm Password</label>
                  <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={inputCls} />
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setStep(1)}
                    className="px-4 py-3 rounded-xl font-medium text-gray-400 border border-white/10 hover:bg-white/5 hover:text-white transition-all flex items-center gap-2">
                    <Icon name="arrow_back" className="text-lg" /> Back
                  </button>
                  <button onClick={handleSubmit} disabled={loading || !email || !username || !password}
                    className="flex-1 bg-primary hover:bg-[var(--primary-hover)] text-white py-3 rounded-xl font-bold shadow-glow-primary transition-all hover:scale-[1.02] disabled:opacity-50 relative overflow-hidden">
                    <span className="relative z-10">{loading ? "Setting up..." : "Complete Setup"}</span>
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent skew-x-12 translate-x-[-150%] animate-[shimmer_3s_infinite]" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
