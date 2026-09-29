/** @jest-environment node */

import { createHash } from "node:crypto";
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
  mockGetToken.mockResolvedValue({ email: ownerEmail });
  mockFetch.mockResolvedValue(new Response("{}", { headers: { "Content-Type": "application/json" } }));
  global.fetch = mockFetch;
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
