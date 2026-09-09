type CaptureRequestError = typeof import("@sentry/nextjs").captureRequestError;

const sentryEnabled = process.env.NODE_ENV === "production";

export async function register() {
  if (!sentryEnabled) return;

  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export async function onRequestError(...args: Parameters<CaptureRequestError>) {
  if (!sentryEnabled) return;
  const { captureRequestError } = await import("@sentry/nextjs");
  return captureRequestError(...args);
}
