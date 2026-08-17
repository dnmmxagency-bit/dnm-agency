/* ============================================================
   DNM Agency Management — Service Worker
   Estrategia: NETWORK-FIRST con respaldo en caché.
   -> Cada despliegue nuevo se ve de inmediato si hay internet;
      si no hay red, se usa la última versión guardada.

   IMPORTANTE: sube el número de versión (v1 -> v2 -> ...) cada vez
   que cambies el código, para forzar que se limpie el caché viejo.
   ============================================================ */
const CACHE_NAME = "dnm-agency-v3";

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./icons/isotipo.png",
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

// Interceptar peticiones
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Solo GET; nada de Supabase/APIs ni otros métodos
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // deja pasar CDN, Supabase, fuentes

  event.respondWith(
    fetch(req)
      .then((res) => {
        // Guarda una copia fresca en caché
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(async () => {
        // Sin red: usa el caché; si es navegación, cae al index
        const cached = await caches.match(req);
        return cached || caches.match("./index.html");
      })
  );
});
