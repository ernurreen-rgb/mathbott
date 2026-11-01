/** @jest-environment node */
import { createHmac } from "node:crypto";
import { normalizeQuizEntryNetwork, quizEntryClientKey, quizEntryClientSignature } from "../quiz-entry-identity";

it.each(["192.0.2.1", "::ffff:192.0.2.1", "0:0:0:0:0:ffff:c000:201"])("normalizes %s as the same IPv4 network", (address) => {
  expect(normalizeQuizEntryNetwork(address)).toBe("v4:192.0.2.1");
});

it.each(["2001:db8:abcd:1234::1", "2001:DB8:ABCD:1234:0:0:0:2"])("groups %s by IPv6 /64", (address) => {
  expect(normalizeQuizEntryNetwork(address)).toBe("v6:2001:db8:abcd:1234::/64");
  expect(normalizeQuizEntryNetwork("2001:db8:abcd:1235::1")).not.toBe(normalizeQuizEntryNetwork(address));
});

it.each([null, "invalid", "192.0.2.1, 192.0.2.2", "192.0.2.1:8000", "[::1]", "fe80::1%eth0", "a".repeat(65)])(
  "rejects malformed or ambiguous ingress address %s", (address) => {
    expect(normalizeQuizEntryNetwork(address)).toBeNull();
  }
);

it("trusts Vercel's owned header instead of generic forwarded headers", () => {
  const secret = "entry-test-secret";
  const key = quizEntryClientKey(new Headers({
    "x-vercel-forwarded-for": "192.0.2.1", "x-forwarded-for": "203.0.113.2", "x-real-ip": "203.0.113.3",
  }), secret, { vercel: true, trustedIpHeader: "x-real-ip" });
  expect(key).toBe(createHmac("sha256", secret).update("QUIZ-ENTRY-NETWORK\nv4:192.0.2.1").digest("hex"));
});

it("uses only explicitly configured self-hosted ingress headers and otherwise one bounded fallback", () => {
  const headers = new Headers({ "x-real-ip": "192.0.2.1", "x-forwarded-for": "203.0.113.2" });
  const fallback = quizEntryClientKey(new Headers(), "secret", { vercel: false });
  expect(quizEntryClientKey(headers, "secret", { vercel: false })).toBe(fallback);
  expect(quizEntryClientKey(headers, "secret", { vercel: false, trustedIpHeader: "not a header name" })).toBe(fallback);
  expect(quizEntryClientKey(headers, "secret", { vercel: false, trustedIpHeader: "x-real-ip" })).not.toBe(fallback);
  headers.set("x-real-ip", "192.0.2.1, 203.0.113.2");
  expect(quizEntryClientKey(headers, "secret", { vercel: false, trustedIpHeader: "x-real-ip" })).toBe(fallback);
});

it("binds the client claim to the signed request and its nonce", () => {
  const input = { clientKey: "a".repeat(64), timestamp: "1700000000", nonce: "entry-test", requestSignature: "b".repeat(64), secret: "secret" };
  const expected = createHmac("sha256", input.secret).update([
    "QUIZ-ENTRY-CLIENT", input.timestamp, input.nonce, input.requestSignature, input.clientKey,
  ].join("\n")).digest("hex");
  expect(quizEntryClientSignature(input)).toBe(expected);
  expect(quizEntryClientSignature({ ...input, nonce: "other" })).not.toBe(expected);
  expect(quizEntryClientSignature({ ...input, requestSignature: "c".repeat(64) })).not.toBe(expected);
});
