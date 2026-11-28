/* Nuestro plan — service worker: cascarón offline. Nunca cachea datos (GitHub API). */
const C = "miplan-v2";
const SHELL = ["./", "./index.html", "./styles.css", "./script.js", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(C).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()).catch(() => {}));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (u.hostname === "api.github.com") return; // datos privados: siempre a la red
  if (u.origin !== location.origin) return; // fuentes, etc: deja al navegador
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      const cp = res.clone(); caches.open(C).then(c => c.put(e.request, cp)); return res;
    }).catch(() => caches.match("./index.html")))
  );
});
