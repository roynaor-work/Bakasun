import test from 'node:test';
import assert from 'node:assert/strict';
import { pose, person, floorPose } from './cam-lab-fixtures.js';

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
    before() {}
    classList = { toggle() {}, remove() {} };
  }
  const elements = new Map(), documentHandlers = {};
  const get = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  get('overlay').getContext = () => ({ clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {} });
  Object.assign(get('video'), { videoWidth: 640, videoHeight: 480, readyState: 2, currentTime: 0, play: async () => {} });
  get('exercise').value = 'squats'; get('age').value = '7'; get('height').value = '120'; get('voice').checked = true;
  let now = 0, raf, worker, stopped = 0, terminated = 0, exported;
  let cameraMode = 'wide'; const requestedCameras = [];
  let voices = [{ lang: 'he-IL', localService: false }, { lang: 'he-IL', localService: true }];
  const speech = [], painted = [];
  const status = get('status'); let statusText = '';
  Object.defineProperty(status, 'textContent', { get: () => statusText, set: text => { statusText = text; painted.push(now); } });
  class FakeWorker {
    constructor() { worker = this; }
    postMessage(message) { if (['init', 'configure'].includes(message.type)) { this.generation = message.generation; this.onmessage({ data: { type: message.type === 'init' ? 'ready' : 'configured', generation: message.generation, model: 'full', modelHistory: [] } }); } }
    terminate() { terminated++; }
  }
  const oldCreate = URL.createObjectURL, oldRevoke = URL.revokeObjectURL;
  try {
    replace('document', { hidden: false, getElementById: get, createElement: () => new Element(),
      addEventListener: (name, handler) => { documentHandlers[name] = handler; } });
    replace('window', { isSecureContext: true, Worker: FakeWorker, OffscreenCanvas: class {}, createImageBitmap() {},
      speechSynthesis: { getVoices: () => voices, addEventListener() {}, cancel() {},
        speak: utterance => speech.push({ time: now, voice: utterance.voice, text: utterance.text }) }, addEventListener() {} });
    replace('navigator', { mediaDevices: { getUserMedia: async options => {
      requestedCameras.push(options);
      assert.equal(options.audio, false);
      assert.deepEqual(options.video.width, { ideal: 720, max: 720 });
      assert.deepEqual(options.video.height, { ideal: 1280, max: 1280 });
      const track = { stop: () => stopped++, addEventListener() {},
        getCapabilities: () => cameraMode === 'wide' ? { zoom: { min: .5, max: 4 } } : {},
        applyConstraints: async c => assert.equal(c.advanced[0].zoom, .5),
        getSettings: () => ({ deviceId: 'front', zoom: cameraMode === 'wide' ? .5 : 1, width: 640, height: 480 }) };
      return { getTracks: () => [track], getVideoTracks: () => [track] };
    }, enumerateDevices: async () => [{ kind: 'videoinput', deviceId: 'rear-wide', label: 'Back ultra-wide camera' }] } });
    window.innerHeight = 844; window.innerWidth = 390;
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
    assert.equal(get('upload-off-banner').hidden, false);
    assert.equal(get('upload-on-banner').hidden, true);
    await get('settings').handlers.submit({ preventDefault() {} });
    await Promise.resolve();
    const frame = async sample => {
      now += 50; get('video').currentTime += .05; await raf();
      worker.onmessage({ data: { type: 'pose', generation: worker.generation, id: now / 50, timestamp: now,
        landmarks: sample?.p || [], world: sample?.world || [], ...(Array.isArray(sample) ? { poses: sample } : {}), inferenceMs: 54 } });
    };
    for (let i = 0; i < 70; i++) await frame(pose({ angle: 159, feet: 1.7, hands: .3 }));
    assert.match(get('zoom-status').textContent, /0.5.*640×480/);
    assert.match(get('distance-status').textContent, /המרחק נוח/);
    assert.equal(get('start').hidden, true); // Automatic start also works in private mode.
    assert.equal(get('record-option').hidden, false);
    assert.equal(get('recording-panel').hidden, false);
    assert.equal(get('export-panel').hidden, false);
    for (let i = 0; i < 10; i++) await frame(pose({ angle: 110 }));
    for (let i = 0; i < 4; i++) await frame(null);
    for (let i = 0; i < 6; i++) await frame(pose({ angle: 110 }));
    for (let i = 0; i < 20; i++) await frame(pose({ angle: 159 }));
    assert.equal(get('count').textContent, 1);
    while (now < 6500) await frame(pose());
    for (let i = 0; i < 30; i++) await frame(null);
    assert.equal(get('status').textContent, 'לא רואה את הנקודות הדרושות לתרגיל');
    // Ignore the initial loading text; all live changes obey the 1-second limit.
    for (let i = 2; i < painted.length; i++) assert.ok(painted[i] - painted[i - 1] >= 1000);
    assert.ok(speech.length >= 2);
    const cues = new Set(['שָׁלוֹשׁ', 'שְׁתַּיִם', 'אַחַת']);
    assert.deepEqual(speech.filter(s => cues.has(s.text)).map(s => s.text), [...cues]);
    for (const s of speech) assert.equal(s.voice.localService, true);
    const guidance = speech.filter(s => !cues.has(s.text));
    for (let i = 1; i < guidance.length; i++) assert.ok(guidance[i].time - guidance[i - 1].time >= 6000);
    get('finish').click(); assert.equal(get('result-upload-off').hidden, false); assert.equal(stopped, 1); assert.equal(terminated, 0);
    assert.equal(get('result-count').textContent, '1 חזרות נספרו');
    assert.ok(get('diagnostics').children.some(li => li.textContent.includes('לפני מחזור: 1')));
    get('export').click(); const output = JSON.parse(await exported.text());
    assert.equal(output.version, 2); assert.equal(output.counted, 1); assert.equal(output.rejected, 0);
    assert.equal(output.exercise, 0); assert.equal(output.framing.footConfidence, .30);
    assert.equal(output.camera.wideApplied, 1); assert.equal(output.camera.zoom, .5);
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
    // Exercise the app's actual two-person routing and recording controls.
    get('again').click(); get('mode').value = 'pair'; get('record').checked = true;
    await get('settings').handlers.submit({ preventDefault() {} }); await Promise.resolve();
    const child = angle => person(pose({ angle }), { x: .28, size: .7 });
    const dad = angle => person(pose({ angle }), { x: .72, size: 1 });
    for (let i = 0; i < 60; i++) await frame([dad(180), child(180)]);
    assert.equal(get('start').disabled, false); assert.equal(get('dad-score').hidden, false); get('start').click();
    for (let i = 0; i < 16; i++) await frame([child(110), dad(180)]);
    const weak = child(110); weak.landmarks[27].visibility = .1; weak.landmarks[28].visibility = .1;
    for (let i = 0; i < 2; i++) await frame([dad(180), weak]);
    await frame([child(110), dad(180)]);
    for (let i = 0; i < 16; i++) await frame([dad(180), child(180)]);
    assert.equal(get('count').textContent, 1); assert.equal(get('dad-count').textContent, '0');
    for (let i = 0; i < 16; i++) await frame([dad(110), child(110)]);
    for (let i = 0; i < 16; i++) await frame([dad(180)]);
    assert.equal(get('count').textContent, 1); assert.equal(get('dad-count').textContent, 1);
    assert.match(get('child-status').textContent, /הספירה נעצרה/);
    // A short overlap after point loss cancels the cycle immediately. Held
    // drawing points must not trigger repeated identity resets during overlap.
    for (let i = 0; i < 16; i++) await frame([child(180), dad(180)]);
    for (let i = 0; i < 16; i++) await frame([child(110), dad(180)]);
    await frame([dad(180)]);
    for (let i = 0; i < 3; i++) await frame([person(pose({ angle: 110 }), { x: .46, size: .7 }),
      person(pose(), { x: .54, size: 1 })]);
    for (let i = 0; i < 16; i++) await frame([child(180), dad(180)]);
    assert.equal(get('count').textContent, 1); assert.equal(get('dad-count').textContent, 1);
    get('finish').click(); assert.equal(stopped, 2); assert.equal(terminated, 0);
    assert.equal(get('result-count').textContent, 'הילד: 1 · אבא: 1 חזרות');
    get('record-download').click(); const skeleton = JSON.parse(await exported.text());
    assert.equal(skeleton.type, 'cam-lab-skeleton'); assert.equal(skeleton.mode, 'pair');
    assert.ok(skeleton.countStartMs > 0); assert.ok(skeleton.frames[0].poses[0].landmarks.length === 33);
    assert.ok(!/"(?:image|video|bitmap|age|height)"/.test(JSON.stringify(skeleton)));
    const { replayRecording } = await import('../workout/cam-lab/recording.mjs');
    assert.deepEqual(replayRecording(skeleton).map(c => c.counted), [1, 1]);
    get('export').click(); const pairLog = JSON.parse(await exported.text());
    assert.equal(pairLog.version, 3); assert.equal(pairLog.adult.counted, 1);
    assert.equal(pairLog.diagnostics.stopReasons.ambiguous, 1);
    assert.equal(pairLog.adult.diagnostics.stopReasons.ambiguous, 1);
    assert.ok(pairLog.diagnostics.graceRecoveries >= 1);
    assert.ok(!/"(?:x|y|z|landmarks|world|image|video)"/.test(JSON.stringify(pairLog)));
    // Floor setup first checks upright placement, then the floor rest pose.
    get('again').click(); get('mode').value = 'solo'; get('record').checked = false; get('exercise').value = 'push-ups';
    await get('settings').handlers.submit({ preventDefault() {} }); await Promise.resolve();
    for (let i = 0; i < 30; i++) await frame(pose());
    for (let i = 0; i < 30; i++) await frame(floorPose({ bridge: 180 }));
    assert.equal(get('start').disabled, false); get('start').click();
    for (let i = 0; i < 16; i++) await frame(floorPose({ elbow: 85, bridge: 180 }));
    for (let i = 0; i < 16; i++) await frame(floorPose({ bridge: 180 }));
    assert.equal(get('count').textContent, 1);
    for (let i = 0; i < 16; i++) await frame(floorPose({ elbow: 85, bridge: 180, badForm: true }));
    for (let i = 0; i < 140; i++) await frame(floorPose({ bridge: 180 }));
    assert.equal(get('count').textContent, 1);
    assert.ok(speech.some(s => s.text.includes('הַגּוּף בְּקוֹ יָשָׁר')));
    get('finish').click();
    assert.equal(stopped, 3); assert.equal(terminated, 0); assert.equal(get('record-download').disabled, true);
    const spokenBefore = speech.length; voices = [{ lang: 'he-IL', localService: false }];
    now += 7000; get('again').click(); await get('settings').handlers.submit({ preventDefault() {} });
    await frame(pose()); assert.equal(speech.length, spokenBefore);
    get('stop').click(); assert.equal(stopped, 4); assert.equal(terminated, 0);
    cameraMode = 'nozoom';
    await get('settings').handlers.submit({ preventDefault() {} });
    assert.match(get('zoom-status').textContent, /0.5 לא זמין/);
    assert.equal(get('wide-camera-option').hidden, false);
    assert.deepEqual(requestedCameras.at(-1).video.facingMode, { ideal: 'user' });
    get('camera-device').value = 'rear-wide'; get('stop').click();
    assert.equal(stopped, 5); assert.equal(get('setup').hidden, false);
    cameraMode = 'wide'; await get('settings').handlers.submit({ preventDefault() {} });
    assert.deepEqual(requestedCameras.at(-1).video.deviceId, { exact: 'rear-wide' });
    get('stop').click(); assert.equal(stopped, 6); assert.equal(terminated, 0);
  } finally {
    URL.createObjectURL = oldCreate; URL.revokeObjectURL = oldRevoke;
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  }
});
