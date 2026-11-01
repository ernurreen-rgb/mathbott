/** @jest-environment node */

import { createHash, createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

jest.mock("next-auth/jwt", () => ({ getToken: jest.fn() }));

const ownerEmail = "owner@example.com";
const victimEmail = "victim@example.com";
const originalEnv = { ...process.env };
const originalFetch = global.fetch;
const mockFetch = jest.fn();
const mockGetToken = getToken as jest.Mock;
let GET: typeof import("../[...path]/route").GET;
let POST: typeof import("../[...path]/route").POST;

beforeAll(() => {
  Object.assign(process.env, {
    NODE_ENV: "production",
    NEXTAUTH_URL: "https://mathbot.example",
    NEXTAUTH_SECRET: "test-nextauth-secret",
    INTERNAL_PROXY_SHARED_SECRET: "test-internal-proxy-secret",
    BACKEND_URL: "http://backend.example",
  });
  ({ GET, POST } = require("../[...path]/route"));
});

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.VERCEL;
  delete process.env.TRUSTED_CLIENT_IP_HEADER;
  mockGetToken.mockResolvedValue({ email: ownerEmail });
  mockFetch.mockResolvedValue(new Response("{}", { headers: { "Content-Type": "application/json" } }));
  global.fetch = mockFetch;
});

it("replaces forged quiz-entry metadata with a Vercel network claim bound to the request", async () => {
  mockGetToken.mockResolvedValue(null);
  process.env.VERCEL = "1";
  const response = await GET(new NextRequest("https://mathbot.example/api/backend/quiz-sessions/pin/123456", {
    headers: {
      "x-vercel-forwarded-for": "192.0.2.1", "x-forwarded-for": "203.0.113.2",
      "x-quiz-entry-client-key": "forged", "x-quiz-entry-client-signature": "forged",
    },
  }), context("quiz-sessions", "pin", "123456"));
  expect(response.status).toBe(200);
  const headers = mockFetch.mock.calls[0][1].headers as Headers;
  const key = createHmac("sha256", "test-internal-proxy-secret").update("QUIZ-ENTRY-NETWORK\nv4:192.0.2.1").digest("hex");
  expect(headers.get("x-quiz-entry-client-key")).toBe(key);
  expect(headers.get("x-quiz-entry-client-signature")).toBe(createHmac("sha256", "test-internal-proxy-secret").update([
    "QUIZ-ENTRY-CLIENT", headers.get("X-Proxy-Request-Ts"), headers.get("X-Proxy-Request-Nonce"),
    headers.get("X-Proxy-Request-Signature-V2"), key,
  ].join("\n")).digest("hex"));
  expect(headers.get("X-Proxy-User-Email")).toBeNull();
});

it("signs guest join network identity after preparing the signed request body", async () => {
  mockGetToken.mockResolvedValue(null);
  process.env.TRUSTED_CLIENT_IP_HEADER = "x-real-ip";
  const response = await POST(new NextRequest("https://mathbot.example/api/backend/quiz-sessions/join", {
    method: "POST", body: JSON.stringify({ pin_code: "123456", nickname: "Guest" }),
    headers: { Origin: "https://mathbot.example", "Content-Type": "application/json", "x-real-ip": "192.0.2.1" },
  }), context("quiz-sessions", "join"));
  expect(response.status).toBe(200);
  const headers = mockFetch.mock.calls[0][1].headers as Headers;
  const key = headers.get("x-quiz-entry-client-key");
  expect(headers.get("x-quiz-entry-client-signature")).toBe(createHmac("sha256", "test-internal-proxy-secret").update([
    "QUIZ-ENTRY-CLIENT", headers.get("X-Proxy-Request-Ts"), headers.get("X-Proxy-Request-Nonce"),
    headers.get("X-Proxy-Request-Signature-V2"), key,
  ].join("\n")).digest("hex"));
  expect(headers.get("X-Proxy-Body-Sha256")).toBe(createHash("sha256").update(mockFetch.mock.calls[0][1].body).digest("hex"));
});

it("strips browser quiz-entry claims from unrelated guest capability requests", async () => {
  mockGetToken.mockResolvedValue(null);
  await GET(new NextRequest("https://mathbot.example/api/backend/quiz-sessions/1/progress", {
    headers: { "x-quiz-entry-client-key": "forged", "x-quiz-entry-client-signature": "forged", "X-Quiz-Participant-Token": "guest" },
  }), context("quiz-sessions", "1", "progress"));
  const headers = mockFetch.mock.calls[0][1].headers as Headers;
  expect(headers.get("x-quiz-entry-client-key")).toBeNull();
  expect(headers.get("x-quiz-entry-client-signature")).toBeNull();
  expect(headers.get("X-Quiz-Participant-Token")).toBe("guest");
});

it("uses the real network bucket for an entry path containing encoded catchall slashes", async () => {
  mockGetToken.mockResolvedValue(null);
  process.env.VERCEL = "1";
  await GET(new NextRequest("https://mathbot.example/api/backend/quiz-sessions%2Fpin%2F123456", {
    headers: { "x-vercel-forwarded-for": "192.0.2.1" },
  }), context("quiz-sessions/pin/123456"));
  const headers = mockFetch.mock.calls[0][1].headers as Headers;
  expect(headers.get("x-quiz-entry-client-key")).toBe(createHmac("sha256", "test-internal-proxy-secret")
    .update("QUIZ-ENTRY-NETWORK\nv4:192.0.2.1").digest("hex"));
  expect(headers.get("x-quiz-entry-client-signature")).not.toBeNull();
});

afterAll(() => {
  process.env = originalEnv;
  global.fetch = originalFetch;
});

function context(...path: string[]) {
  return { params: Promise.resolve({ path }) };
}

it.each([
  "email=&email=victim%40example.com",
  "email=owner%40example.com&email=victim%40example.com",
  "email=victim%40example.com&email=",
  "email=",
])("binds all query email values to the session: %s", async (query) => {
  const response = await GET(
    new NextRequest(`https://mathbot.example/api/backend/modules/map?${query}`),
    context("modules", "map"),
  );
  expect(response.status).toBe(200);
  const [url, options] = mockFetch.mock.calls[0];
  expect(new URL(url).searchParams.getAll("email")).toEqual([ownerEmail]);
  expect(options.headers.get("X-Proxy-User-Email")).toBe(ownerEmail);
});

it("requires a session when a duplicate query hides email behind a blank value", async () => {
  mockGetToken.mockResolvedValue(null);
  const response = await GET(
    new NextRequest("https://mathbot.example/api/backend/modules/map?email=&email=victim%40example.com"),
    context("modules", "map"),
  );
  expect(response.status).toBe(401);
  expect(mockFetch).not.toHaveBeenCalled();
});

it("preserves anonymous access to public requests without email", async () => {
  const response = await GET(
    new NextRequest("https://mathbot.example/api/backend/modules/map"), context("modules", "map"),
  );
  expect(response.status).toBe(200);
  expect(mockGetToken).not.toHaveBeenCalled();
});

it("forwards optional Quiz owner identity even when the URL has no email", async () => {
  const response = await GET(new NextRequest("https://mathbot.example/api/backend/quizzes/1"), context("quizzes", "1"));
  expect(response.status).toBe(200);
  expect(mockFetch.mock.calls[0][1].headers.get("X-Proxy-User-Email")).toBe(ownerEmail);
});

it("preserves guest capability requests without requiring a Google session", async () => {
  mockGetToken.mockResolvedValue(null);
  const response = await GET(new NextRequest("https://mathbot.example/api/backend/quiz-sessions/1/progress", {
    headers: { "X-Quiz-Participant-Token": "guest-credential" },
  }), context("quiz-sessions", "1", "progress"));
  expect(response.status).toBe(200);
  const headers = mockFetch.mock.calls[0][1].headers;
  expect(headers.get("X-Proxy-User-Email")).toBeNull();
  expect(headers.get("X-Quiz-Participant-Token")).toBe("guest-credential");
});

const jsonContentTypes = [
  "application/json",
  "application/problem+json",
  "APPLICATION/VND.MATHBOT+JSON; charset=utf-8",
  "",
];

function jsonRequest(contentType: string) {
  const request = new NextRequest("https://mathbot.example/api/backend/user/web/nickname", {
    method: "POST",
    headers: { "Content-Type": contentType, Origin: "https://mathbot.example" },
    body: JSON.stringify({ email: victimEmail, nickname: "OwnNickname" }),
  });
  if (!contentType) request.headers.delete("Content-Type");
  return request;
}

it.each(jsonContentTypes)("binds JSON identity before hashing and signing: %s", async (contentType) => {
  const response = await POST(jsonRequest(contentType), context("user", "web", "nickname"));
  expect(response.status).toBe(200);
  const [, options] = mockFetch.mock.calls[0];
  expect(JSON.parse(options.body)).toEqual({ email: ownerEmail, nickname: "OwnNickname" });
  expect(options.headers.get("X-Proxy-User-Email")).toBe(ownerEmail);
  expect(options.headers.get("X-Proxy-Body-Sha256")).toBe(
    createHash("sha256").update(options.body).digest("hex"),
  );
});

it.each(jsonContentTypes)("rejects unauthenticated JSON writes: %s", async (contentType) => {
  mockGetToken.mockResolvedValue(null);
  const response = await POST(jsonRequest(contentType), context("user", "web", "nickname"));
  expect(response.status).toBe(401);
  expect(mockFetch).not.toHaveBeenCalled();
});

it.each(["urlencoded", "multipart"])("replaces repeated %s form identities", async (format) => {
  const form = format === "multipart" ? new FormData() : new URLSearchParams();
  form.append("email", "");
  form.append("email", victimEmail);
  form.append("nickname", "OwnNickname");
  const response = await POST(new NextRequest("https://mathbot.example/api/backend/user/onboarding", {
    method: "POST", headers: { Origin: "https://mathbot.example" }, body: form,
  }), context("user", "onboarding"));
  expect(response.status).toBe(200);
  const [, options] = mockFetch.mock.calls[0];
  const forwarded = new Response(options.body, { headers: options.headers });
  const forwardedForm = await forwarded.formData();
  expect(forwardedForm.getAll("email")).toEqual([ownerEmail]);
  expect(forwardedForm.get("nickname")).toBe("OwnNickname");
});

it("continues rejecting cross-origin writes", async () => {
  const request = jsonRequest("application/problem+json");
  request.headers.set("Origin", "https://other.example");
  const response = await POST(request, context("user", "web", "nickname"));
  expect(response.status).toBe(403);
  expect(mockFetch).not.toHaveBeenCalled();
});

it.each([
  ["malformed JSON", Buffer.from('{"email":')],
  ["UTF-16 JSON", Buffer.from(JSON.stringify({ email: victimEmail, nickname: "ChangedByOther" }), "utf16le")],
])("does not sign a body it cannot inspect: %s", async (_label, body) => {
  const request = new NextRequest("https://mathbot.example/api/backend/user/web/nickname", {
    method: "POST", body,
    headers: { "Content-Type": "application/json", Origin: "https://mathbot.example" },
  });
  const response = await POST(request, context("user", "web", "nickname"));
  expect(response.status).toBe(400);
  expect(mockFetch).not.toHaveBeenCalled();
});
