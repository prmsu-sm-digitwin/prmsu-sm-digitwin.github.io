// service-worker.js — PRMSU SM Digital Twin PWA
// Bump CACHE_NAME version whenever files change

const CACHE_NAME = 'prmsu-digitwin-v16';

const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',           
  './script.js',
  './manifest.json',
  './js/pathfinding.js',
  './js/gps.js',
  './js/ui.js',
  './js/main.js',
  './data/campus.json',
  './images/admin-building.png',
  './images/university-gate.jpg',
  './images/Legend_Map.png',
  './images/Legend_Markings.png',
  'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=DM+Sans:wght@300;400;500;600&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
];

// Install: cache all static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Caching static assets');
      // Cache one by one so a single failure doesn't break the whole install
      return Promise.allSettled(STATIC_ASSETS.map(url => cache.add(url)));
    })
  );
  self.skipWaiting();
});

// Activate: clean up old caches, then tell every open tab to reload
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
      )
      .then(() => self.clients.claim())
      .then(() =>
        // Notify all tabs that a new version is ready
        self.clients.matchAll({ type: 'window', includeUncontrolled: true })
          .then(clients => clients.forEach(client => client.postMessage({ type: 'SW_UPDATED' })))
      )
  );
});

// Fetch: cache-first for our assets, network-first for everything else
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-GET and cross-origin requests we don't control
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Cache successful same-origin responses
        if (response && response.status === 200 && url.origin === self.location.origin) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline fallback for HTML pages
        if (event.request.headers.get('accept')?.includes('text/html')) {
          return caches.match('./index.html');
        }
      });
    })
  );
});