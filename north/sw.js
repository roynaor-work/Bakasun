/* מטמון לגופנים ולתמונות בלבד (שמות הקבצים משתנים כשהתוכן משתנה: v2, v3, s). HTML, CSS ו-JS תמיד מהרשת, כדי שפרסום חדש יעלה מיד. */
const CACHE = 'north-assets-v2';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || !/\/north\/(fonts|img)\//.test(u.pathname)) return;
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(e.request); if (hit) return hit;
    const r = await fetch(e.request); if (r.ok) c.put(e.request, r.clone()); return r;
  }));
});
