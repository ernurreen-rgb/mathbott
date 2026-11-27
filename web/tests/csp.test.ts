import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { absoluteApiOrigin, buildContentSecurityPolicy, createNonce } from "@/lib/csp";
import { config as middlewareConfig } from "@/middleware";

const webRoot = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);

// The path-to-regexp copy Next.js compiles matchers and header sources with (it ships no types).
const { pathToRegexp } = require("next/dist/compiled/path-to-regexp") as {
  pathToRegexp: (source: string, keys: unknown[], options: object) => RegExp;
};

type HeaderRule = { source: string; headers: { key: string; value: string }[] };
const nextConfig = require(path.join(webRoot, "next.config.js")) as { headers: () => Promise<HeaderRule[]> };

function directive(policy: string, name: string): string[] {
  const found = policy.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name} `));
  return found ? found.split(/\s+/).slice(1) : [];
}

// Same options Next.js uses for middleware matchers and next.config.js header sources.
const matches = (source: string, pathname: string) =>
  pathToRegexp(source, [], { delimiter: "/", sensitive: false, strict: true }).test(pathname);

describe("buildContentSecurityPolicy", () => {
  const production = { isDevelopment: false, connectSrc: "", apiUrl: "/api/backend" };

  it("trusts nonced scripts on pages instead of 'unsafe-inline'", () => {
    const scriptSrc = directive(buildContentSecurityPolicy({ ...production, nonce: "abc123==" }), "script-src");
    expect(scriptSrc).toEqual(["'self'", "'nonce-abc123=='", "'strict-dynamic'"]);
  });

  it("allows no inline scripts at all without a nonce or hash", () => {
    expect(directive(buildContentSecurityPolicy(production), "script-src")).toEqual(["'self'"]);
  });

  it("adds 'unsafe-eval' only for the dev server", () => {
    const dev = buildContentSecurityPolicy({ ...production, isDevelopment: true, nonce: "n" });
    expect(directive(dev, "script-src")).toContain("'unsafe-eval'");
    expect(directive(buildContentSecurityPolicy({ ...production, nonce: "n" }), "script-src")).not.toContain("'unsafe-eval'");
  });

  it("loads images only from the site, data: and blob: when the API goes through the proxy", () => {
    expect(directive(buildContentSecurityPolicy(production), "img-src")).toEqual(["'self'", "data:", "blob:"]);
  });

  it("adds the API origin to img-src when NEXT_PUBLIC_API_URL is absolute", () => {
    const policy = buildContentSecurityPolicy({ ...production, apiUrl: "https://api.example.test/" });
    expect(directive(policy, "img-src")).toEqual(["'self'", "data:", "blob:", "https://api.example.test"]);
    expect(absoluteApiOrigin("http://localhost:8000")).toBe("http://localhost:8000");
    expect(absoluteApiOrigin("/api/backend")).toBeNull();
    expect(absoluteApiOrigin("javascript:alert(1)")).toBeNull();
  });

  it("keeps inline styles for MathLive", () => {
    expect(directive(buildContentSecurityPolicy(production), "style-src")).toEqual(["'self'", "'unsafe-inline'"]);
  });
});

describe("createNonce", () => {
  it("returns 128 random bits in the base64 form Next.js accepts", () => {
    const nonce = createNonce();
    expect(Buffer.from(nonce, "base64")).toHaveLength(16);
    // Next.js ignores a nonce that does not match this (get-script-nonce-from-header).
    expect(`'nonce-${nonce}'`).toMatch(/^'nonce-([A-Za-z0-9+/_-]+={0,2})'$/);
    expect(createNonce()).not.toBe(nonce);
  });
});

describe("CSP header routing", () => {
  const pages = [
    "/",
    "/modules",
    "/modules/5",
    "/lessons/12",
    "/lessons/12/review/3",
    "/quiz/play/abc",
    "/trial-test/7",
    "/profile",
    "/admin/bank",
    "/join",
    "/no-such-page",
  ];
  const nonPages = [
    "/api/backend/images/task.png",
    "/api/auth/session",
    "/_next/static/chunks/main.js",
    "/_next/image",
    "/favicon.ico",
    "/icons/icon-192.png",
    "/.well-known/ownership.txt",
    "/sw.js",
    "/offline.html",
    "/manifest.webmanifest",
  ];

  async function cspRules() {
    const rules = await nextConfig.headers();
    return rules.filter((rule) => rule.headers.some((header) => header.key === "Content-Security-Policy"));
  }

  it("gives every path exactly one CSP: middleware for pages, next.config.js for the rest", async () => {
    const rules = await cspRules();
    const [matcher] = middlewareConfig.matcher;
    for (const pathname of [...pages, ...nonPages]) {
      const fromMiddleware = matches(matcher.source, pathname);
      const fromConfig = rules.filter((rule) => matches(rule.source, pathname)).length;
      expect({ pathname, sources: Number(fromMiddleware) + fromConfig }).toEqual({ pathname, sources: 1 });
      expect({ pathname, middleware: fromMiddleware }).toEqual({ pathname, middleware: pages.includes(pathname) });
    }
  });

  it("serves no static CSP with 'unsafe-inline' scripts or an https: image wildcard", async () => {
    for (const rule of await cspRules()) {
      const policy = rule.headers.find((header) => header.key === "Content-Security-Policy")!.value;
      expect(directive(policy, "script-src")).not.toContain("'unsafe-inline'");
      expect(directive(policy, "img-src")).not.toContain("https:");
    }
  });

  it("allows the offline page's inline script by its hash", async () => {
    const html = readFileSync(path.join(webRoot, "public", "offline.html"), "utf8");
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(([, body]) => body.replace(/\r\n?/g, "\n"));
    expect(scripts).toHaveLength(1);
    const hash = `'sha256-${createHash("sha256").update(scripts[0]).digest("base64")}'`;

    const offline = (await cspRules()).find((rule) => rule.source === "/offline.html")!;
    expect(directive(offline.headers[0].value, "script-src")).toContain(hash);
  });
});

describe("inline scripts in the React tree", () => {
  // Without the nonce the CSP blocks an inline script silently in production (the dark theme
  // would flash light first, say), so every one has to go through the root layout's helper.
  function sourceFiles(dir: string): string[] {
    return readdirSync(path.join(webRoot, dir), { withFileTypes: true }).flatMap((entry) => {
      const relative = path.join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(relative);
      return /\.(tsx|jsx)$/.test(entry.name) ? [relative.split(path.sep).join("/")] : [];
    });
  }

  it("are only rendered by app/layout.tsx", () => {
    const withScripts = ["app", "components", "lib"]
      .flatMap(sourceFiles)
      .filter((file) => /<script\b|next\/script/.test(readFileSync(path.join(webRoot, file), "utf8")));
    expect(withScripts).toEqual(["app/layout.tsx"]);
  });

  it("all carry the request nonce", () => {
    const layout = readFileSync(path.join(webRoot, "app", "layout.tsx"), "utf8");
    const tags = layout.match(/<script\b[\s\S]*?\/?>/g) ?? [];
    expect(tags.length).toBeGreaterThan(0);
    for (const tag of tags) expect(tag).toContain("nonce={nonce}");
  });
});
