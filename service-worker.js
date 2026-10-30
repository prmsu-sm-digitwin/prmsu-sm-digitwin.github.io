// Update version in CACHE_NAME whenever files change

// Big photos (360° tour + Development Zones) live in their OWN cache, so a normal
// app update (new CACHE_NAME) doesn't throw ~90 MB away and make every phone
// download it all again. Only bump PHOTO_CACHE when you REPLACE photos that keep
// the same file name (new photos / new file names are picked up automatically).
const PHOTO_CACHE = 'prmsu-photos-v3';
const isPhotoPath = p => /\/images\/(360|devzones)\//.test(p);
const CACHE_NAME = 'prmsu-digitwin-v3.29'; // Update this version whenever files change

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
  './js/navfp.js',
  './js/directory.js',
  './js/walkthrough.js',
  './js/tour360.js',
  './data/tour360.json',
  './js/vendor/GLTFLoader.js',
  './data/campus.json',
  './data/devzones.json',
  './images/devzones/DEV_ZONES_SATMAP.jpg',
  // Note: walkthroughPathHeightmap.json is small (precomputed grid), but
  // GATE2LHSdt.glb is ~17MB -- the raw pathway scan. Caching it offline is
  // consistent with the rest of this app; worth decimating/compressing
  // later if cache size or first-load time on mobile becomes a problem.
  './data/walkthroughPathHeightmap.json',
  './models/QuadrangleNav.glb',
  './models/GATE2LHSdt.glb',
  './images/admin-building.png',
  './images/university-gate.jpg',
  './images/LegendMap.png',
  'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=DM+Sans:wght@300;400;500;600&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
];

// Install the cache all static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Caching static assets');
      // Cache one by one so a single failure doesn't break the whole install.
      // { cache: 'reload' } forces each fetch to bypass the browser's own
      // HTTP cache -- without this, cache.add(url) can silently reuse an
      // HTTP-cached (stale) response even though CACHE_NAME just changed,
      // which is why a bumped version sometimes still shows old data.json
      // content until a hard refresh. This makes a version bump actually
      // guarantee a fresh network fetch for every asset, every time.
      return Promise.allSettled(
        STATIC_ASSETS.map(url => cache.add(new Request(url, { cache: 'reload' })))
      ).then(() =>
        // Development Zones photos: the list comes from data/devzones.json, so
        // zones added in devzones-editor.html are cached for offline use too,
        // with no change needed here.
        fetch('./data/devzones.json', { cache: 'reload' })
          .then(r => r.json())
          .then(d => caches.open(PHOTO_CACHE).then(pc => Promise.allSettled(
            ((d && d.zones) || []).filter(z => z.photo).map(z => {
              const req = new Request('./' + z.photo);
              return pc.match(req).then(hit => hit || pc.add(req));
            })
          )))
          .catch(() => {})
      );
    })
  );
  self.skipWaiting();
});

// Activate the service worker and clean up old caches then tell every open tab to reload
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(keys.filter(k => k !== CACHE_NAME && k !== PHOTO_CACHE).map(k => caches.delete(k)))
      )
      .then(() => self.clients.claim())
      .then(() =>
        // Notify the tabs that a new version is ready
        self.clients.matchAll({ type: 'window', includeUncontrolled: true })
          .then(clients => clients.forEach(client => client.postMessage({ type: 'SW_UPDATED' })))
      )
  );
});

// Fetch yung cache-first for assets amd network-first for everything else
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-GET and cross-origin requests we don't control
  if (event.request.method !== 'GET') return;

  // The campus editor is a developer tool, not part of the app: never serve it
  // (or the data it edits) from this cache, or edits show up stale.
  if (url.pathname.endsWith('/campus-editor.html') || url.pathname.endsWith('/devzones-editor.html')) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Cache successful same-origin responses
        if (response && response.status === 200 && url.origin === self.location.origin) {
          const clone = response.clone();
          caches.open(isPhotoPath(url.pathname) ? PHOTO_CACHE : CACHE_NAME).then(cache => cache.put(event.request, clone));
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