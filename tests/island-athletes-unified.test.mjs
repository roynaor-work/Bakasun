// Unified athletes (09/11/2026): one rig, one donor, one standard for every sports game; basketball runs like the soccer reference and never walks sideways.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CANON_BONES, CANON_NAMES, jointWorld, sampleCanonical, gaitMetrics, checkGait, checkStand, normaliseTallClip, ATHLETE_STANDARD} from '../workout/island/minigames/athletes-core.mjs';
import {athletesEnabled, buildDonor, checkDonor, applyDonor, setLean, capAbduction, ballArm, tallPlanFor, unifyTallPack, createHeading, stepHeading, sidewaysDeg, HEADING} from '../workout/island/minigames/athletes-gait.mjs';
import {ATHLETE_ROLES, SHARED, unifiedSports, missingForSport} from '../workout/island/minigames/athletes-roles.mjs';
import {decodeTallPack, TALL_BONES} from '../workout/island/minigames/hoops-tall.mjs';
import {loadLibraries} from '../workout/island/tools/athletes/load-libs.mjs';
import {measure} from '../workout/island/tools/athletes/sideways-sim.mjs';

const root = new URL('../workout/island/', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
const rawPack = () => decodeTallPack(JSON.parse(read('assets/hoops-tall/motion.json')));
const donor = JSON.parse(read('assets/athletes-v1/gait-donor.json'));
const libs = loadLibraries();
const tall = (pack, id) => normaliseTallClip(id, pack.clips[id], pack.fps);
const metricsOf = (clip, id) => gaitMetrics(clip, 40, {skip: /ball|dribble/.test(id) ? ballArm(clip) : null});

test('the three motion libraries and the game rig share one canonical bone list and rest pose', () => {
  assert.equal(CANON_NAMES.join(), TALL_BONES.join(), 'basketball pack bone order is the canonical one');
  const tennis = JSON.parse(read('assets/tennis-motion-v1/core.json'));
  assert.deepEqual(tennis.bones.map(b => b.name), CANON_NAMES);
  for (const b of tennis.bones) assert.deepEqual(b.rest, CANON_BONES.find(c => c.name === b.name).rest, 'rest of ' + b.name);
  const rest = jointWorld({rot: {}, hips: [0, 0, 0]});
  assert.ok(Math.abs(rest.Head.p[1] - 1.49) < .02 && rest.LeftFoot.p[1] > .07 && rest.LeftFoot.p[1] < .09, 'standing pose: head and ankle heights');
  for (const lib of ['soccer-v9', 'soccer-v10', 'hoops-tall', 'tennis-v1']) assert.ok(Object.keys(libs[lib]).length >= 10, lib + ' loads as canonical clips');
});

test('the standard is a measurement, not a guess: the soccer reference gaits pass it, the shipped basketball gaits fail it', () => {
  for (const g of ['walk', 'jog', 'run', 'sprint']) {
    const ref = libs[g === 'run' ? 'soccer-v10' : 'soccer-v9'][g];
    assert.deepEqual(checkGait(gaitMetrics(ref, 40), g), [], 'soccer ' + g);
    const b = tall(rawPack(), g), bad = checkGait(metricsOf(b, g), g);
    assert.ok(bad.length >= 2 && bad.some(x => x.startsWith('arms')), `basketball ${g} before: ${bad.join('; ')}`);
  }
});

test('unified basketball gaits and idles pass the standard, every planned clip', () => {
  const pack = rawPack(), report = unifyTallPack(pack, donor);
  assert.equal(report.gait.length, 8, 'walk, jog, run, sprint, with and without the ball');
  assert.ok(report.cap.length >= 25);
  for (const id of Object.keys(pack.clips)) {
    const plan = tallPlanFor(id); if (!plan) continue;
    const m = metricsOf(tall(pack, id), id), bad = plan.kind === 'gait' ? checkGait(m, plan.gait) : checkStand(m);
    assert.deepEqual(bad, [], id);
  }
  // after, the basketball gait is within a few degrees of the soccer reference it takes its arms from
  for (const g of ['walk', 'jog', 'run', 'sprint']) {
    const a = metricsOf(tall(pack, g), g), ref = gaitMetrics(libs[g === 'run' ? 'soccer-v10' : 'soccer-v9'][g], 40);
    assert.ok(Math.abs(a.armAbdMax - ref.armAbdMax) < 2 && Math.abs(a.swingRange - ref.swingRange) < 5 && Math.abs(a.lean - ref.lean) < 1, g);
  }
});

test('actions keep their authored arms: shots, passes, blocks, defence and celebrations are not touched, and legs never change', () => {
  const before = rawPack(), after = rawPack(); unifyTallPack(after, donor);
  let untouched = 0;
  for (const id of Object.keys(before.clips)) {
    const plan = tallPlanFor(id), a = before.clips[id], b = after.clips[id];
    if (!plan) { assert.deepEqual(Array.from(a.quat), Array.from(b.quat), id + ' unchanged'); untouched++; }
    for (const bone of ['Hips', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot', 'Neck', 'Head', 'Root']) {
      const i = CANON_NAMES.indexOf(bone);
      for (let f = 0; f < a.frames; f++) for (let k = 0; k < 4; k++) assert.equal(a.quat[(f * 18 + i) * 4 + k], b.quat[(f * 18 + i) * 4 + k], `${id} ${bone} frame ${f}`);
    }
    assert.deepEqual(Array.from(a.hips), Array.from(b.hips), id + ' hips');
  }
  assert.ok(untouched > 40);
  for (const id of ['defensive_slide_left', 'defensive_stance', 'closeout', 'jump_shot', 'block_two_hands', 'dunk_one_hand', 'celebrate_fist']) assert.equal(tallPlanFor(id), null, id);
});

test('the hand that holds the ball stays with the ball (the trunk lean moves it by under 4.5 cm); only the other arm takes the donor swing', () => {
  const before = rawPack(), after = rawPack(); unifyTallPack(after, donor);
  for (const id of Object.keys(before.clips).filter(id => /ball|dribble/.test(id) && tallPlanFor(id))) {
    const A = tall(before, id), B = tall(after, id), arm = ballArm(A);
    let max = 0; A.frames.forEach((f, i) => { const h = jointWorld({rot: f.rot, hips: f.hips})[arm + 'Hand'].p, g = jointWorld({rot: B.frames[i].rot, hips: B.frames[i].hips})[arm + 'Hand'].p; max = Math.max(max, Math.hypot(h[0] - g[0], h[1] - g[1], h[2] - g[2])); });
    assert.ok(max < .045, `${id}: ${arm} hand moved ${(max * 100).toFixed(1)} cm`);
  }
  const A = tall(after, 'run_ball'), arm = ballArm(A), other = arm === 'Right' ? 'Left' : 'Right';
  assert.ok(metricsOf(A, 'run_ball').swingRange > 80, 'the free arm swings like the soccer one');
  assert.notEqual(other, arm);
});

test('donor file: valid, soccer sources, one entry per gait, rig matches', () => {
  assert.doesNotThrow(() => checkDonor(donor));
  assert.deepEqual(Object.keys(donor.gaits), ['walk', 'jog', 'run', 'sprint']);
  assert.ok(donor.gaits.run.source.startsWith('soccer-v10'));
  assert.throws(() => checkDonor({schemaVersion: 1, rig: ['x'], gaits: {}}), /another rig/);
  const rebuilt = buildDonor({walk: libs['soccer-v9'].walk, jog: libs['soccer-v9'].jog, run: libs['soccer-v10'].run, sprint: libs['soccer-v9'].sprint});
  for (const g of Object.keys(donor.gaits)) assert.ok(Math.abs(rebuilt.gaits[g].lean - donor.gaits[g].lean) < .01, 'donor is up to date with the soccer packs: ' + g);
});

test('edit primitives: capAbduction brings the arms to the cap and never pushes them out; setLean only adds; applyDonor aligns the phase', () => {
  const clip = tall(rawPack(), 'idle_ready'), m0 = gaitMetrics(clip, 24);
  assert.ok(m0.armAbdMax > 30);
  assert.ok(capAbduction(clip, 14) > 0);
  const m1 = gaitMetrics(clip, 24); assert.ok(m1.armAbdMax < 14.6 && m1.armAbdMax > 12, 'cap reached: ' + m1.armAbdMax);
  assert.equal(capAbduction(clip, 14), 0, 'second pass changes nothing');
  const run = tall(rawPack(), 'run'), lean = gaitMetrics(run, 24).lean;
  assert.equal(setLean(run, lean - 2), lean, 'a lean already above the target stays');
  assert.ok(setLean(run, lean + 3) > lean + 2.8, 'lean raised to the target');
  // arm-leg coordination: the share of the cycle in which the opposite arm and leg are forward together, measured like the soccer reference
  const opposition = clip => { let agree = 0; for (let i = 0; i < 48; i++) { const w = jointWorld(sampleCanonical(clip, i / 48 * clip.dur)); agree += (w.LeftFoot.p[2] - w.RightFoot.p[2]) * (w.RightHand.p[2] - w.LeftHand.p[2]) > 0 ? 1 : 0; } return agree / 48; };
  for (const g of ['walk', 'jog']) {
    const host = tall(rawPack(), g), ref = opposition(libs['soccer-v9'][g]), was = opposition(host); applyDonor(host, donor.gaits[g]);
    assert.ok(Math.abs(opposition(host) - ref) < .08, `${g}: arms follow the legs like the reference (${opposition(host).toFixed(2)} vs ${ref.toFixed(2)}, was ${was.toFixed(2)})`);
  }
});

test('heading: a runner runs where he is going, a defender and a shooter keep the simulation face, a standing player turns to the face, no flicker', () => {
  const dt = 1 / 60, run = (p, ctx, seconds, start) => { const h = createHeading(start ?? p.face); let y = h.yaw; for (let i = 0; i < seconds * 60; i++) y = stepHeading(h, p, ctx, dt); return {y, h}; };
  // face the hoop (0) while running to the right (+x): sideways before, forward after
  const p = {face: 0, vx: 5, vz: 0}, r = run(p, {defending: false, hasBall: false}, .5);
  assert.ok(sidewaysDeg(0, p.vx, p.vz) > 80 && sidewaysDeg(r.y, p.vx, p.vz) < 5, 'runs sideways before, forward after');
  // running backwards from the face
  const b = run({face: 0, vx: 0, vz: -4}, {defending: false, hasBall: false}, .6); assert.ok(sidewaysDeg(b.y, 0, -4) < 5);
  // a defender who slides keeps facing his man
  const d = run({face: 0, vx: 3, vz: 0}, {defending: true, hasBall: false}, .5); assert.equal(Math.round(d.y * 100) / 100, 0);
  // ...but a defender sprinting (4.2 and over) runs where he goes
  const s = run({face: 0, vx: 6, vz: 0}, {defending: true, hasBall: false}, .5); assert.ok(sidewaysDeg(s.y, 6, 0) < 5);
  // acting players keep the face
  const a = run({face: 1, vx: 4, vz: 0, act: 'shoot'}, {defending: false, hasBall: true}, .5); assert.ok(Math.abs(a.y - 1) < .01);
  // slow or standing: the body takes the face
  const st = run({face: 2, vx: 0, vz: 0}, {defending: false, hasBall: false}, .6, 0); assert.ok(Math.abs(st.y - 2) < .01);
  // hysteresis: an off-angle that wobbles around 28 degrees (between release 16 and engage 40) does not toggle the mode
  const h = createHeading(0), seen = []; let last = null, flips = 0;
  for (let i = 0; i < 240; i++) { const off = (28 + 6 * Math.sin(i / 7)) * Math.PI / 180; stepHeading(h, {face: 0, vx: 4 * Math.sin(off), vz: 4 * Math.cos(off)}, {}, dt); if (last !== null && last !== h.following) flips++; last = h.following; seen.push(h.following); }
  assert.ok(flips <= 0, 'no flip inside the dead band: ' + flips);
  assert.ok(HEADING.release < HEADING.engage);
});

test('sideways on the real engine: AI against AI, the share of moving player ticks whose body faces away from the travel direction by over 45 degrees falls from over half to under 8 percent', () => {
  const r = measure({games: 2, seconds: 120});
  assert.ok(r.before.playerTicksMoving > 20000, 'enough moving ticks: ' + r.before.playerTicksMoving);
  assert.ok(r.before.over45Pct > 25, 'before: ' + r.before.over45Pct);
  assert.ok(r.after.over45Pct < 8 && r.after.over90Pct < 5, 'after: ' + JSON.stringify(r.after));
});

test('flags and roles: ?athletes=0 switches the layer off; basketball is unified, soccer is the reference, hockey lists what it still needs', () => {
  assert.equal(athletesEnabled({athletes: {enabled: true}}, '?athletes=0'), false);
  assert.equal(athletesEnabled({athletes: {enabled: false}}, '?athletes=1'), true);
  assert.equal(athletesEnabled({athletes: {enabled: false}}, ''), false);
  assert.equal(athletesEnabled({athletes: {enabled: true}}, new URLSearchParams('')), true);
  const config = JSON.parse(read('data/config.json')).minigames.streetSlam.assets.tall;
  assert.equal(config.athletes.enabled, true);
  assert.equal(config.athletes.donor, SHARED.donor);
  assert.deepEqual(unifiedSports().sort(), ['basketball', 'soccer']);
  assert.ok(missingForSport(ATHLETE_ROLES.hockey).length >= 5);
  assert.deepEqual(missingForSport(ATHLETE_ROLES.basketball), []);
  assert.equal(SHARED.feelScoreMin, ATHLETE_STANDARD.feelScoreMin);
  assert.ok(SHARED.feelScoreMin >= 88);
});

test('wiring: the basketball loader applies the layer behind the flag and falls back, the avatar uses the heading, the view reads the visible face for the ball', () => {
  const tallSrc = read('minigames/hoops-tall.mjs'), view = read('minigames/hoops-view.mjs');
  assert.ok(/unifyTallPack\(pack,await dr\.json\(\)\)/.test(tallSrc) && /onFallback\?\.\('athletes',error\)/.test(tallSrc));
  assert.ok(/stepHeading\(heading,p,/.test(tallSrc) && /av\.visualFace=/.test(tallSrc));
  assert.equal((view.match(/av\.visualFace\?\?handler\.face/g) || []).length, 2);
  const offline = JSON.parse(read('offline-manifest.json'));
  assert.ok(offline.games.hoops.includes('assets/athletes-v1/gait-donor.json'));
  assert.ok(offline.shell.includes('minigames/athletes-gait.mjs') && offline.shell.includes('minigames/athletes-core.mjs'));
});
