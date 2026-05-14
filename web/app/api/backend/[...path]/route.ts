/**
 * Next.js API route that proxies requests to the FastAPI backend.
 * It is the trusted boundary for backend admin access in production.
 */
import { createHmac } from "node:crypto";

import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const INTERNAL_PROXY_SHARED_SECRET =
  process.env.INTERNAL_PROXY_SHARED_SECRET?.trim() ||
  (IS_PRODUCTION ? "" : "dev-internal-proxy-secret-change-me");

const STRIP_REQUEST_HEADERS = new Set([
  "authorization",
  "connection",
  "content-length",
  "cookie",
  "host",
  "x-proxy-request-ts",
  "x-proxy-request-signature",
  "x-proxy-user-email",
]);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(request, params);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(request, params);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(request, params);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(request, params);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(request, params);
}

function isMutatingMethod(method: string): boolean {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase());
}

function tryGetOrigin(value: string | null): string | null {
  if (!value || !value.trim()) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function isTrustedOrigin(request: NextRequest): boolean {
  const appOrigin = tryGetOrigin(process.env.NEXTAUTH_URL || request.nextUrl.origin);
  if (!appOrigin) return false;
  const requestOrigin =
    tryGetOrigin(request.headers.get("origin")) ||
    tryGetOrigin(request.headers.get("referer"));
  if (!requestOrigin) return false;
  return requestOrigin === appOrigin;
}

function buildProxySignature({
  method,
  path,
  rawQuery,
  userEmail,
  timestamp,
}: {
  method: string;
  path: string;
  rawQuery: string;
  userEmail: string;
  timestamp: string;
}): string {
  const canonicalPayload = [
    method.toUpperCase(),
    path,
    rawQuery,
    userEmail,
    timestamp,
  ].join("\n");
  return createHmac("sha256", INTERNAL_PROXY_SHARED_SECRET)
    .update(canonicalPayload, "utf8")
    .digest("hex");
}

async function getProxyUserEmail(request: NextRequest): Promise<string | null> {
  const nextAuthSecret =
    process.env.NEXTAUTH_SECRET?.trim() ||
    (IS_PRODUCTION ? "" : "dev-secret-key-change-in-production");
  if (!nextAuthSecret) {
    return null;
  }
  const token = await getToken({
    req: request,
    secret: nextAuthSecret,
  });
  const email = typeof token?.email === "string" ? token.email.trim().toLowerCase() : "";
  return email || null;
}

function encodeBackendPath(pathSegments: string[]): string {
  return pathSegments.map((segment) => encodeURIComponent(segment)).join("/");
}

function normalizeEmail(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function pathContainsPrivateEmail(pathSegments: string[]): boolean {
  return (
    (pathSegments[0] === "user" && pathSegments[1] === "web" && pathSegments.length >= 3) ||
    (pathSegments[0] === "export" && pathSegments[1] === "user" && pathSegments.length >= 3)
  );
}

function replacePrivatePathEmail(pathSegments: string[], proxyUserEmail: string): string[] {
  const nextSegments = [...pathSegments];
  if (pathContainsPrivateEmail(nextSegments)) {
    nextSegments[2] = proxyUserEmail;
  }
  return nextSegments;
}

function hasEmailSearchParam(searchParams: URLSearchParams): boolean {
  const value = searchParams.get("email");
  return value !== null && value.trim() !== "";
}

function pathRequiresProxyUserEmail(pathSegments: string[]): boolean {
  const path = `/api/${pathSegments.join("/")}`;
  const sensitivePrefixes = [
    "/api/admin/",
    "/api/export/admin/",
    "/api/export/user/",
    "/api/friends",
    "/api/reports",
    "/api/task/check",
    "/api/trial-test-reports",
    "/api/trial-tests",
    "/api/user/onboarding",
    "/api/user/web",
  ];

  return (
    sensitivePrefixes.some((prefix) => path.startsWith(prefix)) ||
    (path.startsWith("/api/tasks/") && path.endsWith("/questions/check"))
  );
}

function redactBackendUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname
      .split("/")
      .map((segment) => {
        const decoded = decodeURIComponent(segment);
        if (decoded.includes("@")) return "[email]";
        if (decoded.length >= 24 && /^[A-Za-z0-9_-]+$/.test(decoded)) return "[token]";
        return segment;
      })
      .join("/");
    return `${parsed.origin}${path}${parsed.search ? "?[redacted]" : ""}`;
  } catch {
    return "[unparseable backend url]";
  }
}

async function proxyRequest(
  request: NextRequest,
  params: Promise<{ path: string[] }>
) {
  try {
    const resolvedParams = await params;
    const originalPathSegments = [...resolvedParams.path];
    const apiPathSegments =
      originalPathSegments[0] === "api" ? originalPathSegments.slice(1) : originalPathSegments;
    let effectivePathSegments = [...apiPathSegments];
    const searchParams = new URLSearchParams(request.nextUrl.searchParams);
    const preliminaryBackendRequestPath = `/api/${encodeBackendPath(effectivePathSegments)}`;
    const isAdminPath = preliminaryBackendRequestPath.startsWith("/api/admin/");
    const hasPrivatePathEmail = pathContainsPrivateEmail(effectivePathSegments);

    if (IS_PRODUCTION && !INTERNAL_PROXY_SHARED_SECRET) {
      return NextResponse.json(
        { detail: "INTERNAL_PROXY_SHARED_SECRET is not configured" },
        { status: 500 }
      );
    }

    if (IS_PRODUCTION && isMutatingMethod(request.method) && !isTrustedOrigin(request)) {
      return NextResponse.json(
        { detail: "Cross-origin write requests are forbidden" },
        { status: 403 }
      );
    }

    let body: BodyInit | undefined;
    const contentType = request.headers.get("content-type") || "";
    let bodyHasEmail = false;

    if (contentType.includes("application/json")) {
      const rawBody = await request.text();
      if (rawBody) {
        try {
          const payload = JSON.parse(rawBody);
          if (
            payload &&
            typeof payload === "object" &&
            !Array.isArray(payload) &&
            normalizeEmail(payload.email)
          ) {
            bodyHasEmail = true;
          }
          body = rawBody;
        } catch {
          body = rawBody;
        }
      } else {
        body = rawBody;
      }
    } else if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      bodyHasEmail = normalizeEmail(String(formData.get("email") || "")) !== "";
      body = formData;
    } else if (request.method !== "GET" && request.method !== "HEAD") {
      try {
        const rawBody = await request.text();
        bodyHasEmail = new URLSearchParams(rawBody).has("email");
        body = rawBody;
      } catch {
        body = undefined;
      }
    }

    const requiresProxyUserEmail =
      isAdminPath ||
      pathRequiresProxyUserEmail(effectivePathSegments) ||
      hasPrivatePathEmail ||
      hasEmailSearchParam(searchParams) ||
      bodyHasEmail;

    let proxyUserEmail = "";
    if (requiresProxyUserEmail) {
      const sessionEmail = await getProxyUserEmail(request);
      if (!sessionEmail) {
        return NextResponse.json(
          { detail: "Authenticated session is required" },
          { status: 401 }
        );
      }
      proxyUserEmail = sessionEmail;
      if (hasEmailSearchParam(searchParams)) {
        searchParams.set("email", proxyUserEmail);
      }
      if (hasPrivatePathEmail) {
        effectivePathSegments = replacePrivatePathEmail(effectivePathSegments, proxyUserEmail);
      }
      if (contentType.includes("application/json") && typeof body === "string" && body) {
        try {
          const payload = JSON.parse(body);
          if (
            payload &&
            typeof payload === "object" &&
            !Array.isArray(payload) &&
            Object.prototype.hasOwnProperty.call(payload, "email")
          ) {
            body = JSON.stringify({ ...payload, email: proxyUserEmail });
          }
        } catch {
          // Keep non-JSON payloads unchanged. Backend validation will reject malformed JSON.
        }
      } else if (body instanceof FormData && body.has("email")) {
        body.set("email", proxyUserEmail);
      } else if (
        typeof body === "string" &&
        body &&
        contentType.includes("application/x-www-form-urlencoded")
      ) {
        const formParams = new URLSearchParams(body);
        if (formParams.has("email")) {
          formParams.set("email", proxyUserEmail);
          body = formParams.toString();
        }
      }
    }

    const searchString = searchParams.toString();
    const backendPath = `api/${encodeBackendPath(effectivePathSegments)}`;
    const backendSignaturePath = `/api/${effectivePathSegments.join("/")}`;
    const url = `${BACKEND_URL}/${backendPath}${searchString ? `?${searchString}` : ""}`;

    console.log(
      `[Proxy] ${request.method} ${request.nextUrl.pathname} -> ${redactBackendUrl(url)}`
    );

    const headers = new Headers();
    request.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (STRIP_REQUEST_HEADERS.has(lowerKey)) {
        return;
      }
      if (lowerKey === "content-type" && contentType.includes("multipart/form-data")) {
        return;
      }
      headers.set(key, value);
    });

    if (contentType.includes("application/json") && body) {
      headers.set("Content-Type", "application/json");
    }

    if (INTERNAL_PROXY_SHARED_SECRET) {
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signature = buildProxySignature({
        method: request.method,
        path: backendSignaturePath,
        rawQuery: searchString,
        userEmail: proxyUserEmail,
        timestamp,
      });
      headers.set("X-Proxy-Request-Ts", timestamp);
      headers.set("X-Proxy-Request-Signature", signature);
      if (proxyUserEmail) {
        headers.set("X-Proxy-User-Email", proxyUserEmail);
      }
    }

    const response = await fetch(url, {
      method: request.method,
      headers,
      body,
    });

    const responseContentType = response.headers.get("content-type") || "";
    const isBinary =
      responseContentType.startsWith("image/") ||
      responseContentType.includes("application/octet-stream");

    let nextResponse: NextResponse;
    if (isBinary) {
      const buffer = Buffer.from(await response.arrayBuffer());
      nextResponse = new NextResponse(buffer, {
        status: response.status,
        statusText: response.statusText,
      });
    } else {
      const data = await response.text();

      if (!response.ok) {
        console.error(`Backend API error (${response.status}):`, redactBackendUrl(url));
        console.error("Response:", data.substring(0, 500));
      }

      const isJson =
        responseContentType.includes("application/json") ||
        data.trim().startsWith("{") ||
        data.trim().startsWith("[");

      nextResponse = isJson
        ? NextResponse.json(JSON.parse(data), {
            status: response.status,
            statusText: response.statusText,
          })
        : new NextResponse(data, {
            status: response.status,
            statusText: response.statusText,
          });
    }

    response.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (!["content-length", "content-encoding", "transfer-encoding"].includes(lowerKey)) {
        nextResponse.headers.set(key, value);
      }
    });

    return nextResponse;
  } catch (error: any) {
    console.error("Proxy error:", error);
    return NextResponse.json(
      { detail: error.message || "Proxy error" },
      { status: 500 }
    );
  }
}
