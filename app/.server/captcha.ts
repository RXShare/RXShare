import { queryOne } from "./db";

export type CaptchaProvider = "none" | "recaptcha" | "turnstile" | "hcaptcha";

export interface CaptchaConfig {
  provider: CaptchaProvider;
  site_key: string | null;
  secret_key: string | null;
  enabled_on_login: boolean;
  enabled_on_signup: boolean;
  enabled_on_upload: boolean;
}

export function getCaptchaConfig(): CaptchaConfig {
  try {
    const sys = queryOne<any>("SELECT captcha_provider, captcha_site_key, captcha_secret_key, captcha_on_login, captcha_on_signup, captcha_on_upload FROM system_settings LIMIT 1");
    if (!sys) return { provider: "none", site_key: null, secret_key: null, enabled_on_login: false, enabled_on_signup: false, enabled_on_upload: false };
    return {
      provider: (sys.captcha_provider as CaptchaProvider) || "none",
      site_key: sys.captcha_site_key || null,
      secret_key: sys.captcha_secret_key || null,
      enabled_on_login: !!sys.captcha_on_login,
      enabled_on_signup: !!sys.captcha_on_signup,
      enabled_on_upload: !!sys.captcha_on_upload,
    };
  } catch {
    return { provider: "none", site_key: null, secret_key: null, enabled_on_login: false, enabled_on_signup: false, enabled_on_upload: false };
  }
}

const VERIFY_URLS: Record<string, string> = {
  recaptcha: "https://www.google.com/recaptcha/api/siteverify",
  turnstile: "https://challenges.cloudflare.com/turnstile/v0/siteverify",
  hcaptcha: "https://api.hcaptcha.com/siteverify",
};

/**
 * Verify a CAPTCHA token server-side.
 * Returns null if valid or CAPTCHA is disabled, or a Response if invalid.
 */
export async function verifyCaptcha(
  request: Request,
  context: "login" | "signup" | "upload"
): Promise<Response | null> {
  const config = getCaptchaConfig();
  if (config.provider === "none" || !config.secret_key) return null;

  const enabledMap = { login: config.enabled_on_login, signup: config.enabled_on_signup, upload: config.enabled_on_upload };
  if (!enabledMap[context]) return null;

  // Skip for Bearer token auth (API clients like ShareX)
  const auth = request.headers.get("Authorization");
  if (auth?.startsWith("Bearer ")) return null;

  // Extract token from request body — we need to clone since body may be read again
  let captchaToken: string | null = null;
  const contentType = request.headers.get("Content-Type") || "";

  if (contentType.includes("application/json")) {
    try {
      const cloned = request.clone();
      const body = await cloned.json();
      captchaToken = body.captchaToken || body["cf-turnstile-response"] || body["g-recaptcha-response"] || body["h-captcha-response"] || null;
    } catch {}
  } else if (contentType.includes("multipart/form-data")) {
    try {
      const cloned = request.clone();
      const formData = await cloned.formData();
      captchaToken = (formData.get("captchaToken") as string) || (formData.get("cf-turnstile-response") as string) || (formData.get("g-recaptcha-response") as string) || (formData.get("h-captcha-response") as string) || null;
    } catch {}
  }

  if (!captchaToken) {
    return Response.json({ error: "CAPTCHA verification required" }, { status: 400 });
  }

  const verifyUrl = VERIFY_URLS[config.provider];
  if (!verifyUrl) return null;

  try {
    const params = new URLSearchParams();
    params.set("secret", config.secret_key);
    params.set("response", captchaToken);

    // Include client IP for providers that support it
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || undefined;
    if (ip) params.set("remoteip", ip);

    const res = await fetch(verifyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    const data = await res.json();
    const success = data.success === true;

    if (!success) {
      return Response.json({ error: "CAPTCHA verification failed" }, { status: 400 });
    }

    return null;
  } catch {
    // If CAPTCHA service is unreachable, fail open to avoid locking users out
    // Log this in production for monitoring
    console.error("CAPTCHA verification service unreachable");
    return null;
  }
}
