/* Offline shell: the app's own files are cached so it opens without a network. Data is not cached here. */
const CACHE = 'bakasun-v61';
/*GEN-START (node tools/gen-sw.mjs)*/
const CORE = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-192.png',
  './css/app.css',
  './css/desktop.css',
  './js/app.js',
  './js/cloud.js',
  './js/data/catalog.js',
  './js/data/cloudcfg.js',
  './js/data/defaults.js',
  './js/files.js',
  './js/i18n-extra.js',
  './js/i18n-more.js',
  './js/i18n.js',
  './js/i18n/board.js',
  './js/i18n/budget.js',
  './js/i18n/calendar.js',
  './js/i18n/casefiles.js',
  './js/i18n/contracts.js',
  './js/i18n/dashboard.js',
  './js/i18n/importmail.js',
  './js/i18n/participants.js',
  './js/i18n/personal.js',
  './js/i18n/rfq.js',
  './js/i18n/rules.js',
  './js/i18n/runsheet.js',
  './js/i18n/tasks2.js',
  './js/i18n/templates.js',
  './js/i18n/voice2.js',
  './js/i18n/workgroup.js',
  './js/labels.js',
  './js/lazycss.js',
  './js/logic/approvals.js',
  './js/logic/brief.js',
  './js/logic/cloudLink.js',
  './js/logic/commands.js',
  './js/logic/core.js',
  './js/logic/extra.js',
  './js/logic/groups.js',
  './js/logic/history.js',
  './js/logic/money.js',
  './js/logic/office.js',
  './js/logic/openItems.js',
  './js/logic/print.js',
  './js/logic/receipts.js',
  './js/logic/rfq.js',
  './js/logic/rfqFlow.js',
  './js/logic/translate.js',
  './js/logic/travel.js',
  './js/screens/rfq.js',
  './js/screens/today.js',
  './js/store.js',
  './js/theme-boot.js',
  './js/ui.js'
];
const REST = [
  './css/board.css',
  './css/budget.css',
  './css/calendar.css',
  './css/casefiles.css',
  './css/contracts.css',
  './css/dashboard.css',
  './css/importmail.css',
  './css/participants.css',
  './css/rules.css',
  './css/runsheet.css',
  './css/tasks2.css',
  './css/templates.css',
  './js/calendar.js',
  './js/caseTabs.js',
  './js/contactsImport.js',
  './js/data/brand.js',
  './js/data/checklistTemplates.js',
  './js/data/demo.js',
  './js/data/docsList.js',
  './js/data/helpText.js',
  './js/data/messageTemplates.js',
  './js/data/places.js',
  './js/logic/agenda.js',
  './js/logic/budget.js',
  './js/logic/calendarGrid.js',
  './js/logic/caseFiles.js',
  './js/logic/checklists.js',
  './js/logic/contacts.js',
  './js/logic/contracts.js',
  './js/logic/dashboard.js',
  './js/logic/howto.js',
  './js/logic/ics.js',
  './js/logic/mailImport.js',
  './js/logic/msgTemplates.js',
  './js/logic/nav.js',
  './js/logic/participants.js',
  './js/logic/pipeline.js',
  './js/logic/questions.js',
  './js/logic/questions2.js',
  './js/logic/quotes.js',
  './js/logic/recent.js',
  './js/logic/recurring.js',
  './js/logic/rules.js',
  './js/logic/runsheet.js',
  './js/logic/search.js',
  './js/logic/taskTree.js',
  './js/logic/templates.js',
  './js/logic/trash.js',
  './js/logic/undo.js',
  './js/logic/workdays.js',
  './js/logic/workgroup.js',
  './js/notes.js',
  './js/notify.js',
  './js/papers.js',
  './js/pdfedit.js',
  './js/recbox.js',
  './js/screens/actions.js',
  './js/screens/assist.js',
  './js/screens/board.js',
  './js/screens/budget.js',
  './js/screens/calendar.js',
  './js/screens/calls.js',
  './js/screens/casefiles.js',
  './js/screens/cases.js',
  './js/screens/clients.js',
  './js/screens/contracts.js',
  './js/screens/dashboard.js',
  './js/screens/groups.js',
  './js/screens/help.js',
  './js/screens/importMail.js',
  './js/screens/lead.js',
  './js/screens/money.js',
  './js/screens/more.js',
  './js/screens/notes.js',
  './js/screens/participants.js',
  './js/screens/portal.js',
  './js/screens/quotes.js',
  './js/screens/receipts.js',
  './js/screens/rules.js',
  './js/screens/runsheet.js',
  './js/screens/search.js',
  './js/screens/settings.js',
  './js/screens/share.js',
  './js/screens/suppliers.js',
  './js/screens/tasks.js',
  './js/screens/templates.js',
  './js/screens/workgroup.js',
  './js/signature.js',
  './js/speak.js',
  './js/voice.js'
];
/*GEN-END*/
/* Install caches only what the first screen needs, so the new version is ready quickly. Every other screen is cached in the background
   right after (the page asks with a 'precache' message once it has loaded), so the whole app also works with no network. */
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
async function cacheRest() {
  const c = await caches.open(CACHE);
  for (let i = 0; i < REST.length; i += 6) await Promise.all(REST.slice(i, i + 6).map(async f => { try { if (!(await c.match(f))) await c.add(f); } catch (err) { /* offline now: the next visit completes it */ } }));
}
self.addEventListener('message', e => { if (e.data === 'precache') e.waitUntil(cacheRest()); });
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
