/* Checkstake invite — offline cache for NFC taps */
const CACHE = 'checkstake-invite-v1';
const SCOPE = '/checkstake-invite/';
const ASSETS = [
  SCOPE,
  SCOPE + 'index.html',
  SCOPE + 'manifest.webmanifest',
  SCOPE + 'sw.js',
  SCOPE + 'og-survey.jpg',
  SCOPE + 'brand/mark-only-green.png',
  SCOPE + 'brand/mark-only-green.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.all(ASSETS.map((url) => cache.add(url).catch(() => undefined)));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      ),
    ])
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (!url.pathname.startsWith(SCOPE)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req, { ignoreSearch: true });
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok) void cache.put(req, fresh.clone());
        return fresh;
      } catch {
        if (cached) return cached;
        if (req.mode === 'navigate') {
          return (
            (await cache.match(SCOPE + 'index.html')) ||
            (await cache.match(SCOPE)) ||
            new Response('Offline — open this invite once online to cache it.', {
              status: 503,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            })
          );
        }
        return cached || new Response('', { status: 504 });
      }
    })()
  );
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type !== 'nfc-schedule-reminders') return;
  const title = data.title || 'Checkstake waitlist';
  const body = data.body || 'Open the form when you can.';
  const href = data.href || SCOPE;
  const until = Number(data.until) || Date.now() + 2 * 24 * 60 * 60 * 1000;
  const checkpoints = Array.isArray(data.checkpoints) ? data.checkpoints : [];
  checkpoints.forEach((at, i) => {
    const when = Number(at);
    if (!Number.isFinite(when) || when <= Date.now() || when > until) return;
    setTimeout(() => {
      void self.registration.showNotification(title, {
        body,
        data: { href },
        tag: `invite-nfc-${i}`,
        renotify: true,
      });
    }, Math.max(0, when - Date.now()));
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.href) || SCOPE;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
