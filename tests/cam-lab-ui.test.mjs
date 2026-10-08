import test from 'node:test';
import assert from 'node:assert/strict';
import { pose } from './cam-lab-fixtures.js';

test('app shows and exports attempt diagnostics; local-only speech is throttled and camera stops', async () => {
  const saved = new Map();
  const replace = (key, value) => {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  };
  class Element {
    constructor() { this.textContent = ''; this.children = []; this.hidden = false; this.disabled = false; this.style = {}; this.handlers = {}; }
    addEventListener(name, handler) { this.handlers[name] = handler; }
    append(child) { this.children.push(child); }
    replaceChildren() { this.children = []; }
    click() { this.onclick?.(); }
    classList = { toggle() {}, remove() {} };
  }
  const elements = new Map(), documentHandlers = {};
  const get = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  get('overlay').getContext = () => ({ clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {} });
  Object.assign(get('video'), { videoWidth: 640, videoHeight: 480, readyState: 2, currentTime: 0, play: async () => {} });
  get('exercise').value = 'squats'; get('age').value = '7'; get('height').value = '120'; get('voice').checked = true;
  let now = 0, raf, worker, stopped = 0, terminated = 0, exported;
  let voices = [{ lang: 'he-IL', localService: false }, { lang: 'he-IL', localService: true }];
  const speech = [], painted = [];
  const status = get('status'); let statusText = '';
  Object.defineProperty(status, 'textContent', { get: () => statusText, set: text => { statusText = text; painted.push(now); } });
  class FakeWorker {
    constructor() { worker = this; }
    postMessage(message) { if (message.type === 'init') this.onmessage({ data: { type: 'ready' } }); }
    terminate() { terminated++; }
  }
  const oldCreate = URL.createObjectURL, oldRevoke = URL.revokeObjectURL;
  try {
    replace('document', { hidden: false, getElementById: get, createElement: () => new Element(),
      addEventListener: (name, handler) => { documentHandlers[name] = handler; } });
    replace('window', { isSecureContext: true, Worker: FakeWorker, OffscreenCanvas: class {}, createImageBitmap() {},
      speechSynthesis: { getVoices: () => voices, addEventListener() {}, cancel() {},
        speak: utterance => speech.push({ time: now, voice: utterance.voice }) }, addEventListener() {} });
    replace('navigator', { mediaDevices: { getUserMedia: async options => {
      assert.equal(options.audio, false);
      const track = { stop: () => stopped++, addEventListener() {} };
      return { getTracks: () => [track], getVideoTracks: () => [track] };
    } } });
    replace('performance', { now: () => now }); replace('Worker', FakeWorker);
    replace('SpeechSynthesisUtterance', class { constructor(text) { this.text = text; } });
    replace('requestAnimationFrame', callback => { raf = callback; return 1; }); replace('cancelAnimationFrame', () => {});
    replace('createImageBitmap', async () => ({ close() {} }));
    replace('setTimeout', () => 1); replace('clearTimeout', () => {});
    replace('localStorage', { setItem() { assert.fail('storage write'); } });
    replace('indexedDB', { open() { assert.fail('storage open'); } });
    replace('fetch', () => assert.fail('unexpected request'));
    URL.createObjectURL = blob => { exported = blob; return 'blob:test'; }; URL.revokeObjectURL = () => {};
    await import('../workout/cam-lab/app.mjs');
    await get('settings').handlers.submit({ preventDefault() {} });
    await Promise.resolve();
    const frame = async sample => {
      now += 50; get('video').currentTime += .05; await raf();
      worker.onmessage({ data: { type: 'pose', id: now / 50, timestamp: now,
        landmarks: sample?.p || [], world: sample?.world || [], inferenceMs: 54 } });
    };
    for (let i = 0; i < 30; i++) await frame(pose({ angle: 159, feet: 1.7, hands: .3 }));
    assert.equal(get('start').disabled, false); get('start').click();
    for (let i = 0; i < 10; i++) await frame(pose({ angle: 110 }));
    for (let i = 0; i < 4; i++) await frame(null);
    for (let i = 0; i < 6; i++) await frame(pose({ angle: 110 }));
    for (let i = 0; i < 20; i++) await frame(pose({ angle: 159 }));
    assert.equal(get('count').textContent, 1);
    while (now < 6500) await frame(pose());
    for (let i = 0; i < 30; i++) await frame(null);
    assert.equal(get('status').textContent, 'לא רואה את כל הגוף');
    // Ignore the initial loading text; all live changes obey the 1-second limit.
    for (let i = 2; i < painted.length; i++) assert.ok(painted[i] - painted[i - 1] >= 1000);
    assert.ok(speech.length >= 2);
    for (let i = 0; i < speech.length; i++) {
      assert.equal(speech[i].voice.localService, true);
      if (i) assert.ok(speech[i].time - speech[i - 1].time >= 6000);
    }
    get('finish').click(); assert.equal(stopped, 1); assert.equal(terminated, 1);
    assert.equal(get('result-count').textContent, '1 חזרות נספרו');
    assert.ok(get('diagnostics').children.some(li => li.textContent.includes('לפני מחזור: 1')));
    get('export').click(); const output = JSON.parse(await exported.text());
    assert.equal(output.version, 2); assert.equal(output.counted, 1); assert.equal(output.rejected, 0);
    assert.equal(output.exercise, 0); assert.equal(output.framing.footConfidence, .35);
    assert.equal(output.diagnostics.graceRecoveries, 1);
    assert.equal(output.diagnostics.frames, output.totalFrames);
    assert.equal(output.frames.length, output.totalFrames);
    assert.ok(output.totalFrames < 900); assert.equal(output.diagnostics.fullBodyFailed, 34);
    assert.ok(output.diagnostics.phaseMs.moving > 0);
    const numeric = value => {
      if (typeof value === 'object') for (const v of Object.values(value)) numeric(v);
      else assert.ok(typeof value === 'number' && Number.isFinite(value));
    };
    numeric(output);
    assert.ok(!/"(?:x|y|z|landmarks|world|image|video)"/.test(JSON.stringify(output)));
    const spokenBefore = speech.length; voices = [{ lang: 'he-IL', localService: false }];
    now += 7000; get('again').click(); await get('settings').handlers.submit({ preventDefault() {} });
    await frame(pose()); assert.equal(speech.length, spokenBefore);
    get('stop').click(); assert.equal(stopped, 2); assert.equal(terminated, 2);
  } finally {
    URL.createObjectURL = oldCreate; URL.revokeObjectURL = oldRevoke;
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  }
});
