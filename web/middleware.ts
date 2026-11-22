import { NextResponse, type NextRequest } from "next/server";
import { buildContentSecurityPolicy, createNonce } from "@/lib/csp";

/**
 * Per-request CSP nonce for pages. Next.js reads the nonce from the request's
 * Content-Security-Policy header and puts it on its own inline bootstrap
 * scripts and script tags; app/layout.tsx reads `x-nonce` for its one inline
 * script. With 'strict-dynamic', chunks those scripts load are trusted too, so
 * script-src needs no 'unsafe-inline'.
 */
export function middleware(request: NextRequest) {
  const nonce = createNonce();
  const contentSecurityPolicy = buildContentSecurityPolicy({ nonce });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  return response;
}

export const config = {
  matcher: [
    {
      // Everything except what next.config.js gives a static CSP
      // (STATIC_CSP_SOURCES there): /api, static assets, the service worker,
      // the offline page and the manifest. Keep both lists in sync;
      // tests/csp.test.ts checks that every path gets exactly one CSP.
      source:
        "/((?!api/|_next/static/|_next/image|favicon\\.ico|icons/|sw\\.js|offline\\.html|manifest\\.webmanifest).*)",
      // Prefetches only fetch RSC payloads (never run as a document), so they
      // need no nonce; skipping them saves a middleware call per prefetched link.
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
