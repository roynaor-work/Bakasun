import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, access, readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {alpineRunnerEnabled, alpineThemesEnabled, alpineRunnerGoals} from '../workout/island/minigames/alpine-runner-rules.mjs';
import {THEME_PACKS, START_SIGN_M, layerWindow} from '../workout/island/minigames/alpine-runner-themes.mjs';
import {makeWeather} from '../workout/island/minigames/alpine-runner-weather.mjs';
// The eleven tests the Codex pack ships for the runner (streaming, gestures, bonuses, bots, settlement, the race behind the flag).
import '../workout/island/design/alpine-runner-integration-patches-v1/tests/runner.test.mjs';

/** Ski v24.8: the three-lane runner (Codex pack alpine-runner-integration-patches-v1) and its six theme packs
 * (alpine-runner-themes-v2). Node part; the real-touch browser proof is workout/island/tools/alpine-runner-v248-browser.mjs
 * (screenshots and numbers in workout/island/verification/alpine-runner-v24-8/). */
const island = fileURLToPath(new URL('../workout/island/', import.meta.url));
const read = file => readFile(path.join(island, file), 'utf8');
const pack = 'assets/alpine-runner-themes-v2/';
const catalogue = JSON.parse(await read(pack + 'themes.json'));
const manifest = JSON.parse(await read('offline-manifest.json'));
const TILES = ['straight', 'forest', 'gentle_turn', 'bridge', 'ice_tunnel', 'slope', 'village', 'summit'];

test('flags: both on by default; ?alpineRunnerPatch=0 (or the pack\'s ?alpineRunner=0) brings the race back, ?alpineThemes=0 the base look', async () => {
  assert.equal(alpineRunnerEnabled(''), true); assert.equal(alpineRunnerEnabled('?dev=1&alpineRunnerPatch=1'), true);
  assert.equal(alpineRunnerEnabled('?alpineRunnerPatch=0'), false); assert.equal(alpineRunnerEnabled('?dev=1&alpineRunner=0'), false);
  assert.equal(alpineThemesEnabled(''), true); assert.equal(alpineThemesEnabled('?alpineThemes=0'), false); assert.equal(alpineThemesEnabled('?alpineRunnerPatch=0'), true);
  const session = await read('minigames/alpine-session.mjs'), runner = await read('minigames/alpine-runner-session.mjs'), view = await read('minigames/alpine-runner-view.mjs');
  assert.match(session, /ctx\.canvas && !ctx\.alpineLeague && alpineRunnerEnabled\(\)\) return runAlpineRunnerSession\(ctx\)/, 'the league and the headless session keep the race');
  assert.match(runner, /themes: packs, goal: goals\[0\]/, 'the session hands the flag and the goal distance to the view');
  assert.match(view, /themes: themePacks = alpineThemesEnabled\(\)/); assert.match(view, /themePacks \? createThemeStage/);
  // With the runner off the race must not pull the theme code: the flag lives in the small rules module.
  assert.doesNotMatch(runner, /from '\.\/alpine-runner-themes/); assert.doesNotMatch(session, /alpine-runner-(themes|view|weather)/);
});

test('theme packs: six themes, every file the game asks for is on disk, in the offline pack and identical to the Codex pack', async () => {
  assert.deepEqual(Object.values(THEME_PACKS).sort(), Object.keys(catalogue.themes).sort());
  assert.equal(Object.keys(THEME_PACKS).length, 6); assert.equal(catalogue.licence, 'CC0-1.0');
  const offline = new Set(manifest.games.alpineRunner), source = await readFile(path.join(island, 'design/alpine-runner-themes-v2/manifest.json'), 'utf8').then(JSON.parse, () => null);
  const hashes = new Map(source ? source.themes.flatMap(t => [...t.tiles, ...t.props, ...t.parallax, ...Object.values(t.signs)].map(i => [i.path.replace(/^assets\//, ''), i.sha256])) : []);
  assert.ok(offline.has(pack + 'themes.json'));
  let files = 0, bytes = 0;
  for (const [id, theme] of Object.entries(catalogue.themes)) {
    assert.deepEqual(Object.keys(theme.tiles).sort(), [...TILES].sort(), id + ': the eight tile ids of the runner');
    assert.deepEqual(theme.parallax.map(layer => layer.id), ['sky', 'ridges', 'foothills'], id);
    assert.deepEqual(Object.keys(theme.signs).sort(), ['finish', 'start']);
    for (const key of ['sky', 'ground', 'sun', 'rim', 'fog']) assert.match(theme.lighting[key], /^#[0-9a-f]{6}$/, id + ' ' + key);
    assert.ok(['snow', 'fog', 'glow'].includes(theme.weather.kind)); assert.ok(makeWeather(theme.weather).particles.length > 0);
    for (const tile of Object.values(theme.tiles)) for (const [prop, x, , z] of tile.placements) {
      assert.ok(theme.props[prop], `${id}: prop ${prop}`); assert.ok(Math.abs(x) > 5.6, 'props stand off the 7.2 m the skier uses and off its 11.2 m surface'); assert.ok(z >= 0 && z <= 30);
    }
    for (const item of [...Object.values(theme.tiles), ...Object.values(theme.props), ...Object.values(theme.signs), ...theme.parallax]) {
      assert.ok(item.path.startsWith(id + '/') && !item.path.includes('..'), item.path);
      const data = await readFile(path.join(island, pack + item.path)); files++; bytes += data.length;
      assert.ok(offline.has(pack + item.path), 'offline pack: ' + item.path);
      if (source) assert.equal(createHash('sha256').update(data).digest('hex'), hashes.get(item.path), 'same bytes as the Codex pack: ' + item.path);
    }
  }
  assert.equal(files, 138); assert.ok(bytes < 4_100_000, 'six themes stay under 4.1 MB: ' + bytes);
  // Nothing else rides along: no decoder, no archive, no file the catalogue does not name.
  const walk = async dir => (await Promise.all((await readdir(path.join(island, dir), {withFileTypes: true})).map(e => e.isDirectory() ? walk(dir + e.name + '/') : [dir + e.name]))).flat();
  const onDisk = await walk(pack);
  assert.equal(onDisk.length, 140, '138 assets, themes.json and the licence note');
  for (const file of onDisk) assert.match(file, /\.(glb|webp)$|themes\.json$|LICENSES\.md$/, file);
  await access(path.join(island, pack + 'LICENSES.md'));
});

test('budget: a full screen of the heaviest theme stays far under the runner\'s 60,000 triangles at low quality', () => {
  for (const [id, theme] of Object.entries(catalogue.themes)) {
    const perTile = Object.values(theme.tiles).map(tile => tile.triangles + tile.placements.reduce((sum, [prop]) => sum + theme.props[prop].triangles, 0));
    const worst = Math.max(...perTile) * 6 + theme.signs.start.triangles + theme.signs.finish.triangles;
    assert.ok(worst < 32_000, `${id}: ${worst} triangles for six tiles and both arches`);
  }
});

test('backdrop: each layer covers the screen at both orientations and wraps without a seam jump', () => {
  for (const theme of Object.values(catalogue.themes)) for (const layer of theme.parallax) for (const [w, h] of [[844, 390], [390, 844], [1280, 720]]) {
    for (const distance of [0, 12.5, 240, 100_000]) for (const x of [-2.4, 0, 2.4]) {
      const view = layerWindow(layer, w, h, distance, x);
      assert.ok(view.repeat > 0 && view.repeat <= 1 / 1.16, 'the picture is never stretched past its own width');
      assert.ok(view.offset >= 0 && view.offset < 1);
    }
    // Nearer layers move faster.
    const moved = l => layerWindow(l, 844, 390, 10, 0).offset - layerWindow(l, 844, 390, 0, 0).offset;
    assert.ok(moved(theme.parallax[2]) > moved(theme.parallax[1]) && moved(theme.parallax[1]) > moved(theme.parallax[0]));
  }
  assert.ok(START_SIGN_M > 0 && START_SIGN_M < 30); for (const stage of [1, 2, 3]) assert.ok(alpineRunnerGoals(stage)[0] > START_SIGN_M);
});

test('rules of the house: runtime reads assets/ only, no network, no decoder, Hebrew without Arabic letters or exclamation marks', async () => {
  const code = {};
  for (const name of ['alpine-runner-themes.mjs', 'alpine-runner-weather.mjs', 'alpine-runner-view.mjs', 'alpine-runner-session.mjs', 'alpine-runner-engine.mjs', 'alpine-runner-rules.mjs', 'alpine-runner.css']) code[name] = await read('minigames/' + name);
  for (const [name, text] of Object.entries(code)) {
    assert.doesNotMatch(text, /https?:\/\/|\bdesign\//, name + ': no network address and no path into design/');
    assert.doesNotMatch(text, /wasm|draco|meshopt|ktx2|new Worker|eval\(|new Function/i, name);
  }
  const strings = JSON.parse(await read('data/strings.he.json'));
  const texts = [...Object.entries(strings).filter(([key]) => key.startsWith('minigame.alpineRush.runner.')).map(([, value]) => value),
    ...Object.values(catalogue.themes).flatMap(theme => [theme.title, theme.weatherName]), ...[...code['alpine-runner-session.mjs'].matchAll(/'([^'\n]*[֐-׿][^'\n]*)'/g)].map(m => m[1])];
  assert.ok(texts.length > 40);
  for (const text of texts) { assert.doesNotMatch(text, /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/, text); assert.doesNotMatch(text, /!/, text); }
  // The weather painters are the pack's file, with one note line added.
  const original = await read('design/alpine-runner-themes-v2/weather.mjs').catch(() => null);
  if (original) assert.equal(code['alpine-runner-weather.mjs'].split('\n').filter((_, i) => i !== 1).join('\n'), original);
  // The review packs are not published; the runtime copy is.
  const pages = await readFile(fileURLToPath(new URL('../.github/scripts/stage-pages.py', import.meta.url)), 'utf8');
  assert.match(pages, /\balpine-runner-themes-v2\b/); assert.match(pages, /REVIEW_DESIGN = \("-audit-v1", "-patches-v1"\)/);
  for (const file of manifest.games.alpineRunner) assert.ok(file.startsWith('assets/alpine-runner'), file);
});
