// A released sentinel cannot be reused. Visibility restoration calls hold()
// again; a pending request is released if the camera/upload ended meanwhile.
export class ScreenWakeLock {
  constructor({ navigator = globalThis.navigator, document = globalThis.document } = {}) {
    this.navigator = navigator; this.document = document;
    this.state = navigator?.wakeLock?.request ? 'denied' : 'unsupported';
    this.wanted = false; this.sentinel = null; this.requesting = null;
  }
  hold() {
    this.wanted = true;
    return this.acquire();
  }
  acquire() {
    if (!this.wanted || this.document?.hidden || this.state === 'unsupported' || this.sentinel) return Promise.resolve();
    if (this.requesting) return this.requesting;
    this.requesting = (async () => {
      try {
        const sentinel = await this.navigator.wakeLock.request('screen');
        this.state = 'granted';
        if (!this.wanted || this.document?.hidden) { await sentinel.release(); return; }
        this.sentinel = sentinel;
        sentinel.addEventListener('release', () => { if (this.sentinel === sentinel) this.sentinel = null; });
      } catch { this.state = 'denied'; }
    })().finally(() => { this.requesting = null; });
    return this.requesting;
  }
  async release() {
    this.wanted = false;
    const sentinel = this.sentinel; this.sentinel = null;
    try { await sentinel?.release(); } catch { /* The browser may already have released it. */ }
  }
}
