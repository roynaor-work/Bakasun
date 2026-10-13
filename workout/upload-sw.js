import { IndexedDBUploadStore, UploadQueue, UPLOAD_TAG } from './cam-lab/upload.mjs?v=20261012-background-1';

// Uploads only: deliberately no fetch listener and no CacheStorage.
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
let queue, running;
self.addEventListener('message', event => {
  if (event.data?.type === 'camlab-upload-revoked') event.waitUntil(queue?.disable() || Promise.resolve());
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
    if (new URL(client.url).pathname.startsWith(new URL(self.registration.scope).pathname))
      client.postMessage({ type: 'camlab-upload-status', status });
  }
}
async function upload() {
  const store = new IndexedDBUploadStore(), config = await store.getConfig();
  if (!config) return false;
  queue = new UploadQueue({ config, store, actor: 'sw', persistConfig: false, onStatus: status => { void notify(status).catch(() => {}); } });
  // Chrome limits a sync event's lifetime. Reserve time for the final request
  // and checkpoint, then yield remaining chunks to another event.
  await queue.retry({ budgetMs: 180000 });
  if (!(await store.getConfig()) || !(await store.list()).some(record => record.consentId === config.consentId)) { queue = null; return true; }
  if (queue.pausedForBudget) {
    await self.registration.sync.register(UPLOAD_TAG);
    await queue.logUpload({ event: 'sync', time: Date.now(), registered: true });
  }
  queue = null;
  return false;
}
self.addEventListener('sync', event => {
  if (event.tag === UPLOAD_TAG) {
    // Busy locks and network errors use Chrome's retry backoff. Re-register only
    // for a budget continuation, avoiding a tight loop of unsuccessful events.
    event.waitUntil(startUpload().then(ok => { if (!ok) throw new Error('Upload pending'); }));
  }
});
