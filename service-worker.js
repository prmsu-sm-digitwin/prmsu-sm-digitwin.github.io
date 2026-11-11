
const PHOTO_CACHE = 'prmsu-photos-v6';
const isPhotoPath = p => /\/images\/(360|devzones)\//.test(p);
const CACHE_NAME = 'prmsu-digitwin-v6.81'; // Internal cache name. Raise it on every push, never reset it or reuse an old name. Not the version users see (that is the about-version line in index.html).

const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './images/ground-grass.jpg',
  './sprites/portraits/Shane.png',
  './sprites/portraits/Jonathan.png',
  './sprites/portraits/Princess.png',
  './sprites/about_portraits/Princess_About.png',
  './sprites/about_portraits/Jonathan_About.png',
  './sprites/about_portraits/Shane_About.png',
  './js/pathfinding.js',
  './js/gps.js',
  './js/tutorial.js',
  './js/gpschar.js',
  './js/charpicker.js',
  './sprites/sprites_navmap/Princess.png',
  './sprites/sprites_navmap/Jonathan.png',
  './sprites/sprites_navmap/Shane.png',
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

const MODEL_ASSETS = [
  './models/QuadrangleNav.glb',
  './models/ASBNav.glb',
  './models/AdminCourtNav.glb',
  './models/AdminNav.glb',
  './models/Agritech1Nav.glb',
  './models/Agritech2Nav.glb',
  './models/BEEDNav.glb',
  './models/BSEDNav.glb',
  './models/CANTEENNav.glb',
  './models/CCIT1Nav.glb',
  './models/CCIT2_LHSFacultyNav.glb',
  './models/ExecutiveHouseNav.glb',
  './models/GabaldonNav.glb',
  './models/GuardHouseNav.glb',
  './models/HM1Nav.glb',
  './models/HM2Nav.glb',
  './models/Housing10Nav.glb',
  './models/Housing11Nav.glb',
  './models/Housing12Nav.glb',
  './models/Housing1Nav.glb',
  './models/Housing2Nav.glb',
  './models/Housing3Nav.glb',
  './models/Housing4Nav.glb',
  './models/Housing5Nav.glb',
  './models/Housing6Nav.glb',
  './models/Housing7Nav.glb',
  './models/Housing8Nav.glb',
  './models/Housing9Nav.glb',
  './models/LHSNav.glb',
  './models/LIBNav.glb',
  './models/MMNav.glb',
  './models/MenDormNav.glb',
  './models/MotorpoolNav.glb',
  './models/Prac_GuestNav.glb',
  './models/R&DCenterNav.glb',
  './models/RMCNav.glb',
  './models/ROMCNav.glb',
  './models/SCNav.glb',
  './models/WomenDormNav.glb',
  './models/places/1st_Statue.glb',
  './models/places/2nd_Statue.glb',
  './models/places/Agri_ShedFIN.glb',
  './models/places/BSED_Shed_Long_FIN.glb',
  './models/places/Bench-LHS_CCIT_FIN.glb',
  './models/places/Bench_With_Fence_FIN.glb',
  './models/places/Broken_Building.glb',
  './models/places/Broken_chairs_FINglb.glb',
  './models/places/Bsed_Shed_Near_Banggar_FIN.glb',
  './models/places/Bsed_Shed_Ni_Justine_FIN.glb',
  './models/places/Bsed_Shed_uli_FIN.glb',
  './models/places/CcitPuntodFIN.glb',
  './models/places/CentralNurseryFIN.glb',
  './models/places/FrontGateBench_FIN.glb',
  './models/places/Front_Gate_MOO_FIN.glb',
  './models/places/Front_Harang_FIN.glb',
  './models/places/GrandStandFIN.glb',
  './models/places/Guard_House_Farm_FIN.glb',
  './models/places/LHS_Shed_FIN.glb',
  './models/places/LHS_Thingy.glb',
  './models/places/Lahar_LTDA.glb',
  './models/places/Lib_Shed_FIN.glb',
  './models/places/LibraryShedFINglb.glb',
  './models/places/MRF.glb',
  './models/places/Random_Nether_Portal_FIN.glb',
  './models/places/SC_Benches_Trees_FIN.glb',
  './models/places/Shed_Gabaldon_FIN.glb',
  './models/places/Shed_Near_Tractor_FIN.glb',
  './models/places/Small_Trees_Cluster_Model.glb',
  './models/places/Under_ConstrictionFIN.glb',
  './models/places/banggarFIN.glb',
  './models/places/bsed chaird.glb',
  './models/places/tractorFIN.glb',
  './models/places/Agri_Z3_Shed.glb',
  './models/places/Practice_House_BenchesFINglb.glb',
  './models/places/Zone3_Greenhouse_beside_oldLin_NEW.glb',
];

const DIRECTORY_ASSETS = [
  './images/directory/ADMIN_BUILDING.jpg',
  './images/directory/ADMIN_COURT.jpg',
  './images/directory/AGRITECH.jpg',
  './images/directory/ASB.jpg',
  './images/directory/CANTEEN.jpg',
  './images/directory/CCIT_MAIN.jpg',
  './images/directory/CHM_1.jpg',
  './images/directory/CHM_2.jpg',
  './images/directory/CTE_BEED.jpg',
  './images/directory/CTE_BSED.jpg',
  './images/directory/GABALDON_COURT.jpg',
  './images/directory/GUARD_HOUSE.jpg',
  './images/directory/GUEST_HOUSE.jpg',
  './images/directory/LHS.jpg',
  './images/directory/LHS_CCIT.jpg',
  './images/directory/LIBRARY.jpg',
  './images/directory/LTDA.jpg',
  './images/directory/MENS_DORMITORY.jpg',
  './images/directory/MITOS.jpg',
  './images/directory/MOTORPOOL.jpg',
  './images/directory/MRF.jpg',
  './images/directory/OVAL.jpg',
  './images/directory/QUADRANGLE_COURT.jpg',
  './images/directory/RMC.jpg',
  './images/directory/RND_CENTER.jpg',
  './images/directory/ROMC.jpg',
  './images/directory/SC.jpg',
  './images/directory/WOMENS_DORMITORY.jpg',
];

const HEAVY_NAMES = ['admin-building.png', 'DEV_ZONES_SATMAP.jpg'];
const isHeavy = u => HEAVY_NAMES.some(n => u.endsWith('/' + n));
const CORE_ASSETS  = STATIC_ASSETS.filter(u => !isHeavy(u));
const HEAVY_ASSETS = STATIC_ASSETS.filter(isHeavy).concat(MODEL_ASSETS, DIRECTORY_ASSETS);

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