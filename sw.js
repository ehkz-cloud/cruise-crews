/* =====================================================
   CRUISE CREWS — SERVICE WORKER v6.7.1
   Offline caching + push notification support
===================================================== */
const SW_VERSION  = 'v6.7.1';
const CACHE_NAME  = 'cruise-crews-v6.7.1';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// ── Install: cache static assets ──────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('[SW] Some assets failed to cache:', err);
      });
    }).then(() => self.skipWaiting())   // activate immediately on install
  );
});

// ── Activate: clean old caches ────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => {
      self.clients.claim();
      // Notify all open tabs that a new SW version is active
      self.clients.matchAll({ type: 'window' }).then(clients => {
        clients.forEach(client => client.postMessage({ type: 'SW_UPDATED', version: SW_VERSION }));
      });
    })
  );
});

// ── Fetch: network-first for HTML, cache-first for assets ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/')) return;

  // Always go network-first for HTML so updates are picked up immediately
  if (event.request.headers.get('accept') && event.request.headers.get('accept').includes('text/html')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // Cache-first for everything else (icons, fonts, etc.)
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        if (event.request.destination === 'document') {
          return caches.match('./index.html');
        }
      });
    })
  );
});

// ── Push Notifications ────────────────────────────────
self.addEventListener('push', event => {
  let data = { title: 'Cruise Crews', body: 'You have a new message!', icon: './icons/icon-192.png' };
  if (event.data) {
    try { data = { ...data, ...event.data.json() }; } catch(e) {}
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || './icons/icon-192.png',
      badge: './icons/icon-192.png',
      vibrate: [200, 100, 200],
      tag: data.tag || 'cruise-crews-msg',
      data: data.url || '/',
      actions: [
        { action: 'open', title: 'Open' },
        { action: 'dismiss', title: 'Dismiss' }
      ]
    })
  );
});

// ── Notification click ────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  const url = event.notification.data || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      const existing = clients.find(c => c.url.includes('cruise-crews') && 'focus' in c);
      if (existing) return existing.focus();
      return self.clients.openWindow(url);
    })
  );
});

// ── Messages from client ──────────────────────────────
self.addEventListener('message', event => {
  const type = (event.data && typeof event.data === 'object')
    ? event.data.type
    : event.data;   // handle both string 'SKIP_WAITING' and object { type: 'SKIP_WAITING' }

  if (type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (type === 'GET_VERSION') {
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({ version: SW_VERSION });
    }
  }
});
