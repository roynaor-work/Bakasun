/* Offline shell: the app's own files are cached so it opens without a network. Data is not cached here. */
const CACHE = 'bakasun-v37';
const FILES = ['./', './index.html', './css/app.css', './manifest.json', './icons/icon.svg',
  './js/app.js', './js/i18n.js', './js/store.js', './js/ui.js', './js/voice.js', './js/recbox.js', './js/logic/trash.js', './js/logic/agenda.js', './js/logic/nav.js', './js/logic/howto.js', './js/logic/ics.js', './js/calendar.js', './js/speak.js', './js/logic/questions.js', './js/screens/actions.js', './js/screens/share.js', './js/contactsImport.js', './js/logic/openItems.js', './js/screens/help.js', './js/data/helpText.js', './js/logic/office.js', './js/logic/core.js', './js/logic/extra.js',
  './js/data/places.js', './js/data/demo.js', './js/screens/today.js', './js/screens/lead.js', './js/screens/cases.js', './js/screens/clients.js',
  './js/screens/calls.js', './js/screens/tasks.js', './js/screens/search.js', './js/screens/settings.js', './js/screens/more.js',
  './js/i18n-more.js', './js/labels.js', './js/cloud.js', './js/logic/quotes.js', './js/logic/groups.js', './js/data/catalog.js', './js/screens/suppliers.js', './js/screens/quotes.js', './js/screens/groups.js', './js/screens/money.js', './js/notes.js', './js/screens/notes.js', './js/data/brand.js', './js/data/defaults.js', './js/logic/commands.js', './js/files.js', './js/screens/assist.js', './js/data/docsList.js', './js/pdfedit.js', './js/screens/portal.js', './js/logic/approvals.js', './js/data/cloudcfg.js', './js/logic/contacts.js', './js/logic/rfq.js', './js/screens/rfq.js', './js/logic/translate.js', './js/data/seedContacts.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
/* Share target: a contact (.vcf) from WhatsApp, a photo from the gallery, a text from any app lands here as a POST.
   The files are parked in their own cache and the app opens on #/share to sort them. */
self.addEventListener('fetch', e => {
  if (e.request.method === 'POST' && new URL(e.request.url).pathname.endsWith('/share')) {
    e.respondWith((async () => {
      try {
        const fd = await e.request.formData();
        const c = await caches.open('bakasun-share');
        const stamp = Date.now();
        const items = [];
        const files = fd.getAll('files');
        for (let i = 0; i < files.length; i++) { const f = files[i]; if (!f || !f.size) continue; const key = './share-item/' + stamp + '-' + i; await c.put(key, new Response(f, { headers: { 'Content-Type': f.type || 'application/octet-stream' } })); items.push({ key, name: f.name || ('file' + i), type: f.type || '', size: f.size }); }
        const text = [fd.get('title'), fd.get('text'), fd.get('url')].filter(Boolean).join('\n');
        if (text) items.push({ key: '', name: '', type: 'text/plain', text });
        const prev = await c.match('./share-index'); let list = []; try { list = prev ? await prev.json() : []; } catch (err) { list = []; }
        await c.put('./share-index', new Response(JSON.stringify(list.concat(items)), { headers: { 'Content-Type': 'application/json' } }));
      } catch (err) { /* nothing to park */ }
      return Response.redirect(new URL('./index.html#/share', self.registration.scope).href, 303);
    })());
    return;
  }
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
});
