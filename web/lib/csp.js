// Content-Security-Policy for the web app, shared by middleware.ts (pages:
// per-request nonce) and next.config.js (everything middleware skips: /api,
// static assets, the service worker, the offline page).
//
// Plain CommonJS so next.config.js can require it; middleware.ts imports it too.
// Keep it free of Node-only APIs: middleware runs on the Edge runtime.

// Extra connect-src origins (backend HTTPS/WSS, etc.) are environment-specific
// and must not be hard-coded. Provide them as a space-separated list via
// CSP_CONNECT_SRC.
const DEFAULT_CONNECT_SRC = "https://qazmath.vercel.app wss://qazmath.vercel.app";

/**
 * Origin of NEXT_PUBLIC_API_URL when it is absolute (a deployment that calls
 * the API directly instead of through /api/backend): task images are loaded
 * from `${apiUrl}/api/images/...` there. A relative URL means same origin.
 * @param {string | undefined} apiUrl
 * @returns {string | null}
 */
function absoluteApiOrigin(apiUrl) {
  const value = (apiUrl || "").trim();
  if (!/^https?:\/\//i.test(value)) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * @typedef {object} CspOptions
 * @property {string} [nonce] Per-request nonce for pages rendered by Next.js.
 *   With it, script-src only trusts nonced scripts and what they load
 *   ('strict-dynamic'); without it, only same-origin script files.
 * @property {string[]} [scriptHashes] 'sha256-...' sources for fixed inline
 *   scripts of static files (public/offline.html).
 * @property {boolean} [isDevelopment] `next dev`: React Refresh / HMR need eval.
 * @property {string} [connectSrc] Space-separated extra connect-src origins.
 * @property {string} [apiUrl] NEXT_PUBLIC_API_URL.
 */

/**
 * @param {CspOptions} [options]
 * @returns {string}
 */
function buildContentSecurityPolicy(options = {}) {
  const {
    nonce,
    scriptHashes = [],
    isDevelopment = process.env.NODE_ENV !== "production",
    connectSrc = process.env.CSP_CONNECT_SRC || DEFAULT_CONNECT_SRC,
    apiUrl = process.env.NEXT_PUBLIC_API_URL,
  } = options;

  // 'self' stays next to 'strict-dynamic': CSP3 browsers ignore it, but
  // browsers without 'strict-dynamic' (Safari < 15.4) still need it for the
  // /_next/static chunks that the webpack runtime adds at run time.
  const scriptSrc = ["'self'"];
  if (nonce) scriptSrc.push(`'nonce-${nonce}'`, "'strict-dynamic'");
  scriptSrc.push(...scriptHashes);
  // Only the Next.js dev server (React Refresh / HMR) needs eval.
  if (isDevelopment) scriptSrc.push("'unsafe-eval'");

  // Task images come from the backend through the same-origin proxy
  // (/api/backend/images/...); data: and blob: are MathLive, image upload
  // previews/crops and the PDF worksheet export (html-to-image).
  const imgSrc = ["'self'", "data:", "blob:"];
  const apiOrigin = absoluteApiOrigin(apiUrl);
  if (apiOrigin) imgSrc.push(apiOrigin);

  const connect = [
    "'self'",
    connectSrc.trim(),
    "https://*.sentry.io",
    "https://*.ingest.sentry.io",
  ].filter(Boolean);

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "form-action 'self'",
    `img-src ${imgSrc.join(" ")}`,
    "font-src 'self' data:",
    // MathLive renders formulas with inline styles, so styles stay inline.
    "style-src 'self' 'unsafe-inline'",
    `script-src ${scriptSrc.join(" ")}`,
    `connect-src ${connect.join(" ")}`,
  ].join("; ");
}

/**
 * 128 random bits, base64. Web Crypto and btoa exist on Edge and in Node.
 * @returns {string}
 */
function createNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

module.exports = { buildContentSecurityPolicy, createNonce, absoluteApiOrigin };
