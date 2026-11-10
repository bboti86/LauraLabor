const CACHE_NAME = 'laura-tanulosarka-v14';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles.css',
  './app-shared.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './szilard-anyagok.html',
  './legnemu-anyagok.html',
  './folyadekok.html',
  './suruseg.html',
  './pcreszek.html',
  './szorzas-bennfoglalas.html',
  './szorzo-felmero.html',
  './ketjegyu-osszeadas-kivonas.html'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        ASSETS_TO_CACHE.map((url) =>
          fetch(url, { cache: 'no-cache' }).then((res) => cache.put(url, res))
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Network-first stratégia cache: 'no-cache' fejléccel, hogy a böngésző 10 perces HTTP gyorsítótára se ragadjon be
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request, { cache: 'no-cache' })
      .then((networkResponse) => {
        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone);
        });
        return networkResponse;
      })
      .catch(() => caches.match(event.request))
  );
});
