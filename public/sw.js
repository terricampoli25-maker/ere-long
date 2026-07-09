// Ere Long service worker — offline support + PWA installability.
//
// Strategy:
//   - App code (page, styles.css, app.js, manifest.json): network-first,
//     so a deploy reaches users immediately; cached copy serves offline.
//   - Fonts and icons: cache-first (they never change without a rename).
//   - Media (backgrounds/, sounds/): cache-first, cached the first time
//     each file is used. When the app runs installed (standalone window),
//     app.js asks us to pre-cache ALL media so everything works offline.
//   - Audio range requests are answered by slicing the cached full file.

const VERSION = 'v1';
const CORE  = `erelong-core-${VERSION}`;
const MEDIA = `erelong-media-${VERSION}`;

const CORE_ASSETS = [
  './',
  'styles.css',
  'app.js',
  'manifest.json',
  'icons/icon-192x192.png',
  'icons/icon-512x512.png',
  'fonts/cinzel-latin.woff2',
  'fonts/cinzel-latin-ext.woff2',
  'fonts/cinzel-decorative-400-latin.woff2',
  'fonts/cinzel-decorative-400-latin-ext.woff2',
  'fonts/cinzel-decorative-700-latin.woff2',
  'fonts/cinzel-decorative-700-latin-ext.woff2',
  'fonts/imfell-english-sc-latin.woff2',
  'fonts/unifraktur-maguntia-latin.woff2',
];

const MEDIA_ASSETS = [
  'backgrounds/espring.png',
  'backgrounds/mspring.png',
  'backgrounds/srain.png',
  'backgrounds/mrain.png',
  'backgrounds/storm.png',
  'backgrounds/after.png',
  'backgrounds/summer.png',
  'sounds/chorus.mp3',
  'sounds/storm.mp3',
  'sounds/post.mp3',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CORE).then(c => c.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CORE && k !== MEDIA).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Installed app asks for the full media set (see app.js).
self.addEventListener('message', e => {
  if (e.data !== 'precache-media') return;
  e.waitUntil((async () => {
    const cache = await caches.open(MEDIA);
    for (const asset of MEDIA_ASSETS) {
      if (await cache.match(asset)) continue;
      try { await cache.add(asset); } catch (_) { /* retry next launch */ }
    }
  })());
});

// Slice a cached full response to satisfy an audio Range request.
async function rangedResponse(res, rangeHeader) {
  const buf = await res.arrayBuffer();
  const m = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
  if (!m) return new Response(buf, { headers: res.headers });
  const start = m[1] ? parseInt(m[1], 10) : 0;
  const end   = m[2] ? Math.min(parseInt(m[2], 10), buf.byteLength - 1) : buf.byteLength - 1;
  if (start >= buf.byteLength || start > end) {
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${buf.byteLength}` },
    });
  }
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': res.headers.get('Content-Type') || 'application/octet-stream',
      'Content-Range': `bytes ${start}-${end}/${buf.byteLength}`,
      'Content-Length': String(end - start + 1),
    },
  });
}

// Media: cache-first; on miss, fetch the FULL file (no range header),
// cache it, then answer the original request (sliced if it was ranged).
async function serveMedia(req) {
  const cache = await caches.open(MEDIA);
  let res = await cache.match(req.url);
  if (!res) {
    res = await fetch(req.url);
    if (res.ok) await cache.put(req.url, res.clone());
    else return res;
  }
  const range = req.headers.get('range');
  return range ? rangedResponse(res, range) : res;
}

// App code: try the network (and refresh the cache); fall back to cache offline.
// Redirected responses are never cached — a logged-out visit redirects to the
// unlock page, and that must not overwrite the cached app shell.
async function networkFirst(req, cacheKey) {
  const cache = await caches.open(CORE);
  try {
    const res = await fetch(req);
    if (res.ok && !res.redirected) await cache.put(cacheKey || req, res.clone());
    return res;
  } catch (_) {
    const hit = await cache.match(cacheKey || req);
    if (hit) return hit;
    throw _;
  }
}

// Fonts/icons: cache-first, fill on first use.
async function cacheFirst(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) {
    const cache = await caches.open(CORE);
    await cache.put(req, res.clone());
  }
  return res;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // The unlock flow always goes to the network — never cached, never gated by us.
  if (url.pathname.includes('/api/') || /\/unlock(\.html)?$/.test(url.pathname) || url.pathname.endsWith('unlock.js')) return;

  if (req.mode === 'navigate') {
    e.respondWith(networkFirst(req, './'));
    return;
  }
  if (url.pathname.includes('/sounds/') || url.pathname.includes('/backgrounds/')) {
    e.respondWith(serveMedia(req));
    return;
  }
  if (/\.(css|js)$/.test(url.pathname) || url.pathname.endsWith('manifest.json')) {
    e.respondWith(networkFirst(req));
    return;
  }
  e.respondWith(cacheFirst(req));
});
