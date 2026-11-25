// Wakes the API while the page is still loading.
//
// After a few idle minutes the API's function and the database go to sleep, and the next page's
// first requests waited 3-5 s for them to start (client_request_timings, 22-25 Nov 2026: 81% of
// slow requests). The page's own requests only start once its JavaScript has downloaded and run,
// which on a phone takes another second or two. This tiny inline script asks /api/health (which
// touches the database) as soon as the HTML arrives, so the waking starts that much earlier.
// At most once per tab every WARM_UP_INTERVAL_MS: a busy tab keeps everything awake by itself.

export const WARM_UP_INTERVAL_MS = 2 * 60 * 1000;
export const WARM_UP_STORAGE_KEY = "qazmath.warm-up";

/** The inline script for the root layout. `healthUrl` is apiPath("health"). */
export function warmUpScript(healthUrl: string): string {
  const url = JSON.stringify(healthUrl);
  const key = JSON.stringify(WARM_UP_STORAGE_KEY);
  return (
    "try{var n=Date.now(),l=0;" +
    `try{l=+sessionStorage.getItem(${key})||0}catch(e){}` +
    `if(!(l&&n-l<${WARM_UP_INTERVAL_MS})){` +
    `try{sessionStorage.setItem(${key},String(n))}catch(e){}` +
    `fetch(${url},{cache:"no-store",credentials:"omit"}).catch(function(){})` +
    "}}catch(e){}"
  );
}
