import { queryOne } from "./db";

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

function getEmailConfig() {
  const sys = queryOne<any>("SELECT resend_api_key, email_from, site_name FROM system_settings LIMIT 1");
  return {
    apiKey: sys?.resend_api_key || process.env.RESEND_API_KEY || "",
    from: sys?.email_from || process.env.EMAIL_FROM || "RXShare <noreply@resend.dev>",
    siteName: sys?.site_name || "RXShare",
  };
}

export function isEmailConfigured(): boolean {
  const { apiKey } = getEmailConfig();
  return !!apiKey;
}

export async function sendEmail({ to, subject, html }: EmailOptions): Promise<{ success: boolean; error?: string }> {
  const { apiKey, from } = getEmailConfig();
  if (!apiKey) return { success: false, error: "Email not configured" };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { success: false, error: data.message || `Resend API error ${res.status}` };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export function passwordResetEmail(resetUrl: string, siteName: string): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
      <h2 style="color: #fff; font-size: 20px; margin-bottom: 8px;">Reset your password</h2>
      <p style="color: #888; font-size: 14px; line-height: 1.6;">
        You requested a password reset for your ${siteName} account. Click the button below to set a new password.
      </p>
      <a href="${resetUrl}" style="display: inline-block; margin: 24px 0; padding: 12px 32px; background: #f97316; color: #fff; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px;">
        Reset Password
      </a>
      <p style="color: #666; font-size: 12px; line-height: 1.5;">
        This link expires in 1 hour. If you didn't request this, you can safely ignore this email.
      </p>
    </div>
  `;
}
