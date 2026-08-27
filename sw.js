/* ============================================================
   DNM Agency Management — Service Worker
   Estrategia: NETWORK-FIRST con respaldo en caché.
   -> Cada despliegue nuevo se ve de inmediato si hay internet;
      si no hay red, se usa la última versión guardada.

   IMPORTANTE: sube el número de versión (v1 -> v2 -> ...) cada vez
   que cambies el código, para forzar que se limpie el caché viejo.
   ============================================================ */
const CACHE_NAME = "dnm-agency-v76";

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./icons/isotipo.png",
  "./icons/isotipo-white.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/favicon-64.png",
  "./icons/apple-touch-icon.png"
];

// Instalar: precargar el esqueleto
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

// Activar: borrar cachés de versiones anteriores
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Interceptar peticiones — STALE-WHILE-REVALIDATE
// Sirve al instante lo cacheado (arranque rápido) y actualiza en segundo plano.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // deja pasar CDN, Supabase, fuentes

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; })
        .catch(() => null);
      // Si hay copia en caché, la devuelve YA (rápido) y actualiza atrás;
      // si no, espera a la red; si tampoco, cae al index.
      return cached || (await network) || cache.match("./index.html");
    })
  );
});
