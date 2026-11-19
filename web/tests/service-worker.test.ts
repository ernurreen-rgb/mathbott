import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { beforeEach, describe, expect, it } from "vitest";

// public/sw.js is plain browser JavaScript: it runs here in a sandbox with a fake `self`.
const source = readFileSync(fileURLToPath(new URL("../public/sw.js", import.meta.url)), "utf8");
const ORIGIN = "https://qazmath.vercel.app";

type Listener = (event: Record<string, unknown>) => void;
type Notification = { title: string; options: { body: string; tag: string; icon: string; data: { url: string } } };
type WindowClient = { url: string; focus: () => Promise<void> };

let listeners: Record<string, Listener>;
let shown: Notification[];
let opened: string[];
let focused: string[];
let windows: WindowClient[];

beforeEach(() => {
  listeners = {};
  shown = [];
  opened = [];
  focused = [];
  windows = [];
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, listener: Listener) => void (listeners[type] = listener),
    registration: {
      showNotification: async (title: string, options: Notification["options"]) => void shown.push({ title, options }),
    },
    clients: {
      matchAll: async () => windows,
      openWindow: async (url: string) => void opened.push(url),
      claim: async () => undefined,
    },
    skipWaiting: () => undefined,
  };
  runInNewContext(source, { self, caches: {}, URL, Request: class {}, fetch: async () => undefined, console });
});

// Fires a worker event and waits for the promise it hands to waitUntil.
const fire = async (type: string, event: Record<string, unknown>) => {
  let pending: Promise<unknown> | undefined;
  listeners[type]({ ...event, waitUntil: (promise: Promise<unknown>) => void (pending = promise) });
  await pending;
};

const push = (payload: unknown) => ({
  data: {
    json: () => {
      if (payload instanceof Error) throw payload;
      return payload;
    },
  },
});

const click = (url: unknown) => ({ notification: { close: () => undefined, data: { url } } });

describe("service worker: streak reminder notifications", () => {
  it("shows the reminder with its text, the app icon and one tag", async () => {
    await fire("push", push({ title: "🔥 5 күндік серия", body: "Серия үзілмеуі үшін бүгін бір есеп шығарыңыз.", url: "/modules", tag: "streak-reminder" }));
    expect(shown).toHaveLength(1);
    expect(shown[0].title).toBe("🔥 5 күндік серия");
    expect(shown[0].options).toMatchObject({ tag: "streak-reminder", icon: "/icons/icon-192.png", data: { url: "/modules" } });
  });

  it("still shows something sensible when the payload is not JSON", async () => {
    await fire("push", push(new Error("not json")));
    expect(shown[0].title).toBe("QazMath");
    expect(shown[0].options.data.url).toBe("/modules");
  });

  it("never links to another site or /api/ routes and handles null JSON payloads", async () => {
    await fire("push", push({ title: "x", url: "//evil.example.com" }));
    await fire("push", push({ title: "x", url: "https://evil.example.com" }));
    await fire("push", push({ title: "x", url: "/\\evil.example.com" }));
    await fire("push", push({ title: "x", url: "/\t/evil.example.com" }));
    await fire("push", push({ title: "x", url: "/modules/../api/auth/signout" }));
    await fire("push", push(null));
    expect(shown.map((notification) => notification.options.data.url)).toEqual([
      "/modules",
      "/modules",
      "/modules",
      "/modules",
      "/modules",
      "/modules",
    ]);
  });

  it("opens the app when no QazMath tab is open", async () => {
    await fire("notificationclick", click("/modules"));
    expect(opened).toEqual([`${ORIGIN}/modules`]);
  });

  it("only focuses an open QazMath tab, so a lesson in progress is not navigated away", async () => {
    windows = [
      { url: "https://other.example.com/", focus: async () => void focused.push("other") },
      { url: `${ORIGIN}/lessons/3`, focus: async () => void focused.push("lesson") },
    ];
    await fire("notificationclick", click("/modules"));
    expect(focused).toEqual(["lesson"]);
    expect(opened).toEqual([]);
  });
});
