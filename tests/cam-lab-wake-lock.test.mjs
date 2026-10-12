import test from 'node:test';
import assert from 'node:assert/strict';
import { ScreenWakeLock } from '../workout/cam-lab/screen-wake-lock.mjs';

function setup() {
  const sentinels = [], document = { hidden: false };
  const navigator = { wakeLock: { async request(type) {
    assert.equal(type, 'screen');
    const sentinel = { released: false, addEventListener(_, fn) { this.onrelease = fn; },
      async release() { this.released = true; this.onrelease?.(); } };
    sentinels.push(sentinel); return sentinel;
  } } };
  return { lock: new ScreenWakeLock({ navigator, document }), document, navigator, sentinels };
}
test('screen lock is granted, reused and released at end; visibility return obtains a new sentinel', async () => {
  const { lock, document, sentinels } = setup();
  await lock.hold(); await lock.hold(); assert.equal(lock.state, 'granted'); assert.equal(sentinels.length, 1);
  document.hidden = true; await sentinels[0].release(); await lock.acquire(); assert.equal(sentinels.length, 1);
  document.hidden = false; await lock.acquire(); assert.equal(sentinels.length, 2);
  await lock.release(); assert.equal(sentinels[1].released, true); await lock.acquire(); assert.equal(sentinels.length, 2);
});
test('denied and unsupported requests are diagnostic states without failing camera flow', async () => {
  const denied = new ScreenWakeLock({ navigator: { wakeLock: { request: async () => { throw new Error('denied'); } } } });
  await denied.hold(); assert.equal(denied.state, 'denied');
  const unsupported = new ScreenWakeLock({ navigator: {} }); await unsupported.hold(); assert.equal(unsupported.state, 'unsupported');
});
test('a request completing after finish releases immediately; concurrent holds request only once', async () => {
  let resolve; const { document } = setup(); let released = false, calls = 0;
  const lock = new ScreenWakeLock({ document, navigator: { wakeLock: { request() { calls++; return new Promise(r => { resolve = r; }); } } } });
  const hold = lock.hold(); const other = lock.hold(); await lock.release();
  resolve({ release: async () => { released = true; } }); await Promise.all([hold, other]);
  assert.equal(calls, 1); assert.equal(released, true); assert.equal(lock.sentinel, null);
});
