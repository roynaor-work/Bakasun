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
  return {canvas, joystick, win, doc, captures, input: createAlpineControls({canvas, joystick, config: {trackHalfWidth: 10}})};
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
  for (const first of ['canvas', 'joystick']) {
    const c = controls(), second = first === 'canvas' ? 'joystick' : 'canvas';
    fire(c[first], 'pointerdown', {pointerId: 1, clientX: first === 'canvas' ? 200 : 110, pointerType: 'touch'});
    if (first === 'canvas') fire(c.canvas, 'pointermove', {pointerId: 1, clientX: 300});
    assert.ok(c.input.sample({x: 0, lean: 0}).steer > .9);
    fire(c[second], 'pointerdown', {pointerId: 2, clientX: second === 'canvas' ? 200 : 10, pointerType: 'touch'});
    assert.equal(c.captures.has(1), false, 'the previous surface releases its pointer capture');
    fire(c[second], 'pointerup', {pointerId: 2}); assert.equal(c.input.sample({x: 0, lean: 0}).steer, 0, first);
    assert.equal(c.input.dragging, false); c.input.dispose();
  }
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
