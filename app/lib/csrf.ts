/**
 * Get the CSRF token from the meta tag injected by the root loader.
 */
export function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const meta = document.querySelector('meta[name="csrf-token"]');
  return meta?.getAttribute("content") || null;
}

/**
 * Returns headers object with CSRF token included.
 * Merges with any existing headers you pass in.
 */
export function csrfHeaders(headers: Record<string, string> = {}): Record<string, string> {
  const token = getCsrfToken();
  if (token) {
    return { ...headers, "X-CSRF-Token": token };
  }
  return headers;
}
