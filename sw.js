// ⚠️  Atualize o caminho abaixo com o nome do seu repositório no GitHub
//     Exemplo: se o repo for github.com/seunome/drugcalc → '/drugcalc/'
const REPO = '/anest-tools/';

const CACHE = 'anest-tools-v6';
const ASSETS = [
  REPO,
  REPO + 'index.html',
  REPO + 'js/infusion.js',
  REPO + 'js/mix.js',
  REPO + 'js/scales.js',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // página: rede primeiro, para correções de dose chegarem a quem já instalou
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).then(res => {
      const clone = res.clone();
      caches.open(CACHE).then(c => c.put(REPO, clone));
      return res;
    }).catch(() => caches.match(REPO)));
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => {
      return cached || fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      }).catch(() => Response.error());
    })
  );
});
