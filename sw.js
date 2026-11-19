// Service worker : met l'application en cache pour qu'elle marche sans réseau.
// Pour forcer une mise à jour chez l'utilisateur, changer le numéro de version ci-dessous.
const VERSION = 'seya-audit-v4';
const FILES = [
  './', 'index.html', 'app.js', 'manifest.webmanifest',
  'lib/jspdf.umd.min.js',
  'fonts/Mulish-Regular.ttf', 'fonts/Mulish-Bold.ttf', 'fonts/Mulish-Italic.ttf',
  'img/logo.png', 'img/icon-192.png', 'img/icon-512.png', 'img/apple-touch-icon.png'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).catch(() =>
      e.request.mode === 'navigate' ? caches.match('index.html') : Response.error()))
  );
});
