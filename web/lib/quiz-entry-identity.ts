import { createHmac } from "node:crypto";
import { isIP } from "node:net";

export const QUIZ_ENTRY_KEY_HEADER = "x-quiz-entry-client-key";
export const QUIZ_ENTRY_SIGNATURE_HEADER = "x-quiz-entry-client-signature";

export function isQuizEntryRequest(method: string, segments: string[]): boolean {
  // Next catchall segments can themselves contain decoded slashes. Match the
  // same joined path that is signed and decoded by the backend router.
  const path = segments.join("/").split("/");
  return path[0] === "quiz-sessions" && (
    (method === "GET" && path.length === 3 && path[1] === "pin") ||
    (method === "POST" && path.length === 2 && path[1] === "join")
  );
}

export function normalizeQuizEntryNetwork(value: string | null): string | null {
  if (!value || value.length > 64) return null;
  const address = value.trim();
  if (isIP(address) === 4) return `v4:${address}`;
  if (isIP(address) !== 6) return null;
  try {
    const canonical = new URL(`http://[${address}]/`).hostname.slice(1, -1);
    const [left, right = ""] = canonical.split("::");
    const start = left ? left.split(":") : [];
    const end = right ? right.split(":") : [];
    const words = [...start, ...Array(8 - start.length - end.length).fill("0"), ...end]
      .map((word) => parseInt(word, 16));
    if (words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff) {
      return `v4:${words[6] >> 8}.${words[6] & 255}.${words[7] >> 8}.${words[7] & 255}`;
    }
    return `v6:${words.slice(0, 4).map((word) => word.toString(16)).join(":")}::/64`;
  } catch {
    return null;
  }
}

export function quizEntryClientKey(
  headers: Headers, secret: string,
  options: { vercel: boolean; trustedIpHeader?: string },
): string {
  // Only an ingress-owned header may identify a network. Missing configuration
  // uses one shared, bounded bucket instead of accepting browser-supplied XFF.
  const name = options.vercel ? "x-vercel-forwarded-for" : options.trustedIpHeader?.trim().toLowerCase();
  let address: string | null = null;
  try { address = name ? headers.get(name) : null; } catch { /* Invalid configuration remains bounded. */ }
  const network = normalizeQuizEntryNetwork(address) || "shared-proxy";
  return createHmac("sha256", secret).update(`QUIZ-ENTRY-NETWORK\n${network}`).digest("hex");
}

export function quizEntryClientSignature(input: {
  clientKey: string; timestamp: string; nonce: string; requestSignature: string; secret: string;
}): string {
  return createHmac("sha256", input.secret).update([
    "QUIZ-ENTRY-CLIENT", input.timestamp, input.nonce, input.requestSignature, input.clientKey,
  ].join("\n")).digest("hex");
}
