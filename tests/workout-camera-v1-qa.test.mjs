// Camera workout v1, internal QA round (21/11/2026): the range meter and the child's own range, short and
// rushed repetitions, rationed corrections, a knocked phone, doubled detections, the far leg in a side view,
// knee lifts read against the child's own thigh, and the scoring tool of the rendered-figure bench.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { RangeMeter, RANGES, RANGE_COPY, OWN_FLOOR } from '../workout/js/camera-v1/range.mjs';
import { MotionCounter } from '../workout/js/camera-v1/motion.mjs';
import { PoseTracker } from '../workout/js/camera-v1/tracking.mjs';
import { CueLimiter, guide, GUIDE_COPY } from '../workout/js/camera-v1/guide.mjs';
import { measure, NOMINAL_THIGH } from '../workout/js/camera-v1/geometry.mjs';
import { CAMERA_EXERCISES } from '../workout/js/camera-v1/profiles.mjs';
import { plan, BODIES, CORE } from '../workout/tools/camera-v1-render.mjs';
import { replay, score, load } from '../workout/tools/camera-v1-realmodel.mjs';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

// A standing figure in normalized image coordinates (MediaPipe indices). legs scales the leg length,
// size the whole body: a small six-year-old and a tall eleven-year-old are the same code path.
function body({ size = 1, legs = 1, dx = 0, knee = 0, side = false, far = .95 } = {}) {
  const hipY = .5, torso = .2 * size, thigh = .17 * size * legs, shin = .17 * size * legs, half = side ? .004 : .05 * size;
  const at = (x, y, visibility = .95) => ({ x: .5 + dx + x, y, visibility, presence: visibility });
  const points = Array.from({ length: 33 }, () => ({ x: .5, y: .5, visibility: 0, presence: 0 }));
  const lift = knee * thigh;
  points[0] = at(0, hipY - torso - .09 * size); points[7] = at(.02, hipY - torso - .1 * size); points[8] = at(-.02, hipY - torso - .1 * size);
  for (const [sign, base, v] of [[1, 11, .95], [-1, 12, far]]) {
    const x = sign * half;
    points[base] = at(x, hipY - torso, v);
    points[base + 2] = at(x * 1.2, hipY - torso / 2, v); points[base + 4] = at(x * 1.3, hipY, v);
    points[base + 12] = at(x, hipY, v);
    const raised = sign === 1 ? lift : 0;
    points[base + 14] = at(x + (side ? raised : 0), hipY + thigh - raised, v);
    points[base + 16] = at(x, hipY + thigh + shin - raised, v);
    points[base + 18] = at(x - .01, hipY + thigh + shin + .02 * size - raised, v);
    points[base + 20] = at(x + .03 * size, hipY + thigh + shin + .025 * size - raised, v);
  }
  return { landmarks: points, world: [] };
}
const feed = (tracker, pose, from, to, extra = {}) => {
  let last;
  for (let time = from; time <= to; time += 66) last = tracker.update({ poses: Array.isArray(pose) ? pose : [pose], time, aspect: .75, ...extra });
  return last;
};

test('range meter: 0 at the start, 1 at the full range, and a finished movement reports its peak and length', () => {
  const meter = new RangeMeter('squats');
  let done = null, top = 0;
  const knee = [170, 170, 160, 140, 122, 122, 140, 165, 170, 170];
  knee.forEach((kneeAngle, i) => { const out = meter.update({ kneeAngle }, i * 150); top = Math.max(top, out.meter); done ??= out.done; });
  assert.equal(top, 1);
  assert.ok(done.peak >= 1 && done.reached);
  assert.ok(done.ms > 300 && done.ms < 900);
  assert.equal(new RangeMeter('jog').update({}, 0).meter, null, 'an exercise without a range shows no meter');
  for (const [id, spec] of Object.entries(RANGES)) {
    assert.ok(Object.hasOwn(CAMERA_EXERCISES, id), id);
    assert.equal(CAMERA_EXERCISES[id].kind, 'reps', id);
    assert.ok([RANGE_COPY.LOWER.text, RANGE_COPY.HIGHER.text].includes(spec.cue.text));
  }
});

test('the child\'s own range: two movements that agree set it, never below the floor, never from a nod', () => {
  const two = (a, b) => { const meter = new RangeMeter('squats'); meter.learn({ peak: a }); return [meter.learn({ peak: b }), meter.need]; };
  const [learnt, need] = two(.8, .78);
  assert.equal(learnt, true);
  assert.ok(Math.abs(need - .92 * .78) < 1e-9);
  assert.deepEqual(two(1.2, 1.25), [false, 1], 'a child who reaches the full range keeps it');
  const crunch = new RangeMeter('crunches');
  crunch.learn({ peak: .8 });
  assert.equal(crunch.learn({ peak: .8 }), false, 'only joint-angle ranges are eased');
  assert.deepEqual(two(.4, .45), [false, 1], 'two nods teach nothing');
  assert.deepEqual(two(.62, .95), [false, 1], 'two movements that disagree teach nothing');
  assert.equal(two(.62, .63)[1], OWN_FLOOR, 'the floor holds');
});

// The counter with its step logic scripted: the frame only carries the knee angle the range reads.
function squatCounter({ fromStart = true } = {}) {
  const counter = new MotionCounter('squats', { goal: 20 });
  let time = 0;
  const frame = (kneeAngle, event = null) => {
    time += 100;
    if (fromStart) counter.origin ??= { kneeAngle: 170 };
    const base = event === 'counted' ? counter.creditRep(time) : counter.result(event, event ? 'hint' : null);
    return counter.gauge(base, { kneeAngle }, time);
  };
  const movement = (bottom, { ms = 1200, counted = false } = {}) => {
    const steps = Math.max(4, Math.round(ms / 100)), out = [];
    for (let i = 0; i <= steps; i++) { const u = Math.sin(Math.PI * i / steps); out.push(frame(170 - (170 - bottom) * u)); }
    out.push(frame(170, counted ? 'counted' : null));
    for (let i = 0; i < 6; i++) out.push(frame(170));
    return out;
  };
  return { counter, frame, movement };
}

test('a repetition that stops short is marked as "almost" with the way to go, not passed over in silence', () => {
  const { counter, movement } = squatCounter();
  const out = movement(150);
  const partial = out.find(r => r.event === 'partial');
  assert.ok(partial, 'a partial event');
  assert.deepEqual(partial.hint, RANGE_COPY.LOWER);
  assert.equal(counter.count, 0);
  assert.equal(out.at(-1).partials, 1);
  assert.equal(movement(166).some(r => r.event === 'partial'), false, 'a small sway is not an attempt');
});

test('own range: two consistent shallower squats from the start ease the range; the stages then read the knee on the eased scale', () => {
  const { counter, movement } = squatCounter();
  const bottom = 170 - .8 * (170 - 122);
  const first = movement(bottom), second = movement(bottom);
  assert.equal(counter.count, 0, 'the range itself never adds a count');
  assert.ok(second.some(r => r.own), 'the range was learnt on the second');
  assert.ok(Math.abs(counter.range.need - .92 * .8) < .03);
  assert.equal(first.filter(r => r.event === 'partial').length, 1);
  const frame = { kneeAngle: bottom, main: { index: 0 }, sides: [{ index: 0, kneeAngle: bottom }, { index: 1, kneeAngle: 168 }] };
  const eased = counter.range.eased(frame);
  assert.ok(eased.kneeAngle <= 122, 'the child\'s own bottom now reads as the nominal bottom: ' + eased.kneeAngle);
  assert.ok(eased.main.kneeAngle === eased.sides[0].kneeAngle && eased.sides[1].kneeAngle > 160);
  const half = counter.range.eased({ ...frame, kneeAngle: 170 - .5 * (170 - 122) });
  assert.ok(half.kneeAngle > 125, 'half of the range is still short of the stage');
  const standing = squatCounter({ fromStart: false });
  for (let i = 0; i < 4; i++) standing.movement(bottom);
  assert.equal(standing.counter.range.need, 1, 'a movement that did not begin from the starting position teaches nothing');
  const deep = squatCounter();
  for (let i = 0; i < 3; i++) deep.movement(118, { counted: true });
  assert.equal(deep.counter.count, 3, 'counted once each, by the stages');
  assert.equal(deep.counter.range.need, 1);
  assert.equal(deep.counter.range.eased(frame), frame, 'no easing: the frame is untouched');
});

test('pace: two rushed repetitions in a row ask for "slower", a calm pace does not', () => {
  const fast = squatCounter();
  const rushed = [fast.movement(118, { ms: 500, counted: true }), fast.movement(118, { ms: 500, counted: true })].flat();
  assert.equal(rushed.filter(r => r.tempo).length, 1);
  const calm = squatCounter();
  const slow = [calm.movement(118, { ms: 1600, counted: true }), calm.movement(118, { ms: 1600, counted: true })].flat();
  assert.equal(slow.filter(r => r.tempo).length, 0);
});

test('corrections are rationed: a gap between any two, a longer one for the same, and every second occurrence', () => {
  const limiter = new CueLimiter({ gapMs: 4000, sameMs: 10000, every: 2 });
  assert.equal(limiter.allow('form', 0), true);
  assert.equal(limiter.allow('form', 200), false, 'the same cause, still lasting');
  assert.equal(limiter.allow('tempo', 2000), false, 'too soon after another correction');
  assert.equal(limiter.allow('tempo', 5000), true);
  assert.equal(limiter.allow('form', 12000), false, 'the occurrence after a shown one is skipped');
  assert.equal(limiter.allow('form', 30000), true, 'the one after that is shown');
  assert.equal(limiter.allow('form', 45000), false);
  let shown = 0;
  for (let t = 0; t < 60000; t += 66) if (new Object(limiter).allow('lasting', 100000 + t)) shown++;
  assert.equal(shown, 1, 'a hint that lasts a whole minute is shown once');
});

test('a knocked phone: the framing check and calibration run again, with their own line', () => {
  const tracker = new PoseTracker({ view: 'either', setup: 'standing', required: CAMERA_EXERCISES.squats.required });
  assert.equal(feed(tracker, body(), 0, 1500, { scene: .01 }).status, 'ready');
  assert.equal(tracker.update({ poses: [body()], time: 1566, aspect: .75, scene: .4 }).status, 'ready', 'one changed frame can be a passer-by');
  const knocked = tracker.update({ poses: [body()], time: 1632, aspect: .75, scene: .4 });
  assert.equal(knocked.status, 'phone-moved');
  assert.equal(knocked.calibration, null);
  assert.equal(feed(tracker, body(), 1700, 2000, { scene: .01 }).status, 'phone-moved');
  assert.equal(feed(tracker, body(), 2200, 2400, { scene: .01 }).status, 'calibrating');
  assert.equal(feed(tracker, body(), 2466, 3600, { scene: .01 }).status, 'ready');
  const line = guide({ poses: [body()], time: 0 }, 'phone-moved', CAMERA_EXERCISES.squats);
  assert.equal(line.text, GUIDE_COPY.LINES['phone-moved'].text + '.');
  assert.match(line.say, /[ְ-ׇ]/);
});

test('one body answered twice is one person; a second person elsewhere is still "more than one"', () => {
  const policy = CAMERA_EXERCISES.squats;
  const tracker = () => new PoseTracker({ view: 'either', setup: policy.setup, required: policy.required });
  assert.equal(feed(tracker(), [body(), body({ dx: .008 })], 0, 1500).status, 'ready');
  assert.equal(feed(tracker(), [body({ dx: -.2 }), body({ dx: .2 })], 0, 1500).status, 'multiple');
});

test('side view: the far leg the model is unsure of is accepted beside a clear near leg; an unknown one is not', () => {
  const policy = CAMERA_EXERCISES['squat-jumps'];
  assert.equal(policy.view, 'side');
  const tracker = () => new PoseTracker({ view: policy.view, setup: policy.setup, required: policy.required });
  assert.equal(feed(tracker(), body({ side: true, far: .3 }), 0, 1500).status, 'ready');
  assert.equal(feed(tracker(), body({ side: true, far: .05 }), 0, 1500).status, 'missing');
  const front = new PoseTracker({ view: 'front', setup: 'standing', required: CAMERA_EXERCISES['jumping-jacks'].required });
  assert.equal(feed(front, body({ far: .3 }), 0, 1500).status, 'missing', 'from the front both sides must be seen');
});

test('knee lift is read against the child\'s own thigh: the same lift scores the same for short and long legs and any size', () => {
  const lifts = [];
  for (const size of [.55, .8, 1.1]) for (const legs of [.8, 1, 1.25]) {
    const reference = measure(body({ size, legs }).landmarks, .75, null, null);
    assert.ok(reference.thigh > .4, 'the standing thigh was measured');
    const f = measure(body({ size, legs, knee: .5 }).landmarks, .75, reference, null);
    lifts.push(f.left.kneeRise);
    assert.ok(Math.abs(f.right.kneeRise + NOMINAL_THIGH) < .02, 'the standing leg sits at the nominal thigh');
  }
  assert.ok(Math.max(...lifts) - Math.min(...lifts) < .03, 'spread ' + lifts.map(v => v.toFixed(2)).join(' '));
});

test('no age, height or centimetres anywhere in the camera modules: only measured proportions', async () => {
  for (const name of ['geometry', 'motion', 'profiles', 'range', 'tracking', 'guide', 'hall']) {
    const code = (await read(`workout/js/camera-v1/${name}.mjs`)).replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(code, /\b(age|years?|cm|centimet|heightCm|adult|kidHeight)\b/i, name);
  }
});

test('new guidance lines are vowel-marked, without exclamation marks or Arabic letters', () => {
  const lines = [...Object.values(RANGE_COPY), GUIDE_COPY.LINES['phone-moved'], GUIDE_COPY.LINES.tight];
  for (const line of lines) {
    assert.match(line.say, /[ְ-ׇ]/, line.text);
    assert.doesNotMatch(line.text + line.say, /!|[؀-ۿ]/);
  }
});

test('the page: range bar, "almost" tally, rationed cues and a manual fix at the end are wired', async () => {
  const html = await read('workout/camera-v1/index.html');
  for (const id of ['range', 'meter', 'meter-label', 'partials', 'fix-note']) assert.match(html, new RegExp(`id="${id}"`));
  const session = await read('workout/js/camera-v1/session.mjs');
  assert.match(session, /cues\.allow\(cue\.code, sample\.time\)/);
  assert.match(session, /row\.fix = Math\.max\(-base, Math\.min\(row\.target - base/);
  assert.match(session, /TIGHT_MS/);
  const worker = await read('workout/js/camera-v1/pose-worker.js');
  assert.match(worker, /scene: sceneChange\(data, poses\)/);
  assert.doesNotMatch(worker, /postMessage\([^)]*luma/, 'the brightness grid never leaves the worker');
});

test('the bench plan covers every exercise, both picture shapes, and body sizes from 0.55 to 1.1', () => {
  const clips = plan();
  assert.equal(new Set(clips.filter(c => c.condition === 'natural').map(c => c.id)).size, 50);
  assert.ok(clips.some(c => c.w === 390 && c.h === 844) && clips.some(c => c.w === 844 && c.h === 390));
  const heights = Object.values(BODIES).map(b => b.height);
  assert.equal(Math.min(...heights), .55);
  assert.equal(Math.max(...heights), 1.1);
  for (const key of ['long-legs', 'short-legs', 'broad']) assert.ok(BODIES[key]);
  assert.ok(CORE.every(id => Object.hasOwn(CAMERA_EXERCISES, id)));
});

test('the scoring tool replays a recorded clip through the wired tracker and counter', async () => {
  const api = await load();
  const frames = [];
  for (let t = 0; t <= 2600; t += 67) frames.push({ t, active: false, ms: 80, light: { p50: 150, p90: 200 }, truth: { lShoulder: [.55, .3], rShoulder: [.45, .3], lHip: [.55, .5], rHip: [.45, .5] }, poses: [body()] });
  const clip = { cfg: { id: 'squats', name: 'squats.idle', condition: 'idle', idle: true, w: 390, h: 844 }, aspect: .75, motion: 0, frames };
  const run = replay(clip, api);
  assert.ok(run.readyFrames > 10);
  const row = score(clip, api);
  assert.equal(row.amount, 0);
  assert.equal(row.exact, true);
  assert.equal(row.detect, 1);
});
