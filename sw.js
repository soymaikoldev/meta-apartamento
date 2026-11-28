/* Nuestro plan — service worker: cascarón offline (red primero). Nunca cachea datos (GitHub API). */
const C = "miplan-v3";
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
  // red primero: cada versión nueva llega sola; la caché es solo para cuando no hay conexión
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok) { const cp = res.clone(); caches.open(C).then(c => c.put(e.request, cp)); }
      return res;
    }).catch(() => caches.match(e.request).then(hit => hit || caches.match("./index.html")))
  );
});
