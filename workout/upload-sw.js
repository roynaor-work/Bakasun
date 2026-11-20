import { IndexedDBUploadStore, UploadQueue, UPLOAD_CONTEXTS } from './cam-lab/upload.mjs?v=20261013-frames-1';

// Uploads only: deliberately no fetch listener and no CacheStorage.
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
const context = new URL(self.location.href).searchParams.get('app');
const uploadContext = context === 'lab' || context === 'workout' ? UPLOAD_CONTEXTS[context] : null;
const inApp = client => {
  if (!client?.url || !uploadContext) return false;
  const url = new URL(client.url);
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin) return false;
  return context === 'lab' ? url.pathname.startsWith(scope.pathname) :
    url.pathname === scope.pathname || url.pathname === scope.pathname + 'index.html';
};
let queue, running;
self.addEventListener('message', event => {
  if (event.data?.app !== context || !inApp(event.source)) return;
  if (event.data?.type === 'camlab-upload-revoked') queue?.stop();
  if (event.data?.type === 'camlab-upload-start') event.waitUntil(startUpload().then(ok => {
    event.ports[0]?.postMessage({ ok });
  }).catch(() => { event.ports[0]?.postMessage({ ok: false }); }));
});
function startUpload() {
  running ||= upload().finally(() => { running = null; });
  return running;
}
async function notify(status) {
  for (const client of await self.clients.matchAll({ type: 'window', includeUncontrolled: true })) {
    if (inApp(client)) client.postMessage({ type: 'camlab-upload-status', app: context, status });
  }
}
async function upload() {
  const store = new IndexedDBUploadStore({ context }), config = await store.getConfig();
  if (!config) return false;
  queue = new UploadQueue({ config, store, context, actor: 'sw', persistConfig: false, onStatus: status => { void notify(status).catch(() => {}); } });
  // Chrome limits a sync event's lifetime. Reserve time for the final request
  // and checkpoint, then yield remaining chunks to another event.
  await queue.retry({ budgetMs: 180000 });
  if (!(await store.getConfig()) || !(await store.list()).some(record => record.consentId === config.consentId)) { queue = null; return true; }
  if (queue.pausedForBudget) {
    await self.registration.sync.register(uploadContext.tag);
    await queue.logUpload({ event: 'sync', time: Date.now(), registered: true });
  }
  queue = null;
  return false;
}
self.addEventListener('sync', event => {
  if (event.tag === uploadContext?.tag) {
    // Busy locks and network errors use Chrome's retry backoff. Re-register only
    // for a budget continuation, avoiding a tight loop of unsuccessful events.
    event.waitUntil(startUpload().then(ok => { if (!ok) throw new Error('Upload pending'); }));
  }
});
