// Daily streak reminder over Web Push: the browser side. The server sends the reminders
// (bot/services/streak_reminders.py) and public/sw.js shows them.
import { deletePushSubscription, getPushConfig, savePushSubscription, type PushSubscriptionKeys } from "@/lib/api";
import { tr } from "@/lib/i18n/translate";

export type ReminderState =
  | "unsupported" // this browser has no Web Push
  | "install" //     iPhone/iPad: Web Push only works in the app added to the home screen
  | "denied" //      notifications are blocked in the browser settings
  | "off"
  | "on";

export type ReminderResult = { ok: true } | { ok: false; error: string; state?: ReminderState };

const isIos = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

const hasPushApi = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) return existing;
  // The worker caches static files, so it is only registered by production builds (ServiceWorkerRegister).
  if (process.env.NODE_ENV !== "production") return null;
  await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  return navigator.serviceWorker.ready;
}

async function getSubscription(): Promise<PushSubscription | null> {
  const registration = await getRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

export async function getReminderState(): Promise<ReminderState> {
  if (!hasPushApi()) return typeof window !== "undefined" && isIos() && !isStandalone() ? "install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  const registration = await getRegistration();
  if (!registration) return "unsupported";
  if (Notification.permission !== "granted") return "off";
  return (await registration.pushManager.getSubscription()) ? "on" : "off";
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = (value + "=".repeat((4 - (value.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function sameKey(current: ArrayBuffer | null | undefined, expected: Uint8Array): boolean {
  if (!current) return false;
  const bytes = new Uint8Array(current);
  return bytes.length === expected.length && bytes.every((byte, index) => byte === expected[index]);
}

function toKeys(subscription: PushSubscription): PushSubscriptionKeys | null {
  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  return json.endpoint && p256dh && auth ? { endpoint: json.endpoint, keys: { p256dh, auth } } : null;
}

// Read at call time: the student may switch language while the page is open.
const unavailable = () => tr("push.unavailable");

/** Call straight from a click: iOS only shows the permission prompt inside a user gesture. */
export async function enableStreakReminder(email: string): Promise<ReminderResult> {
  const UNAVAILABLE = unavailable();
  if (!hasPushApi()) return { ok: false, error: UNAVAILABLE, state: await getReminderState() };
  const permission = await Notification.requestPermission();
  if (permission === "denied") {
    return { ok: false, state: "denied", error: tr("push.denied") };
  }
  if (permission !== "granted") return { ok: false, state: "off", error: tr("push.notGranted") };

  try {
    const [{ data: config }, registration] = await Promise.all([getPushConfig(email), getRegistration()]);
    if (!config?.enabled || !config.public_key || !registration) return { ok: false, error: UNAVAILABLE };

    const serverKey = base64UrlToBytes(config.public_key);
    let subscription = await registration.pushManager.getSubscription();
    // A subscription made for an older server key can no longer receive anything.
    if (subscription && !sameKey(subscription.options.applicationServerKey, serverKey)) {
      await subscription.unsubscribe();
      subscription = null;
    }
    // The server sends a test notification; a push service that calls the subscription dead
    // (404/410) gets one more try with a brand-new subscription, as the browser may have handed
    // back one the service has already dropped.
    const subscribeAndSave = async (reuse: PushSubscription | null) => {
      const current =
        reuse ?? (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: serverKey }));
      const keys = toKeys(current);
      const saved = keys ? await savePushSubscription(keys, email, true) : { data: null, error: UNAVAILABLE, status: undefined };
      return { subscription: current, fresh: !reuse, saved };
    };
    const isGone = (status?: number) => status === 404 || status === 410;

    let attempt = await subscribeAndSave(subscription);
    if (!attempt.saved.data && isGone(attempt.saved.status)) {
      await attempt.subscription.unsubscribe().catch(() => undefined);
      attempt = await subscribeAndSave(null);
    }
    if (!attempt.saved.data) {
      // Only tear down a browser subscription made here, or one the server says is gone.
      if (attempt.fresh || isGone(attempt.saved.status)) {
        await attempt.subscription.unsubscribe().catch(() => undefined);
      }
      return { ok: false, error: attempt.saved.error || UNAVAILABLE };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: UNAVAILABLE };
  }
}

export async function disableStreakReminder(email: string): Promise<ReminderResult> {
  try {
    const subscription = await getSubscription();
    if (subscription) {
      // Unsubscribing in the browser is what really stops the notifications, so it goes first.
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      await deletePushSubscription(endpoint, email);
    }
    return { ok: true };
  } catch {
    return { ok: false, error: tr("push.disableFailed") };
  }
}

/**
 * Re-send this browser's subscription for the signed-in account, without a test notification.
 * It repairs a subscription the server lost, and moves it to whoever is signed in now.
 */
export async function syncStreakReminder(email: string): Promise<void> {
  try {
    if (!hasPushApi() || Notification.permission !== "granted") return;
    const subscription = await getSubscription();
    const keys = subscription && toKeys(subscription);
    if (keys) await savePushSubscription(keys, email, false);
  } catch {
    // Only a repair: the switch still shows the browser's real state.
  }
}
