export const UPLOAD_STORAGE_KEY = 'camlab.upload';
export const MAX_UPLOAD_BYTES = 40_000_000;
export const UPLOAD_PARTS = ['diagnostics', 'skeleton', 'video'];
export const VIDEO_CHUNK_BYTES = 1_572_864;
export const UPLOAD_LOG_KEY = 'camlab.upload.log';
export const RETRY_DELAYS_MS = [2000, 5000, 15000];
export const UPLOAD_TAG = 'camlab-upload';
export const UPLOAD_DB_VERSION = 2;
export const UPLOAD_VERSION = '20261012-background-1';
const storageError = 'לא ניתן לשמור את ההגדרה במכשיר. אפשרו אחסון באתר ופתחו שוב את קישור ההגדרה.';
const queueError = 'לא ניתן לשמור את הניסיון במכשיר. פנו מקום באחסון ונסו שוב; הניסיון עדיין לא נשלח.';
const sendError = 'השליחה לבדיקה נכשלה';
const partNames = { diagnostics: 'אבחון', skeleton: 'שלד', video: 'וידאו' };
const errorCodes = new Set(['size-mismatch', 'chunk-fields', 'chunk-data', 'secret', 'network', 'timeout', 'response', 'redirect', 'storage']);
class UploadError extends Error {
  constructor(code) { super(errorCodes.has(code) ? code : 'response'); this.code = this.message; }
}
export function requestTimeoutMs(bodyBytes) {
  return Math.max(60000, 20000 + 15000 * bodyBytes / 1_000_000);
}
export function safeUploadLog(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.slice(-30).filter(e => e && (e.event === 'sync' || /^[a-zA-Z0-9-]{1,160}$/.test(e.session) && UPLOAD_PARTS.includes(e.part)))
      .map(e => e.event === 'sync' ? { event: 'sync', time: Number(e.time) || 0,
        actor: e.actor === 'sw' ? 'sw' : 'page', registered: e.registered === true } : ({ actor: e.actor === 'sw' ? 'sw' : 'page',
        time: Number(e.time) || 0, session: e.session, part: e.part, chunk: Number.isInteger(e.chunk) ? e.chunk : null,
        bytes: Number(e.bytes) || 0, bodyBytes: Number(e.bodyBytes) || 0, durationMs: Number(e.durationMs) || 0,
        ...(e.result === 'stored' || e.result === 'assembled' || e.result === 'duplicate' ? { result: e.result } :
          { error: errorCodes.has(e.error) ? e.error : 'response' }) }));
}
export async function readUploadLog(store = new IndexedDBUploadStore()) {
  try { return safeUploadLog(await store.readLog()); } catch { return []; }
}
const uniqueToken = () => globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

function validEndpoint(value) {
  if (typeof value !== 'string' || value.length > 4096) return null;
  try {
    const url = new URL(value);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) || url.username || url.password || url.hash) return null;
    return url.href;
  } catch { return null; }
}
function validConfig(value) {
  const endpoint = validEndpoint(value?.endpoint);
  return endpoint && typeof value.secret === 'string' && value.secret.length > 0 && value.secret.length <= 4096 &&
    typeof value.consentId === 'string' && value.consentId.length > 0 && value.consentId.length <= 128 ?
    { endpoint, secret: value.secret, consentId: value.consentId } : null;
}

// The fragment is erased before parsing or storage access. Neither errors nor
// queue records contain the endpoint or the secret from the parent's link.
export function initializeUploadConfig({ location = globalThis.location, history = globalThis.history, storage } = {}) {
  const params = new URLSearchParams(location?.hash?.replace(/^#/, '') || '');
  const configuring = params.has('upload') || params.has('key');
  if (configuring) {
    try { history.replaceState(history.state, '', `${location.pathname || ''}${location.search || ''}`); }
    catch {
      try { location.hash = ''; }
      catch { return { config: null, error: 'לא ניתן להסיר את מפתח השליחה מהכתובת. סגרו את הדף ופתחו אותו מחדש.' }; }
    }
  }
  try {
    storage ??= globalThis.localStorage;
    let previous = null;
    try { previous = validConfig(JSON.parse(storage?.getItem(UPLOAD_STORAGE_KEY) || 'null')); } catch { /* Invalid saved settings do not grant consent. */ }
    if (!configuring) return { config: previous, error: null };
    const endpoint = validEndpoint(params.get('upload')), secret = params.get('key');
    if (!endpoint || !secret || secret.length > 4096 || params.getAll('upload').length !== 1 || params.getAll('key').length !== 1) {
      return { config: null, error: 'קישור השליחה אינו תקין. נדרשים כתובת HTTPS ומפתח בדיקה.' };
    }
    const config = { endpoint, secret, consentId: previous?.endpoint === endpoint && previous.secret === secret ? previous.consentId : uniqueToken() };
    if (!storage?.setItem) return { config: null, error: storageError };
    storage.setItem(UPLOAD_STORAGE_KEY, JSON.stringify(config));
    return { config, error: null };
  } catch { return { config: null, error: storageError }; }
}

export function disableUploadConfig(storage) {
  try { (storage || globalThis.localStorage)?.removeItem(UPLOAD_STORAGE_KEY); return true; }
  catch { return false; }
}

let sessionSequence = 0;
export function createSessionId(exercise, date = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  const day = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  const name = String(exercise).replace(/[^a-z0-9-]/g, '').slice(0, 40) || 'exercise';
  return `${day}-${time}-${name}-${++sessionSequence}-${uniqueToken().slice(0, 8)}`;
}

// Resolve writes on transaction completion, not request success: a request can
// succeed and the surrounding transaction can still abort (quota, disk, etc.).
export class IndexedDBUploadStore {
  constructor({ indexedDB = globalThis.indexedDB, name = 'camlab.upload.queue' } = {}) {
    this.indexedDB = indexedDB; this.name = name; this.database = null;
  }
  open() {
    if (!this.database) this.database = new Promise((resolve, reject) => {
      if (!this.indexedDB) { reject(new Error(queueError)); return; }
      const request = this.indexedDB.open(this.name, UPLOAD_DB_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('sessions')) request.result.createObjectStore('sessions', { keyPath: 'session' });
        if (!request.result.objectStoreNames.contains('state')) request.result.createObjectStore('state');
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); this.database = null; };
        resolve(db);
      };
      request.onerror = () => { this.database = null; reject(new Error(queueError)); };
      request.onblocked = () => { this.database = null; reject(new Error(queueError)); };
    });
    return this.database;
  }
  async transaction(mode, operation, name = 'sessions') {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      let result;
      const tx = db.transaction(name, mode);
      tx.oncomplete = () => resolve(result);
      tx.onabort = tx.onerror = () => reject(new Error(queueError));
      try {
        const request = operation(tx.objectStore(name));
        if (request) request.onsuccess = () => { result = request.result; };
      } catch { try { tx.abort(); } catch { /* Already aborted. */ } reject(new Error(queueError)); }
    });
  }
  put(record) { return this.transaction('readwrite', store => store.put(record)); }
  list() { return this.transaction('readonly', store => store.getAll()); }
  remove(session) { return this.transaction('readwrite', store => store.delete(session)); }
  clear() { return this.transaction('readwrite', store => store.clear()); }
  getConfig() { return this.transaction('readonly', store => store.get(UPLOAD_STORAGE_KEY), 'state').then(validConfig); }
  setConfig(config) { return this.transaction('readwrite', store => validConfig(config) ?
    store.put(validConfig(config), UPLOAD_STORAGE_KEY) : store.delete(UPLOAD_STORAGE_KEY), 'state'); }
  readLog() { return this.transaction('readonly', store => store.get(UPLOAD_LOG_KEY), 'state'); }
  // All read/modify/write operations run in a single serialized IDB transaction.
  async updateState(key, update) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      let result;
      const tx = db.transaction('state', 'readwrite'), store = tx.objectStore('state');
      tx.oncomplete = () => resolve(result);
      tx.onabort = tx.onerror = () => reject(new UploadError('storage'));
      const request = store.get(key);
      request.onsuccess = () => {
        try {
          const next = update(request.result); result = next.result;
          if (next.value === null) store.delete(key);
          else if (next.value !== undefined) store.put(next.value, key);
        } catch { tx.abort(); }
      };
    });
  }
  appendLog(event) { return this.updateState(UPLOAD_LOG_KEY, entries => {
    const log = safeUploadLog([...(entries || []), event]); return { value: log, result: log };
  }); }
  acquireLease(owner, now, ttl) { return this.updateState(UPLOAD_TAG, lease => !lease || lease.expires <= now || lease.owner === owner ?
    { value: { owner, expires: now + ttl }, result: true } : { result: false }); }
  renewLease(owner, now, ttl) { return this.updateState(UPLOAD_TAG, lease => lease?.owner === owner && lease.expires > now ?
    { value: { owner, expires: now + ttl }, result: true } : { result: false }); }
  releaseLease(owner) { return this.updateState(UPLOAD_TAG, lease => lease?.owner === owner ? { value: null } : {}); }
  async revoke() {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['state', 'sessions'], 'readwrite');
      tx.oncomplete = resolve; tx.onabort = tx.onerror = () => reject(new UploadError('storage'));
      tx.objectStore('state').delete(UPLOAD_STORAGE_KEY); tx.objectStore('sessions').clear();
    });
  }
  async putCurrent(record, owner = null, now = Date.now()) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      let saved = false;
      const tx = db.transaction(['state', 'sessions'], 'readwrite');
      tx.oncomplete = () => resolve(saved); tx.onabort = tx.onerror = () => reject(new UploadError('storage'));
      const request = tx.objectStore('state').get(UPLOAD_STORAGE_KEY);
      request.onsuccess = () => {
        if (request.result?.consentId !== record.consentId) return;
        if (!owner) { tx.objectStore('sessions').put(record); saved = true; return; }
        const lease = tx.objectStore('state').get(UPLOAD_TAG);
        lease.onsuccess = () => {
          if (lease.result?.owner === owner && lease.result.expires > now) { tx.objectStore('sessions').put(record); saved = true; }
        };
      };
    });
  }
}

export class UploadLock {
  constructor({ store, locks = globalThis.navigator?.locks, now = Date.now, ttl = 120000,
    setTimer = setTimeout, clearTimer = clearTimeout, onLost = () => {} } = {}) {
    Object.assign(this, { store, locks, now, ttl, setTimer, clearTimer, onLost }); this.owner = uniqueToken();
  }
  async run(operation, { ifAvailable = false } = {}) {
    if (this.locks?.request) return this.locks.request(UPLOAD_TAG, { ifAvailable }, lock => lock ? operation() : false);
    // In-memory test stores have no cross-context persistence. Production always
    // uses the atomic IDB lease when Web Locks is unavailable.
    if (!this.store.acquireLease) return operation();
    if (!await this.store.acquireLease(this.owner, this.now(), this.ttl)) return false;
    let timer, finished = false, renewal = Promise.resolve();
    const schedule = () => { timer = this.setTimer(() => {
      renewal = this.store.renewLease(this.owner, this.now(), this.ttl).then(ok => {
        if (!ok) this.onLost(); else if (!finished) schedule();
      }).catch(() => this.onLost());
    }, this.ttl / 3); };
    schedule();
    try { return await operation(); }
    finally { finished = true; this.clearTimer(timer); await renewal; await this.store.releaseLease(this.owner); }
  }
}

export async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  // Chunking avoids spreading a 40MB buffer into one call's argument list.
  const chunks = [];
  for (let i = 0; i < bytes.length; i += 0x8000) chunks.push(String.fromCharCode(...bytes.subarray(i, i + 0x8000)));
  return btoa(chunks.join(''));
}

function asBlob(value, part) {
  if (value instanceof Blob) return value;
  if (part === 'video') throw new TypeError('לא התקבל סרטון של הניסיון. הניסיון לא נשלח.');
  return new Blob([typeof value === 'string' ? value : JSON.stringify(value)], { type: 'application/json' });
}

export class UploadQueue {
  constructor({ config = null, store = new IndexedDBUploadStore(), fetchImpl = globalThis.fetch,
    onStatus = () => {}, timeoutMs = 0,
    setTimer = setTimeout, clearTimer = clearTimeout, actor = 'page', locks = globalThis.navigator?.locks,
    now = Date.now, persistConfig = true, onQueued = () => {} } = {}) {
    this.config = validConfig(config); this.store = store;
    // Native browser methods require their Window/Worker receiver, even when
    // dependency injection stores them on another object's property.
    this.fetchImpl = (...args) => fetchImpl.call(globalThis, ...args);
    this.onStatus = onStatus; this.timeoutMs = timeoutMs; this.epoch = 0;
    this.setTimer = (...args) => setTimer.call(globalThis, ...args);
    this.clearTimer = (...args) => clearTimer.call(globalThis, ...args);
    this.actor = actor; this.now = now; this.onQueued = onQueued; this.log = []; this.deadline = Infinity;
    this.lock = new UploadLock({ store, locks, now, setTimer: this.setTimer, clearTimer: this.clearTimer,
      onLost: () => { this.epoch++; this.controller?.abort(); } });
    this.ready = this.enabled ? (async () => {
      if (persistConfig) await store.setConfig?.(this.config);
      this.log = await readUploadLog(store);
    })() : Promise.resolve();
    this.ready.catch(() => {});
    this.running = null; this.controller = null; this.pending = 0; this.writes = new Set();
  }
  get enabled() { return this.config != null; }
  status(state, message, extra = {}) { this.onStatus({ state, message, pending: this.pending, total: 3, ...extra }); }
  stop() { this.config = null; this.epoch++; this.controller?.abort(); this.pending = 0; }
  async disable() {
    this.stop();
    this.status('disabled', 'שליחה לבדיקה: כבויה');
    // Also wait for a save already in progress so revoking consent cannot race
    // with a late IndexedDB write and resurrect a queued private recording.
    await Promise.allSettled([...this.writes]);
    await this.ready.catch(() => {});
    try { if (this.store.revoke) await this.store.revoke(); else await this.store.clear(); } catch { /* Revocation still blocks every send. */ }
  }
  async enqueue({ session, video, skeleton, diagnostics, readyAt = 0 }) {
    if (!this.enabled) return false;
    const epoch = this.epoch, config = this.config;
    if (typeof session !== 'string' || !/^[a-zA-Z0-9-]{1,160}$/.test(session)) throw new TypeError('מזהה ניסיון לא תקין.');
    const values = { video, skeleton, diagnostics };
    const parts = UPLOAD_PARTS.map(part => {
      if (values[part] == null) throw new TypeError('חסר חלק מהניסיון; הנתונים לא נשלחו.');
      const blob = asBlob(values[part], part);
      if (blob.size > MAX_UPLOAD_BYTES) throw new RangeError(`הקובץ גדול מ־40MB (${part === 'video' ? 'וידאו' : part === 'skeleton' ? 'שלד' : 'אבחון'}). הניסיון לא נשלח.`);
      return { part, mime: blob.type || (part === 'video' ? 'video/webm' : 'application/json'), blob, acked: false };
    });
    const record = { session, consentId: config.consentId, createdAt: Date.now(), readyAt, parts };
    const writing = this.ready.then(() => this.store.putCurrent ? this.store.putCurrent(record) : this.store.put(record)); this.writes.add(writing);
    let saved;
    try { saved = await writing; }
    catch { if (epoch === this.epoch) this.status('error', queueError); throw new Error(queueError); }
    finally { this.writes.delete(writing); }
    if (!this.enabled || epoch !== this.epoch || saved === false) { await this.store.remove(session).catch(() => {}); return false; }
    this.pending++; this.status('queued', 'הניסיון נשמר במכשיר וממתין לשליחה.');
    void Promise.resolve(this.onQueued()).catch(() => {}); return true;
  }
  retry({ budgetMs = Infinity } = {}) {
    if (!this.enabled) return Promise.resolve(false);
    if (this.running) return this.running;
    const epoch = this.epoch;
    this.pausedForBudget = false;
    this.running = this.ready.then(() => this.backgroundReady).then(() => {
      if (!this.isCurrent(epoch)) return false;
      if (this.remoteRetry) return this.remoteRetry();
      return this.lock.run(() => {
        this.deadline = this.now() + budgetMs; return this.drain(epoch);
      }, { ifAvailable: this.actor === 'sw' });
    }).catch(() => {
      if (this.isCurrent(epoch)) this.status('error', queueError);
      return false;
    }).finally(() => { this.running = null; });
    return this.running;
  }
  async save(record) {
    const writing = this.store.putCurrent ? this.store.putCurrent(record,
      this.lock.locks?.request ? null : this.lock.owner, this.now()) : this.store.put(record); this.writes.add(writing);
    try { if (await writing === false) throw new UploadError('storage'); } catch { throw new UploadError('storage'); }
    finally { this.writes.delete(writing); }
  }
  async logUpload(event) {
    event = { ...event, actor: this.actor };
    this.log = safeUploadLog([...this.log, event]);
    try { if (this.store.appendLog) this.log = await this.store.appendLog(event); }
    catch { /* Logging failure must not prevent a durable upload. */ }
  }
  isCurrent(epoch, config = this.config) { return this.enabled && epoch === this.epoch && config === this.config; }
  async canSend(epoch, config) {
    if (!this.isCurrent(epoch, config)) return false;
    if (this.now() >= this.deadline) { this.pausedForBudget = true; return false; }
    if (this.store.getConfig && (await this.store.getConfig())?.consentId !== config.consentId) return false;
    if (!this.lock.locks?.request && this.store.renewLease &&
      !await this.store.renewLease(this.lock.owner, this.now(), this.lock.ttl)) return false;
    return this.isCurrent(epoch, config);
  }
  async pause(delay, epoch) {
    if (!this.isCurrent(epoch)) return;
    const controller = new AbortController(); this.controller = controller;
    await new Promise(resolve => {
      const timer = this.setTimer(resolve, delay);
      controller.signal.addEventListener('abort', () => { this.clearTimer(timer); resolve(); }, { once: true });
    });
    if (this.controller === controller) this.controller = null;
  }
  async post(config, record, part, chunk = null) {
    const controller = new AbortController(); this.controller = controller;
    let timer, bodyBytes = 0;
    const started = Date.now();
    const blob = chunk == null ? part.blob : part.blob.slice(chunk * VIDEO_CHUNK_BYTES, (chunk + 1) * VIDEO_CHUNK_BYTES);
    const event = { time: started, session: record.session, part: part.part, chunk, bytes: blob.size };
    try {
      const mime = part.part === 'video' ? part.mime.split(';', 1)[0].trim() : part.mime;
      const body = JSON.stringify({ secret: config.secret, session: record.session, part: part.part, mime,
        ...(chunk == null ? {} : { chunk, chunks: Math.max(1, Math.ceil(part.blob.size / VIDEO_CHUNK_BYTES)), totalBytes: part.blob.size }),
        data: await blobToBase64(blob) });
      bodyBytes = new TextEncoder().encode(body).length;
      if (!this.enabled || this.config !== config) return false;
      // The final video request also waits for assembly of the entire file.
      const finalChunk = chunk != null && chunk === Math.max(1, Math.ceil(part.blob.size / VIDEO_CHUNK_BYTES)) - 1;
      const fullTimeout = Math.max(this.timeoutMs, requestTimeoutMs(bodyBytes), finalChunk ? 5000 * part.blob.size / 1_000_000 : 0);
      const timeout = this.actor === 'sw' || this.store.acquireLease && !this.lock.locks?.request ? Math.min(90000, fullTimeout) : fullTimeout;
      // Leave enough time for a whole request and its durable acknowledgement.
      // Yield between chunks, rather than aborting an accepted chunk at a deadline.
      if (this.deadline - this.now() < timeout + 1000) { this.pausedForBudget = true; return false; }
      const timedOut = new Promise((_, reject) => {
        timer = this.setTimer(() => { controller.abort(); reject(new UploadError('timeout')); },
          timeout);
      });
      const { response, result } = await Promise.race([this.fetchImpl(config.endpoint, {
        method: 'POST', headers: { 'Content-Type': 'text/plain' }, body, signal: controller.signal,
        credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'follow',
      }).then(async response => {
        if (response.redirected) {
          let url;
          try { url = new URL(response.url); } catch { throw new UploadError('redirect'); }
          if (url.protocol !== 'https:' ||
            (url.hostname !== 'script.googleusercontent.com' && url.hostname !== new URL(config.endpoint).hostname)) throw new UploadError('redirect');
        }
        let result;
        try { result = await response.json(); } catch { throw new UploadError('response'); }
        return { response, result };
      }), timedOut]);
      if (!response.ok || result?.ok !== true) throw new UploadError(result?.error || 'response');
      if (chunk != null) {
        const chunks = Math.max(1, Math.ceil(part.blob.size / VIDEO_CHUNK_BYTES));
        if (typeof result.assembled !== 'boolean' || chunk === chunks - 1 && !result.assembled ||
          result.assembled && result.duplicate !== true && result.bytes !== part.blob.size) throw new UploadError('response');
      }
      await this.logUpload({ ...event, bodyBytes, durationMs: Date.now() - started,
        result: result.duplicate ? 'duplicate' : result.assembled ? 'assembled' : 'stored' });
      return result;
    } catch (error) {
      const safe = error instanceof UploadError ? error : new UploadError('network');
      await this.logUpload({ ...event, bodyBytes, durationMs: Date.now() - started, error: safe.code });
      throw safe;
    } finally { this.clearTimer(timer); if (this.controller === controller) this.controller = null; }
  }
  async sendWithRetries(config, record, part, chunk, epoch) {
    for (let attempt = 0; attempt < 4; attempt++) {
      if (!await this.canSend(epoch, config)) return false;
      this.status('sending', chunk == null ? `שולח ${partNames[part.part]}` :
        `שולח וידאו: חלק ${chunk + 1} מתוך ${Math.max(1, Math.ceil(part.blob.size / VIDEO_CHUNK_BYTES))}`,
      { part: UPLOAD_PARTS.indexOf(part.part) + 1, partName: part.part, session: record.session,
        chunk, chunks: chunk == null ? null : Math.max(1, Math.ceil(part.blob.size / VIDEO_CHUNK_BYTES)), attempt: attempt + 1 });
      try { return await this.post(config, record, part, chunk); }
      catch (error) {
        if (!this.isCurrent(epoch, config)) return false;
        error.chunk = chunk;
        // Retrying cannot repair protocol/auth errors; size-mismatch is repaired at file level.
        if (['size-mismatch', 'chunk-fields', 'chunk-data', 'secret', 'redirect'].includes(error.code) || attempt === 3) throw error;
        if (this.now() + RETRY_DELAYS_MS[attempt] >= this.deadline) { this.pausedForBudget = true; return false; }
        await this.pause(RETRY_DELAYS_MS[attempt], epoch);
      }
    }
  }
  async sendPart(config, record, part, epoch) {
    if (part.acked) return true;
    if (!(part.blob instanceof Blob) || part.blob.size > MAX_UPLOAD_BYTES) throw new UploadError('response');
    if (part.part !== 'video') {
      if (!await this.sendWithRetries(config, record, part, null, epoch) || !this.isCurrent(epoch, config)) return false;
      part.acked = true; await this.save(record); return true;
    }
    // Old records keep their single Blob and acked flag. Chunk acknowledgements
    // are added lazily, with no database-version upgrade or new consent needed.
    part.ackedChunks ||= [];
    const chunks = Math.max(1, Math.ceil(part.blob.size / VIDEO_CHUNK_BYTES));
    for (;;) {
      try {
        for (let chunk = 0; chunk < chunks; chunk++) {
          if (part.ackedChunks.includes(chunk)) continue;
          const result = await this.sendWithRetries(config, record, part, chunk, epoch);
          if (!result || !this.isCurrent(epoch, config)) return false;
          part.ackedChunks.push(chunk);
          if (result.assembled) part.acked = true;
          await this.save(record);
          if (part.acked) return true;
        }
        throw new UploadError('response');
      } catch (error) {
        if (error.code !== 'size-mismatch') throw error;
        const alreadyRestarted = part.sizeMismatchRestarted;
        part.sizeMismatchRestarted = true; part.ackedChunks = []; part.acked = false;
        await this.save(record);
        if (alreadyRestarted) throw error;
      }
    }
  }
  async drain(epoch) {
    const config = this.config, visited = new Set(), failures = [];
    try {
      while (this.isCurrent(epoch, config)) {
        const records = await this.store.list();
        if (!this.isCurrent(epoch, config)) return false;
        const own = records.filter(record => record.consentId === config.consentId);
        this.pending = own.length;
        const batch = own.filter(record => !visited.has(record.session) && (record.readyAt || 0) <= this.now());
        if (!batch.length) {
          const deferred = own.filter(record => !visited.has(record.session) && record.readyAt > this.now());
          if (deferred.length) {
            const delay = Math.min(...deferred.map(record => record.readyAt)) - this.now();
            if (this.now() + delay >= this.deadline) { this.pausedForBudget = true; return false; }
            await this.pause(delay, epoch); continue;
          }
          if (failures.length) this.status('error', failures.at(-1).message, failures.at(-1).extra);
          return failures.length === 0 && !own.length;
        }
        for (const record of batch) {
          visited.add(record.session);
          let currentPart;
          try {
            // Always order explicitly: queued pre-update records were video first.
            for (const name of UPLOAD_PARTS) {
              currentPart = record.parts.find(part => part.part === name);
              if (!currentPart) throw new UploadError('response');
              if (!await this.sendPart(config, record, currentPart, epoch)) return false;
            }
            if (!this.isCurrent(epoch, config)) return false;
            await this.store.remove(record.session); this.pending--;
            this.status('sent', 'נשלח לבדיקה', { session: record.session });
          } catch (error) {
            if (!this.isCurrent(epoch, config)) return false;
            const name = currentPart?.part;
            const chunk = Number.isInteger(error.chunk) ? error.chunk : name === 'video' && currentPart.blob instanceof Blob ? Array.from({ length: Math.max(1, Math.ceil(currentPart.blob.size / VIDEO_CHUNK_BYTES)) }, (_, i) => i)
              .find(i => !currentPart.ackedChunks?.includes(i)) : null;
            const failure = { message: `${sendError}: ${partNames[name] || 'נתונים'}${chunk == null ? '' : `, חלק ${chunk + 1}`}${error.code === 'size-mismatch' ? ' — גודל הקובץ אינו תואם גם אחרי שליחה מחדש' : ''}. הניסיון שמור בטלפון. אפשר ללחוץ על ״נסה שוב״.`,
              extra: { session: record.session, partName: name, chunk, error: errorCodes.has(error.code) ? error.code : 'storage' } };
            failures.push(failure); this.status('error', failure.message, failure.extra);
          }
        }
        // Refresh for sessions enqueued while uploading. Each failed session is
        // attempted only once per drain, so it cannot block or loop indefinitely.
      }
    } catch { if (this.isCurrent(epoch, config)) this.status('error', queueError); }
    return false;
  }
}
