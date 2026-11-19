// Settings shared by playwright.config.ts and the tests. The secrets below exist only for the
// throwaway servers the tests start on loopback; production uses its own values.

export const E2E_PORTS = {
  api: Number(process.env.E2E_API_PORT || 8031),
  web: Number(process.env.E2E_WEB_PORT || 3031),
};

export const E2E_WEB_URL = `http://localhost:${E2E_PORTS.web}`;
export const E2E_NEXTAUTH_SECRET = "e2e-nextauth-secret-only-for-browser-tests-0001";
const E2E_PROXY_SECRET = "e2e-proxy-secret-only-for-browser-tests-00000001";

const databaseUrl =
  process.env.E2E_DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/qazmath_e2e";

export const E2E_ENV = {
  api: {
    // Production mode, so every request goes through the signed-proxy checks it meets in production.
    ENVIRONMENT: "production",
    E2E_DATABASE_URL: databaseUrl,
    DATABASE_URL: databaseUrl,
    DATABASE_MIGRATION_URL: "",
    DATABASE_AUTO_MIGRATE: "true",
    INTERNAL_PROXY_SHARED_SECRET: E2E_PROXY_SECRET,
    ALLOWED_ORIGINS: E2E_WEB_URL,
    BACKGROUND_TASKS_ENABLED: "false",
    SENTRY_DSN: "",
    AI_TWIN_BASE_URL: "",
    AI_TWIN_API_KEY: "",
    AI_TWIN_MODEL: "",
    VAPID_PUBLIC_KEY: "",
    VAPID_PRIVATE_KEY: "",
    PYTHONIOENCODING: "utf-8",
  },
  web: {
    BACKEND_URL: `http://127.0.0.1:${E2E_PORTS.api}`,
    NEXT_PUBLIC_API_URL: "/api/backend",
    NEXT_PUBLIC_REALTIME_TRANSPORT: "polling",
    NEXT_PUBLIC_SENTRY_DSN: "",
    NEXTAUTH_URL: E2E_WEB_URL,
    NEXTAUTH_SECRET: E2E_NEXTAUTH_SECRET,
    INTERNAL_PROXY_SHARED_SECRET: E2E_PROXY_SECRET,
    // Sign-in is skipped (the tests set the session cookie), but the auth route wants both values.
    GOOGLE_CLIENT_ID: "e2e-google-client-id",
    GOOGLE_CLIENT_SECRET: "e2e-google-client-secret",
    NEXT_TELEMETRY_DISABLED: "1",
  },
};
