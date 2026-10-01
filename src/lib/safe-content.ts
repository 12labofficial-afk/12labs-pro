/**
 * Files served from our own origin (R2 proxies, Telegram CDN, download
 * proxies) carry user-uploaded or third-party bytes. If one of them is
 * HTML/JS/SVG and the browser renders it as a page on 12labs.in, its script
 * runs with access to the signed-in user's Firebase session. These helpers
 * make every such response inert: only media/plain types, no sniffing, and
 * a sandboxing CSP so nothing can execute even if a type slips through.
 */
const ACTIVE_TYPES = new Set([
  'text/html', 'application/xhtml+xml', 'text/xml', 'application/xml',
  'text/javascript', 'application/javascript', 'application/ecmascript', 'text/ecmascript',
]);

export function safeContentType(type: string | null | undefined, fallback = 'application/octet-stream'): string {
  const base = (type || '').split(';')[0].trim().toLowerCase();
  if (!base) return fallback;
  if (ACTIVE_TYPES.has(base)) return 'text/plain; charset=utf-8';
  return base;
}

export const SAFE_FILE_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'unsafe-inline'",
};

/**
 * Blocks server-side fetches to internal/loopback/link-local targets (SSRF)
 * and non-HTTPS URLs. Hostname-based: good enough to stop the open-proxy and
 * metadata-endpoint cases on serverless.
 */
export function isSafeExternalUrl(raw: string): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== 'https:') return false;
  if (u.username || u.password) return false;
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const [a, b] = host.split('.').map(Number);
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) return false;
  }
  if (host.includes(':')) {
    if (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80') || host.startsWith('::ffff:')) return false;
  }
  return true;
}

/** For hrefs built from user/seller-supplied URLs: drops javascript:, data: etc. */
export function safeHref(url: string | null | undefined): string {
  const u = (url || '').trim();
  if (!u) return '#';
  if (u.startsWith('/') || u.startsWith('pub://') || u.startsWith('gcs://') || u.startsWith('tg://')) return u;
  try {
    const p = new URL(u);
    return p.protocol === 'https:' || p.protocol === 'http:' ? u : '#';
  } catch {
    return '#';
  }
}
