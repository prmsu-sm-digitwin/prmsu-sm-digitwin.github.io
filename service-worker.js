
const PHOTO_CACHE = 'prmsu-photos-v6';
const isPhotoPath = p => /\/images\/(360|devzones)\//.test(p);
const CACHE_NAME = 'prmsu-digitwin-v5.19';

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
  './js/tour360.js',
  './data/tour360.json',
  './js/vendor/GLTFLoader.js',
  './data/campus.json',
  './data/devzones.json',
  './images/devzones/DEV_ZONES_SATMAP.jpg',
  './models/QuadrangleNav.glb',
  './images/admin-building.png',
  './images/university-gate.jpg',
  './images/LegendMap.png',
  './fonts/fonts.css',
  './fonts/dm-sans-latin-300-normal.woff2',
  './fonts/dm-sans-latin-400-normal.woff2',
  './fonts/dm-sans-latin-500-normal.woff2',
  './fonts/dm-sans-latin-600-normal.woff2',
  './fonts/playfair-display-latin-600-normal.woff2',
  './fonts/playfair-display-latin-700-normal.woff2',
  './js/vendor/three.min.js',
];

const HEAVY_NAMES = ['QuadrangleNav.glb', 'admin-building.png', 'DEV_ZONES_SATMAP.jpg'];
const isHeavy = u => HEAVY_NAMES.some(n => u.endsWith('/' + n));
const CORE_ASSETS  = STATIC_ASSETS.filter(u => !isHeavy(u));
const HEAVY_ASSETS = STATIC_ASSETS.filter(isHeavy);

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Caching static assets');
      return Promise.allSettled(
        CORE_ASSETS.map(url => cache.add(new Request(url, { cache: 'reload' })))
      );
    })
  );
  self.skipWaiting();
});

function warmHeavy() {
  return caches.open(CACHE_NAME).then(cache => Promise.allSettled(
    HEAVY_ASSETS.map(url => cache.match(url).then(hit => hit || cache.add(new Request(url, { cache: 'reload' }))))
  )).then(() =>
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
}
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'WARM_CACHE') event.waitUntil(warmHeavy());
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(keys.filter(k => k !== CACHE_NAME && k !== PHOTO_CACHE).map(k => caches.delete(k)))
      )
      .then(() => self.clients.claim())
      .then(() =>
        self.clients.matchAll({ type: 'window', includeUncontrolled: true })
          .then(clients => clients.forEach(client => client.postMessage({ type: 'SW_UPDATED' })))
      )
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (event.request.method !== 'GET') return;

  if (url.pathname.endsWith('/campus-editor.html') || url.pathname.endsWith('/devzones-editor.html')) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        const isTourPhoto = /\/images\/360\//.test(url.pathname);
        if (!isTourPhoto && response && response.status === 200 && url.origin === self.location.origin) {
          const clone = response.clone();
          caches.open(isPhotoPath(url.pathname) ? PHOTO_CACHE : CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        if (event.request.headers.get('accept')?.includes('text/html')) {
          return caches.match('./index.html');
        }
      });
    })
  );
});