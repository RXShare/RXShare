import { useEffect, useRef, useCallback, useState } from "react";

type CaptchaProvider = "recaptcha" | "turnstile" | "hcaptcha";

interface CaptchaProps {
  provider: CaptchaProvider;
  siteKey: string;
  onVerify: (token: string) => void;
  onExpire?: () => void;
  theme?: "dark" | "light";
}

const SCRIPT_URLS: Record<CaptchaProvider, string> = {
  recaptcha: "https://www.google.com/recaptcha/api.js?render=explicit",
  turnstile: "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
  hcaptcha: "https://js.hcaptcha.com/1/api.js?render=explicit",
};

const SCRIPT_IDS: Record<CaptchaProvider, string> = {
  recaptcha: "recaptcha-script",
  turnstile: "turnstile-script",
  hcaptcha: "hcaptcha-script",
};

function loadScript(provider: CaptchaProvider): Promise<void> {
  return new Promise((resolve, reject) => {
    const id = SCRIPT_IDS[provider];
    if (document.getElementById(id)) { resolve(); return; }
    const script = document.createElement("script");
    script.id = id;
    script.src = SCRIPT_URLS[provider];
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${provider} script`));
    document.head.appendChild(script);
  });
}

function waitForApi(provider: CaptchaProvider, maxWait = 10000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (provider === "recaptcha" && (window as any).grecaptcha?.render) { resolve(); return; }
      if (provider === "turnstile" && (window as any).turnstile?.render) { resolve(); return; }
      if (provider === "hcaptcha" && (window as any).hcaptcha?.render) { resolve(); return; }
      if (Date.now() - start > maxWait) { reject(new Error("CAPTCHA API timeout")); return; }
      setTimeout(check, 100);
    };
    check();
  });
}

export function Captcha({ provider, siteKey, onVerify, onExpire, theme = "dark" }: CaptchaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleVerify = useCallback((token: string) => { onVerify(token); }, [onVerify]);
  const handleExpire = useCallback(() => { onExpire?.(); }, [onExpire]);

  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        await loadScript(provider);
        await waitForApi(provider);
        if (!mounted || !containerRef.current) return;

        // Clear any previous widget
        containerRef.current.innerHTML = "";

        if (provider === "recaptcha") {
          const grecaptcha = (window as any).grecaptcha;
          widgetIdRef.current = grecaptcha.render(containerRef.current, {
            sitekey: siteKey,
            theme,
            callback: handleVerify,
            "expired-callback": handleExpire,
          });
        } else if (provider === "turnstile") {
          const turnstile = (window as any).turnstile;
          widgetIdRef.current = turnstile.render(containerRef.current, {
            sitekey: siteKey,
            theme,
            callback: handleVerify,
            "expired-callback": handleExpire,
          });
        } else if (provider === "hcaptcha") {
          const hcaptcha = (window as any).hcaptcha;
          widgetIdRef.current = hcaptcha.render(containerRef.current, {
            sitekey: siteKey,
            theme,
            callback: handleVerify,
            "expired-callback": handleExpire,
          });
        }
      } catch (err: any) {
        if (mounted) setError(err.message);
      }
    }

    init();

    return () => {
      mounted = false;
      try {
        if (widgetIdRef.current !== null) {
          if (provider === "turnstile") (window as any).turnstile?.remove(widgetIdRef.current);
          if (provider === "hcaptcha") (window as any).hcaptcha?.remove(widgetIdRef.current);
        }
      } catch {}
    };
  }, [provider, siteKey, theme, handleVerify, handleExpire]);

  if (error) {
    return <p className="text-xs text-red-400">CAPTCHA failed to load: {error}</p>;
  }

  return <div ref={containerRef} className="flex justify-center my-2" />;
}

/**
 * Hook to manage CAPTCHA state in forms.
 */
export function useCaptcha() {
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  const onVerify = useCallback((token: string) => setCaptchaToken(token), []);
  const onExpire = useCallback(() => setCaptchaToken(null), []);
  const reset = useCallback(() => setCaptchaToken(null), []);

  return { captchaToken, onVerify, onExpire, reset };
}
