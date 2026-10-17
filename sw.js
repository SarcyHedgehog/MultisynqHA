const CACHE = "home-remote-v4";
const SHELL = [
  "./public-app.html", "./study.html", "./study-model.html", "./styles.css", "./study.css",
  "./config.js", "./remote-app.js", "./study-app.js", "./study-config.js", "./study-scene.js", "./study-model-scene.js",
  "./manifest.webmanifest", "./pwa.js", "./vendor/photon.min.js", "./vendor/three.module.min.js",
  "./vendor/GLTFLoader.js", "./models/study/study.glb", "./models/ritchie-sofa/scene.gltf", "./models/ritchie-sofa/scene.bin",
  "./models/ritchie-sofa/textures/FABRIC_baseColor.jpeg", "./models/ritchie-sofa/textures/FLOOR_baseColor.png",
  "./icons/icon-192x192.png", "./icons/icon-512x512.png"
];
self.addEventListener("install", event => event.waitUntil(
  caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting())
));
self.addEventListener("activate", event => event.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim())
));
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request).then(response => {
      if (response.ok && new URL(event.request.url).origin === self.location.origin) {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy));
      }
      return response;
    }).catch(() => caches.match(event.request).then(cached => cached || caches.match("./public-app.html")))
  );
});
