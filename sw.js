/* ============================================================
   DNM Agency Management — Service Worker
   Estrategia:
   - index.html, app.js, style.css y manifest: NETWORK-FIRST
     (cada despliegue se ve de inmediato; sin red, la copia guardada).
   - Íconos y demás estáticos: caché primero (casi nunca cambian).

   IMPORTANTE: sube el número de versión junto con APP_VERSION en
   app.js cada vez que cambies el código.
   ============================================================ */
const CACHE_NAME = "dnm-agency-v99";

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

// Instalar: precargar el esqueleto saltándose la caché HTTP del navegador
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS.map((u) => new Request(u, { cache: "reload" }))))
      .catch(() => {})
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

const isAppShell = (req, url) =>
  req.mode === "navigate" || /\/$|\.(html|js|css|json)$/.test(url.pathname);

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // deja pasar CDN, Supabase, fuentes

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      if (isAppShell(req, url)) {
        // NETWORK-FIRST: código siempre al día
        try {
          const res = await fetch(req, { cache: "no-cache" });
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        } catch (_) {
          return (await cache.match(req)) || cache.match("./index.html");
        }
      }
      // CACHE-FIRST para estáticos
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      } catch (_) {
        return cache.match("./index.html");
      }
    })
  );
});
