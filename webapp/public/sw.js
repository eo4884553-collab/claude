// service worker minimo — so cacheia o "esqueleto" estatico do app (pro Chrome/Android
// aceitar o "adicionar a tela inicial" e pra abrir mais rapido). Os dados de verdade
// sempre vem do Supabase pela rede; isto nao tenta funcionar 100% offline.
//
// Estrategia: network-first. Tenta a rede sempre primeiro (pra pegar o deploy mais
// novo assim que ele existir) e so cai pro cache se a rede falhar (offline de
// verdade) — ao contrario de cache-first, que prendia o app instalado numa versao
// antiga ate um Ctrl+Shift+R manual.
const CACHE = 'piquinzada-shell-v2';
const SHELL = ['/', '/manifest.json', '/pmo-app-template.html', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // nunca intercepta chamadas de API/Supabase (precisam sempre ir pra rede, dados ao vivo)
  if (url.origin !== self.location.origin) return;
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(event.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(event.request))
  );
});
