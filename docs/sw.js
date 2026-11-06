// Attendance の Service Worker。オフラインでも前回の表示を出し、通信回復後に更新する。
// API(script.google.com への POST)は一切キャッシュせず、そのまま通す。
var VERSION = 'att-v5';
var CORE = [
  './', 'index.html', 'config.js', 'manifest.webmanifest',
  'assets/app.js', 'assets/style.css', 'assets/logo.png',
  'assets/favicon.png', 'assets/apple-touch-icon.png', 'assets/icon-192.png', 'assets/icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(CORE); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return; // API の POST などは触らない
  var url = new URL(req.url);

  // 別オリジン: API はそのまま通す。Google Fonts だけキャッシュして次回を速くする
  if (url.origin !== location.origin) {
    if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
      e.respondWith(caches.open(VERSION).then(function (c) {
        return c.match(req).then(function (hit) {
          if (hit) return hit;
          return fetch(req).then(function (res) { if (res && res.ok) c.put(req, res.clone()); return res; });
        });
      }));
    }
    return;
  }

  // 同一オリジンの HTML/JS/CSS はネット優先(更新を取りに行き、失敗したらキャッシュ)
  if (req.mode === 'navigate' || /\.(html|js|css)$/.test(url.pathname)) {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(VERSION).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () {
        return caches.match(req).then(function (hit) { return hit || caches.match('index.html'); });
      })
    );
    return;
  }

  // その他(画像など)はキャッシュ優先
  e.respondWith(caches.match(req).then(function (hit) {
    return hit || fetch(req).then(function (res) {
      var copy = res.clone();
      caches.open(VERSION).then(function (c) { c.put(req, copy); });
      return res;
    });
  }));
});
