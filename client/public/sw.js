const CACHE_NAME = 'cocalendar-v3';
const PRECACHE_URLS = ['/', '/index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/') || url.protocol === 'ws:' || url.protocol === 'wss:' || self.location.origin !== url.origin) return;
  event.respondWith(
    fetch(event.request)
      .then((r) => { caches.open(CACHE_NAME).then((c) => c.put(event.request, r.clone())); return r; })
      .catch(() => caches.match(event.request).then((r) => r || caches.match('/index.html')))
  );
});

self.addEventListener('push', (event) => {
  let data = { title: 'CoCalendar', body: 'Nouvelle activité sur le calendrier' };
  try { data = event.data.json(); } catch {}
  const options = {
    body: data.body,
    icon: '/favicon.svg',
    badge: '/icons/icon-192.svg',
    vibrate: [100, 50, 100],
    data: { url: data.url || '/' }
  };
  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(clients.openWindow(url));
});
