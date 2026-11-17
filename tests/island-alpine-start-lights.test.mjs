import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadData} from '../workout/island/engine/load-data.mjs';
import {createAlpineEngine} from '../workout/island/minigames/alpine-engine.mjs';
import {lightsState, createStartLights, startLightsEnabled, LAMPS, GREEN_MS} from '../workout/island/minigames/alpine-start-lights.mjs';

/** Alpine Rush start lights (Formula 1 style): five red lamps light one by one during the countdown, all go out to green at the start;
 * a small 3-2-1 under them; ?alpineStartLights=0 keeps the old big number. */
const root = new URL('../workout/island/', import.meta.url);
const data = await loadData(root, async url => ({ok: true, json: async () => JSON.parse(await readFile(url, 'utf8'))}));
const balance = data.config.minigames.alpineRush, P = balance.physics;

/** A tiny DOM stand-in: enough for createStartLights (elements, dataset, text, attributes, children). */
function fakeDoc() {
  const make = tag => ({tag, className: '', dataset: {}, hidden: false, textContent: '', children: [], attrs: {}, append(...c) { this.children.push(...c); }, setAttribute(k, v) { this.attrs[k] = String(v); }, remove() { this.removed = true; }});
  return {createElement: make};
}

test('the lamps light one by one during the 3 s countdown, all go out to green at the start, and the 3-2-1 stays under them', () => {
  const total = P.countdownSeconds * 1000, seen = [];
  assert.equal(total, 3000);
  for (let left = total; left >= 0; left -= 50) seen.push(lightsState({phase: 'countdown', countdownMs: left, totalMs: total}));
  assert.equal(seen[0].lit, 0); assert.equal(seen[0].count, '3'); assert.equal(seen.at(-1).lit, LAMPS); assert.equal(seen.at(-1).count, '1');
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i].lit >= seen[i - 1].lit && seen[i].lit - seen[i - 1].lit <= 1, 'one lamp at a time, never back');
  const at = n => total - seen.findIndex(s => s.lit >= n) * 50;
  assert.deepEqual([1, 2, 3, 4, 5].map(n => total - at(n)), [250, 750, 1250, 1750, 2250], 'a lamp every half second, all five for the last 0.75 s');
  assert.deepEqual([...new Set(seen.map(s => s.count))], ['3', '2', '1']);
  assert.deepEqual(lightsState({phase: 'racing', timeMs: 0}), {state: 'green', lit: 0, count: ''});
  assert.equal(lightsState({phase: 'racing', timeMs: GREEN_MS - 1}).state, 'green');
  assert.equal(lightsState({phase: 'racing', timeMs: GREEN_MS}).state, 'off');
  for (const phase of ['menu', 'paused', 'finished']) assert.equal(lightsState({phase, countdownMs: 1000, timeMs: 0}).state, 'off');
});

test('the engine reports the remaining countdown for the lamps; the race itself is unchanged', () => {
  const e = createAlpineEngine({balance, stage: 1, seed: 4}); e.command({type: 'start'});
  let last = Infinity, steps = 0;
  while (e.phase === 'countdown') { const s = e.snapshot(); assert.ok(s.countdownMs <= last); last = s.countdownMs; e.step(1 / 60); steps++; }
  assert.equal(e.snapshot().countdownMs, 0); assert.equal(e.snapshot().timeMs, 0); assert.ok(Math.abs(steps - 180) <= 1, `3 s countdown (${steps} steps)`);
  // Fed the engine's own frames, the gantry lights all five lamps in order, then turns green once.
  const lamps = [], greens = [], g = createStartLights(fakeDoc(), {totalMs: 3000, onLamp: n => lamps.push(n), onGreen: () => greens.push(1)});
  const f = createAlpineEngine({balance, stage: 1, seed: 4}); f.command({type: 'start'});
  for (let i = 0; i < 260; i++) { g.update(f.snapshot()); f.step(1 / 60); }
  assert.deepEqual(lamps, [1, 2, 3, 4, 5]); assert.equal(greens.length, 1);
  const node = g.node, gantry = node.children[0];
  assert.equal(node.dataset.state, 'off'); assert.equal(node.hidden, true, 'gone after the green'); assert.equal(gantry.children.length, LAMPS);
});

test('the gantry DOM: red lamps on, then green; spoken numbers; the flag ?alpineStartLights=0 turns it off', () => {
  const g = createStartLights(fakeDoc(), {totalMs: 3000}), lamps = g.node.children[0].children;
  g.update({phase: 'countdown', countdownMs: 1600, timeMs: 0});
  assert.deepEqual(lamps.map(l => l.dataset.on), ['true', 'true', 'true', 'false', 'false']); assert.equal(g.node.hidden, false); assert.equal(g.node.children[1].textContent, '2');
  g.update({phase: 'racing', countdownMs: 0, timeMs: 100});
  assert.deepEqual(lamps.map(l => l.dataset.on), Array(LAMPS).fill('green')); assert.equal(g.node.dataset.state, 'green'); assert.equal(g.node.children[3].textContent, 'יוצאים');
  assert.equal(startLightsEnabled(''), true); assert.equal(startLightsEnabled('?dev=1'), true); assert.equal(startLightsEnabled('?alpineStartLights=0'), false); assert.equal(startLightsEnabled('?x=1&alpineStartLights=0'), false);
});

test('every ski stage gets the lights from the session, with a beep per lamp and the start cue at green; the flag keeps the old number and cues', async () => {
  const session = await readFile(new URL('minigames/alpine-session.mjs', root), 'utf8'), css = await readFile(new URL('minigames/alpine-start-lights.css', root), 'utf8');
  assert.match(session, /import \{createStartLights,startLightsEnabled\} from '\.\/alpine-start-lights\.mjs\?v=island-v2-20261107-17'/);
  assert.match(session, /const lightsOn = startLightsEnabled\(\), lights = lightsOn \? createStartLights\(doc/);
  assert.match(session, /if \(lightsOn\) \{ if \(e\.value === 0\) audio\.cue\('go'\); \} else \{ audio\.cue\(e\.value > 0 \? 'countdown' : 'go'\)/);
  assert.match(session, /countdown\.hidden = !count \|\| lightsOn;/);
  assert.match(css, /prefers-reduced-motion/); assert.doesNotMatch(css + session, /[؀-ۿ]/, 'no Arabic letters');
});
