const { withSentryConfig } = require("@sentry/nextjs");

const isProduction = process.env.NODE_ENV === "production";

// Extra connect-src origins (backend HTTP/WS, etc.) are environment-specific
// and must not be hard-coded. Provide them as a space-separated list via
// CSP_CONNECT_SRC at build time. The defaults below match the current
// production topology so existing deployments keep working if the env var
// is unset; override it per environment.
const defaultConnectSrc =
  "http://35.225.92.22 ws://35.225.92.22 https://qazmath.vercel.app wss://qazmath.vercel.app";
const extraConnectSrc = (process.env.CSP_CONNECT_SRC || defaultConnectSrc).trim();

const connectSrc = [
  "'self'",
  extraConnectSrc,
  "https://*.sentry.io",
  "https://*.ingest.sentry.io",
]
  .filter(Boolean)
  .join(" ");

// 'unsafe-eval' is only needed by the Next.js dev server (React Refresh / HMR).
// Production bundles do not require it, so keep it out of the production CSP.
const scriptSrc = isProduction
  ? "script-src 'self' 'unsafe-inline'"
  : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  scriptSrc,
  `connect-src ${connectSrc}`,
].join("; ");

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: contentSecurityPolicy,
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: [],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

module.exports = withSentryConfig(
  nextConfig,
  {
    silent: true,
    webpack: {
      treeshake: {
        removeDebugLogging: true,
      },
    },
    sourcemaps: {
      deleteSourcemapsAfterUpload: true,
    },
  },
  {
    hideSourceMaps: true,
  }
);
