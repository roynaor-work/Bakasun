import test from 'node:test';
import assert from 'node:assert/strict';
import { IndexedDBUploadStore, UploadLock, UploadQueue, VIDEO_CHUNK_BYTES, UPLOAD_TAG, readUploadLog } from '../workout/cam-lab/upload.mjs?v=20261013-frames-1';
import { BackgroundUploads, NEXT_OPEN_MESSAGE } from '../workout/cam-lab/upload-background.mjs?v=20261013-frames-1';
import { uploadIndexedDB } from './helpers/upload-idb.mjs';

const config = { endpoint: 'https://upload.example.invalid/exec', secret: 'synthetic-background-key', consentId: 'synthetic-consent' };
const storePair = () => { const indexedDB = uploadIndexedDB({ legacy: true }); return [new IndexedDBUploadStore({ indexedDB }), new IndexedDBUploadStore({ indexedDB }), indexedDB]; };
const payload = session => ({ session, video: new Blob([new Uint8Array(VIDEO_CHUNK_BYTES * 2 + 11)], { type: 'video/webm' }), skeleton: '{}', diagnostics: '{}' });

test('version 1 upgrades in place; config copy updates, revocation clears it and stale saves cannot resurrect it', async () => {
  const [store, other, indexedDB] = storePair();
  await store.setConfig(config); assert.deepEqual(await other.getConfig(), config);
  assert.ok(indexedDB.versions.every(version => version === 2));
  const changed = { ...config, secret: 'synthetic-replacement', consentId: 'replacement' };
  await other.setConfig(changed); assert.deepEqual(await store.getConfig(), changed);
  assert.equal(await store.putCurrent({ session: 'old', consentId: config.consentId }), false);
  await store.putCurrent({ session: 'new', consentId: changed.consentId });
  await other.revoke(); assert.equal(await store.getConfig(), null); assert.deepEqual(await store.list(), []);
  assert.equal(await store.putCurrent({ session: 'late', consentId: changed.consentId }), false);
});

test('atomic IDB lease excludes two connections, expires, renews, and cannot be released by an old owner', async () => {
  const [store, other] = storePair();
  assert.deepEqual(await Promise.all([store.acquireLease('page', 100, 1000), other.acquireLease('sw', 100, 1000)]), [true, false]);
  assert.equal(await other.acquireLease('sw', 1099, 1000), false);
  assert.equal(await store.renewLease('page', 1099, 1000), true);
  assert.equal(await other.acquireLease('sw', 1100, 1000), false);
  assert.equal(await other.acquireLease('sw', 2099, 1000), true);
  assert.equal(await store.renewLease('page', 2100, 1000), false);
  await store.releaseLease('page'); assert.equal(await store.acquireLease('tab2', 2100, 1000), false);
  await other.releaseLease('sw'); assert.equal(await store.acquireLease('tab2', 2100, 1000), true);
});

test('lease heartbeats stop an expired owner and release on failure', async () => {
  const [store, other] = storePair(); let time = 0, heartbeat, lost = 0, finish;
  const gate = new Promise(resolve => { finish = resolve; });
  const lock = new UploadLock({ store, locks: null, ttl: 90, now: () => time,
    setTimer(fn) { heartbeat = fn; return 1; }, clearTimer() {}, onLost() { lost++; finish(); } });
  const running = lock.run(() => gate);
  while (!heartbeat) await new Promise(resolve => setImmediate(resolve));
  time = 30; heartbeat(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(await other.acquireLease('sw', 91, 90), false);
  time = 121; assert.equal(await other.acquireLease('sw', time, 90), true);
  heartbeat(); await running; assert.equal(lost, 1);
  assert.equal(await store.acquireLease('tab2', 122, 90), false);
  await other.releaseLease('sw');
  await assert.rejects(new UploadLock({ store, locks: null }).run(() => { throw Error('test'); }), /test/);
  assert.equal(await other.acquireLease('after-error', Date.now(), 90), true);
});

test('Web Locks uses the shared tag and a busy worker never enters the sender', async () => {
  let entered = 0;
  const locks = { async request(name, options, callback) {
    assert.equal(name, UPLOAD_TAG); assert.equal(options.ifAvailable, true); return callback(null);
  } };
  const lock = new UploadLock({ locks });
  assert.equal(await lock.run(() => { entered++; }, { ifAvailable: true }), false); assert.equal(entered, 0);
});

test('page retry waits for worker activation and delegates once without starting a page fetch', async () => {
  const [store] = storePair(); let activate, delegated = 0;
  const queue = new UploadQueue({ config, store, fetchImpl: () => { throw Error('page must not post'); } });
  queue.backgroundReady = new Promise(resolve => { activate = resolve; });
  queue.remoteRetry = async () => { delegated++; return true; };
  const first = queue.retry(); assert.equal(queue.retry(), first);
  await queue.ready; assert.equal(delegated, 0); activate();
  assert.equal(await first, true); assert.equal(delegated, 1);
});

test('a bounded drain checkpoints a video chunk; the worker resumes without repeating accepted parts', async () => {
  const [store, other] = storePair(); let time = 0;
  const sent = [], fetchImpl = async (_, options) => {
    const body = JSON.parse(options.body); sent.push([body.part, body.chunk]);
    time += body.part === 'video' ? 25000 : 1000;
    return { ok: true, json: async () => ({ ok: true, assembled: body.chunk === body.chunks - 1, bytes: body.totalBytes }) };
  };
  const page = new UploadQueue({ config, store, locks: null, now: () => time, fetchImpl });
  await page.enqueue(payload('resume'));
  assert.equal(await page.retry({ budgetMs: 85000 }), false);
  assert.deepEqual(sent, [['diagnostics', undefined], ['skeleton', undefined], ['video', 0]]);
  const worker = new UploadQueue({ config: await other.getConfig(), store: other, actor: 'sw', locks: null,
    now: () => time, fetchImpl, persistConfig: false });
  assert.equal(await worker.retry({ budgetMs: 180000 }), true);
  assert.deepEqual(sent.slice(3), [['video', 1], ['video', 2]]); assert.deepEqual(await store.list(), []);
  assert.deepEqual((await readUploadLog(other)).map(event => event.actor), ['page', 'page', 'page', 'sw', 'sw']);
});

test('page and worker queues use the same fallback lease and read checkpoints after acquisition', async () => {
  const [store, other] = storePair(); let entered, finish;
  const started = new Promise(resolve => { entered = resolve; }), gate = new Promise(resolve => { finish = resolve; });
  const sent = [], fetchImpl = async (_, options) => {
    const body = JSON.parse(options.body); sent.push(body.part); entered(); await gate;
    return { ok: true, json: async () => ({ ok: true, assembled: true, bytes: body.totalBytes }) };
  };
  const page = new UploadQueue({ config, store, locks: null, fetchImpl });
  await page.enqueue({ ...payload('concurrent'), video: new Blob(['video']) });
  const active = page.retry(); await started;
  const sw = new UploadQueue({ config, store: other, actor: 'sw', persistConfig: false, locks: null, fetchImpl });
  assert.equal(await sw.retry(), false); finish(); assert.equal(await active, true);
  assert.equal(await sw.retry(), true); assert.deepEqual(sent, ['diagnostics', 'skeleton', 'video']);
});

test('pagehide snapshot waits for the final recorder write; only the final video is uploaded', async () => {
  const [store] = storePair(); let time = 0, finishPause;
  const sent = [], queue = new UploadQueue({ config, store, actor: 'sw', locks: null, now: () => time,
    setTimer(fn, delay) { if (delay === 1000) { finishPause = fn; return 0; } return setTimeout(fn, delay); },
    fetchImpl: async (_, options) => {
      const body = JSON.parse(options.body); sent.push(body);
      return { ok: true, json: async () => ({ ok: true, assembled: true, bytes: body.totalBytes }) };
    } });
  await queue.enqueue({ ...payload('closing'), video: new Blob(['partial']), readyAt: 1000 });
  const sending = queue.retry({ budgetMs: 180000 });
  while (!finishPause) await new Promise(resolve => setImmediate(resolve));
  assert.equal(sent.length, 0);
  await queue.enqueue({ ...payload('closing'), video: new Blob(['final-recording']) });
  time = 1000; finishPause(); assert.equal(await sending, true);
  assert.deepEqual(sent.map(body => body.part), ['diagnostics', 'skeleton', 'video']);
  assert.equal(Buffer.from(sent.at(-1).data, 'base64').toString(), 'final-recording');
});

test('safe IDB journal records sync registration and actors without configuration or raw errors', async () => {
  const [store] = storePair();
  await store.appendLog({ event: 'sync', registered: true, time: 123, actor: 'sw', secret: config.secret, endpoint: config.endpoint });
  assert.deepEqual(await readUploadLog(store), [{ event: 'sync', registered: true, time: 123, actor: 'sw' }]);
});

test('private visits register no worker; unsupported browsers expose the next-open message', async () => {
  let registrations = 0, support; const events = [];
  const navigator = { serviceWorker: { register() { registrations++; } } };
  await new BackgroundUploads({ navigator }).ready; assert.equal(registrations, 0);
  const background = new BackgroundUploads({ navigator: {}, queue: { enabled: true, ready: Promise.resolve(), pending: 1,
    logUpload: async event => events.push(event) }, onSupport: value => { support = value; } });
  await background.ready; assert.equal(await background.schedule(), false);
  assert.equal(events[0].registered, false); assert.ok(events[0].time > 0);
  assert.equal(support, false); assert.equal(NEXT_OPEN_MESSAGE, 'השליחה תמשיך בפתיחה הבאה');
});

test('both lifecycle hooks register the same sync tag, including a write completed after pagehide', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'SyncManager');
  Object.defineProperty(globalThis, 'SyncManager', { configurable: true, value: class {} });
  const handlers = {}, tags = [], log = [];
  const host = { addEventListener(type, handler) { handlers[type] = handler; }, removeEventListener() {} };
  const queue = { enabled: true, ready: Promise.resolve(), pending: 1, logUpload: async event => log.push(event) };
  try {
    const background = new BackgroundUploads({ queue, window: host, document: { ...host, hidden: false },
      navigator: { serviceWorker: { ...host, async register(url, options) {
        assert.match(url, /workout\/upload-sw\.js\?v=20261013-frames-1$/);
        assert.ok(options.scope.endsWith('/workout/')); assert.equal(options.type, 'module'); assert.equal(options.updateViaCache, 'none');
        return { active: {}, sync: { async register(tag) { tags.push(tag); } } };
      } } } });
    await background.ready;
    background.document.hidden = true; handlers.visibilitychange();
    await new Promise(resolve => setImmediate(resolve));
    background.document.hidden = false; handlers.pagehide();
    await new Promise(resolve => setImmediate(resolve));
    await queue.onQueued();
    assert.deepEqual(tags, [UPLOAD_TAG, UPLOAD_TAG, UPLOAD_TAG]);
    assert.ok(log.every(event => event.registered && event.time > 0));
    background.detach();
    let finishSaving, registeredAfterRevocation = 0;
    const revoked = { enabled: true, ready: new Promise(resolve => { finishSaving = resolve; }) };
    const cancelled = new BackgroundUploads({ queue: revoked, navigator: { serviceWorker: { ...host,
      async register() { registeredAfterRevocation++; throw Error('must not register'); } } } });
    revoked.enabled = false; finishSaving(); await cancelled.ready;
    assert.equal(registeredAfterRevocation, 0);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'SyncManager', previous); else delete globalThis.SyncManager;
  }
});
