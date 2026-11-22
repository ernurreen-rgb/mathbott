/** Matches backend MAX_SIGNED_BODY_BYTES (10 MB) in trusted_proxy_identity.py (H-30). */
export const MAX_PROXY_BODY_BYTES = 10 * 1024 * 1024;

export function normalizeProxyRequestBody(
  body: BodyInit | undefined,
  contentType: string
): BodyInit | undefined {
  if (body === "" && !contentType.trim()) return undefined;
  return body;
}

/**
 * Stream a request body up to maxBytes without unbounded buffering in RAM.
 * Returns null as soon as the stream exceeds maxBytes and cancels the reader.
 */
export async function readBoundedRequestBody(
  request: Request,
  maxBytes: number = MAX_PROXY_BODY_BYTES
): Promise<Buffer | null> {
  if (!request.body) {
    return Buffer.alloc(0);
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // Ignore cancel failures on aborted streams.
        }
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, totalBytes);
}
