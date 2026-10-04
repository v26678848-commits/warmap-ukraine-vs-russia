const CACHE = 'frontline-map-v1-2026-10';
const CORE = [
  './', './index.html', './style.css', './gameState.js', './territory.js', './grayzone.js', './cities.js', './map.js', './ui.js', './app.js', './manifest.json', './data/ukraine-outline.geojson',
  './assets/icons/icon-192.svg', './assets/icons/icon-512.svg'
];
const RUNTIME = 'frontline-map-runtime';

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== RUNTIME).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const sameOrigin = url.origin === self.location.origin;
  const allowedExternal = url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'unpkg.com';
  if (!sameOrigin && !allowedExternal) return;

  event.respondWith((async () => {
    const cache = await caches.open(RUNTIME);
    const cached = await cache.match(event.request);
    if (cached) return cached;
    try {
      const response = await fetch(event.request);
      if (response.ok || response.type === 'opaque') {
        cache.put(event.request, response.clone()).catch(() => {});
      }
      return response;
    } catch (e) {
      return caches.match('./index.html');
    }
  })());
});
