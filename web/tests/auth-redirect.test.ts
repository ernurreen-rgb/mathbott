import { describe, expect, it } from "vitest";

import {
  buildLoginRedirectHref,
  DEFAULT_AUTHENTICATED_PATH,
  resolveSafeCallbackPath,
} from "@/lib/auth-redirect";

describe("default landing and auth callback path", () => {
  it("defaults the main landing route to /modules", () => {
    expect(DEFAULT_AUTHENTICATED_PATH).toBe("/modules");
    expect(resolveSafeCallbackPath(null)).toBe("/modules");
    expect(resolveSafeCallbackPath(undefined)).toBe("/modules");
    expect(resolveSafeCallbackPath("")).toBe("/modules");
    expect(resolveSafeCallbackPath("/")).toBe("/modules");
    expect(resolveSafeCallbackPath("/?foo=bar")).toBe("/modules");
    expect(resolveSafeCallbackPath("/#top")).toBe("/modules");
    expect(resolveSafeCallbackPath("/api/auth/signin")).toBe("/modules");
  });

  it("rejects external or protocol-relative callback targets", () => {
    expect(resolveSafeCallbackPath("https://evil.example/modules")).toBe("/modules");
    expect(resolveSafeCallbackPath("//evil.example")).toBe("/modules");
    expect(resolveSafeCallbackPath("/\\evil.example")).toBe("/modules");
  });

  it("preserves explicit safe in-app routes for shared links", () => {
    expect(resolveSafeCallbackPath("/modules")).toBe("/modules");
    expect(resolveSafeCallbackPath("/modules/3")).toBe("/modules/3");
    expect(resolveSafeCallbackPath("/lessons/12?step=2")).toBe("/lessons/12?step=2");
    expect(resolveSafeCallbackPath("/trial-test")).toBe("/trial-test");
  });

  it("builds login redirect hrefs with safe callbackUrl", () => {
    expect(buildLoginRedirectHref("/modules")).toBe("/?callbackUrl=%2Fmodules");
    expect(buildLoginRedirectHref("/modules/5")).toBe("/?callbackUrl=%2Fmodules%2F5");
    expect(buildLoginRedirectHref("/")).toBe("/");
    expect(buildLoginRedirectHref("https://evil.example")).toBe("/");
  });
});
