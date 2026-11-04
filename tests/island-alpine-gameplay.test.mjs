import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createAlpineEngine} from '../workout/island/minigames/alpine-engine.mjs';
import {createAlpineControls} from '../workout/island/minigames/alpine-controls.mjs';
import {createAlpineMotionPlayer} from '../workout/island/minigames/alpine-character.mjs';
import {Bone} from '../workout/island/vendor/three.module.js';

const base = JSON.parse(await readFile(new URL('../workout/island/data/config.json', import.meta.url), 'utf8')).minigames.alpineRush;
const motion = JSON.parse(await readFile(new URL('../workout/island/design/motion/alpine.json', import.meta.url), 'utf8'));
const STEP = base.physics.fixedStep;
function engine() {
  const balance = structuredClone(base);
  balance.physics.grid = [{s: 0, x: 0}, ...Array.from({length: 5}, (_, i) => ({s: -200 - i * 8, x: 0}))];
  const course = {id: 'input-test', length: 400, objects: [{id: 'ramp', type: 'ramp', s: 30, x: 0}], rows: [], path: null, coins: 0};
  const e = createAlpineEngine({balance, stage: 1, seed: 7, course}); e.command({type: 'start'});
  while (e.phase === 'countdown') e.step(STEP);
  e.drainEvents(); return e;
}
function ticks(e, count) { for (let i = 0; i < count; i++) e.step(STEP); }
function launchTick() {
  const e = engine(); let tick = 0;
  while (!e.debug()[0].airborne && tick < 600) { e.step(STEP); tick++; }
  assert.ok(e.debug()[0].airborne, 'the fixed test ramp launches the player'); e.dispose(); return tick;
}
const launch = launchTick();

test('Alpine trick input on the takeoff tick is accepted only after authoritative takeoff', () => {
  const e = engine(); ticks(e, launch - 1); e.drainEvents();
  assert.equal(e.debug()[0].airborne, false);
  e.command({type: 'trick', id: 'grab'}); assert.equal(e.snapshot().player.trick, null, 'a ground command never creates a ground trick');
  e.step(STEP); const frame = e.snapshot(), events = e.drainEvents().filter(e => e.riderId === 'player');
  assert.equal(frame.player.airborne, true); assert.equal(frame.player.trick?.id, 'grab');
  assert.deepEqual(events.filter(e => e.type === 'takeoff' || e.type === 'trick-start').map(e => e.type), ['takeoff', 'trick-start']);
  e.dispose();
});

test('Alpine trick buffer accepts the last 7 ticks, expires on tick 8, and never banks a ground score', () => {
  for (const [early, accepted] of [[7, true], [8, false], [30, false]]) {
    const e = engine(); ticks(e, launch - early); e.command({type: 'trick', id: 'grab'}); ticks(e, early);
    assert.equal(e.snapshot().player.trick?.id === 'grab', accepted, `${early} simulation ticks before takeoff`);
    assert.equal(e.snapshot().score, 0, 'points are still awarded only after a completed air trick lands');
    ticks(e, 120);
    assert.equal(e.snapshot().score, accepted ? base.physics.tricks.grab.points : 0);
    e.dispose();
  }
});

test('Alpine pending trick input clears on pause, retry, exit and disposal', () => {
  for (const boundary of ['pause', 'retry', 'exit', 'dispose']) {
    const e = engine(); ticks(e, launch - 4); e.command({type: 'trick', id: 'grab'});
    if (boundary === 'dispose') { e.dispose(); e.command({type: 'trick', id: 'spin'}); assert.equal(e.disposed, true); assert.deepEqual(e.debug(), []); continue; }
    e.command({type: boundary});
    if (boundary === 'pause') e.command({type: 'resume'});
    else { if (boundary === 'exit') e.command({type: 'start'}); while (e.phase === 'countdown') e.step(STEP); ticks(e, launch - 4); }
    ticks(e, 4); assert.equal(e.snapshot().player.airborne, true); assert.equal(e.snapshot().player.trick, null, boundary); e.dispose();
  }
});

test('Alpine buffered input remains deterministic at 30, 60 and 120 fps without changing speed caps', () => {
  const states = [];
  for (const fps of [30, 60, 120]) {
    const e = engine(); let pressed = false;
    for (let n = 0; n < fps * 8; n++) {
      if (!pressed && e.snapshot().timeMs >= (launch - 6) * STEP * 1000) { e.command({type: 'trick', id: 'grab'}); pressed = true; }
      e.step(1 / fps); assert.ok(e.debug()[0].speed <= base.physics.baseSpeed);
    }
    assert.equal(e.snapshot().score, base.physics.tricks.grab.points); states.push(e.debug()); e.dispose();
  }
  assert.deepEqual(states[0], states[1]); assert.deepEqual(states[1], states[2]);
});

function controls() {
  const doc = new EventTarget(), win = new EventTarget(); doc.defaultView = win; doc.hidden = false;
  const canvas = new EventTarget(), joystick = new EventTarget(), captures = new Set(), knob = {style: {}};
  const properties = {ownerDocument: doc, dataset: {}, style: {}, setPointerCapture: id => captures.add(id), hasPointerCapture: id => captures.has(id), releasePointerCapture: id => captures.delete(id)};
  Object.assign(canvas, {...properties, getBoundingClientRect: () => ({width: 400})});
  Object.assign(joystick, {...properties, dataset: {}, style: {}, querySelector: () => knob, setAttribute() {}, getBoundingClientRect: () => ({left: 0, width: 120})});
  return {canvas, joystick, win, doc, captures, input: createAlpineControls({canvas, joystick, config: {trackHalfWidth: 10, joystickReach: 1}})};
}
function fire(target, type, properties = {}) { const event = new Event(type, {cancelable: true}); for (const [k, v] of Object.entries(properties)) Object.defineProperty(event, k, {value: v}); target.dispatchEvent(event); }
test('Alpine opposing keyboard directions stay neutral while the analog stick is held', () => {
  const c = controls(); fire(c.joystick, 'pointerdown', {pointerId: 1, clientX: 86, pointerType: 'touch'});
  assert.equal(c.input.sample({x: 0, lean: 0}).steer, .5);
  fire(c.win, 'keydown', {code: 'ArrowLeft'}); fire(c.win, 'keydown', {code: 'ArrowRight'});
  assert.equal(c.input.sample({x: 0, lean: 0}).steer, 0, 'opposing keyboard inputs do not fall through to a held stick');
  fire(c.win, 'keyup', {code: 'ArrowLeft'}); assert.equal(c.input.sample({x: 0, lean: 0}).steer, 1);
  fire(c.win, 'keyup', {code: 'ArrowRight'}); assert.equal(c.input.sample({x: 0, lean: 0}).steer, .5); c.input.dispose();
});

test('Alpine changing steering surface releases the previous pointer and cannot resume its stale target', () => {
  // A slope drag (right half) is replaced when the stick is pressed: one steering source at a time.
  const c = controls();
  fire(c.canvas, 'pointerdown', {pointerId: 1, clientX: 300, pointerType: 'touch'}); fire(c.canvas, 'pointermove', {pointerId: 1, clientX: 380});
  assert.ok(c.input.sample({x: 0, lean: 0}).steer > .9);
  fire(c.joystick, 'pointerdown', {pointerId: 2, clientX: 10, pointerType: 'touch'});
  assert.equal(c.captures.has(1), false, 'the previous surface releases its pointer capture');
  fire(c.joystick, 'pointerup', {pointerId: 2}); assert.equal(c.input.sample({x: 0, lean: 0}).steer, 0);
  assert.equal(c.input.dragging, false); c.input.dispose();
  // ctrl-ski: a second finger on the slope never takes the stick away from the first.
  const d = controls();
  fire(d.joystick, 'pointerdown', {pointerId: 1, clientX: 110, pointerType: 'touch'});
  assert.ok(d.input.sample({x: 0, lean: 0}).steer > .9);
  fire(d.canvas, 'pointerdown', {pointerId: 2, clientX: 300, pointerType: 'touch'}); fire(d.canvas, 'pointermove', {pointerId: 2, clientX: 100});
  assert.equal(d.captures.has(1), true, 'the stick keeps its pointer'); assert.ok(d.input.sample({x: 0, lean: 0}).steer > .9, 'and its value');
  fire(d.canvas, 'pointerup', {pointerId: 2}); assert.ok(d.input.sample({x: 0, lean: 0}).steer > .9);
  fire(d.joystick, 'pointerup', {pointerId: 1}); assert.equal(d.input.sample({x: 0, lean: 0}).steer, 0); d.input.dispose();
});

test('Alpine floating stick: the left half of the slope puts the stick under the thumb, a thumb drift drags its origin, release goes home', () => {
  const R = 52, c = controls(); c.canvas.getBoundingClientRect = () => ({left: 0, top: 0, width: 400, height: 300});
  c.joystick.getBoundingClientRect = () => ({left: 10, top: 180, width: 120, height: 120});
  // Radius = (120/2 - 8) * .62 = R px: full lock at 32 px from where the thumb landed.
  fire(c.canvas, 'pointerdown', {pointerId: 1, clientX: 150, clientY: 200, pointerType: 'touch'});
  assert.equal(c.input.sample({x: 0, lean: 0}).steer, 0, 'landing alone does not steer');
  assert.equal(c.joystick.dataset.floating, 'true'); assert.match(c.joystick.style.transform, /translate\(/);
  fire(c.canvas, 'pointermove', {pointerId: 1, clientX: 150 + (R / 2)});
  assert.ok(Math.abs(c.input.sample({x: 0, lean: 0}).steer - .5) < .01, 'half the reach is half steer from the landing point');
  fire(c.canvas, 'pointermove', {pointerId: 1, clientX: 150 + R * 3}); assert.equal(c.input.sample({x: 0, lean: 0}).steer, 1);
  // The origin followed the thumb to within 1.25 reach: 1.25 reach back is centre, 2.25 reach back is full left.
  fire(c.canvas, 'pointermove', {pointerId: 1, clientX: 150 + R * 3 - R * 1.25});
  assert.ok(Math.abs(c.input.sample({x: 0, lean: 0}).steer) < .01, 'the dragged origin is the new centre');
  fire(c.canvas, 'pointermove', {pointerId: 1, clientX: 0}); assert.equal(c.input.sample({x: 0, lean: 0}).steer, -1);
  fire(c.canvas, 'pointerup', {pointerId: 1});
  assert.equal(c.input.sample({x: 0, lean: 0}).steer, 0); assert.equal(c.joystick.style.transform, ''); assert.equal(c.joystick.dataset.floating, undefined);
  assert.equal(c.captures.has(1), false); assert.equal(c.input.dragging, false);
  // Every release path clears it.
  for (const end of ['pointercancel', 'lostpointercapture']) { fire(c.canvas, 'pointerdown', {pointerId: 3, clientX: 100, clientY: 200, pointerType: 'touch'}); fire(c.canvas, 'pointermove', {pointerId: 3, clientX: 170}); assert.ok(c.input.sample({x: 0, lean: 0}).steer > .9); fire(c.canvas, end, {pointerId: 3}); assert.equal(c.input.sample({x: 0, lean: 0}).steer, 0, end); }
  fire(c.canvas, 'pointerdown', {pointerId: 4, clientX: 100, clientY: 200, pointerType: 'touch'}); fire(c.canvas, 'pointermove', {pointerId: 4, clientX: 140}); fire(c.win, 'blur'); assert.equal(c.input.sample({x: 0, lean: 0}).steer, 0, 'blur'); assert.equal(c.joystick.style.transform, '');
  c.input.dispose();
});

test('Alpine multi-touch: steering with the left thumb while boost and tricks are pressed with the right', () => {
  const doc = new EventTarget(), win = new EventTarget(); doc.defaultView = win; doc.hidden = false;
  const caps = new Set(), canvas = Object.assign(new EventTarget(), {ownerDocument: doc, dataset: {}, style: {}, getBoundingClientRect: () => ({left: 0, top: 0, width: 800, height: 380}), setPointerCapture: id => caps.add(id), hasPointerCapture: id => caps.has(id), releasePointerCapture: id => caps.delete(id)});
  const joystick = Object.assign(new EventTarget(), {dataset: {}, style: {}, setAttribute() {}, querySelector: () => ({style: {}}), getBoundingClientRect: () => ({left: 20, top: 250, width: 112, height: 112})});
  const boost = Object.assign(new EventTarget(), {disabled: false}), grab = Object.assign(new EventTarget(), {disabled: false, dataset: {trick: 'grab'}});
  const input = createAlpineControls({canvas, boostButton: boost, joystick, trickButtons: [grab], config: {trackHalfWidth: 10}});
  fire(canvas, 'pointerdown', {pointerId: 1, clientX: 120, clientY: 300, pointerType: 'touch'}); fire(canvas, 'pointermove', {pointerId: 1, clientX: 160});
  fire(boost, 'pointerdown', {pointerId: 2, pointerType: 'touch'});
  let sample = input.sample({x: 0, lean: 0}); assert.equal(sample.boost, true); assert.ok(sample.steer > .9, 'the boost tap leaves the stick alone');
  fire(grab, 'pointerdown', {pointerId: 3, pointerType: 'touch'}); sample = input.sample({x: 0, lean: 0}); assert.equal(sample.trick, 'grab'); assert.ok(sample.steer > .9);
  fire(canvas, 'pointerdown', {pointerId: 4, clientX: 700, clientY: 200, pointerType: 'touch'}); assert.ok(input.sample({x: 0, lean: 0}).steer > .9, 'a stray right-hand touch on the slope does not steal the stick');
  input.dispose();
});

function motionPlayer() {
  const clips = Object.fromEntries(Object.entries(motion.states).map(([name, state]) => {
    const values = new Float32Array(state.keyframes.length * 7);
    for (const [i, key] of state.keyframes.entries()) values.set(key.rotations.Hips, i * 7 + 3);
    return [name, {values, times: Float32Array.from(state.keyframes, k => k.time * state.durationSeconds), duration: state.durationSeconds, loop: state.loop}];
  }));
  const bone = new Bone(), player = createAlpineMotionPlayer({names: ['Hips'], stride: 7, clips, transitions: motion.transitions, initialState: motion.initialState}, [bone]); let time = 0, s = 0;
  return {player, bone, step(lean, extra = {}, context = {}) { time += STEP; s += .3; player.update({s, lean, ...extra}, {time, dt: STEP, phase: 'racing', speedKmh: 72, ...context}); }};
}
test('Alpine sustained carving holds the authored pose and reverses within one display update', () => {
  const m = motionPlayer(); m.step(0); m.step(-.8);
  for (let i = 0; i < 120; i++) { m.step(-.8); assert.equal(m.player.metrics().state, 'turn_left', 'a held carve does not pulse back to glide'); }
  assert.ok(m.bone.quaternion.z < -.08, 'a sustained left turn retains the authored lean instead of its neutral ending');
  const before = m.bone.quaternion.clone(); m.step(.8);
  assert.equal(m.player.metrics().state, 'turn_right', 'opposite steering interrupts a ground carve immediately');
  assert.ok(m.bone.quaternion.angleTo(before) < .15, 'side changes blend from the displayed pose');
  for (let i = 0; i < 15; i++) m.step(.8);
  assert.ok(m.bone.quaternion.z > .08, 'the right carve is visibly established after its short authored blend');
  m.step(0); assert.equal(m.player.metrics().state, 'glide', 'neutral steering releases the sustained carve');
});

test('Alpine takeoff and fall interrupt a carve immediately; pause freezes the presentation', () => {
  const m = motionPlayer(); m.step(0); m.step(-1); for (let i = 0; i < 20; i++) m.step(-1);
  m.step(-1, {airborne: true}); assert.equal(m.player.metrics().state, 'air');
  m.step(0, {airborne: false, landing: true}); assert.equal(m.player.metrics().state, 'land');
  m.step(0, {crashed: true}); assert.equal(m.player.metrics().state, 'fall');
  const pose = m.bone.quaternion.toArray(), metrics = m.player.metrics(); m.step(1, {crashed: false}, {phase: 'paused'});
  assert.deepEqual(m.bone.quaternion.toArray(), pose); assert.deepEqual(m.player.metrics(), metrics);
});

test('Alpine joystick reaches full lock at 62% of its travel by default', () => {
  const c = controls(); c.input.dispose();
  const doc = new EventTarget(), win = new EventTarget(); doc.defaultView = win; doc.hidden = false;
  const canvas = Object.assign(new EventTarget(), {ownerDocument: doc, dataset: {}, style: {}, getBoundingClientRect: () => ({width: 400}), setPointerCapture() {}, hasPointerCapture: () => false, releasePointerCapture() {}});
  const joystick = Object.assign(new EventTarget(), {dataset: {}, style: {}, setAttribute() {}, querySelector: () => ({style: {}}), getBoundingClientRect: () => ({left: 0, width: 120}), setPointerCapture() {}, hasPointerCapture: () => false, releasePointerCapture() {}});
  const input = createAlpineControls({canvas, joystick, config: {trackHalfWidth: 10}});
  fire(joystick, 'pointerdown', {pointerId: 1, clientX: 60 + 52 * .62, pointerType: 'touch'});
  assert.ok(Math.abs(input.sample({x: 0, lean: 0}).steer - 1) < .01, 'full lock at 62% of the radius');
  fire(joystick, 'pointermove', {pointerId: 1, clientX: 60 + 52 * .31, pointerType: 'touch'});
  assert.ok(Math.abs(input.sample({x: 0, lean: 0}).steer - .5) < .01, 'half the reach is half steer'); input.dispose();
});

// ---------- ctrl-ski (04/11): body-first response and the left-stick layout ----------
const steerModule = await import('../workout/island/minigames/alpine-steer.mjs');
const MS = 1000 / 60;
function benchEngine() {
  const b = structuredClone(base); b.physics.grid = [{s: 0, x: 0}, ...Array.from({length: 5}, (_, i) => ({s: -200 - i * 5, x: i * 2 - 4}))];
  const e = createAlpineEngine({balance: b, stage: 1, seed: 9, course: {id: 'bench', length: 2400, objects: [], rows: [], path: null, coins: 0}}); e.command({type: 'start'});
  while (e.phase === 'countdown') e.step(1 / 60);
  for (let i = 0; i < 480; i++) { e.command({type: 'steer', value: 0}); e.step(1 / 60); } return e;
}
test('Alpine ctrl-ski: the displayed body leans within 100 ms of the stick (worst case with one frame to sample and one to show), on foot and in boost', () => {
  for (const boosting of [false, true]) {
    const e = benchEngine(); if (boosting) { e.command({type: 'boost'}); for (let i = 0; i < 120; i++) e.step(1 / 60); }
    let tilt = 0, frames = null;
    for (let n = 1; n <= 20 && frames === null; n++) { e.command({type: 'steer', value: 1}); e.step(1 / 60); tilt = steerModule.followBody(tilt, steerModule.bodyTarget(e.snapshot().player), 1 / 60); if (Math.abs(tilt) >= .2) frames = n; }
    assert.ok(frames !== null && frames * MS + 2 * MS <= 100, `${boosting ? 'boost' : 'cruise'}: visible after ${frames} ticks`);
    // And the engine did not need to be changed to move the track: the real lean (lateral speed) is still the slower signal.
    assert.ok(e.snapshot().player.intent >= e.snapshot().player.lean - 1e-9, 'intent leads lean');
  }
});

test('Alpine ctrl-ski: intent is exported for the body, the body falls back to lean without it, and release returns upright', () => {
  assert.equal(steerModule.bodyTarget({lean: .7}), .7); assert.equal(steerModule.bodyTarget({lean: .1, intent: .9}), .9); assert.equal(steerModule.bodyTarget({lean: .3, intent: 0}), .3, 'released stick: the real drift is shown');
  let t = 0; for (let i = 0; i < 12; i++) t = steerModule.followBody(t, 1, 1 / 60); assert.ok(t > .85, `leans in fast: ${t}`);
  for (let i = 0; i < 18; i++) t = steerModule.followBody(t, 0, 1 / 60); assert.ok(Math.abs(t) < .15, `comes up in 300 ms: ${t}`);
  let r = 1; r = steerModule.followBody(r, -1, 1 / 60); assert.ok(r < 1 - .3, 'reversal uses the fast rate');
  const pose = steerModule.carvePose(1, 1), slow = steerModule.carvePose(1, 0); assert.ok(pose.roll < slow.roll && slow.roll < 0, 'banks into a right turn, more at speed'); assert.ok(Math.abs(pose.yaw - .24) < 1e-9);
});

test('Alpine ctrl-ski: shaping at speed softens the attack only, never the ceiling; speed caps and calibration rails hold', () => {
  const P = base.physics; assert.ok(P.steerBoostSoften > 0 && P.steerBoostSoften < .5 && P.lateralBoostDamp <= .1);
  const e = benchEngine(); for (let i = 0; i < 400; i++) { e.command({type: 'steer', value: 0}); e.step(1 / 60); assert.ok(e.debug()[0].speed <= P.baseSpeed + 1e-9); }
  const top = benchEngine(); top.command({type: 'boost'}); for (let i = 0; i < 300; i++) { top.command({type: 'steer', value: 1}); top.step(1 / 60); assert.ok(top.debug()[0].speed <= P.boostSpeed + 1e-9); }
  assert.ok(P.lateralResponse >= 9 && P.steerExpo <= 1.3 && P.steerAttack >= 18, 'response never drops below the previous tuning');
});

test('Alpine ctrl-ski: the stick is always on the left, the actions always on the right: no mirror switch, no saved side, no direction dependence', async () => {
  const css = (await Promise.all(['alpine.css', 'alpine-screen.css', 'alpine-clean.css', 'alpine-polish.css', 'alpine-feel.css'].map(f => readFile(new URL(`../workout/island/minigames/${f}`, import.meta.url), 'utf8')))).join('\n');
  assert.doesNotMatch(css, /left-handed|movement-side|data-movement-side|data-action-side|row-reverse|data-hand/i);
  assert.match(css, /\.alpine-footer\{direction:ltr!important;flex-direction:row!important/);
  const source = (await Promise.all(['alpine-session.mjs', 'alpine-controls.mjs', 'alpine-screen.mjs'].map(f => readFile(new URL(`../workout/island/minigames/${f}`, import.meta.url), 'utf8')))).join('\n');
  assert.doesNotMatch(source, /handed|handedness|controlSides|setHanded|island\.alpine\.(hand|side)/i, 'no handedness or side setting is read');
  assert.ok(source.indexOf("footer.append(joystick, center, actions)") > 0, 'DOM order: stick first, actions last');
});
