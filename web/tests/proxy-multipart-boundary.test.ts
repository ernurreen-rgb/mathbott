import { createHash, createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth/jwt", () => ({
  getToken: vi.fn(async () => ({ email: "teacher@example.com" })),
}));

import { POST } from "@/app/api/backend/[...path]/route";

describe("Backend proxy multipart boundary preservation", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("preserves mixed-case multipart boundary in Content-Type while signing lowercased X-Proxy-Content-Type", async () => {
    const boundary = "----WebKitFormBoundaryAbCdEf123456";
    const incomingContentType = `multipart/form-data; boundary=${boundary}`;
    const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]);
    const rawBody = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="file"; filename="background.jpg"\r\n` +
          `Content-Type: image/jpeg\r\n\r\n`,
        "utf8"
      ),
      jpegBytes,
      Buffer.from(`\r\n--${boundary}--\r\n`, "utf8"),
    ]);

    let capturedUrl = "";
    let capturedHeaders: Headers | null = null;
    let capturedBody: BodyInit | null | undefined;

    globalThis.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      capturedBody = init?.body;
      return new Response(JSON.stringify({ url: "/api/images/title.jpg" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const req = new NextRequest(
      "http://localhost:3000/api/backend/constructor/collections/1/images/title?email=spoofed@example.com",
      {
        method: "POST",
        headers: { "content-type": incomingContentType },
        body: rawBody,
      }
    );

    const res = await POST(req, {
      params: Promise.resolve({
        path: ["constructor", "collections", "1", "images", "title"],
      }),
    });

    expect(res.status).toBe(200);
    expect(capturedUrl).toContain("/api/constructor/collections/1/images/title?email=teacher%40example.com");
    expect(capturedHeaders).not.toBeNull();

    const forwardedContentType = capturedHeaders!.get("content-type");
    const signedContentType = capturedHeaders!.get("x-proxy-content-type");
    const bodySha256 = capturedHeaders!.get("x-proxy-body-sha256");
    const ts = capturedHeaders!.get("x-proxy-request-ts");
    const nonce = capturedHeaders!.get("x-proxy-request-nonce");
    const sigV2 = capturedHeaders!.get("x-proxy-request-signature-v2");
    const userEmail = capturedHeaders!.get("x-proxy-user-email");

    // Critical invariant: RFC 2046 multipart boundary must keep exact case in Content-Type
    expect(forwardedContentType).toBe(incomingContentType);
    expect(signedContentType).toBe(incomingContentType.toLowerCase());
    expect(userEmail).toBe("teacher@example.com");

    const expectedBodySha = createHash("sha256").update(rawBody).digest("hex");
    expect(bodySha256).toBe(expectedBodySha);

    const secret =
      process.env.INTERNAL_PROXY_SHARED_SECRET?.trim() || "dev-internal-proxy-secret-change-me";
    const expectedSigV2 = createHmac("sha256", secret)
      .update(
        [
          "POST",
          "/api/constructor/collections/1/images/title",
          "email=teacher%40example.com",
          "teacher@example.com",
          ts,
          nonce,
          expectedBodySha,
          signedContentType,
        ].join("\n"),
        "utf8"
      )
      .digest("hex");
    expect(sigV2).toBe(expectedSigV2);

    // Verify forwarded bytes + forwarded Content-Type actually parse as valid multipart FormData
    expect(capturedBody).toBeInstanceOf(Buffer);
    const parsedForm = await new Response(new Uint8Array(capturedBody as Buffer), {
      headers: { "content-type": forwardedContentType! },
    }).formData();
    const uploadedFile = parsedForm.get("file");
    expect(uploadedFile).toBeInstanceOf(File);
    expect(Buffer.from(await (uploadedFile as File).arrayBuffer()).equals(jpegBytes)).toBe(true);
  });
});
