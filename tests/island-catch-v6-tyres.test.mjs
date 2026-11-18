import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createTyreGun, TYRES, STRINGS as GUN_STRINGS} from '../workout/island/minigames/catch-tyres.mjs';
import {seededRandom} from '../workout/island/minigames/catch-track.mjs';
import {TYRE_FX, flatSquash, leanFor, ribbonStrip, createTyreFx} from '../workout/island/minigames/catch-tyre-fx.mjs';
import {STRINGS, reticleQuality, reloadProgress, pipStates, resolveText, installFireHud} from '../workout/island/minigames/catch-fire-hud.mjs';

/** Agent B of the v6 deep round: the tyre gun's presentation (catch-tyre-fx.mjs, catch-fire-hud.mjs) and its pure helpers.
 * The rules (catch-tyres.mjs) are covered by island-catch-v6-rules.test.mjs; here they are only driven, in a small chase model,
 * to report how long the tyres take to stop the thief per stage. */
const root = new URL('../workout/island/', import.meta.url);
const ctx = (over = {}) => ({gap: 12, lateral: .4, vOfficer: 24, vThief: 21, stun: 0, scraping: false, thiefSwerve: 0, curvature: 0, ...over});

test('fire hud helpers: reticle colours at the contract thresholds, reload arc, ammo pips with the trickle', () => {
  assert.equal(reticleQuality(.61), 'green'); assert.equal(reticleQuality(.6), 'yellow'); assert.equal(reticleQuality(.31), 'yellow'); assert.equal(reticleQuality(.3), 'grey'); assert.equal(reticleQuality(0), 'grey');
  assert.equal(reloadProgress({reload: 0}, {reloadSeconds: 1}), 1);
  assert.equal(reloadProgress({reload: .25}, {reloadSeconds: 1}), .75);
  assert.equal(reloadProgress({reload: 2}, {reloadSeconds: 1}), 0, 'clamped');
  const full = pipStates({ammo: 6, ammoMax: 6, trickle: 5}, {trickleSeconds: 5});
  assert.deepEqual(full.pips, Array(6).fill('full')); assert.equal(full.trickle, 0, 'a full magazine shows no refill');
  const part = pipStates({ammo: 2, ammoMax: 6, trickle: 1.25}, {trickleSeconds: 5});
  assert.deepEqual(part.pips, ['full', 'full', 'next', 'used', 'used', 'used']); assert.equal(part.trickle, .75);
  const empty = pipStates({ammo: 0, ammoMax: 8, trickle: 5}, {trickleSeconds: 5});
  assert.equal(empty.pips[0], 'next'); assert.equal(empty.pips.filter(p => p === 'used').length, 7);
  // the real gun state feeds the helpers directly
  const g = createTyreGun({stage: 4, rnd: () => 1}); g.step(1 / 60, ctx()); g.fire();
  const live = pipStates(g.state, g.balance); assert.equal(live.pips.length, g.state.ammoMax); assert.equal(live.pips[g.state.ammo], 'next');
  assert.ok(reloadProgress(g.state, g.balance) < 1);
});

test('fire hud strings: Hebrew with a fallback, no exclamation marks, no Arabic, placeholders filled', () => {
  for (const [k, v] of Object.entries({...STRINGS, ...GUN_STRINGS})) { assert.ok(/[א-ת]/.test(v), k + ' is Hebrew'); assert.equal(v.includes('!'), false, k); assert.equal(/[؀-ۿ]/.test(v), false, k); }
  assert.equal(resolveText(k => k, 'catch.lockHint'), STRINGS['catch.lockHint'], 'a missing line falls back to the module');
  assert.equal(resolveText(() => undefined, 'catch.fire'), STRINGS['catch.fire']);
  assert.equal(resolveText(k => (k === 'catch.ammo' ? 'כדורים {count}' : k), 'catch.ammo', {count: 3}), 'כדורים 3', 'the session line wins and gets its vars');
  assert.equal(resolveText(k => k, 'catch.ammo', {count: 5}), 'כדורים: 5');
  assert.equal(resolveText(k => k, 'catch.hitChance', {percent: 62}), 'סיכוי לפגיעה 62%');
});

test('fire hud source: no document key listener (the session owns f/x), the button keeps the catch-fire class, its own style', async () => {
  const src = await readFile(new URL('minigames/catch-fire-hud.mjs', root), 'utf8');
  assert.equal(/document\.addEventListener\(\s*['"]keydown/.test(src), false, 'no keydown on the document');
  assert.equal(/doc\.addEventListener\(\s*['"]keydown/.test(src), false);
  assert.ok(src.includes("'catch-fire'"), 'the button class the browser test looks for');
  assert.ok(src.includes('data-catch-fire-hud'), 'injects its own style element');
  assert.equal(/[؀-ۿ]/.test(src), false, 'no Arabic letters');
  const fxSrc = await readFile(new URL('minigames/catch-tyre-fx.mjs', root), 'utf8');
  assert.equal(/^import\s/m.test(fxSrc), false, 'the fx module takes Three.js as a parameter, it imports nothing');
  assert.equal(/[؀-ۿ]/.test(fxSrc), false);
});

test('fire hud in a fake DOM: installs once, replaces the temporary controls, refresh/handle/show/dispose, the button fires', () => {
  const made = [];
  const el = (tag) => {
    const n = {tag, children: [], dataset: {}, style: {props: {}, setProperty(k, v) { this.props[k] = v; }, removeProperty(k) { delete this.props[k]; }}, attrs: {}, listeners: {}, hidden: false, className: '', textContent: '', parent: null, offsetWidth: 1,
      classList: {set: new Set(), add(c) { this.set.add(c); }, remove(c) { this.set.delete(c); }, contains(c) { return this.set.has(c); }},
      append(...kids) { for (const k of kids) { k.parent = n; n.children.push(k); } }, remove() { if (n.parent) n.parent.children = n.parent.children.filter(c => c !== n); n.parent = null; },
      replaceChildren(...kids) { n.children = []; n.append(...kids); }, setAttribute(k, v) { n.attrs[k] = String(v); }, getAttribute(k) { return n.attrs[k]; },
      addEventListener(type, fn) { (n.listeners[type] ||= []).push(fn); }, dispatch(type, e = {}) { for (const fn of n.listeners[type] || []) fn({preventDefault() {}, ...e}); },
      querySelector(sel) { return n.querySelectorAll(sel)[0] || null; },
      querySelectorAll(sel) { const classes = sel.split(',').map(s => s.trim().replace(/^:scope > /, '')); const out = []; const walk = m => { for (const c of m.children) { for (const cl of classes) { if (cl.startsWith('.') && String(c.className).split(' ').includes(cl.slice(1))) out.push(c); else if (cl.startsWith('style[') && c.tag === 'style' && c.dataset.catchFireHud) out.push(c); } walk(c); } }; walk(n); return out; },
    };
    Object.defineProperty(n, 'innerHTML', {set(v) { n.html = v; }, get() { return n.html || ''; }});
    made.push(n); return n;
  };
  const doc = {createElement: tag => el(tag), createElementNS: (ns, tag) => el(tag)};
  const stageEl = el('div'), hud = el('div'); hud.ownerDocument = doc; stageEl.append(hud);
  // the session's temporary controls, with the same class names
  const oldFire = el('button'); oldFire.className = 'catch-fire'; const oldAmmo = el('div'); oldAmmo.className = 'catch-ammo'; const oldRet = el('div'); oldRet.className = 'catch-reticle'; hud.append(oldFire, oldAmmo, oldRet);
  const gun = createTyreGun({stage: 1, rnd: () => 0});
  let fired = 0, visible = true;
  const api = installFireHud({hud, stageEl, t: k => k, gun: () => gun, project: (x, y, z) => ({x: x * 10, y: y * 10 + z, visible}), crimWorld: () => ({x: 5, y: .5, z: 1}), onFire: () => { fired++; gun.fire(); }});
  assert.deepEqual(Object.keys(api).sort(), ['button', 'dispose', 'handle', 'refresh', 'show']);
  assert.equal(hud.querySelectorAll('.catch-fire').length, 1, 'one fire button on the page: the temporary one left');
  assert.equal(hud.querySelectorAll('.catch-ammo').length, 1); assert.equal(hud.querySelectorAll('.catch-reticle').length, 1);
  assert.equal(stageEl.children.filter(c => c.tag === 'style').length, 1, 'one style element');
  const button = api.button, reticle = hud.querySelector('.catch-reticle'), ammo = hud.querySelector('.catch-ammo');
  // not locked yet: the button shows greyed, the reticle hides
  gun.step(1 / 60, ctx({gap: 60})); api.refresh();
  assert.equal(button.hidden, false); assert.equal(button.dataset.locked, 'false'); assert.equal(reticle.hidden, true);
  assert.equal(ammo.children.length, gun.state.ammoMax); assert.equal(ammo.children.every(p => p.dataset.state === 'full'), true);
  // locked: the reticle sits on the projected car, coloured by the chance; the lock event pops it and shows the hint once
  gun.step(1 / 60, ctx({gap: 10})); api.refresh(); api.handle(gun.drainEvents());
  assert.equal(button.dataset.locked, 'true'); assert.equal(reticle.hidden, false); assert.equal(reticle.style.left, '50px'); assert.equal(reticle.dataset.q, reticleQuality(gun.state.hitChance));
  assert.ok(reticle.classList.contains('lock'));
  const hint = hud.children.find(c => c.className === 'catch-lock-hint'); assert.equal(hint.hidden, false, 'the hint shows on the first lock');
  // the button fires through onFire and spends a bullet; the reload arc and pip states follow
  button.dispatch('pointerdown'); assert.equal(fired, 1); assert.equal(gun.state.ammo, gun.state.ammoMax - 1);
  api.handle(gun.drainEvents()); api.refresh();
  assert.ok(reticle.classList.contains('hit'), 'a hit flashes the reticle');
  assert.equal(button.dataset.reload, 'true'); assert.equal(ammo.children[gun.state.ammo].dataset.state, 'next');
  const arc = button.children[0].children[0]; assert.ok(Number(arc.attrs['stroke-dashoffset']) > 0, 'the reload arc is partly drawn');
  // keyboard on the button fires too (Enter), the session's document keys are not duplicated here
  for (let i = 0; i < 70; i++) gun.step(1 / 60, ctx({gap: 10})); api.refresh();
  button.dispatch('keydown', {key: 'Enter'}); assert.equal(fired, 2);
  api.handle(gun.drainEvents()); api.refresh();
  assert.equal(gun.state.stopped, true, 'two hits at stage 1 stop the car'); assert.equal(button.hidden, true, 'the fire control leaves with the stopped car'); assert.equal(reticle.hidden, true);
  // show(false) hides everything; dispose detaches
  const g2 = createTyreGun({stage: 1, rnd: () => 1}); const api2 = installFireHud({hud, stageEl, t: k => k, gun: () => g2, project: () => ({x: 0, y: 0, visible: true}), crimWorld: () => ({x: 0, y: 0, z: 0}), onFire: () => {}});
  assert.equal(stageEl.children.filter(c => c.tag === 'style').length, 1, 'the style is injected once per stage');
  g2.step(1 / 60, ctx({gap: 10})); api2.refresh(); assert.equal(api2.button.hidden, false);
  api2.show(false); assert.equal(api2.button.hidden, true);
  api2.dispose(); assert.equal(hud.querySelectorAll('.catch-fire').length, 0);
});

test('tyre fx helpers: the flat squash keeps the tyre on the road, the lean follows the flat corners, the ribbon strip is a clean triangle strip', () => {
  const sq = flatSquash(.32); assert.equal(sq.scaleY, TYRE_FX.squashY); assert.ok(Math.abs(sq.drop - .32 * (1 - TYRE_FX.squashY)) < 1e-9, 'the hub drops by what the squash takes off the radius');
  assert.deepEqual(leanFor(new Set()), {roll: 0, pitch: 0});
  const rl = leanFor(['RL']); assert.ok(rl.roll < 0 && rl.pitch > 0, 'rear-left flat: left side down, rear down');
  const rr = leanFor(['RR']); assert.ok(rr.roll > 0 && rr.pitch > 0);
  const both = leanFor(['RL', 'RR']); assert.equal(both.roll, 0); assert.ok(Math.abs(both.pitch - 2 * TYRE_FX.pitchPerFlat) < 1e-9, 'two rear flats: level sideways, the tail down');
  assert.ok(Math.abs(leanFor(['FL']).pitch + TYRE_FX.pitchPerFlat) < 1e-9, 'a front flat drops the nose');
  assert.equal(ribbonStrip([{x: 0, z: 0}], .4).count, 0, 'one point draws nothing');
  const strip = ribbonStrip([{x: 0, z: 0}, {x: 1, z: 0}, {x: 2, z: 0}], .4, .03);
  assert.equal(strip.count, 6);
  assert.deepEqual(Array.from(strip.positions.slice(0, 6)).map(v => +v.toFixed(3)), [0, .03, .2, 0, .03, -.2], 'two vertices across the direction of travel, width apart');
  assert.deepEqual(Array.from(strip.positions.slice(12, 18)).map(v => +v.toFixed(3)), [2, .03, .2, 2, .03, -.2]);
  // a turn: the cross vector follows the local direction
  const turn = ribbonStrip([{x: 0, z: 0}, {x: 1, z: 0}, {x: 1, z: 1}], 1);
  const p = Array.from(turn.positions.slice(12, 18)); assert.ok(Math.abs(p[0] - .5) < 1e-9 && Math.abs(p[2] - 1) < 1e-9, 'at the end the strip runs along +z so its width lies along x');
  const into = new Float32Array(3 * 6); ribbonStrip([{x: 0, z: 0}, {x: 1, z: 1}, {x: 2, z: 2}], .2, .03, into); assert.ok(into.some(v => v !== 0), 'writes into the given array');
});

test('tyre fx with a stub Three.js: flat wheels get a non-spinning squash pivot, the body leans, ribbons grow in the skid, dispose restores', () => {
  // a minimal Three.js stand-in: enough object/vector behaviour for createTyreFx
  class V3 { constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; } set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } copy(v) { return this.set(v.x, v.y, v.z); } clone() { return new V3(this.x, this.y, this.z); } sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; } length() { return Math.hypot(this.x, this.y, this.z); } normalize() { const l = this.length() || 1; this.x /= l; this.y /= l; this.z /= l; return this; } addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; } setScalar(s) { return this.set(s, s, s); } }
  class Q { copy() { return this; } identity() { return this; } setFromUnitVectors() { return this; } }
  class Obj { constructor() { this.children = []; this.parent = null; this.position = new V3(); this.scale = new V3(1, 1, 1); this.rotation = {x: 0, y: 0, z: 0}; this.quaternion = new Q(); this.userData = {}; this.visible = true; this.name = ''; } add(...kids) { for (const k of kids) { k.parent = this; this.children.push(k); } return this; } remove(...kids) { this.children = this.children.filter(c => !kids.includes(c)); for (const k of kids) k.parent = null; return this; } getWorldPosition(out) { let x = 0, y = 0, z = 0, n = this; while (n) { x += n.position.x; y += n.position.y; z += n.position.z; n = n.parent; } return out.set(x, y, z); } getWorldScale(out) { return out.set(1, 1, 1); } localToWorld(v) { const w = this.getWorldPosition(new V3()); return v.set(v.x + w.x, v.y + w.y, v.z + w.z); } traverse(fn) { fn(this); for (const c of this.children) c.traverse(fn); } }
  class Mat { constructor(p = {}) { Object.assign(this, p); this.opacity = p.opacity ?? 1; } dispose() {} }
  class Geo { constructor() { this.attributes = {}; this.drawRange = {start: 0, count: 0}; } setAttribute(k, a) { this.attributes[k] = a; } setIndex() {} setDrawRange(s, c) { this.drawRange = {start: s, count: c}; } dispose() {} }
  const T = {Vector3: V3, Quaternion: Q, Group: class extends Obj {}, Sprite: class extends Obj { constructor(m) { super(); this.material = m; } }, Mesh: class extends Obj { constructor(g, m) { super(); this.geometry = g; this.material = m; } },
    SpriteMaterial: Mat, MeshBasicMaterial: Mat, MeshStandardMaterial: Mat, BufferGeometry: Geo, PlaneGeometry: Geo, BoxGeometry: Geo, BufferAttribute: class { constructor(a, n) { this.array = a; this.itemSize = n; this.count = a.length / n; } },
    Box3: class { setFromObject(o) { this.o = o; return this; } getSize(out) { return out.set(.3, .64, .64); } }, AdditiveBlending: 1, DoubleSide: 2};
  const scene = new Obj(), playerCar = new Obj(), crimCar = new Obj(), inner = new Obj(), model = new Obj(); crimCar.add(inner); inner.add(model);
  const wheels = []; for (const [id, x, z] of [['FL', 1.3, -.8], ['FR', 1.3, .8], ['RL', -1.3, -.8], ['RR', -1.3, .8]]) { const w = new Obj(); w.name = 'Wheel_' + id; w.position.set(x, .32, z); model.add(w); wheels.push(w); }
  crimCar.userData.wheels = wheels; crimCar.position.set(40, 0, 1);
  const emits = [], part = {emit(x, y, z, n, o) { emits.push({x, y, z, n, o}); }};
  const gfx = {glowTexture: () => ({}), canvasTexture: () => ({}), blobShadow: () => new Obj()};
  const fx = createTyreFx({T, scene, playerCar, crimCar, sparks: part, dust: part, gfx});
  assert.equal(fx.inner, inner, 'the body that leans is the fitted model under the car root');
  fx.handle([{type: 'shot', hit: true, wheel: 'RL', x: -1.4, y: .35, z: -.9}, {type: 'flat', wheel: 'RL', flatCount: 1}]);
  const rl = wheels[2];
  assert.equal(rl.parent.name, 'Wheel_RL_flat', 'the wheel sits in a squash pivot');
  assert.equal(rl.parent.scale.y, TYRE_FX.squashY); assert.ok(rl.parent.position.y < .32, 'the hub drops'); assert.equal(rl.position.y, 0);
  assert.ok(rl.children.length === 1, 'a rubber flap hangs on the rim');
  assert.ok(emits.some(e => e.n >= 20), 'a spark burst on the hit');
  assert.equal(crimCar.userData.flatLean, 0, 'the view adds nothing on the root: the lean lives on the inner model');
  for (let i = 0; i < 60; i++) fx.update(1 / 60, {thiefSpeed: 16, flatCount: 1, skid: false});
  assert.ok(inner.rotation.x < -.03, 'the body rolls onto the flat left-rear corner'); assert.ok(inner.rotation.z > .015, 'and sits down at the back');
  const smoke = emits.filter(e => e.o.gravity < 0).length; assert.ok(smoke >= 5, 'smoke puffs trail from the flat wheel: ' + smoke);
  // the second flat and the stop: the skid ribbons grow with the car's positions, then a puff at the halt
  fx.handle([{type: 'shot', hit: true, wheel: 'RR', x: -1.4, y: .35, z: .9}, {type: 'flat', wheel: 'RR', flatCount: 2}, {type: 'stopped'}]);
  assert.ok(Math.abs(inner.rotation.x) < .07, 'two rear flats: the roll cancels over time');
  const before = emits.length;
  for (let i = 0; i < 40; i++) { crimCar.position.x += .25; crimCar.rotation.y = i / 40 * .8; fx.update(1 / 60, {thiefSpeed: 10 - i * .25, flatCount: 2, skid: true}); }
  assert.ok(fx.ribbonPoints('RL') >= 30 && fx.ribbonPoints('RR') >= 30, 'ribbons behind both rear wheels: ' + fx.ribbonPoints('RL'));
  for (let i = 0; i < 20; i++) fx.update(1 / 60, {thiefSpeed: 0, flatCount: 2, skid: false});
  assert.ok(emits.slice(before).some(e => e.n >= 16), 'a puff when the car stands still');
  fx.dispose();
  assert.equal(rl.parent, model, 'dispose puts the wheel back'); assert.equal(rl.position.y, .32); assert.equal(rl.children.length, 0);
  assert.ok(!scene.children.some(c => c.material?.map), 'bolt and ring are gone');
});

test('tyres per stage: seconds to a stop and the share stopped within 30 s in a small chase model (200 chases per stage)', () => {
  // a plain model of what the rules see: the gap wanders between 10 and 30 m, the thief swerves now and then, the road bends by the stage,
  // and the officer fires whenever the reticle is at least yellow and the gun is ready. Reported for the balance report, loosely asserted.
  const rows = [];
  for (let stage = 1; stage <= 10; stage++) {
    const curve = [.3, .4, .5, .6, .7, .8, .9, 1, 1, 1][stage - 1];
    let stoppedIn30 = 0, totalT = 0, stopped = 0;
    for (let run = 0; run < 200; run++) {
      const rnd = seededRandom(stage * 1000 + run), g = createTyreGun({stage, rnd});
      let t = 0, gap = 20, swerve = 0, done = 0, fireCool = 0;
      const dt = 1 / 30, phase = rnd() * 7;
      while (t < 45) {
        t += dt; fireCool -= dt;
        gap += (Math.sin(t * .35 + phase) * 10 + 20 - gap) * dt * .8 + (rnd() - .5) * .6;
        gap = Math.max(6, Math.min(34, gap));
        if (rnd() < .02) swerve = (rnd() - .5) * 2; swerve *= .97;
        const k = Math.sin(t * .5 + phase) * curve / 60;
        g.step(dt, ctx({gap, lateral: swerve * 2.5 + Math.sin(t * .7) * .8, thiefSwerve: swerve, curvature: k, stun: rnd() < .01 ? .5 : 0}));
        if (g.state.locked && g.state.reload === 0 && g.state.hitChance > .3 && fireCool <= 0) { fireCool = .35; g.fire(); }
        for (const e of g.drainEvents()) if (e.type === 'stopped') done = t;
        if (done) break;
      }
      if (done) { stopped++; totalT += done; if (done <= 30) stoppedIn30++; }
    }
    rows.push({stage, stoppedPct: stoppedIn30 / 2, meanSeconds: stopped ? +(totalT / stopped).toFixed(1) : null});
  }
  console.log('tyre stops per stage (model driver, 200 chases):\n' + rows.map(r => `  stage ${String(r.stage).padStart(2)}: ${r.stoppedPct}% stopped within 30 s, mean ${r.meanSeconds} s`).join('\n'));
  assert.ok(rows[0].stoppedPct >= 70, 'stage 1 nearly always stops the car by its tyres: ' + rows[0].stoppedPct);
  assert.ok(rows[9].stoppedPct < rows[0].stoppedPct, 'stage 10 is harder than stage 1');
  assert.ok(rows[9].stoppedPct > 0, 'stage 10 is still possible: ' + rows[9].stoppedPct);
  // the reference numbers are the real chase simulation (tools/catch-sim.mjs --v6, see REPORT.md); this model is cruder and sits lower on stages 9-10
});
