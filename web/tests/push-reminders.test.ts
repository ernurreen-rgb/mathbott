import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  getPushConfig: vi.fn(),
  savePushSubscription: vi.fn(),
  deletePushSubscription: vi.fn(),
}));
vi.mock("@/lib/i18n/translate", () => ({ tr: (key: string) => key }));

import { getPushConfig, savePushSubscription } from "@/lib/api";
import { enableStreakReminder } from "@/lib/push-reminders";

// Any uncompressed P-256 point works: the browser and the push service are faked below.
const SERVER_KEY = Buffer.from(Uint8Array.from({ length: 65 }, (_, index) => (index === 0 ? 4 : index))).toString("base64url");
const SAVED = { data: { subscribed: true, confirmation: "sent" }, error: null, status: 200 };
const GONE = { data: null, error: "gone", status: 410 };

type FakeSubscription = PushSubscription & { unsubscribe: ReturnType<typeof vi.fn> };

function fakeSubscription(name: string): FakeSubscription {
  const endpoint = `https://fcm.googleapis.com/fcm/send/${name}`;
  return {
    endpoint,
    options: { applicationServerKey: Uint8Array.from(Buffer.from(SERVER_KEY, "base64url")).buffer, userVisibleOnly: true },
    toJSON: () => ({ endpoint, keys: { p256dh: `p256dh-${name}`, auth: `auth-${name}` } }),
    unsubscribe: vi.fn(async () => true),
  } as unknown as FakeSubscription;
}

let existing: FakeSubscription | null;
let created: FakeSubscription[];

beforeEach(() => {
  existing = null;
  created = [];
  const pushManager = {
    getSubscription: vi.fn(async () => existing),
    subscribe: vi.fn(async () => {
      const subscription = fakeSubscription(`new-${created.length + 1}`);
      created.push(subscription);
      return subscription;
    }),
  };
  const notification = { permission: "granted", requestPermission: vi.fn(async () => "granted") };
  vi.stubGlobal("Notification", notification);
  vi.stubGlobal("window", { PushManager: function PushManager() {}, Notification: notification, matchMedia: () => ({ matches: false }) });
  vi.stubGlobal("navigator", {
    userAgent: "Android",
    platform: "Linux",
    maxTouchPoints: 5,
    serviceWorker: { getRegistration: async () => ({ pushManager }) },
  });
  vi.mocked(getPushConfig).mockResolvedValue({ data: { enabled: true, public_key: SERVER_KEY }, error: null });
  vi.mocked(savePushSubscription).mockReset();
});

afterEach(() => vi.unstubAllGlobals());

describe("turning the streak reminder on", () => {
  it("replaces a subscription the push service has dropped and tries once more", async () => {
    existing = fakeSubscription("stale");
    vi.mocked(savePushSubscription).mockResolvedValueOnce(GONE).mockResolvedValueOnce(SAVED);

    expect(await enableStreakReminder("student@example.com")).toEqual({ ok: true });
    expect(existing.unsubscribe).toHaveBeenCalledOnce();
    expect(created).toHaveLength(1);
    expect(vi.mocked(savePushSubscription).mock.calls.map(([keys]) => keys.endpoint)).toEqual([
      existing.endpoint,
      created[0].endpoint,
    ]);
  });

  it("tries a new subscription only once, and leaves none behind when that fails too", async () => {
    vi.mocked(savePushSubscription).mockResolvedValue(GONE);

    const result = await enableStreakReminder("student@example.com");
    expect(result.ok).toBe(false);
    expect(created).toHaveLength(2);
    expect(savePushSubscription).toHaveBeenCalledTimes(2);
    for (const subscription of created) expect(subscription.unsubscribe).toHaveBeenCalledOnce();
  });

  it("does not retry other errors", async () => {
    vi.mocked(savePushSubscription).mockResolvedValue({ data: null, error: "server error", status: 500 });

    expect((await enableStreakReminder("student@example.com")).ok).toBe(false);
    expect(savePushSubscription).toHaveBeenCalledOnce();
    expect(created[0].unsubscribe).toHaveBeenCalledOnce();
  });

  it("keeps a working subscription the browser already had", async () => {
    existing = fakeSubscription("working");
    vi.mocked(savePushSubscription).mockResolvedValue(SAVED);

    expect(await enableStreakReminder("student@example.com")).toEqual({ ok: true });
    expect(created).toHaveLength(0);
    expect(existing.unsubscribe).not.toHaveBeenCalled();
  });
});
