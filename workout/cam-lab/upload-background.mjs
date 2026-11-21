import { IndexedDBUploadStore, UPLOAD_CONTEXTS, UPLOAD_VERSION, readUploadLog } from './upload.mjs?v=20261013-frames-1';

export const NEXT_OPEN_MESSAGE = 'השליחה תמשיך בפתיחה הבאה';
const workoutScope = new URL('../', import.meta.url);
const workerURL = new URL('../upload-sw.js', import.meta.url);

// Disable the former shared authorization without removing queued media.
async function retireLegacyUploads(sw) {
  try { globalThis.localStorage?.removeItem('camlab.upload'); } catch { /* IndexedDB is checked separately. */ }
  const registrations = await sw?.getRegistrations?.() || [];
  const legacy = registrations.find(registration => registration.scope === workoutScope.href &&
    [registration.active, registration.waiting, registration.installing].some(worker => {
      if (!worker) return false;
      const url = new URL(worker.scriptURL);
      return url.pathname === workerURL.pathname && !url.searchParams.has('app');
    }));
  const databases = await globalThis.indexedDB?.databases?.();
  if (legacy || databases?.some(db => db.name === 'camlab.upload.queue')) {
    await new IndexedDBUploadStore({ name: 'camlab.upload.queue' }).clearConfig('camlab.upload');
  }
  if (legacy) await legacy.unregister();
}

// Each app gets its own service-worker scope, queue and consent.
export class BackgroundUploads {
  constructor({ queue = null, navigator = globalThis.navigator, document = globalThis.document,
    window = globalThis.window, context = queue?.context || 'lab', onSupport = () => {} } = {}) {
    Object.assign(this, { queue, navigator, document, window, context, onSupport });
    this.scopeURL = context === 'workout' ? workoutScope : new URL('./', import.meta.url);
    this.workerURL = new URL(workerURL);
    this.workerURL.search = new URLSearchParams({ v: UPLOAD_VERSION, app: context });
    this.supported = false; this.registration = null;
    this.hidden = () => { if (document.hidden) void this.schedule(); else this.pageClosing = false; };
    this.hide = () => { this.pageClosing = true; void this.schedule(); };
    this.show = () => { this.pageClosing = false; };
    this.message = ({ data }) => {
      if (data?.type !== 'camlab-upload-status' || data.app !== this.context || !this.queue?.enabled) return;
      // The worker only sends this fixed, safe status shape.
      const status = data.status;
      if (!['sending', 'sent', 'error'].includes(status?.state)) return;
      this.queue.pending = Number(status.pending) || 0;
      this.queue.onStatus(status);
      void readUploadLog(this.queue.store).then(log => { this.queue.log = log; });
    };
    if (queue) {
      queue.onQueued = () => document?.hidden || this.pageClosing ? this.schedule() : undefined;
      document?.addEventListener('visibilitychange', this.hidden);
      window?.addEventListener('pagehide', this.hide);
      window?.addEventListener('pageshow', this.show);
      navigator?.serviceWorker?.addEventListener?.('message', this.message);
    }
    this.ready = this.start(); this.ready.catch(() => {});
    if (queue) queue.backgroundReady = this.ready;
  }
  async start() {
    const sw = this.navigator?.serviceWorker;
    try {
      await retireLegacyUploads(sw);
      if (!this.queue?.enabled) return;
      await this.queue.ready;
      if (!this.queue.enabled) return;
      if (!sw || !('SyncManager' in globalThis)) { this.onSupport(false); return; }
      const registration = await sw.register(this.workerURL.href, { scope: this.scopeURL.pathname, type: 'module', updateViaCache: 'none' });
      this.registration = registration;
      if (registration.active?.scriptURL !== this.workerURL.href) await new Promise((resolve, reject) => {
        const worker = registration.installing || registration.waiting;
        if (worker?.scriptURL !== this.workerURL.href) { reject(new Error('worker')); return; }
        worker.addEventListener('statechange', () => {
          if (worker.state === 'activated') resolve();
          if (worker.state === 'redundant') reject(new Error('worker'));
        });
      });
      if (!this.queue.enabled) return;
      this.supported = !!registration.sync; this.onSupport(this.supported);
      // The worker owns supported foreground requests too: destroying the page
      // must not lose an acknowledgement for a body already received by the server.
      if (this.supported) this.queue.remoteRetry = () => this.uploadInWorker();
      if (this.document?.hidden) void this.schedule();
    } catch { this.supported = false; this.onSupport(false); }
  }
  async schedule() {
    // Start register() before the first await when the page is closing and the
    // already durable queue has work. enqueue() also calls here after its commit.
    if (!this.queue?.enabled) return false;
    if (!this.registration) await this.ready;
    try {
      if (!this.queue.pending && !this.queue.writes.size && !(await this.queue.store.list()).length) return false;
    } catch { return false; }
    if (!this.supported || !this.registration) {
      await this.queue.logUpload({ event: 'sync', time: Date.now(), registered: false }); return false;
    }
    let registered = false;
    try { await this.registration.sync.register(UPLOAD_CONTEXTS[this.context].tag); registered = true; }
    catch { this.supported = false; this.onSupport(false); }
    await this.queue.logUpload({ event: 'sync', time: Date.now(), registered });
    return registered;
  }
  uploadInWorker() {
    if (!this.queue?.enabled || !this.registration?.active) return Promise.resolve(false);
    return new Promise(resolve => {
      const channel = new MessageChannel(), controller = new AbortController();
      this.queue.controller = controller;
      const finish = ok => {
        clearTimeout(timer); channel.port1.close();
        if (this.queue.controller === controller) this.queue.controller = null;
        resolve(ok);
      };
      const timer = setTimeout(() => finish(false), 210000);
      controller.signal.addEventListener('abort', () => finish(false), { once: true });
      channel.port1.onmessage = ({ data }) => finish(data?.ok === true);
      try { this.registration.active.postMessage({ type: 'camlab-upload-start', app: this.context }, [channel.port2]); }
      catch { finish(false); }
    });
  }
  detach() {
    if (this.queue) this.queue.remoteRetry = null;
    this.document?.removeEventListener?.('visibilitychange', this.hidden);
    this.window?.removeEventListener?.('pagehide', this.hide);
    this.window?.removeEventListener?.('pageshow', this.show);
    this.navigator?.serviceWorker?.removeEventListener?.('message', this.message);
  }
  async remove() {
    this.supported = false; this.detach();
    const sw = this.navigator?.serviceWorker;
    try {
      for (const registration of await sw?.getRegistrations?.() || []) {
        if (registration.scope !== this.scopeURL.href) continue;
        const worker = registration.active || registration.waiting || registration.installing;
        if (worker?.scriptURL === this.workerURL.href) {
          worker.postMessage({ type: 'camlab-upload-revoked', app: this.context });
          await registration.unregister();
        }
      }
    } catch { /* The changed consent is also checked by the queue before each send. */ }
  }
}
