const CACHE = "home-remote-v8";
const SHELL = [
  "./public-app.html", "./study.html", "./study-model.html", "./styles.css", "./study.css",
  "./config.js", "./remote-app.js", "./study-app.js", "./study-config.js", "./study-scene.js", "./study-model-scene.js",
  "./manifest.webmanifest", "./pwa.js", "./vendor/photon.min.js", "./vendor/three.module.min.js",
  "./vendor/GLTFLoader.js", "./models/study/study.glb", "./models/ritchie-sofa/scene.gltf", "./models/ritchie-sofa/scene.bin",
  "./models/ritchie-sofa/textures/FABRIC_baseColor.jpeg", "./models/ritchie-sofa/textures/FLOOR_baseColor.png",
  "./models/study/chair/scene.gltf", "./models/study/chair/scene.bin", "./models/study/chair/textures/Scene_-_Root_baseColor.png", "./models/study/chair/textures/Scene_-_Root_metallicRoughness.png", "./models/study/chair/textures/Scene_-_Root_normal.png",
  "./models/study/dual-monitor/scene.gltf", "./models/study/dual-monitor/scene.bin", "./models/study/dual-monitor/textures/Monitor.003_baseColor.png", "./models/study/dual-monitor/textures/Monitor_Screen.001_metallicRoughness.png",
  "./models/study/television/scene.gltf", "./models/study/television/scene.bin", "./models/study/rug/carpet-basecolor.jpg",
  "./models/study/outdoor-light/scene.gltf", "./models/study/outdoor-light/scene.bin", "./models/study/outdoor-light/textures/BlackMetal_baseColor.jpeg", "./models/study/outdoor-light/textures/BlackMetal_metallicRoughness.png", "./models/study/outdoor-light/textures/BlackMetal_normal.jpeg", "./models/study/outdoor-light/textures/Material_61_metallicRoughness.png",
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
