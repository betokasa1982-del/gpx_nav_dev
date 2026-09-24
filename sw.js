// GPX Navigator Pro — Service Worker
// Versão do cache: incrementar ao atualizar os arquivos
const CACHE = "gpx-nav-v63-synth-cycle";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css",
  "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js",
  "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
];

// Instalação: pré-cachear recursos essenciais
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => {
      // Tenta cachear cada asset, ignora falhas individuais
      return Promise.allSettled(ASSETS.map(url => cache.add(url)));
    })
  );
  self.skipWaiting();
});

// Ativação: remover caches antigos
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: cache-first para assets locais, network-first para tiles do mapa
self.addEventListener("fetch", e => {
  // Só GET e http(s) — cache.put lança erro com POST/chrome-extension://
  if (e.request.method !== "GET" || !e.request.url.startsWith("http")) return;
  const url = e.request.url;

  // Tiles do mapa: sempre tenta rede, fallback para cache.
  // Fonte única e sem chave: tile.openstreetmap.org. Os antigos endpoints
  // CARTO (basemaps.cartocdn.com) passaram a exigir API key e carimbavam
  // "API KEY REQUIRED" em cada tile — o bump do CACHE apaga os tiles
  // carimbados que ficaram gravados na versão anterior.
  if (url.includes("openstreetmap")) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Demais recursos: cache-first
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      });
    })
  );
});
