import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import vm from 'node:vm';

const appFile = path => pathToFileURL(resolve(process.cwd(), path));
const upload = await import(appFile('workout/cam-lab/upload.mjs'));
const { approvedUploadEndpoint, APPROVED_UPLOAD_ENDPOINTS } = await import(appFile('workout/cam-lab/upload-endpoints.mjs'));
const { createLearningVoice } = await import(appFile('workout/island/learning/voice.mjs'));
const { canListen, listenCount } = await import(appFile('workout/js/count.js'));

const endpoint = 'https://upload.example.invalid/ingest';
const endpoints = [endpoint];
const token = 'synthetic-test-value';
const localStorage = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key) };
};
const read = (storage, context, extras = {}) => upload.initializeUploadConfig({
  storage, context, endpoints, location: { hash: '' }, ...extras,
});
function link(storage, context, url, options = {}) {
  const location = { pathname: '/app/', search: '', hash: '#' + new URLSearchParams({ upload: url, key: token }) };
  const result = upload.initializeUploadConfig({
    storage, context, endpoints, location, history: { replaceState() { location.hash = ''; } },
    ...options,
  });
  assert.equal(location.hash, '');
  return result;
}

test('camera endpoint policies are exact and the shipped policy requires deployment configuration', () => {
  assert.deepEqual(APPROVED_UPLOAD_ENDPOINTS, []);
  assert.equal(approvedUploadEndpoint(endpoint, endpoints), endpoint);
  for (const variant of [
    '/another-path', '?mode=alternate', '#marker', ':8443/ingest', 'http://upload.example.invalid/ingest',
    'https://another.example.invalid/ingest', 'https://upload.example.invalid/other',
  ]) {
    const url = variant.includes('://') ? variant : endpoint + variant;
    assert.equal(approvedUploadEndpoint(url, endpoints), null);
  }
  const storage = localStorage();
  let prompts = 0;
  const result = link(storage, 'lab', endpoint, { endpoints: undefined, approve: () => { prompts++; return true; } });
  assert.equal(result.config, null);
  assert.equal(prompts, 0);
  assert.equal(storage.getItem(upload.UPLOAD_CONTEXTS.lab.key), null);
});

test('explicit, expiring consent is isolated between the lab and workout', () => {
  const storage = localStorage();
  storage.setItem('camlab.upload', JSON.stringify({ endpoint, secret: token, consentId: 'old' }));
  assert.equal(read(storage, 'workout').config, null);
  assert.equal(read(storage, 'lab').config, null);
  assert.equal(link(storage, 'lab', endpoint).config, null);
  const when = Date.now();
  const lab = link(storage, 'lab', endpoint, { approve: value => value === endpoint, now: () => when }).config;
  assert.equal(lab.expiresAt, when + upload.CONSENT_TTL_MS);
  assert.deepEqual(read(storage, 'lab').config, lab);
  assert.equal(read(storage, 'workout').config, null);
  const workout = link(storage, 'workout', endpoint, { approve: () => true }).config;
  assert.notEqual(workout.consentId, lab.consentId);
  assert.notEqual(upload.UPLOAD_CONTEXTS.workout.database, upload.UPLOAD_CONTEXTS.lab.database);
  assert.notEqual(upload.UPLOAD_CONTEXTS.workout.tag, upload.UPLOAD_CONTEXTS.lab.tag);
  assert.equal(upload.disableUploadConfig(storage, 'workout'), true);
  assert.equal(read(storage, 'workout').config, null);
  assert.equal(read(storage, 'lab', { now: () => lab.expiresAt }).config, null);
  assert.deepEqual(read(storage, 'lab').config, lab);
});

test('a page or worker with a revoked or expired grant never calls fetch', async () => {
  const storage = localStorage();
  const approved = link(storage, 'lab', endpoint, { approve: () => true }).config;
  const record = { session: 'synthetic-attempt', consentId: approved.consentId, parts: [] };
  for (const actor of ['page', 'sw']) {
    const fetchImpl = () => assert.fail('unexpected upload');
    const store = { list: async () => [record], getConfig: async () => null };
    const queue = new upload.UploadQueue({ config: approved, endpoints, store, actor, fetchImpl, persistConfig: false });
    record.parts = [{ part: 'diagnostics', blob: new Blob(['{}']), mime: 'application/json' }];
    assert.equal(await queue.retry(), false);
    const expired = new upload.UploadQueue({
      config: { ...approved, expiresAt: Date.now() - 1 }, endpoints, store, actor, fetchImpl,
    });
    assert.equal(expired.enabled, false);
    assert.equal(await expired.retry(), false);
  }
});

test('root worker only caches public shell responses at the exact scoped URL', async () => {
  const listeners = new Map(), cache = new Map();
  const scope = 'https://app.example.invalid/project/';
  const cacheApi = {
    open: async () => ({
      match: async request => cache.get(request.url),
      put: async (request, value) => cache.set(request.url ?? request, value),
      delete: async request => cache.delete(request.url),
    }),
  };
  let response, offline = false;
  vm.runInNewContext(await readFile(appFile('sw.js'), 'utf8'), {
    URL, Headers, Response, caches: cacheApi,
    self: { registration: { scope }, addEventListener: (event, fn) => listeners.set(event, fn) },
    fetch: async () => { if (offline) throw new Error('offline'); return response; },
  });
  function check(path, headers) {
    let promise;
    const request = { url: new URL(path, scope).href, method: 'GET', headers: new Headers(headers) };
    listeners.get('fetch')({ request, respondWith: result => { promise = result; } });
    return promise;
  }
  const shellURL = new URL('index.html', scope).href;
  response = { url: shellURL, status: 200, type: 'basic', headers: new Headers(), clone: () => response };
  for (const path of ['other.json', 'workout/index.html', 'index.html?query=marker', '/index.html']) {
    assert.equal(check(path), undefined);
  }
  assert.equal(check('index.html', { Authorization: 'synthetic' }), undefined);
  assert.equal(await check('index.html'), response);
  assert.ok(cache.has(shellURL));
  offline = true;
  assert.equal(await check('index.html'), response);
  offline = false;
  response = { ...response, headers: new Headers({ 'Cache-Control': 'private, no-store' }) };
  await check('index.html');
  assert.equal(cache.has(shellURL), false);
});

test('speech recognition requires an installed local language and TTS ignores remote voices', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'SpeechRecognition');
  let installed = 'unavailable', starts = 0, aborted = 0;
  class Recognition {
    get processLocally() { return this.local; }
    set processLocally(value) { this.local = value; }
    start() { assert.equal(this.local, true); starts++; }
    abort() { aborted++; }
    static async available(options) {
      assert.deepEqual(options, { langs: ['he-IL'], processLocally: true });
      return installed;
    }
  }
  try {
    globalThis.SpeechRecognition = class { start() { assert.fail('remote recognition'); } };
    assert.equal(canListen(), false);
    assert.equal(listenCount(() => {}), null);
    globalThis.SpeechRecognition = Recognition;
    assert.ok(canListen());
    listenCount(() => {});
    await Promise.resolve();
    assert.equal(starts, 0);
    installed = 'available';
    const stop = listenCount(() => {});
    await Promise.resolve();
    assert.equal(starts, 1);
    stop();
    assert.equal(aborted, 1);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'SpeechRecognition', previous);
    else delete globalThis.SpeechRecognition;
  }
  const voice = createLearningVoice({ Utterance: class {}, synthesis: {
    getVoices: () => [{ lang: 'he-IL', localService: false }],
    speak: () => assert.fail('remote voice'),
  } });
  assert.equal(voice.speak('טקסט בדיקה'), false);
  voice.dispose();
});
