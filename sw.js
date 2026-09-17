// Service worker mínimo — só existe para permitir "Instalar app" no navegador.
// O app depende de dados ao vivo (login e banco de dados), então não faz cache
// de páginas ou respostas de /api/*: cada carregamento busca a versão atual.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
