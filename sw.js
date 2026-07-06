/**
 * sw.js
 * オフラインでもアプリを開けるように、必要なファイルを端末にキャッシュします。
 * 更新がすぐ反映されるよう、通信できるときは常に最新のファイルを取りに行き、
 * 電波が無いときだけキャッシュ（保存しておいたもの）を使う方式にしています。
 */
const CACHE_NAME = "koyomi-cache-v3";
const FILES_TO_CACHE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./js/astro.js",
  "./js/lunar.js",
  "./js/kanshi.js",
  "./js/zassetsu.js",
  "./js/holidays.js",
  "./js/app.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(FILES_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request)
      .then((networkRes) => {
        const clone = networkRes.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return networkRes;
      })
      .catch(() => caches.match(event.request))
  );
});
