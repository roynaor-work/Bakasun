/* Offline shell: the app's own files are cached so it opens without a network. Data is not cached here. */
const CACHE = 'bakasun-v9';
const FILES = ['./', './index.html', './css/app.css', './manifest.json', './icons/icon.svg',
  './js/app.js', './js/i18n.js', './js/store.js', './js/ui.js', './js/voice.js', './js/logic/office.js', './js/logic/core.js', './js/logic/extra.js',
  './js/data/places.js', './js/data/demo.js', './js/screens/today.js', './js/screens/lead.js', './js/screens/cases.js', './js/screens/clients.js',
  './js/screens/calls.js', './js/screens/tasks.js', './js/screens/search.js', './js/screens/settings.js', './js/screens/more.js',
  './js/i18n-more.js', './js/labels.js', './js/cloud.js', './js/logic/quotes.js', './js/logic/groups.js', './js/data/catalog.js', './js/screens/suppliers.js', './js/screens/quotes.js', './js/screens/groups.js', './js/screens/money.js', './js/notes.js', './js/screens/notes.js', './js/data/brand.js', './js/data/defaults.js', './js/logic/commands.js', './js/files.js', './js/screens/assist.js', './js/data/docsList.js', './js/pdfedit.js', './js/screens/portal.js', './js/logic/approvals.js', './js/data/cloudcfg.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
});
