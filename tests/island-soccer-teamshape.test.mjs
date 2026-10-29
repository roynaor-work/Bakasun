import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fieldTarget} from '../workout/island/minigames/soccer-tactics.mjs';
import {passLaneClearance} from '../workout/island/minigames/soccer-teamplay.mjs';

const config = JSON.parse(await readFile(new URL('../workout/island/data/config.json', import.meta.url), 'utf8')).minigames.soccer;
const player = (id, team, role, x, z, extra = {}) => ({id, team, role, x, z, vx: 0, vz: 0, recover: 0, slideTime: 0, duty: null, ...extra});
const without = key => ({...config, tactics: {...config.tactics, [key]: undefined}});
function state(players, owner, ball) { players.sort((a, b) => a.id - b.id); return {players, attackDir: 1, difficulty: 'normal', campaign: null, ball: {owner, x: ball.x, z: ball.z, vx: 0, vz: 0, y: config.physics.ballRadius}}; }

test('the cover defender screens the pass from the carrier to the most advanced attacker', () => {
  const players = [
    player(0, 0, 'striker', 3, 0.6), player(1, 0, 'support', -2, -6), player(2, 0, 'keeper', -16, 0), player(6, 0, 'wing', 0, 7),
    player(3, 1, 'striker', 2, 0), player(4, 1, 'support', -7, 6.5), player(5, 1, 'keeper', 16, 0), player(7, 1, 'wing', 1, -8),
  ];
  const byId = id => players.find(p => p.id === id), carrier = byId(3), threat = byId(4), s = state(players, 3, carrier);
  const lane = t => passLaneClearance(t, carrier, threat);
  const moved = [1, 6].map(id => ({id, covered: fieldTarget(byId(id), s, config), zone: fieldTarget(byId(id), s, without('coverLane'))}));
  const screens = moved.filter(m => lane(m.covered) < lane(m.zone) - 0.5), holds = moved.filter(m => m.covered.x === m.zone.x && m.covered.z === m.zone.z);
  assert.equal(screens.length, 1, 'exactly one non-pressing defender takes the passing lane');
  assert.equal(holds.length, 1, 'the other keeps its zone and the team keeps its width');
  const covered = screens[0].covered;
  assert.equal(covered.duty, 'cover');
  assert.ok(covered.x < carrier.x, 'cover stays goal-side of the ball');
  const again = fieldTarget(byId(screens[0].id), s, config);
  assert.deepEqual(again, covered, 'deterministic for the same visible state');
});

test('a pressed carrier gets a safe diagonal outlet behind the ball; an unpressed one gets a forward run', () => {
  const pressed = [
    player(0, 0, 'striker', 4, 0), player(1, 0, 'support', 6, -5), player(2, 0, 'keeper', -16, 0), player(6, 0, 'wing', 6, 6),
    player(3, 1, 'striker', 5.2, 1.2), player(4, 1, 'support', 9, -4), player(5, 1, 'keeper', 16, 0), player(7, 1, 'wing', 10, 5),
  ];
  const s = state(pressed, 0, pressed.find(p => p.id === 0)), t = fieldTarget(s.players[1], s, config);
  assert.equal(t.duty, 'outlet');
  const c0 = s.players[0];
  assert.ok(t.x < c0.x, 'outlet drops behind the carrier');
  assert.ok(Math.abs(t.z - c0.z) > 1.5, 'and offers width');
  assert.ok(t.z < c0.z, 'on the side away from the presser');
  const free = s.players.map(p => (p.id === 3 ? {...p, x: 12, z: 6} : p)), fs = state(free, 0, free[0]), u = fieldTarget(fs.players[1], fs, config);
  assert.equal(u.duty, 'support');
  assert.equal(fieldTarget(s.players[6], s, config).duty, 'support', 'only one player drops; the wing keeps its run');
});
