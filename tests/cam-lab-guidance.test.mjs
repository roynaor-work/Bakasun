import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PlacementCoach, placementHint } from '../workout/cam-lab/placement-coach.mjs';
import { PLACEMENT_LINES } from '../workout/cam-lab/placement-lines.mjs';
import { selectLocalVoice, voiceId } from '../workout/cam-lab/voice-selection.mjs';
import { VOICE_BY_ID, splitVoiceText, voiceLinesMarkdown } from '../workout/js/voice-lines.js';
import { pose, person, floorPose } from './cam-lab-fixtures.js';

function standing(center = .5, front = true) {
  const sample = pose();
  if (front) [sample.p[11].x, sample.p[12].x] = [sample.p[12].x, sample.p[11].x];
  sample.p.forEach(p => { p.x += center - .5; });
  return sample;
}

test('far and near instructions address the child; floor movement and unknown poses invent no distance cue', () => {
  const far = person(pose(), { x: .5, size: .2 }).landmarks;
  const near = person(pose(), { x: .5, size: 1.2 }).landmarks;
  assert.equal(placementHint(far).code, 'far'); assert.equal(placementHint(near).code, 'near');
  assert.match(placementHint(far).text, /אתה רחוק מדי.*תתקרב/);
  assert.match(placementHint(near).text, /אתה קרוב מדי.*תתרחק/);
  assert.equal(placementHint(floorPose().p).code, null); assert.equal(placementHint([]).code, null);
  assert.equal(placementHint(near).blocking, false);
});

test('left/right are the child’s anatomical sides; front/rear mirroring changes only the visible arrow', () => {
  for (const [center, code, rearArrow] of [[.28, 'left', 'right'], [.72, 'right', 'left']]) {
    const sample = standing(center);
    const rear = placementHint(sample.p, { mirrored: false }), front = placementHint(sample.p, { mirrored: true });
    assert.equal(rear.code, code); assert.equal(front.code, code); assert.equal(rear.arrow, rearArrow);
    assert.notEqual(front.arrow, rear.arrow);
    assert.equal(front.text, rear.text);
    assert.notEqual(placementHint(standing(center, false).p).code, code, 'turning the child reverses anatomical side in image coordinates');
  }
});

test('uncertain shoulder labels use the arrow instead of guessing the child’s side', () => {
  const sample = standing(.72); sample.p[11].visibility = .1;
  assert.equal(placementHint(sample.p, { mirrored: true }).code, 'arrow');
  assert.equal(placementHint(sample.p, { mirrored: true }).arrow, 'right');
});

test('opposite response and reversed shoulder labels switch to arrow guidance until the child centers', () => {
  for (const reverseLabels of [false, true]) {
    const coach = new PlacementCoach();
    assert.equal(coach.update(standing(.72).p, 0), null);
    const hint = coach.update(standing(.72).p, 400); assert.equal(hint.code, 'right'); coach.markSpoken(hint, 400);
    const wrong = standing(reverseLabels ? .72 : .80, !reverseLabels);
    assert.equal(coach.update(wrong.p, 600), null);
    assert.equal(coach.update(wrong.p, 1000).code, 'arrow');
    assert.equal(coach.update(standing(.5).p, 1100), null); assert.equal(coach.confused, false);
  }
  const coach = new PlacementCoach(); coach.update(standing(.72).p, 0);
  coach.markSpoken(coach.update(standing(.72).p, 400), 400);
  assert.equal(coach.update(standing(.68).p, 600).code, 'right'); assert.equal(coach.confused, false);
});

test('brief jitter, frame loss and centered return never leave a stale arrow on screen', () => {
  const coach = new PlacementCoach();
  for (let time = 0; time <= 300; time += 100) assert.equal(coach.update(standing(time % 200 ? .72 : .5).p, time), null);
  coach.update(standing(.72).p, 500); assert.ok(coach.update(standing(.72).p, 900));
  assert.equal(coach.update([], 1000), null); assert.equal(coach.current, null);
  assert.equal(coach.update(standing(.72).p, 3000), null);
  assert.equal(coach.update(standing(.5).p, 3100), null);
});

test('voice selection prefers Hebrew, handles delayed/legacy voices, supports a chosen local fallback and excludes remote voices', () => {
  const english = { name: 'English local', lang: 'en-US', localService: true, default: true };
  const alternate = { name: 'Second local', lang: 'fr-FR', localService: true };
  const hebrew = { name: 'Hebrew local', lang: 'he_IL', localService: true };
  const remote = { name: 'Network Hebrew', lang: 'he-IL', localService: false };
  assert.equal(selectLocalVoice([]), null); assert.equal(selectLocalVoice([remote]), null);
  assert.equal(selectLocalVoice([english, remote]), english);
  assert.equal(selectLocalVoice([english, remote, hebrew]), hebrew);
  assert.equal(selectLocalVoice([english, hebrew, alternate], voiceId(alternate)), alternate);
  assert.equal(selectLocalVoice([english, hebrew], voiceId(remote)), hebrew);
  const legacy = { ...hebrew, lang: 'iw-IL' }; assert.equal(selectLocalVoice([english, legacy]), legacy);
});

test('every placement sentence is in the shared voice catalog, with pointed speech and current recording documentation', async () => {
  for (const [id, line] of Object.entries(PLACEMENT_LINES)) {
    assert.match(line.tts, /[\u05b0-\u05bc]/);
    assert.equal(VOICE_BY_ID[`camera-placement-${id}`].text, line.text);
    assert.equal(VOICE_BY_ID[`camera-placement-${id}`].tts, line.tts);
    assert.deepEqual(splitVoiceText(line.tts).map(p => p.id), [`camera-placement-${id}`]);
  }
  assert.equal(await readFile(new URL('../workout/snd/voice/LINES.md', import.meta.url), 'utf8'), voiceLinesMarkdown());
});

test('live lab speaks child-relative guidance with a non-Hebrew local voice, switches to the arrow and discards stale cues', async () => {
  const saved = new Map(), replace = (key, value) => {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
  };
  class Element {
    constructor() { this.textContent = ''; this.value = ''; this.checked = false; this.hidden = false; this.disabled = false; this.style = {}; this.handlers = {}; this.children = []; }
    addEventListener(n, f) { this.handlers[n] = f; } append(c) { this.children.push(c); } replaceChildren() { this.children = []; } before() {}
    classList = { toggle() {}, remove() {} };
  }
  const elements = new Map(), get = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  get('overlay').getContext = () => ({ clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, arc() {}, fill() {} });
  Object.assign(get('video'), { videoWidth: 480, videoHeight: 640, readyState: 2, currentTime: 0, play: async () => {} });
  for (const [id, value] of Object.entries({ exercise: 'squats', age: '7', height: '120', mode: 'solo', 'camera-facing': 'user', 'camera-width': 'normal' })) get(id).value = value;
  get('voice').checked = true;
  let now = 0, worker, raf; const speech = [], voiceHandlers = {};
  const english = { name: 'English local', lang: 'en-US', localService: true, default: true };
  const other = { name: 'Other local', lang: 'fr-FR', localService: true };
  let voices = [english, other, { name: 'Remote', lang: 'he-IL', localService: false }];
  class FakeWorker {
    constructor() { worker = this; } terminate() {}
    postMessage(m) {
      if (['init', 'configure'].includes(m.type)) { this.generation = m.generation;
        this.onmessage({ data: { type: m.type === 'init' ? 'ready' : 'configured', generation: m.generation, model: 'full', modelHistory: [] } }); }
    }
  }
  try {
    replace('document', { hidden: false, getElementById: get, createElement: () => new Element(), addEventListener() {} });
    replace('window', { location: { hash: '' }, isSecureContext: true, innerWidth: 390, innerHeight: 844, Worker: FakeWorker,
      OffscreenCanvas: class {}, createImageBitmap() {}, addEventListener() {}, speechSynthesis: {
        getVoices: () => voices, addEventListener: (n, f) => { voiceHandlers[n] = f; }, cancel() {}, speak: u => speech.push(u),
      } });
    replace('navigator', { mediaDevices: { getUserMedia: async () => {
      const track = { stop() {}, addEventListener() {}, getSettings: () => ({ width: 480, height: 640, facingMode: get('camera-facing').value }), getCapabilities: () => ({}) };
      return { getTracks: () => [track], getVideoTracks: () => [track] };
    } } });
    replace('Worker', FakeWorker); replace('performance', { now: () => now });
    replace('requestAnimationFrame', cb => { raf = cb; return 1; }); replace('cancelAnimationFrame', () => {});
    replace('setTimeout', () => 1); replace('clearTimeout', () => {}); replace('createImageBitmap', async () => ({ close() {} }));
    replace('SpeechSynthesisUtterance', class { constructor(text) { this.text = text; } });
    replace('localStorage', { getItem: () => null, setItem() { assert.fail('unexpected write'); } });
    replace('fetch', () => assert.fail('unexpected network')); replace('indexedDB', { open() { assert.fail('unexpected storage'); } });
    await import('../workout/cam-lab/app.mjs?placement-guidance-test');
    assert.match(get('voice-status').textContent, /אין קול עברי מקומי/);
    assert.equal(get('voice-select').children.length, 3);
    await get('settings').handlers.submit({ preventDefault() {} });
    const frame = async (sample, step = 100) => {
      now += step; get('video').currentTime += step / 1000; await raf();
      worker.onmessage({ data: { type: 'pose', generation: worker.generation, timestamp: now, inferenceMs: 1,
        // No world angles: keep counting unarmed while testing placement.
        poses: sample ? [{ landmarks: sample.p, world: [] }] : [] } });
    };
    for (let i = 0; i < 6; i++) await frame(standing(.72));
    assert.equal(get('direction-arrow').hidden, false); assert.equal(get('direction-arrow').textContent, '→');
    assert.equal(speech.at(-1).text, PLACEMENT_LINES.right.tts); assert.equal(speech.at(-1).voice, english);
    assert.equal(get('start').disabled, true);
    for (let i = 0; i < 6; i++) await frame(standing(.80));
    assert.equal(get('placement-hint').textContent, PLACEMENT_LINES.arrow.text);
    for (let i = 0; i < 60; i++) await frame(standing(.80));
    assert.equal(speech.at(-1).text, PLACEMENT_LINES.arrow.tts);
    const before = speech.length; await frame(standing(.5)); await frame(standing(.5), 6500);
    assert.equal(get('direction-arrow').hidden, true); assert.equal(get('placement-hint').textContent, '');
    assert.ok(speech.slice(before).every(u => !Object.values(PLACEMENT_LINES).some(l => l.tts === u.text)), 'no stale direction is spoken after centering');
    get('voice-select').value = voiceId(other); get('voice-select').handlers.change();
    for (let i = 0; i < 6; i++) await frame(standing(.28));
    assert.equal(speech.at(-1).voice, other); assert.equal(speech.at(-1).text, PLACEMENT_LINES.left.tts);
    get('voice').checked = false; get('voice').handlers.change(); const muted = speech.length;
    for (let i = 0; i < 70; i++) await frame(standing(.28)); assert.equal(speech.length, muted);
    assert.equal(get('direction-arrow').hidden, false);
    voices = []; voiceHandlers.voiceschanged(); assert.equal(get('voice-select').disabled, true);
    get('stop').onclick(); assert.equal(get('direction-arrow').hidden, true);
    get('voice').checked = true; voices = [english]; voiceHandlers.voiceschanged();
    get('camera-facing').value = 'environment'; await get('settings').handlers.submit({ preventDefault() {} });
    for (let i = 0; i < 6; i++) await frame(standing(.72));
    assert.equal(get('direction-arrow').textContent, '←'); assert.equal(get('placement-hint').textContent, PLACEMENT_LINES.right.text);
    get('stop').onclick();
  } finally {
    for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  }
});
