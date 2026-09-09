type CaptureRouterTransitionStart = typeof import("@sentry/nextjs").captureRouterTransitionStart;

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const sentryEnabled = process.env.NODE_ENV === "production" && Boolean(dsn);
let sentryPromise: Promise<typeof import("@sentry/nextjs")> | null = null;

const loadSentry = () => {
  if (!sentryEnabled) return null;
  sentryPromise ||= import("@sentry/nextjs");
  return sentryPromise;
};

const clientSentry = loadSentry();
if (clientSentry) {
  void clientSentry.then((Sentry) => {
    Sentry.init({
      dsn,
      environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV,
      tracesSampleRate: 0.1,
      sendDefaultPii: false,
    });
  });
}

export function onRouterTransitionStart(...args: Parameters<CaptureRouterTransitionStart>) {
  const runtime = loadSentry();
  if (!runtime) return;
  void runtime.then((Sentry) => Sentry.captureRouterTransitionStart(...args));
}
