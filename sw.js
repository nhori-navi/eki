// 鉄道のひろがり（/eki/）のサービスワーカー
// 同じアドレスのほかのアプリとキャッシュ置き場を共有しているので、"eki" で始まるものだけを扱う
const CACHE = 'eki-v8';
const SHELL = ['./', './index.html', './app.js?v=8', './rails.json?v=8', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(k => k.startsWith('eki') && k !== CACHE).map(k => caches.delete(k))
  )).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin === location.origin && url.pathname.startsWith('/eki/')) {
    // 自分のファイルは「まずネット、だめなら保存分」
    e.respondWith(fetch(e.request).then(r => {
      const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r;
    }).catch(() => caches.match(e.request)));
  } else if (url.hostname === 'cdnjs.cloudflare.com') {
    // 地図ライブラリは「まず保存分」
    e.respondWith(caches.match(e.request).then(m => m || fetch(e.request).then(r => {
      const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r;
    })));
  }
  // 地図タイルはそのまま通す
});
