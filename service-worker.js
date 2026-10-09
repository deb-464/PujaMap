/* PujaMap service worker: offline app shell + Puja data. Map tiles are never cached. */
const VERSION = 'pujamap-v3';
const SHELL = [
  './', 'index.html', 'about.html', 'favorites.html', 'manifest.json',
  'assets/css/style.css',
  'assets/js/ui.js', 'assets/js/puja.js', 'assets/js/favorites.js', 'assets/js/search.js',
  'assets/js/location.js', 'assets/js/map.js', 'assets/js/app.js', 'assets/js/favorites-page.js',
  'assets/images/placeholder.jpg', 'assets/images/icon-192.png', 'data/pujas.csv'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => Promise.all(SHELL.map((url) => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.endsWith('tile.openstreetmap.org')) return; // tiles: network only

  // Puja data: network first so edits show up, cache as offline fallback
  if (url.origin === location.origin && url.pathname.endsWith('/data/pujas.csv')) {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // Everything else: stale-while-revalidate
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        if (res && (res.ok || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => cached || (req.mode === 'navigate' ? caches.match('index.html') : undefined));
      return cached || network;
    })
  );
});
