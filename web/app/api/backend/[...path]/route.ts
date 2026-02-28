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
  { params }: { params: Promise<{ path: string[] }> | { path: string[] } }
) {
  return proxyRequest(request, params);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> | { path: string[] } }
) {
  return proxyRequest(request, params);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> | { path: string[] } }
) {
  return proxyRequest(request, params);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> | { path: string[] } }
) {
  return proxyRequest(request, params);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> | { path: string[] } }
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

async function getAdminProxyUserEmail(request: NextRequest): Promise<string | null> {
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

async function proxyRequest(
  request: NextRequest,
  params: Promise<{ path: string[] }> | { path: string[] }
) {
  try {
    const resolvedParams = params instanceof Promise ? await params : params;
    const pathString = resolvedParams.path.join("/");
    const searchParams = request.nextUrl.searchParams.toString();
    const backendPath = pathString.startsWith("api/") ? pathString : `api/${pathString}`;
    const backendRequestPath = `/${backendPath}`;
    const url = `${BACKEND_URL}/${backendPath}${searchParams ? `?${searchParams}` : ""}`;
    const isAdminPath = backendRequestPath.startsWith("/api/admin/");

    console.log(`[Proxy] ${request.method} ${request.nextUrl.pathname} -> ${url}`);

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

    let proxyUserEmail = "";
    if (isAdminPath) {
      const adminEmail = await getAdminProxyUserEmail(request);
      if (!adminEmail) {
        return NextResponse.json(
          { detail: "Authenticated admin session is required" },
          { status: 401 }
        );
      }
      proxyUserEmail = adminEmail;
    }

    let body: BodyInit | undefined;
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      body = await request.text();
    } else if (contentType.includes("multipart/form-data")) {
      body = await request.formData();
    } else if (request.method !== "GET" && request.method !== "HEAD") {
      try {
        body = await request.text();
      } catch {
        body = undefined;
      }
    }

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
        path: backendRequestPath,
        rawQuery: searchParams,
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
        console.error(`Backend API error (${response.status}):`, url);
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
