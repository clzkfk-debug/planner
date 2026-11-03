/* 서비스 워커: 오프라인에서도 앱이 열리도록 앱 파일을 캐시합니다.
   파일을 수정해 배포할 때는 CACHE 버전 숫자를 올려 주세요. */
const CACHE = 'planner-v9';
const FONT_CACHE = 'planner-fonts';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './habits.js',
  './main.js',
  './fonts/griun-gowoon.ttf',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== FONT_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 글씨체(Google Fonts): 한 번 받으면 계속 캐시에서 사용
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONT_CACHE).then(async cache => {
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
        return res;
      } catch { return new Response('', { status: 504 }); }
    }));
    return;
  }
  if (url.origin !== location.origin) return;

  // 앱 파일: 캐시 우선 + 백그라운드 갱신
  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const network = fetch(req)
        .then(res => { if (res.ok) cache.put(req, res.clone()); return res; })
        .catch(() => null);
      if (cached) { e.waitUntil(network); return cached; }
      const res = await network;
      if (res) return res;
      if (req.mode === 'navigate') return cache.match('./index.html');
      return new Response('', { status: 504 });
    })
  );
});
