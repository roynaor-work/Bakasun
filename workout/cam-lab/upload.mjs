export const UPLOAD_STORAGE_KEY = 'camlab.upload';
export const MAX_UPLOAD_BYTES = 40_000_000;
export const UPLOAD_PARTS = ['video', 'skeleton', 'diagnostics'];
const storageError = 'לא ניתן לשמור את ההגדרה במכשיר. אפשרו אחסון באתר ופתחו שוב את קישור ההגדרה.';
const queueError = 'לא ניתן לשמור את הניסיון במכשיר. פנו מקום באחסון ונסו שוב; הניסיון עדיין לא נשלח.';
const sendError = 'השליחה לבדיקה נכשלה. הניסיון שמור במכשיר ויישלח בכניסה הבאה; אפשר ללחוץ על ״נסה שוב״.';
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
      const request = this.indexedDB.open(this.name, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('sessions')) request.result.createObjectStore('sessions', { keyPath: 'session' });
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
  async transaction(mode, operation) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      let result;
      const tx = db.transaction('sessions', mode);
      tx.oncomplete = () => resolve(result);
      tx.onabort = tx.onerror = () => reject(new Error(queueError));
      try {
        const request = operation(tx.objectStore('sessions'));
        if (request) request.onsuccess = () => { result = request.result; };
      } catch { try { tx.abort(); } catch { /* Already aborted. */ } reject(new Error(queueError)); }
    });
  }
  put(record) { return this.transaction('readwrite', store => store.put(record)); }
  list() { return this.transaction('readonly', store => store.getAll()); }
  remove(session) { return this.transaction('readwrite', store => store.delete(session)); }
  clear() { return this.transaction('readwrite', store => store.clear()); }
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
    onStatus = () => {}, timeoutMs = 45000 } = {}) {
    this.config = validConfig(config); this.store = store;
    // Native browser methods require their Window/Worker receiver, even when
    // dependency injection stores them on another object's property.
    this.fetchImpl = (...args) => fetchImpl.call(globalThis, ...args);
    this.onStatus = onStatus; this.timeoutMs = timeoutMs; this.epoch = 0;
    this.running = null; this.controller = null; this.pending = 0; this.writes = new Set();
  }
  get enabled() { return this.config != null; }
  status(state, message, extra = {}) { this.onStatus({ state, message, pending: this.pending, total: 3, ...extra }); }
  async disable() {
    this.config = null; this.epoch++; this.controller?.abort(); this.pending = 0;
    this.status('disabled', 'שליחה לבדיקה: כבויה');
    // Also wait for a save already in progress so revoking consent cannot race
    // with a late IndexedDB write and resurrect a queued private recording.
    await Promise.allSettled([...this.writes]);
    try { await this.store.clear(); } catch { /* Revocation still blocks every send. */ }
  }
  async enqueue({ session, video, skeleton, diagnostics }) {
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
    const record = { session, consentId: config.consentId, createdAt: Date.now(), parts };
    const writing = this.store.put(record); this.writes.add(writing);
    try { await writing; }
    catch { if (epoch === this.epoch) this.status('error', queueError); throw new Error(queueError); }
    finally { this.writes.delete(writing); }
    if (!this.enabled || epoch !== this.epoch) { await this.store.remove(session).catch(() => {}); return false; }
    this.pending++; this.status('queued', 'הניסיון נשמר במכשיר וממתין לשליחה.'); return true;
  }
  retry() {
    if (!this.enabled) return Promise.resolve(false);
    if (this.running) return this.running;
    this.running = this.drain(this.epoch).finally(() => { this.running = null; });
    return this.running;
  }
  async post(config, record, part) {
    const controller = new AbortController(); this.controller = controller;
    let timer;
    try {
      const body = JSON.stringify({ secret: config.secret, session: record.session, part: part.part, mime: part.mime, data: await blobToBase64(part.blob) });
      if (!this.enabled || this.config !== config) return false;
      const timedOut = new Promise((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error(sendError)); }, this.timeoutMs);
      });
      const response = await Promise.race([this.fetchImpl(config.endpoint, {
        method: 'POST', headers: { 'Content-Type': 'text/plain' }, body, signal: controller.signal,
        credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error',
      }).then(async response => ({ response, result: await response.json() })), timedOut]);
      if (!response.response.ok || response.result?.ok !== true) throw new Error(sendError);
      return true;
    } finally { clearTimeout(timer); if (this.controller === controller) this.controller = null; }
  }
  async drain(epoch) {
    const config = this.config;
    try {
      while (this.enabled && epoch === this.epoch) {
        const records = await this.store.list();
        if (!this.enabled || epoch !== this.epoch) return false;
        const own = records.filter(record => record.consentId === config.consentId);
        this.pending = own.length;
        if (!own.length) return true;
        for (const record of own) {
          for (const [index, part] of record.parts.entries()) {
            if (part.acked) continue;
            if (!this.enabled || epoch !== this.epoch) return false;
            if (!UPLOAD_PARTS.includes(part.part) || !(part.blob instanceof Blob) || part.blob.size > MAX_UPLOAD_BYTES) throw new Error(sendError);
            this.status('sending', `שולח ${index + 1} מתוך 3`, { part: index + 1, session: record.session });
            if (!await this.post(config, record, part) || !this.enabled || epoch !== this.epoch) return false;
            part.acked = true;
            // Persist each acknowledgement. The next visit only sends unacked
            // parts; the server must also deduplicate by session + part.
            const writing = this.store.put(record); this.writes.add(writing);
            try { await writing; } finally { this.writes.delete(writing); }
          }
          if (!this.enabled || epoch !== this.epoch) return false;
          await this.store.remove(record.session); this.pending--;
          this.status('sent', 'נשלח לבדיקה', { session: record.session });
        }
        // A new attempt may have been saved while the preceding snapshot was
        // uploading. Refresh after success; failures exit through catch below
        // and wait for the next explicit/online/startup retry.
      }
      return false;
    } catch {
      if (this.enabled && epoch === this.epoch) this.status('error', sendError);
      return false;
    }
  }
}
