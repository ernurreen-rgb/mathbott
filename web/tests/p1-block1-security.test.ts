import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { isAllowedForPage } from "@/lib/admin-access";
import {
  normalizeQuizEntryNetwork,
  proxyClientKeySignature,
  proxyClientNetworkKey,
  quizEntryClientKey,
} from "@/lib/quiz-entry-identity";

describe("P1 Block 1 security & RBAC regressions (H-03, H-05)", () => {
  it("H-05: normalizeQuizEntryNetwork parses multi-hop comma-separated IPv4 and IPv6 headers", () => {
    expect(normalizeQuizEntryNetwork("203.0.113.195, 70.41.3.18")).toBe("v4:203.0.113.195");
    expect(normalizeQuizEntryNetwork("  198.51.100.4 , 10.0.0.1, 10.0.0.2 ")).toBe("v4:198.51.100.4");
    expect(normalizeQuizEntryNetwork("2001:db8:1:2::99, 2001:db8::1")).toBe("v6:2001:db8:1:2::/64");
    expect(normalizeQuizEntryNetwork("::ffff:203.0.113.42, 10.0.0.1")).toBe("v4:203.0.113.42");
    expect(normalizeQuizEntryNetwork("not-an-ip, 203.0.113.1")).toBeNull();
    expect(normalizeQuizEntryNetwork("")).toBeNull();
  });

  it("H-05: quizEntryClientKey does not collapse multi-hop clients into shared-proxy", () => {
    const secret = "s".repeat(48);
    const sharedKey = createHmac("sha256", secret)
      .update("QUIZ-ENTRY-NETWORK\nshared-proxy")
      .digest("hex");

    const clientA = quizEntryClientKey(
      new Headers({ "x-vercel-forwarded-for": "203.0.113.10, 70.41.3.18" }),
      secret,
      { vercel: true },
    );
    const clientB = quizEntryClientKey(
      new Headers({ "x-vercel-forwarded-for": "198.51.100.20, 70.41.3.18" }),
      secret,
      { vercel: true },
    );
    const fallbackRealIp = quizEntryClientKey(
      new Headers({ "x-real-ip": "203.0.113.77" }),
      secret,
      { vercel: true },
    );

    expect(clientA).not.toBe(sharedKey);
    expect(clientB).not.toBe(sharedKey);
    expect(clientA).not.toBe(clientB);
    expect(fallbackRealIp).not.toBe(sharedKey);
  });

  it("H-05: proxyClientNetworkKey ignores unconfigured XFF and signs configured ingress IP", () => {
    const secret = "p".repeat(48);

    // Without vercel or trustedIpHeader, spoofed x-forwarded-for must never be trusted
    expect(
      proxyClientNetworkKey(
        new Headers({ "x-forwarded-for": "203.0.113.5" }),
        secret,
        { vercel: false },
      ),
    ).toBeNull();

    const key = proxyClientNetworkKey(
      new Headers({ "x-vercel-forwarded-for": "203.0.113.5, 10.0.0.1" }),
      secret,
      { vercel: true },
    );
    expect(key).toMatch(/^[0-9a-f]{64}$/);

    const sig = proxyClientKeySignature({
      clientKey: key!,
      timestamp: "1700000000",
      nonce: "nonce-1",
      requestSignature: "a".repeat(64),
      secret,
    });
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it("H-03: bank quality page access aligns with content capability", () => {
    expect(isAllowedForPage("content", "content_editor")).toBe(true);
    expect(isAllowedForPage("content", "super_admin")).toBe(true);
    expect(isAllowedForPage("content", "reviewer")).toBe(false);
    expect(isAllowedForPage("content", null)).toBe(false);
  });
});
