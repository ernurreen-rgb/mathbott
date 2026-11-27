const isProduction = process.env.NODE_ENV === "production";

const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { buildContentSecurityPolicy } = require("./lib/csp");

const CSP_HEADER = "Content-Security-Policy";

/**
 * 'sha256-...' sources for the inline scripts of a file in public/, so the CSP
 * follows the file instead of a hash copied by hand. The HTML parser turns
 * CRLF into LF before the browser hashes a script, so this does the same.
 */
function inlineScriptHashes(publicFile) {
  const html = readFileSync(path.join(__dirname, "public", publicFile), "utf8");
  return [...html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .filter(([, attributes = ""]) => !/\ssrc\s*=/i.test(attributes))
    .map(([, , body]) => body.replace(/\r\n?/g, "\n"))
    .map((body) => `'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`);
}

// Pages get a per-request nonce CSP from middleware.ts. Everything that
// middleware skips gets a static CSP here (no inline scripts at all), so no
// response carries two CSP headers. Keep in sync with the middleware matcher;
// tests/csp.test.ts checks that every path gets exactly one CSP.
const STATIC_CSP_SOURCES = [
  "/api/:path*",
  "/_next/static/:path*",
  "/_next/image",
  "/favicon.ico",
  "/icons/:path*",
  "/.well-known/:path*",
  // The CSP of the worker script also governs the worker's own fetches.
  "/sw.js",
  "/manifest.webmanifest",
];
const staticContentSecurityPolicy = buildContentSecurityPolicy();
// The offline page is cached by the service worker and must work with no
// network, so its small inline script is allowed by hash.
const offlineContentSecurityPolicy = buildContentSecurityPolicy({
  scriptHashes: inlineScriptHashes("offline.html"),
});

const securityHeaders = [
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
      ...STATIC_CSP_SOURCES.map((source) => ({
        source,
        headers: [{ key: CSP_HEADER, value: staticContentSecurityPolicy }],
      })),
      {
        source: "/offline.html",
        headers: [{ key: CSP_HEADER, value: offlineContentSecurityPolicy }],
      },
      {
        // Browsers must always revalidate the service worker script so
        // updates are picked up on the next load.
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache" }],
      },
    ];
  },
};

if (isProduction) {
  const { withSentryConfig } = require("@sentry/nextjs/config");

  module.exports = withSentryConfig(nextConfig, {
    silent: true,
    webpack: {
      // middleware.ts only sets the CSP nonce: tracing it would add a Sentry
      // transaction per page request. Its errors still reach Sentry through
      // onRequestError in instrumentation.ts.
      autoInstrumentMiddleware: false,
      treeshake: {
        removeDebugLogging: true,
      },
    },
    sourcemaps: {
      deleteSourcemapsAfterUpload: true,
    },
  });
} else {
  // Keep the development compiler lean. Runtime Sentry instrumentation is
  // disabled in development as well; production keeps the full integration.
  module.exports = nextConfig;
}
