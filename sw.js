/* Offline shell: the app's own files are cached so it opens without a network. Data is not cached here. */
const CACHE = 'bakasun-v56';
const FILES = ['./', './index.html', './css/app.css', './manifest.json', './icons/icon.svg',
  './js/app.js', './js/i18n.js', './js/store.js', './js/ui.js', './js/voice.js', './js/recbox.js', './js/logic/trash.js', './js/logic/agenda.js', './js/logic/nav.js', './js/logic/howto.js', './js/logic/ics.js', './js/calendar.js', './js/speak.js', './js/logic/questions.js', './js/logic/templates.js', './js/screens/actions.js', './js/screens/share.js', './js/contactsImport.js', './js/logic/openItems.js', './js/screens/help.js', './js/data/helpText.js', './js/logic/office.js', './js/logic/core.js', './js/logic/extra.js',
  './js/data/places.js', './js/data/demo.js', './js/screens/today.js', './js/screens/lead.js', './js/screens/cases.js', './js/screens/clients.js',
  './js/screens/calls.js', './js/screens/tasks.js', './js/screens/search.js', './js/screens/settings.js', './js/screens/more.js',
  './js/i18n-more.js', './js/labels.js', './js/cloud.js', './js/logic/quotes.js', './js/logic/groups.js', './js/data/catalog.js', './js/screens/suppliers.js', './js/screens/quotes.js', './js/screens/groups.js', './js/screens/money.js', './js/notes.js', './js/screens/notes.js', './js/data/brand.js', './js/data/defaults.js', './js/logic/commands.js', './js/files.js', './js/screens/assist.js', './js/data/docsList.js', './js/pdfedit.js', './js/screens/portal.js', './js/logic/approvals.js', './js/data/cloudcfg.js', './js/logic/contacts.js', './js/logic/rfq.js', './js/screens/rfq.js', './js/logic/translate.js', './js/data/seedContacts.js', './js/logic/receipts.js', './js/logic/print.js', './js/logic/brief.js', './js/logic/money.js', './js/logic/undo.js', './js/logic/travel.js', './js/logic/recent.js', './js/screens/receipts.js', './css/desktop.css', './css/dashboard.css', './css/calendar.css', './css/participants.css', './css/contracts.css', './js/caseTabs.js', './js/i18n-extra.js', './js/i18n/dashboard.js', './js/i18n/calendar.js', './js/i18n/participants.js', './js/i18n/contracts.js', './js/screens/dashboard.js', './js/screens/calendar.js', './js/screens/participants.js', './js/screens/contracts.js', './js/logic/dashboard.js', './js/logic/calendarGrid.js', './js/logic/history.js', './js/logic/participants.js', './js/logic/contracts.js', './js/logic/checklists.js', './js/signature.js', './js/data/checklistTemplates.js', './js/logic/cloudLink.js', './css/budget.css', './css/runsheet.css', './css/casefiles.css', './css/rules.css', './css/board.css', './js/i18n/budget.js', './js/i18n/runsheet.js', './js/i18n/casefiles.js', './js/i18n/rules.js', './js/i18n/board.js', './js/screens/budget.js', './js/screens/runsheet.js', './js/screens/casefiles.js', './js/screens/rules.js', './js/screens/board.js', './js/logic/budget.js', './js/logic/runsheet.js', './js/logic/caseFiles.js', './js/logic/rules.js', './js/logic/pipeline.js', './js/notify.js', './js/i18n/tasks2.js', './js/i18n/personal.js', './js/i18n/voice2.js', './js/i18n/workgroup.js', './js/logic/workgroup.js', './js/screens/workgroup.js', './js/screens/templates.js', './js/screens/importMail.js', './js/i18n/templates.js', './js/i18n/importmail.js', './js/logic/msgTemplates.js', './js/data/messageTemplates.js', './js/logic/mailImport.js', './css/templates.css', './css/importmail.css', './css/tasks2.css', './js/logic/taskTree.js', './js/logic/recurring.js', './js/logic/workdays.js', './js/logic/search.js', './js/logic/questions2.js'];
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
