/*
 * Offline support for the web export (SPEC-LIGHTWEIGHT §4.5, "PWA-lite").
 * - Hashed bundles under /_expo/static/, MUFI fonts under /assets/mufi/, and the lemma
 *   dictionary under /dic/ are cache-first.
 * - Library sidecars under /library/ use stale-while-revalidate.
 * - Navigations and other same-origin GETs are network-first with a cache fallback.
 * No background sync and no push. Bump CACHE_VERSION to drop old caches.
 */
const CACHE_VERSION = "tc-v2";
const SHELL = ["/", "/index.html"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

function isImmutable(url) {
  return (
    url.pathname.startsWith("/_expo/static/") ||
    url.pathname.startsWith("/dic/") ||
    url.pathname.startsWith("/assets/mufi/")
  );
}

function isLibrarySidecar(url) {
  return (
    url.pathname.startsWith("/library/") ||
    url.pathname === "/library-catalog.json" ||
    url.pathname === "/library-graph.json" ||
    url.pathname === "/corpus-tfidf.json" ||
    url.pathname === "/corpus-stats.json" ||
    url.pathname === "/corpus-term-postings.json"
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Cache-first for static immutable assets
  if (isImmutable(url)) {
    event.respondWith(
      caches.open(CACHE_VERSION).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      }),
    );
    return;
  }

  // Stale-while-revalidate for library sidecars / corpus indexes
  if (isLibrarySidecar(url)) {
    event.respondWith(
      caches.open(CACHE_VERSION).then(async (cache) => {
        const cachedResponse = await cache.match(request);
        const fetchPromise = fetch(request)
          .then((networkResponse) => {
            if (networkResponse.ok) {
              cache.put(request, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      }),
    );
    return;
  }

  // Network-first for navigations and dynamic endpoints
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const hit = await caches.match(request);
        if (hit) return hit;
        if (request.mode === "navigate") {
          const shell = await caches.match("/");
          if (shell) return shell;
        }
        return Response.error();
      }),
  );
});
