import test from 'node:test';
import assert from 'node:assert/strict';
import { UPLOAD_STORAGE_KEY, MAX_UPLOAD_BYTES, initializeUploadConfig, disableUploadConfig,
  createSessionId, UploadQueue, IndexedDBUploadStore, blobToBase64 } from '../workout/cam-lab/upload.mjs';

const config = { endpoint: 'https://upload.example.invalid/receive', secret: 'synthetic-test-key', consentId: 'synthetic-consent' };
const input = (session = '20261010-173000-squats-test') => ({ session,
  video: new Blob(['synthetic-video'], { type: 'video/webm' }), skeleton: '{"frames":[]}', diagnostics: { version: 'test' } });
const goodResponse = () => ({ ok: true, json: async () => ({ ok: true }) });
class MemoryStore {
  constructor() { this.records = new Map(); this.events = []; }
  async put(record) { this.events.push('durable'); this.records.set(record.session, structuredClone(record)); }
  async list() { return [...this.records.values()].map(record => structuredClone(record)); }
  async remove(id) { this.records.delete(id); }
  async clear() { this.records.clear(); }
}
test('browser fetch retains the global receiver when injected into the queue', async () => {
  let calls = 0;
  const queue = new UploadQueue({ config, store:new MemoryStore(), fetchImpl:async function() {
    assert.equal(this,globalThis);calls++;return goodResponse();
  } });
  await queue.enqueue(input());assert.equal(await queue.retry(),true);assert.equal(calls,3);
});
function fakeStorage() {
  const values = new Map(), events = [];
  return { values, events, getItem(key) { events.push('read'); return values.get(key) ?? null; },
    setItem(key, value) { events.push('save'); values.set(key, value); }, removeItem(key) { values.delete(key); } };
}
function setupLink(endpoint = config.endpoint, secret = config.secret, storage = fakeStorage()) {
  const location = { hash: `#upload=${encodeURIComponent(endpoint)}&key=${encodeURIComponent(secret)}`, pathname: '/cam-lab/', search: '?test=1' };
  const history = { state: { navigation: true }, replaceState(state, title, url) {
    storage.events.push('erase'); assert.deepEqual(state, { navigation: true }); assert.equal(url, '/cam-lab/?test=1'); location.hash = '';
  } };
  return { location, history, storage };
}

test('one-time link removes the fragment before reading/saving; key decoding and next-visit consent persist', () => {
  const context = setupLink(config.endpoint, 'synthetic+key&=');
  const result = initializeUploadConfig(context);
  assert.equal(result.error, null); assert.equal(result.config.secret, 'synthetic+key&=');
  assert.equal(context.location.hash, ''); assert.equal(context.storage.events[0], 'erase');
  assert.deepEqual(JSON.parse(context.storage.values.get(UPLOAD_STORAGE_KEY)), result.config);
  const revisit = initializeUploadConfig(context); assert.deepEqual(revisit.config, result.config);
  assert.equal(disableUploadConfig(context.storage), true);
  assert.equal(initializeUploadConfig(context).config, null);
});

test('same setup link preserves queue consent; changed secret grants a different consent id', () => {
  const context = setupLink(); const first = initializeUploadConfig(context).config;
  context.location.hash = `#upload=${encodeURIComponent(config.endpoint)}&key=${config.secret}`;
  assert.equal(initializeUploadConfig(context).config.consentId, first.consentId);
  context.location.hash = `#upload=${encodeURIComponent(config.endpoint)}&key=other-synthetic-key`;
  assert.notEqual(initializeUploadConfig(context).config.consentId, first.consentId);
});

for (const endpoint of ['http://upload.example.invalid/receive', 'javascript:alert(1)', 'data:text/plain,test',
  'https://synthetic:password@example.invalid/', 'https://upload.example.invalid/#private', 'invalid']) {
  test(`invalid upload endpoint is erased and not saved (${endpoint.split(':')[0]})`, () => {
    const context = setupLink(endpoint); const result = initializeUploadConfig(context);
    assert.equal(context.location.hash, ''); assert.equal(result.config, null);
    assert.match(result.error, /קישור השליחה/); assert.equal(context.storage.values.size, 0);
    assert.equal(result.error.includes(endpoint), false); assert.equal(result.error.includes(config.secret), false);
  });
}

test('localhost HTTP works for local tests and duplicate/missing setup fields fail', () => {
  for (const endpoint of ['http://localhost:8765/', 'http://127.0.0.1:8765/', 'http://[::1]:8765/']) {
    assert.equal(initializeUploadConfig(setupLink(endpoint)).error, null);
  }
  for (const hash of ['#key=synthetic', '#upload=https%3A%2F%2Fexample.invalid', '#upload=https%3A%2F%2Fexample.invalid&key=a&key=b']) {
    const context = setupLink(); context.location.hash = hash;
    assert.equal(initializeUploadConfig(context).config, null); assert.equal(context.location.hash, '');
  }
});

test('storage failure never activates upload and fragment is still erased', () => {
  const context = setupLink(); context.storage.setItem = () => { throw new Error('synthetic private detail'); };
  const result = initializeUploadConfig(context); assert.equal(result.config, null); assert.equal(context.location.hash, '');
  assert.equal(result.error.includes('private'), false);
});

test('a blocked localStorage getter is caught after the private hash is erased', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const context = setupLink(); delete context.storage;
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true,
      get() { throw new Error('synthetic blocked storage'); } });
    const result = initializeUploadConfig(context);
    assert.equal(context.location.hash, ''); assert.equal(result.config, null);
    assert.match(result.error, /אחסון/); assert.equal(disableUploadConfig(), false);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  }
});

test('without consent, enqueue and retry perform no persistence and no network operations', async () => {
  const forbidden = () => { throw new Error('should not be called'); };
  const queue = new UploadQueue({ store: { put: forbidden, list: forbidden }, fetchImpl: forbidden });
  assert.equal(await queue.enqueue(input()), false); assert.equal(await queue.retry(), false);
});

test('three files are durable before POST, with exact text/plain contract and no credentials in queue', async () => {
  const store = new MemoryStore(), requests = [], statuses = [];
  const queue = new UploadQueue({ config, store, onStatus: value => statuses.push(value), fetchImpl: async (endpoint, options) => {
    store.events.push('fetch'); assert.equal(store.events[0], 'durable');
    const saved = JSON.stringify([...store.records.values()]); assert.equal(saved.includes(config.secret), false); assert.equal(saved.includes(config.endpoint), false);
    requests.push({ endpoint, options, body: JSON.parse(options.body) }); return goodResponse();
  } });
  await queue.enqueue(input()); assert.equal(requests.length, 0);
  assert.equal(await queue.retry(), true); assert.equal(requests.length, 3); assert.equal(store.records.size, 0);
  assert.deepEqual(requests.map(request => request.body.part), ['video', 'skeleton', 'diagnostics']);
  for (const { endpoint, options, body } of requests) {
    assert.equal(endpoint, config.endpoint); assert.equal(options.method, 'POST'); assert.equal(options.headers['Content-Type'], 'text/plain');
    assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error'); assert.equal(options.referrerPolicy, 'no-referrer');
    assert.deepEqual(Object.keys(body), ['secret', 'session', 'part', 'mime', 'data']); assert.equal(body.secret, config.secret);
  }
  assert.equal(Buffer.from(requests[0].body.data, 'base64').toString(), 'synthetic-video');
  assert.deepEqual(statuses.filter(status => status.state === 'sending').map(status => status.message), ['שולח 1 מתוך 3', 'שולח 2 מתוך 3', 'שולח 3 מתוך 3']);
  assert.equal(statuses.at(-1).message, 'נשלח לבדיקה');
});

test('partial success is durable and next visit retries only unacknowledged files', async () => {
  const store = new MemoryStore(), firstCalls = [], secondCalls = [], statuses = [];
  const first = new UploadQueue({ config, store, onStatus: status => statuses.push(status), fetchImpl: async (_, options) => {
    const body = JSON.parse(options.body); firstCalls.push(body.part);
    if (body.part === 'skeleton') return { ok: true, json: async () => ({ ok: false, error: config.secret + config.endpoint }) };
    return goodResponse();
  } });
  await first.enqueue(input()); assert.equal(await first.retry(), false);
  assert.deepEqual(firstCalls, ['video', 'skeleton']);
  assert.deepEqual([...store.records.values()][0].parts.map(part => part.acked), [true, false, false]);
  assert.equal(JSON.stringify(statuses).includes(config.secret), false); assert.equal(JSON.stringify(statuses).includes(config.endpoint), false);
  const second = new UploadQueue({ config, store, fetchImpl: async (_, options) => { secondCalls.push(JSON.parse(options.body).part); return goodResponse(); } });
  assert.equal(await second.retry(), true); assert.deepEqual(secondCalls, ['skeleton', 'diagnostics']); assert.equal(store.records.size, 0);
});

test('an attempt queued during an active drain is sent immediately by the shared retry', async () => {
  const store = new MemoryStore(), requests = []; let started, resume;
  const observed = new Promise(resolve => { started = resolve; });
  const paused = new Promise(resolve => { resume = resolve; });
  const queue = new UploadQueue({ config, store, fetchImpl: async (_, options) => {
    requests.push(JSON.parse(options.body));
    if (requests.length === 1) { started(); await paused; }
    return goodResponse();
  } });
  await queue.enqueue(input('attempt-A')); const first = queue.retry(); await observed;
  await queue.enqueue(input('attempt-B')); const second = queue.retry(); assert.equal(second, first);
  resume(); assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.deepEqual(requests.map(request => [request.session, request.part]), [
    ['attempt-A', 'video'], ['attempt-A', 'skeleton'], ['attempt-A', 'diagnostics'],
    ['attempt-B', 'video'], ['attempt-B', 'skeleton'], ['attempt-B', 'diagnostics'],
  ]);
  assert.equal(store.records.size, 0);
});

test('a refreshed batch stops after a network failure and waits for a later retry', async () => {
  const store = new MemoryStore(), requests = []; let started, resume;
  const observed = new Promise(resolve => { started = resolve; });
  const paused = new Promise(resolve => { resume = resolve; });
  const queue = new UploadQueue({ config, store, fetchImpl: async (_, options) => {
    const request = JSON.parse(options.body); requests.push(request);
    if (requests.length === 1) { started(); await paused; }
    if (request.session === 'attempt-B') throw new Error('synthetic network failure');
    return goodResponse();
  } });
  await queue.enqueue(input('attempt-A')); const sending = queue.retry(); await observed;
  await queue.enqueue(input('attempt-B')); assert.equal(queue.retry(), sending); resume();
  assert.equal(await sending, false); assert.equal(requests.length, 4);
  assert.deepEqual([...store.records.keys()], ['attempt-B']);
  assert.equal([...store.records.values()][0].parts.some(part => part.acked), false);
});

test('network, malformed server JSON, and HTTP errors retain queued files', async () => {
  for (const fetchImpl of [async () => { throw new Error('synthetic network failure'); },
    async () => ({ ok: true, json: async () => { throw new Error('invalid JSON'); } }),
    async () => ({ ok: false, json: async () => ({ ok: true }) })]) {
    const store = new MemoryStore(), queue = new UploadQueue({ config, store, fetchImpl });
    await queue.enqueue(input()); assert.equal(await queue.retry(), false); assert.equal(store.records.size, 1);
    assert.equal([...store.records.values()][0].parts.some(part => part.acked), false);
  }
});

test('new destination or key cannot send sessions from old consent', async () => {
  const store = new MemoryStore(); await new UploadQueue({ config, store }).enqueue(input());
  let calls = 0;
  const replacement = new UploadQueue({ config: { ...config, endpoint: 'https://other.example.invalid/', consentId: 'new-consent' }, store,
    fetchImpl: async () => { calls++; return goodResponse(); } });
  assert.equal(await replacement.retry(), true); assert.equal(calls, 0); assert.equal(store.records.size, 1);
});

test('revoking consent aborts pending fetch, clears durable files, and blocks all remaining parts', async () => {
  const store = new MemoryStore(); let calls = 0, started;
  const observed = new Promise(resolve => { started = resolve; });
  const queue = new UploadQueue({ config, store, fetchImpl: (_, options) => {
    calls++; started(); return new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted'))));
  } });
  await queue.enqueue(input()); const sending = queue.retry(); await observed; await queue.disable();
  assert.equal(await sending, false); assert.equal(calls, 1); assert.equal(store.records.size, 0);
  assert.equal(await queue.retry(), false); assert.equal(await queue.enqueue(input()), false);
});

test('revocation during a delayed durable write cannot resurrect a queued recording', async () => {
  const store = new MemoryStore(); let resume, started;
  const observed = new Promise(resolve => { started = resolve; });
  store.put = async record => { started(); await new Promise(resolve => { resume = resolve; }); store.records.set(record.session, record); };
  const queue = new UploadQueue({ config, store }); const writing = queue.enqueue(input()); await observed;
  const disabling = queue.disable(); resume(); await disabling; assert.equal(await writing, false); assert.equal(store.records.size, 0);
});

test('40MB is a raw file cap and oversized parts never reach storage or fetch', async () => {
  const store = new MemoryStore(), queue = new UploadQueue({ config, store });
  assert.equal(MAX_UPLOAD_BYTES, 40_000_000);
  const data = input(); data.video = new Blob([new Uint8Array(MAX_UPLOAD_BYTES + 1)], { type: 'video/webm' });
  await assert.rejects(queue.enqueue(data), /40MB/); assert.equal(store.records.size, 0);
  data.video = data.video.slice(0, MAX_UPLOAD_BYTES); assert.equal(await queue.enqueue(data), true);
});

test('a hung network request times out, aborts, and preserves the queued session', async () => {
  const store = new MemoryStore(); let signal;
  const queue = new UploadQueue({ config, store, timeoutMs: 5, fetchImpl: (_, options) => { signal = options.signal; return new Promise(() => {}); } });
  await queue.enqueue(input()); assert.equal(await queue.retry(), false); assert.equal(signal.aborted, true); assert.equal(store.records.size, 1);
});

test('failed durable write never starts a network request', async () => {
  let calls = 0;
  const queue = new UploadQueue({ config, store: { put: async () => { throw new Error('quota'); } }, fetchImpl: async () => { calls++; } });
  await assert.rejects(queue.enqueue(input()), /אחסון/); assert.equal(calls, 0);
});

test('session id uses local date/time, includes exercise and distinguishes attempts in the same second', () => {
  const date = new Date(2026, 9, 10, 17, 30, 2);
  const first = createSessionId('squats', date), second = createSessionId('squats', date);
  assert.match(first, /^20261010-173002-squats-/); assert.notEqual(first, second);
});

test('base64 correctly handles binary bytes beyond the string argument limit', async () => {
  const bytes = Uint8Array.from({ length: 100000 }, (_, index) => index % 256);
  const encoded = await blobToBase64(new Blob([bytes])); assert.deepEqual(new Uint8Array(Buffer.from(encoded, 'base64')), bytes);
});

test('IndexedDB adapter waits for transaction completion and rejects success followed by abort', async () => {
  let transaction, request;
  const db = { transaction() {
    transaction = { objectStore() { return { put() { request = {}; return request; } }; }, abort() { transaction.onabort(); } }; return transaction;
  } };
  const store = new IndexedDBUploadStore(); store.database = Promise.resolve(db);
  let settled = false;
  const writing = store.put(input()).then(() => { settled = true; }); await Promise.resolve(); await Promise.resolve();
  request.result = 'saved'; request.onsuccess(); await Promise.resolve(); assert.equal(settled, false);
  transaction.oncomplete(); await writing; assert.equal(settled, true);
  const failed = store.put(input()); await Promise.resolve(); await Promise.resolve();
  request.onsuccess(); transaction.onabort(); await assert.rejects(failed, /אחסון/);
});
