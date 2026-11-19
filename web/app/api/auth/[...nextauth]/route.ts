import NextAuth, { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim();
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
const configuredNextAuthSecret = process.env.NEXTAUTH_SECRET?.trim();
const configuredNextAuthUrl = process.env.NEXTAUTH_URL?.trim();
const isProduction = process.env.NODE_ENV === "production";
const nextAuthSecret = configuredNextAuthSecret || "dev-secret-key-change-in-production";
const resolvedGoogleClientId = googleClientId || "dev-missing-google-client-id";
const resolvedGoogleClientSecret = googleClientSecret || "dev-missing-google-client-secret";
const isLoopbackAuthUrl = (() => {
  if (!configuredNextAuthUrl) return false;
  try {
    const hostname = new URL(configuredNextAuthUrl).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
})();
const knownPlaceholderSecrets = new Set([
  "replace-with-a-random-32-char-secret",
  "dev-secret-key-change-in-production",
]);

function assertProductionAuthConfig() {
  if (isProduction && !configuredNextAuthUrl) {
    throw new Error("Missing NEXTAUTH_URL in production.");
  }
  if (
    isProduction &&
    configuredNextAuthUrl &&
    !configuredNextAuthUrl.startsWith("https://") &&
    !isLoopbackAuthUrl
  ) {
    throw new Error("NEXTAUTH_URL must use HTTPS in production.");
  }
  if (isProduction && !configuredNextAuthSecret) {
    throw new Error("Missing NEXTAUTH_SECRET in production.");
  }
  if (isProduction && knownPlaceholderSecrets.has(nextAuthSecret)) {
    throw new Error("NEXTAUTH_SECRET must not use a documented placeholder value.");
  }
  if (!googleClientId || !googleClientSecret) {
    throw new Error(
      "Missing Google OAuth credentials: set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET."
    );
  }
}

const authOptions: NextAuthOptions = {
  secret: nextAuthSecret,
  providers: [
    GoogleProvider({
      clientId: resolvedGoogleClientId,
      clientSecret: resolvedGoogleClientSecret,
    }),
  ],
  callbacks: {
    async session({ session, token }) {
      if (session.user) {
        session.user.email = session.user.email || (token.email as string);
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      const dynamicBaseUrl = configuredNextAuthUrl || baseUrl;

      // Relative path: reject protocol-relative ("//"), backslashes, control chars, or /api/ targets
      if (url.startsWith("/")) {
        if (
          url.startsWith("//") ||
          url.includes("\\") ||
          /[\u0000-\u001F\u007F]/.test(url)
        ) {
          return dynamicBaseUrl;
        }
        try {
          const baseOrigin = new URL(dynamicBaseUrl).origin;
          const resolved = new URL(url, baseOrigin);
          if (
            resolved.origin === baseOrigin &&
            resolved.pathname !== "/api" &&
            !resolved.pathname.startsWith("/api/")
          ) {
            return `${dynamicBaseUrl.replace(/\/+$/, "")}${resolved.pathname}${resolved.search}${resolved.hash}`;
          }
        } catch {
          return dynamicBaseUrl;
        }
        return dynamicBaseUrl;
      }

      // Same-origin absolute URL
      try {
        const parsed = new URL(url);
        if (
          parsed.origin === new URL(dynamicBaseUrl).origin &&
          parsed.pathname !== "/api" &&
          !parsed.pathname.startsWith("/api/")
        ) {
          return url;
        }
      } catch {
        // Invalid URL, use dynamicBaseUrl
      }

      return dynamicBaseUrl;
    },
  },
  pages: {
    signIn: "/",
  },
  // Derive secure cookies strictly from configured NEXTAUTH_URL — never mutate this singleton per-request.
  useSecureCookies: configuredNextAuthUrl?.startsWith("https://") ?? false,
  debug: process.env.NODE_ENV === "development" && process.env.NEXTAUTH_DEBUG === "true",
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
};

const nextAuthHandler = NextAuth(authOptions);

export async function GET(
  req: Request,
  context: { params: Promise<{ nextauth?: string[] }> }
) {
  assertProductionAuthConfig();
  const params = await context.params;
  const adaptedReq = Object.assign(req, {
    query: {
      nextauth: params.nextauth || [],
    },
  });
  return nextAuthHandler(adaptedReq as any, context as any);
}

export async function POST(
  req: Request,
  context: { params: Promise<{ nextauth?: string[] }> }
) {
  assertProductionAuthConfig();
  const params = await context.params;
  const adaptedReq = Object.assign(req, {
    query: {
      nextauth: params.nextauth || [],
    },
  });
  return nextAuthHandler(adaptedReq as any, context as any);
}
