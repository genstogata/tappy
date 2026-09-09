// Bump this on every deploy so clients pick up new files instead of stale cache.
const CACHE_NAME = "tappy-cache-v15";
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png",
];

// App-shell files that define the running version — always prefer network for these so a fresh
// load online never depends on the SW update lifecycle (unreliable on iOS Safari/home-screen PWA).
const APP_SHELL_SUFFIXES = ["/", "/index.html", "/app.js", "/styles.css", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    // {cache:"reload"} bypasses the HTTP cache so precaching itself can't store a stale response.
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(PRECACHE_URLS.map((url) =>
        fetch(url, { cache: "reload" }).then((response) => cache.put(url, response))
      ))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

function isAppShell(request, url) {
  return request.mode === "navigate" || APP_SHELL_SUFFIXES.some((suffix) => url.pathname.endsWith(suffix));
}

// Network-first: online users always get the latest shell; falls back to cache only when offline.
// Scoped to our own cache (not the global caches.match) so it can never resolve against a stale,
// not-yet-deleted previous version's cache.
function networkFirst(request) {
  return caches.open(CACHE_NAME).then((cache) =>
    fetch(request)
      .then((response) => {
        cache.put(request, response.clone());
        return response;
      })
      .catch(() => cache.match(request))
  );
}

// Cache-first for everything else (icons etc.) so the app still works fully offline.
function cacheFirst(request) {
  return caches.open(CACHE_NAME).then((cache) =>
    cache.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        cache.put(request, response.clone());
        return response;
      });
    })
  );
}

// Only intercept same-origin requests so a compromised/third-party endpoint can never be cached or served from cache.
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(isAppShell(request, url) ? networkFirst(request) : cacheFirst(request));
});
