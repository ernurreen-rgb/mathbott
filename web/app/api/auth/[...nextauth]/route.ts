import NextAuth, { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim();
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
const configuredNextAuthSecret = process.env.NEXTAUTH_SECRET?.trim();
const isProduction = process.env.NODE_ENV === "production";
const nextAuthSecret = configuredNextAuthSecret || "dev-secret-key-change-in-production";
const resolvedGoogleClientId = googleClientId || "dev-missing-google-client-id";
const resolvedGoogleClientSecret = googleClientSecret || "dev-missing-google-client-secret";

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
        session.user.email = session.user.email || token.email as string;
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      // Use baseUrl from environment or NextAuth default
      const dynamicBaseUrl = process.env.NEXTAUTH_URL || baseUrl;
      
      // If url is relative, prepend dynamic baseUrl
      if (url.startsWith("/")) {
        return `${dynamicBaseUrl}${url}`;
      }
      
      // If url is on the same origin, return as is
      try {
        const urlOrigin = new URL(url).origin;
        if (urlOrigin === new URL(dynamicBaseUrl).origin) {
          return url;
        }
      } catch (e) {
        // Invalid URL, use dynamicBaseUrl
      }
      
      // Default to dynamicBaseUrl
      return dynamicBaseUrl;
    },
  },
  pages: {
    signIn: "/",
  },
  // Use secure cookies if using HTTPS
  useSecureCookies: process.env.NEXTAUTH_URL?.startsWith('https://') ?? false,
  // Enable NextAuth debug only when explicitly requested (reduces noisy logs)
  debug: process.env.NODE_ENV === "development" && process.env.NEXTAUTH_DEBUG === "true",
  // Set explicit session strategy
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
};

// Create NextAuth handler
const nextAuthHandler = NextAuth(authOptions);

// In App Router, NextAuth receives params via context.params.nextauth array
// We need to adapt the Request object to include query.nextauth for NextAuth compatibility
export async function GET(
  req: Request,
  context: { params: Promise<{ nextauth?: string[] }> | { nextauth?: string[] } }
) {
  if (isProduction && !configuredNextAuthSecret) {
    throw new Error("Missing NEXTAUTH_SECRET in production.");
  }
  if (!googleClientId || !googleClientSecret) {
    throw new Error(
      "Missing Google OAuth credentials: set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET."
    );
  }
  // Ensure secure cookies for HTTPS if NEXTAUTH_URL is set to HTTPS
  try {
    const protocol = req.headers.get('x-forwarded-proto') || 
                     (req.headers.get('x-forwarded-ssl') === 'on' ? 'https' : 'http');
    
    if (protocol === 'https') {
      (authOptions as any).useSecureCookies = true;
    }
  } catch (e) {
    console.error('Error setting secure cookies:', e);
  }
  
  // Resolve params if it's a Promise (Next.js 15+) or use directly
  const params = context.params instanceof Promise ? await context.params : context.params;
  
  // Adapt Request to include query.nextauth for NextAuth compatibility
  const adaptedReq = Object.assign(req, {
    query: {
      nextauth: params.nextauth || []
    }
  });
  
  return nextAuthHandler(adaptedReq as any, context as any);
}

export async function POST(
  req: Request,
  context: { params: Promise<{ nextauth?: string[] }> | { nextauth?: string[] } }
) {
  if (isProduction && !configuredNextAuthSecret) {
    throw new Error("Missing NEXTAUTH_SECRET in production.");
  }
  if (!googleClientId || !googleClientSecret) {
    throw new Error(
      "Missing Google OAuth credentials: set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET."
    );
  }
  // Ensure secure cookies for HTTPS if NEXTAUTH_URL is set to HTTPS
  try {
    const protocol = req.headers.get('x-forwarded-proto') || 
                     (req.headers.get('x-forwarded-ssl') === 'on' ? 'https' : 'http');
    
    if (protocol === 'https') {
      (authOptions as any).useSecureCookies = true;
    }
  } catch (e) {
    console.error('Error setting secure cookies:', e);
  }
  
  // Resolve params if it's a Promise (Next.js 15+) or use directly
  const params = context.params instanceof Promise ? await context.params : context.params;
  
  // Adapt Request to include query.nextauth for NextAuth compatibility
  const adaptedReq = Object.assign(req, {
    query: {
      nextauth: params.nextauth || []
    }
  });
  
  return nextAuthHandler(adaptedReq as any, context as any);
}

