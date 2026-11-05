// Offline cache. Bump VERSION whenever any file changes so phones pick up the update.
const VERSION = "smart-lift-v1";
const FILES = [
  "./", "index.html", "manifest.webmanifest", "css/app.css",
  "js/app.js", "js/plan.js", "js/engine.js", "js/store.js", "js/ui.js",
  "js/train.js", "js/library.js", "js/profile.js", "js/food.js", "js/ai.js",
  "icons/apple-touch-icon.png", "icons/icon-192.png", "icons/icon-512.png",
  ...["latin", "latin-ext"].flatMap((s) => [400, 500, 600, 700].map((w) => `fonts/plus-jakarta-sans-${s}-${w}-normal.woff2`)),
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return; // API calls go straight to the network
  // Network first so a fresh deploy shows up right away; cache when offline (e.g. in the gym).
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("index.html")))
  );
});
