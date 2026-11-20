/* QazMath service worker.
 *
 * Deliberately small and conservative, because the app has auth and live data:
 *  - never touches /api/* (backend proxy, NextAuth) or any non-GET request;
 *  - cache-first only for immutable static assets (/_next/static, /icons,
 *    fonts, same-origin images);
 *  - page navigations are network-first and only fall back to the cached
 *    offline page when the network fails (HTML is never cached or served stale).
 *
 * Bump VERSION to invalidate every cache (e.g. after changing files in /icons,
 * which are not content-hashed).
 */
const VERSION = "v1";
const STATIC_CACHE = `qazmath-static-${VERSION}`;
const OFFLINE_CACHE = `qazmath-offline-${VERSION}`;
const CURRENT_CACHES = [STATIC_CACHE, OFFLINE_CACHE];
const OFFLINE_URL = "/offline.html";

// /_next/static filenames are content-hashed, so old entries are never reused
// after a deploy; cap the cache so they cannot pile up forever.
const MAX_STATIC_ENTRIES = 150;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(OFFLINE_CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" })))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("qazmath-") && !CURRENT_CACHES.includes(key))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;
  // Chrome DevTools quirk: this combination throws when passed to fetch().
  if (request.cache === "only-if-cached" && request.mode !== "same-origin") return;
  // Partial/range responses cannot be stored in the Cache API.
  if (request.headers.has("range")) return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Backend proxy and NextAuth: always straight to the network, never cached.
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isStaticAsset(url, request)) {
    event.respondWith(cacheFirst(event, request));
  }
  // Anything else (RSC payloads, JSON, manifest, ...) is left to the browser.
});

function isStaticAsset(url, request) {
  const path = url.pathname;
  if (path.startsWith("/_next/static/") || path.startsWith("/icons/")) return true;
  if (path === "/_next/image") {
    // Never cache the optimizer's copy of anything served from /api or another origin.
    const source = (url.searchParams.get("url") || "").trim();
    if (!source) return false;
    try {
      const parsed = new URL(source, self.location.origin);
      if (parsed.origin !== self.location.origin) return false;
      return parsed.pathname !== "/api" && !parsed.pathname.startsWith("/api/");
    } catch {
      return false;
    }
  }
  return request.destination === "font" || request.destination === "image";
}

async function networkFirstNavigation(request) {
  try {
    return await fetch(request);
  } catch (error) {
    const cache = await caches.open(OFFLINE_CACHE);
    const offline = await cache.match(OFFLINE_URL);
    if (offline) return offline;
    throw error;
  }
}

async function cacheFirst(event, request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  // Only store complete, same-origin, successful responses.
  if (response.status === 200 && response.type === "basic") {
    event.waitUntil(
      cache.put(request, response.clone()).then(() => trimCache(cache, MAX_STATIC_ENTRIES))
    );
  }
  return response;
}

// Daily streak reminder (bot/services/streak_reminders.py): the payload is
// {title, body, url, tag}. One tag means a new reminder replaces an unread one.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    const parsed = event.data ? event.data.json() : {};
    data = parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    data = {};
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "QazMath", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      tag: data.tag || "qazmath",
      data: { url: safeAppPath(data.url) },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(safeAppPath(event.notification.data && event.notification.data.url), self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      // An open QazMath tab is only focused: navigating it could interrupt a lesson.
      const open = windows.find((client) => {
        try {
          return new URL(client.url).origin === self.location.origin;
        } catch {
          return false;
        }
      });
      return open ? open.focus() : self.clients.openWindow(url);
    })
  );
});

// Only normalized same-origin paths inside the app; never another site ("//host", "/\host", "/\t/host", "https://...").
function safeAppPath(value) {
  if (typeof value !== "string") return "/modules";
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\u0000-\u001F\u007F]/.test(value)) {
    return "/modules";
  }
  try {
    const parsed = new URL(value, self.location.origin);
    if (parsed.origin !== self.location.origin) return "/modules";
    if (parsed.pathname === "/api" || parsed.pathname.startsWith("/api/")) return "/modules";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/modules";
  }
}

async function trimCache(cache, maxEntries) {
  const keys = await cache.keys();
  // keys() is in insertion order, so the oldest entries go first.
  for (let i = 0; i < keys.length - maxEntries; i++) {
    await cache.delete(keys[i]);
  }
}
