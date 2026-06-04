const CACHE = 'rentify-v1';
const FILES = ['/', '/index.html', '/styles.css', '/script.js', '/assets/logo.svg', '/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(FILES))
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(response => response || fetch(e.request))
  );
});
