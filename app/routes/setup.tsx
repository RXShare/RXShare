import { useState } from "react";
import { useNavigate } from "react-router";
import { useToast } from "~/components/ui/use-toast";
import { Icon } from "~/components/Icon";
import { getCsrfToken } from "~/lib/csrf";

const DEFAULT_LOGO = "https://cdn.rxss.click/rexsystems/logo-transparent.svg";
const TOTAL_STEPS = 5;

export default function Setup() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Step 1: Database
  const [dbType, setDbType] = useState<"sqlite" | "mysql">("sqlite");
  const [dbHost, setDbHost] = useState("localhost");
  const [dbPort, setDbPort] = useState("3306");
  const [dbUser, setDbUser] = useState("root");
  const [dbPassword, setDbPassword] = useState("");
  const [dbName, setDbName] = useState("rxshare");

  // Step 2: Storage
  const [storageType, setStorageType] = useState<"local" | "s3">("local");
  const [s3Bucket, setS3Bucket] = useState("");
  const [s3Region, setS3Region] = useState("us-east-1");
  const [s3AccessKey, setS3AccessKey] = useState("");
  const [s3SecretKey, setS3SecretKey] = useState("");
  const [s3Endpoint, setS3Endpoint] = useState("");
  const [s3Provider, setS3Provider] = useState<"aws" | "cloudflare" | "custom">("aws");

  // Step 3: Site config
  const [siteName, setSiteName] = useState("RXShare");
  const [baseUrl, setBaseUrl] = useState("");

  // Step 4: Admin account
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const inputCls = "block w-full px-4 py-3 border border-white/10 rounded-xl bg-[#0a0a0a] text-gray-300 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-sm transition-all shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]";

  const handleConfirmSetup = async () => {
    if (password !== confirmPassword) { toast({ title: "Passwords don't match", variant: "destructive" }); return; }
    if (password.length < 6) { toast({ title: "Password must be at least 6 characters", variant: "destructive" }); return; }
    const usernameRegex = /^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$/;
    if (!usernameRegex.test(username)) { toast({ title: "Invalid username", description: "3-30 chars, lowercase alphanumeric with . _ -", variant: "destructive" }); return; }
    setLoading(true);
    try {
      // Step 1: Save .env config
      const configRes = await fetch("/api/setup/config", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}) },
        body: JSON.stringify({
          dbType, dbHost, dbPort, dbUser, dbPassword, dbName,
          storageType, s3Bucket, s3Region, s3AccessKey, s3SecretKey,
          s3Endpoint: (s3Provider === "cloudflare" || s3Provider === "custom") ? s3Endpoint : undefined,
        }),
      });
      if (!configRes.ok) { const d = await configRes.json(); throw new Error(d.error || "Failed to save config"); }

      // Step 2: Create admin account + system settings
      const res = await fetch("/api/auth/signup", {
        method: "POST", headers: { "Content-Type": "application/json", ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}) },
        body: JSON.stringify({ email, password, username, isSetup: true, siteName, baseUrl: baseUrl || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Setup failed");

      toast({ title: "Setup complete!" });
      navigate("/dashboard");
    } catch (err: any) {
      toast({ title: "Setup failed", description: err.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const stepTitles = ["Database", "Storage", "Site Config", "Admin Account", "Review & Confirm"];

  const getProviderLabel = () => {
    if (s3Provider === "aws") return "AWS S3";
    if (s3Provider === "cloudflare") return "Cloudflare R2";
    return "Custom";
  };

  const maskSecret = (s: string) => s ? "••••" + s.slice(-4) : "—";

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative">
      <div className="absolute top-0 left-0 w-full h-full bg-grid-pattern opacity-10 pointer-events-none" />
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 relative z-10 w-full max-w-xl">
        <div className="glass-card rounded-2xl shadow-glow-card overflow-hidden">
          <div className="p-8 pb-6 text-center relative">
            <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />
            <div className="relative z-10">
              <div className="flex items-center justify-center gap-3 mb-4">
                <img src={DEFAULT_LOGO} alt="" className="h-12 w-12 object-contain" />
                <span className="text-2xl font-bold text-white tracking-tight">RXShare</span>
              </div>
              <h2 className="text-xl font-bold text-white">Initial Setup</h2>
              <p className="text-gray-500 text-sm mt-1">{stepTitles[step - 1]}</p>
              <div className="flex gap-2 justify-center mt-4">
                {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
                  <div key={i} className={`h-1.5 w-8 rounded-full transition-colors duration-300 ${step > i ? "bg-primary shadow-glow-primary" : "bg-gray-800"}`} />
                ))}
              </div>
            </div>
          </div>
          <div className="px-8 pb-8">

            {/* Step 1: Database */}
            {step === 1 && (
              <div key="step1" className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-200">
                <p className="text-sm text-gray-400">Choose your database engine. SQLite works out of the box, MySQL/MariaDB requires a running server.</p>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => setDbType("sqlite")}
                    className={`p-4 rounded-xl border text-left transition-all ${dbType === "sqlite" ? "border-primary bg-primary/10 shadow-glow-primary" : "border-white/10 bg-[#0a0a0a] hover:border-white/20"}`}>
                    <div className="flex items-center gap-3 mb-2">
                      <Icon name="storage" className={`text-2xl ${dbType === "sqlite" ? "text-primary" : "text-gray-500"}`} />
                      <span className="font-bold text-white">SQLite</span>
                    </div>
                    <p className="text-xs text-gray-500">Zero config, file-based. Perfect for small to medium deployments.</p>
                  </button>
                  <button onClick={() => setDbType("mysql")}
                    className={`p-4 rounded-xl border text-left transition-all ${dbType === "mysql" ? "border-primary bg-primary/10 shadow-glow-primary" : "border-white/10 bg-[#0a0a0a] hover:border-white/20"}`}>
                    <div className="flex items-center gap-3 mb-2">
                      <Icon name="database" className={`text-2xl ${dbType === "mysql" ? "text-primary" : "text-gray-500"}`} />
                      <span className="font-bold text-white">MySQL / MariaDB</span>
                    </div>
                    <p className="text-xs text-gray-500">For larger deployments with existing MySQL infrastructure.</p>
                  </button>
                </div>
                {dbType === "mysql" && (
                  <div className="space-y-3 animate-in fade-in duration-200 pt-2">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-gray-400">Host</label>
                        <input value={dbHost} onChange={(e) => setDbHost(e.target.value)} className={inputCls} placeholder="localhost" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-gray-400">Port</label>
                        <input value={dbPort} onChange={(e) => setDbPort(e.target.value)} className={inputCls} placeholder="3306" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-gray-400">Username</label>
                        <input value={dbUser} onChange={(e) => setDbUser(e.target.value)} className={inputCls} placeholder="root" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-gray-400">Password</label>
                        <input type="password" value={dbPassword} onChange={(e) => setDbPassword(e.target.value)} className={inputCls} placeholder="••••••" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-400">Database Name</label>
                      <input value={dbName} onChange={(e) => setDbName(e.target.value)} className={inputCls} placeholder="rxshare" />
                    </div>
                  </div>
                )}
                <button onClick={() => setStep(2)}
                  className="w-full bg-primary hover:bg-[var(--primary-hover)] text-white py-3 rounded-xl font-bold shadow-glow-primary transition-all hover:scale-[1.02] flex items-center justify-center gap-2">
                  Next <Icon name="arrow_forward" className="text-lg" />
                </button>
              </div>
            )}

            {/* Step 2: Storage */}
            {step === 2 && (
              <div key="step2" className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-200">
                <p className="text-sm text-gray-400">Where should uploaded files be stored?</p>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => setStorageType("local")}
                    className={`p-4 rounded-xl border text-left transition-all ${storageType === "local" ? "border-primary bg-primary/10 shadow-glow-primary" : "border-white/10 bg-[#0a0a0a] hover:border-white/20"}`}>
                    <div className="flex items-center gap-3 mb-2">
                      <Icon name="folder" className={`text-2xl ${storageType === "local" ? "text-primary" : "text-gray-500"}`} />
                      <span className="font-bold text-white">Local Disk</span>
                    </div>
                    <p className="text-xs text-gray-500">Store files on the server's filesystem. Simple and fast.</p>
                  </button>
                  <button onClick={() => setStorageType("s3")}
                    className={`p-4 rounded-xl border text-left transition-all ${storageType === "s3" ? "border-primary bg-primary/10 shadow-glow-primary" : "border-white/10 bg-[#0a0a0a] hover:border-white/20"}`}>
                    <div className="flex items-center gap-3 mb-2">
                      <Icon name="cloud" className={`text-2xl ${storageType === "s3" ? "text-primary" : "text-gray-500"}`} />
                      <span className="font-bold text-white">S3-Compatible</span>
                    </div>
                    <p className="text-xs text-gray-500">AWS S3, Cloudflare R2, MinIO, or any S3-compatible service.</p>
                  </button>
                </div>
                {storageType === "s3" && (
                  <div className="space-y-3 animate-in fade-in duration-200 pt-2">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-400">Provider</label>
                      <div className="grid grid-cols-3 gap-2">
                        {([
                          { id: "aws", label: "AWS S3", icon: "cloud" },
                          { id: "cloudflare", label: "Cloudflare R2", icon: "shield" },
                          { id: "custom", label: "Custom / Other", icon: "dns" },
                        ] as const).map((p) => (
                          <button key={p.id} onClick={() => {
                            setS3Provider(p.id);
                            if (p.id === "cloudflare") setS3Region("auto");
                          }}
                            className={`p-3 rounded-lg border transition-all text-xs flex items-center justify-center gap-2 ${s3Provider === p.id ? "border-primary bg-primary/10 text-white" : "border-white/10 bg-[#0a0a0a] text-gray-400 hover:border-white/20"}`}>
                            <Icon name={p.icon} className="text-base" />
                            <span>{p.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-gray-400">Bucket Name</label>
                        <input value={s3Bucket} onChange={(e) => setS3Bucket(e.target.value)} className={inputCls} placeholder="my-bucket" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-gray-400">Region</label>
                        <input value={s3Region} onChange={(e) => setS3Region(e.target.value)} className={inputCls} placeholder={s3Provider === "cloudflare" ? "auto" : "us-east-1"} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-gray-400">Access Key</label>
                        <input value={s3AccessKey} onChange={(e) => setS3AccessKey(e.target.value)} className={inputCls} placeholder="AKIA..." />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-gray-400">Secret Key</label>
                        <input type="password" value={s3SecretKey} onChange={(e) => setS3SecretKey(e.target.value)} className={inputCls} placeholder="••••••" />
                      </div>
                    </div>
                    {(s3Provider === "cloudflare" || s3Provider === "custom") && (
                      <div className="space-y-1.5 animate-in fade-in duration-200">
                        <label className="text-xs font-medium text-gray-400">
                          {s3Provider === "cloudflare" ? "R2 Endpoint URL" : "Custom S3 Endpoint"}
                        </label>
                        <input value={s3Endpoint} onChange={(e) => setS3Endpoint(e.target.value)} className={inputCls}
                          placeholder={s3Provider === "cloudflare" ? "https://<account-id>.r2.cloudflarestorage.com" : "https://s3.example.com"} />
                        {s3Provider === "cloudflare" && (
                          <p className="text-xs text-gray-600">Find this in your Cloudflare dashboard → R2 → Overview</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
                <div className="flex gap-3">
                  <button onClick={() => setStep(1)}
                    className="px-4 py-3 rounded-xl font-medium text-gray-400 border border-white/10 hover:bg-white/5 hover:text-white transition-all flex items-center gap-2">
                    <Icon name="arrow_back" className="text-lg" /> Back
                  </button>
                  <button onClick={() => setStep(3)} disabled={storageType === "s3" && (!s3Bucket || !s3AccessKey || !s3SecretKey)}
                    className="flex-1 bg-primary hover:bg-[var(--primary-hover)] text-white py-3 rounded-xl font-bold shadow-glow-primary transition-all hover:scale-[1.02] disabled:opacity-50 flex items-center justify-center gap-2">
                    Next <Icon name="arrow_forward" className="text-lg" />
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Site Config */}
            {step === 3 && (
              <div key="step3" className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-200">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-400">Site Name</label>
                  <input value={siteName} onChange={(e) => setSiteName(e.target.value)} className={inputCls} placeholder="RXShare" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-400">Base URL (optional)</label>
                  <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className={inputCls} placeholder="https://share.example.com" />
                  <p className="text-xs text-gray-600">Used for generating share links. Leave empty to auto-detect.</p>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setStep(2)}
                    className="px-4 py-3 rounded-xl font-medium text-gray-400 border border-white/10 hover:bg-white/5 hover:text-white transition-all flex items-center gap-2">
                    <Icon name="arrow_back" className="text-lg" /> Back
                  </button>
                  <button onClick={() => setStep(4)}
                    className="flex-1 bg-primary hover:bg-[var(--primary-hover)] text-white py-3 rounded-xl font-bold shadow-glow-primary transition-all hover:scale-[1.02] flex items-center justify-center gap-2">
                    Next <Icon name="arrow_forward" className="text-lg" />
                  </button>
                </div>
              </div>
            )}

            {/* Step 4: Admin Account */}
            {step === 4 && (
              <div key="step4" className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-200">
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
                  <button onClick={() => setStep(3)}
                    className="px-4 py-3 rounded-xl font-medium text-gray-400 border border-white/10 hover:bg-white/5 hover:text-white transition-all flex items-center gap-2">
                    <Icon name="arrow_back" className="text-lg" /> Back
                  </button>
                  <button onClick={() => setStep(5)} disabled={!email || !username || !password || !confirmPassword}
                    className="flex-1 bg-primary hover:bg-[var(--primary-hover)] text-white py-3 rounded-xl font-bold shadow-glow-primary transition-all hover:scale-[1.02] disabled:opacity-50 flex items-center justify-center gap-2">
                    Review <Icon name="arrow_forward" className="text-lg" />
                  </button>
                </div>
              </div>
            )}

            {/* Step 5: Review & Confirm */}
            {step === 5 && (
              <div key="step5" className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-200">
                <p className="text-sm text-gray-400">Please review your configuration before finalizing. This will create your <span className="text-white font-mono text-xs">.env</span> file and set up the database.</p>

                {/* Database */}
                <div className="rounded-xl border border-white/10 bg-[#0a0a0a] overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-2">
                      <Icon name="storage" className="text-primary" />
                      <span className="text-sm font-bold text-white">Database</span>
                    </div>
                    <button onClick={() => setStep(1)} className="text-xs text-primary hover:underline">Edit</button>
                  </div>
                  <div className="px-4 py-3 space-y-1 text-sm">
                    <div className="flex justify-between"><span className="text-gray-500">Engine</span><span className="text-white">{dbType === "sqlite" ? "SQLite" : "MySQL / MariaDB"}</span></div>
                    {dbType === "mysql" && (
                      <>
                        <div className="flex justify-between"><span className="text-gray-500">Host</span><span className="text-white">{dbHost}:{dbPort}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Database</span><span className="text-white">{dbName}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">User</span><span className="text-white">{dbUser}</span></div>
                      </>
                    )}
                  </div>
                </div>

                {/* Storage */}
                <div className="rounded-xl border border-white/10 bg-[#0a0a0a] overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-2">
                      <Icon name="cloud" className="text-primary" />
                      <span className="text-sm font-bold text-white">Storage</span>
                    </div>
                    <button onClick={() => setStep(2)} className="text-xs text-primary hover:underline">Edit</button>
                  </div>
                  <div className="px-4 py-3 space-y-1 text-sm">
                    <div className="flex justify-between"><span className="text-gray-500">Type</span><span className="text-white">{storageType === "local" ? "Local Disk" : getProviderLabel()}</span></div>
                    {storageType === "s3" && (
                      <>
                        <div className="flex justify-between"><span className="text-gray-500">Bucket</span><span className="text-white">{s3Bucket}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Region</span><span className="text-white">{s3Region}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Access Key</span><span className="text-white font-mono text-xs">{maskSecret(s3AccessKey)}</span></div>
                        {s3Endpoint && <div className="flex justify-between"><span className="text-gray-500">Endpoint</span><span className="text-white text-xs truncate ml-4">{s3Endpoint}</span></div>}
                      </>
                    )}
                  </div>
                </div>

                {/* Site */}
                <div className="rounded-xl border border-white/10 bg-[#0a0a0a] overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-2">
                      <Icon name="settings" className="text-primary" />
                      <span className="text-sm font-bold text-white">Site</span>
                    </div>
                    <button onClick={() => setStep(3)} className="text-xs text-primary hover:underline">Edit</button>
                  </div>
                  <div className="px-4 py-3 space-y-1 text-sm">
                    <div className="flex justify-between"><span className="text-gray-500">Name</span><span className="text-white">{siteName}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Base URL</span><span className="text-white">{baseUrl || "Auto-detect"}</span></div>
                  </div>
                </div>

                {/* Admin */}
                <div className="rounded-xl border border-white/10 bg-[#0a0a0a] overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-2">
                      <Icon name="person" className="text-primary" />
                      <span className="text-sm font-bold text-white">Admin Account</span>
                    </div>
                    <button onClick={() => setStep(4)} className="text-xs text-primary hover:underline">Edit</button>
                  </div>
                  <div className="px-4 py-3 space-y-1 text-sm">
                    <div className="flex justify-between"><span className="text-gray-500">Email</span><span className="text-white">{email}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Username</span><span className="text-white">{username}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Password</span><span className="text-white font-mono text-xs">{"•".repeat(password.length)}</span></div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button onClick={() => setStep(4)}
                    className="px-4 py-3 rounded-xl font-medium text-gray-400 border border-white/10 hover:bg-white/5 hover:text-white transition-all flex items-center gap-2">
                    <Icon name="arrow_back" className="text-lg" /> Back
                  </button>
                  <button onClick={handleConfirmSetup} disabled={loading}
                    className="flex-1 bg-primary hover:bg-[var(--primary-hover)] text-white py-3 rounded-xl font-bold shadow-glow-primary transition-all hover:scale-[1.02] disabled:opacity-50 relative overflow-hidden flex items-center justify-center gap-2">
                    <span className="relative z-10 flex items-center gap-2">
                      <Icon name="check_circle" className="text-lg" />
                      {loading ? "Setting up..." : "Confirm & Complete Setup"}
                    </span>
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
