/* Service worker: chơi offline được, nhưng LUÔN ưu tiên bản mới nhất khi có mạng.
   - HTML/JS/manifest: network-first (có mạng -> lấy bản mới & cập nhật cache; mất mạng -> dùng cache)
   - Ảnh/icon: cache-first, cập nhật nền
   - Không đụng tới request khác domain (Firebase, Google, Facebook) và đường dẫn /__/ của Firebase Hosting
   Đổi VERSION mỗi lần phát hành để dọn cache cũ. */
const VERSION = '2026-10-06.1';
const CACHE = 'stone-balance-' + VERSION;
const PRECACHE = [
  './', './index.html', './stone-balance.html', './manifest.webmanifest',
  './firebase-config.js', './online.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './icons/favicon-32.png'
];

self.addEventListener('install', e => {
  // cache từng file riêng: thiếu một file (vd. bản trong app không có stone-balance.html) không làm hỏng cả SW
  e.waitUntil(caches.open(CACHE)
    .then(c => Promise.allSettled(PRECACHE.map(u => c.add(new Request(u, {cache: 'reload'})))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k.startsWith('stone-balance-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function isCode(req, url) {
  return req.mode === 'navigate' || /\.(html|js|webmanifest|json)$/.test(url.pathname) || url.pathname.endsWith('/');
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req, {cache: 'no-cache'});
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req, {ignoreSearch: true});
    if (hit) return hit;
    if (req.mode === 'navigate') {
      return (await cache.match('./index.html')) || (await cache.match('./stone-balance.html')) || Response.error();
    }
    throw err;
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  const update = fetch(req).then(res => { if (res && res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
  return hit || (await update) || Response.error();
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;     // Firebase/Google/Facebook: để trình duyệt tự xử lý
  if (url.pathname.startsWith('/__/')) return;          // trang xử lý đăng nhập của Firebase Hosting
  if (url.pathname.endsWith('/auth.html')) return;      // trang đăng nhập cho app: không bao giờ cache
  e.respondWith(isCode(req, url) ? networkFirst(req) : cacheFirst(req));
});
