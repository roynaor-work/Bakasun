// v24.7 wiring of the two Codex packages (learning questions v2, progress board and praise):
// the off switches, the privacy rules (no network, nothing stored beyond localStorage), the
// language rules (no exclamation marks, Hebrew letters only) and the offline shell.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createStore, DB_NAME} from '../workout/island/assets/progress-board-v1/src/store.mjs';
import {COMPLIMENTS} from '../workout/island/assets/progress-board-v1/data/compliments.mjs';
import {BADGES} from '../workout/island/assets/progress-board-v1/data/badges.mjs';
import {DOMAINS} from '../workout/island/assets/learning-v2/src/data.mjs';

const island = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../workout/island');
const read = file => readFile(path.join(island, file), 'utf8');
const walk = async dir => (await Promise.all((await readdir(path.join(island, dir), {withFileTypes: true}))
  .map(entry => entry.isDirectory() ? walk(dir + '/' + entry.name) : [dir + '/' + entry.name]))).flat();
const packs = ['assets/learning-v2', 'assets/progress-board-v1'];
const FOREIGN = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/u;
const bank = (await Promise.all(DOMAINS.map(async domain => JSON.parse(await read(`assets/learning-v2/data/${domain}.json`))))).flat();

test('each feature has a URL switch that keeps its code from loading', async () => {
  const app = await read('app.mjs');
  assert.match(app, /get\('learningV2'\) === '0' \? null\s*: await import\('\.\/assets\/learning-v2\/src\/integration\.mjs/);
  assert.match(app, /get\('progressBoard'\) !== '0'\) \{\s*const progress = import\('\.\/assets\/progress-board-v1\/src\/integration\.mjs/);
  // The page itself links nothing from the packs: with the switches off the old screens are untouched.
  const page = await read('index.html');
  assert.doesNotMatch(page, /learning-v2|progress-board/);
  const workout = await readFile(path.join(island, '../js/app.js'), 'utf8');
  assert.match(workout, /get\('progressBoard'\) !== '0'/);
  assert.match(workout, /if \(workoutBoardEnabled\) routes\.progress = progressScreen/);
});

test('the engine and the old learning path are unchanged when the learning pack is not installed', async () => {
  const engine = await read('engine/engine.mjs');
  assert.match(engine, /if \(options\.installLearningV2\) engine\.learningV2 = /);
  assert.match(engine, /engine\.learningV2\?\.access\(/);
  const ui = await read('ui/interface.mjs');
  assert.match(ui, /this\.learningInterface\?\.beforeBuild\?\.\(/);
  assert.match(await read('ui/ready-plots.mjs'), /ui\.learningInterface\?\.beforeBuild\?\.\(/);
});

test('the packs are runtime copies under assets/ and never reach the network or any store but localStorage', async () => {
  for (const pack of packs) {
    for (const file of await walk(pack)) {
      const text = await read(file);
      const code = text.replaceAll('http://www.w3.org/2000/svg', '').replaceAll('http://www.w3.org/1999/xlink', '');
      assert.doesNotMatch(code, /https?:\/\//, file + ' names no outside address');
      if (!/\.(?:mjs|css)$/.test(file)) continue;
      assert.doesNotMatch(code, /indexedDB|sessionStorage|document\.cookie|sendBeacon|XMLHttpRequest|WebSocket|navigator\.serviceWorker|caches\.|WebAssembly|\.wasm/, file);
      assert.doesNotMatch(code, /design\//, file + ' does not depend on a review pack');
    }
  }
  // The only fetch is the question bank, by a path relative to the module.
  const fetching = [];
  for (const pack of packs) for (const file of await walk(pack)) if (/\.mjs$/.test(file) && /\bfetch\(/.test(await read(file))) fetching.push(file);
  assert.deepEqual(fetching, ['assets/learning-v2/src/data.mjs']);
  assert.match(await read('assets/learning-v2/src/data.mjs'), /new URL\('\.\.\/data\/math\.json[^']*', import\.meta\.url\)/);
  // Speech goes to a voice installed on the device only.
  assert.match(await read('assets/progress-board-v1/src/view.mjs'), /item\.localService && /);
});

test('the progress board keeps one localStorage value: counters and personal results, no name, recording or family code', async () => {
  const map = new Map();
  const storage = {getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key)};
  const at = Date.UTC(2026, 10, 18, 12);
  const store = await createStore({storage, now: () => at});
  assert.equal(store.persistent, true);
  const event = {id: 'island:run-1', source: 'island', kind: 'game', activity: 'soccer', at, stars: 2, won: true,
    metric: {key: 'soccer:stage:1:default:1', label: 'כדורגל · שלב 1', unit: 'points', value: 3}};
  assert.ok(await store.record(event));
  assert.equal(await store.record(event), null, 'the same result is counted once');
  await store.preferences({ageBand: '9-12', form: 'feminine'});
  assert.deepEqual([...map.keys()], [DB_NAME]);
  const saved = JSON.parse(map.get(DB_NAME));
  assert.deepEqual(Object.keys(saved).sort(), ['events', 'state']);
  assert.deepEqual(saved.events, ['island:run-1']);
  assert.doesNotMatch(map.get(DB_NAME), /name|family|recording|email|phone/i);
  // A second page (the workout app shares the board) reads the same value.
  const other = await createStore({storage, now: () => at});
  const board = await other.read();
  assert.equal(board.weeklyStars, 2);
  assert.deepEqual(board.preferences, {ageBand: '9-12', form: 'feminine'});
  assert.equal(await other.record(event), null);
  // A damaged value starts an empty board instead of breaking the result screen.
  map.set(DB_NAME, '{"state":7');
  assert.equal((await (await createStore({storage, now: () => at})).read()).stars, 0);
  // Storage that refuses writes: the board still works until the page closes.
  assert.equal((await createStore({storage: {setItem() { throw new Error('blocked'); }}, now: () => at})).persistent, false);
});

test('every text a child sees or hears is Hebrew without exclamation marks or foreign letters', async () => {
  const texts = [];
  for (const q of bank) texts.push(q.prompt, q.hint, q.explanation, ...q.options, q.speech.prompt, q.speech.hint, q.speech.explanation, ...q.speech.options);
  for (const c of COMPLIMENTS) texts.push(c.masculine.text, c.masculine.spoken, c.feminine.text, c.feminine.spoken);
  for (const b of BADGES) texts.push(b.title, b.rule);
  const strings = JSON.parse(await read('data/strings.he.json'));
  for (const [key, value] of Object.entries(strings)) if (key.startsWith('learning.v2.')) texts.push(value);
  assert.ok(texts.length > 6000);
  for (const text of texts) {
    assert.doesNotMatch(text, /!/, text);
    assert.doesNotMatch(text, FOREIGN, text);
    assert.doesNotMatch(text, /[A-Za-z]/, text);
  }
  // Interface literals inside the modules (labels, notices).
  for (const file of ['assets/learning-v2/src/integration.mjs', 'assets/learning-v2/src/integration-runtime.mjs',
    'assets/progress-board-v1/src/view.mjs', 'assets/progress-board-v1/src/integration.mjs', 'assets/progress-board-v1/src/events.mjs']) {
    for (const [literal] of (await read(file)).matchAll(/(['`])(?:(?!\1).)*[א-ת](?:(?!\1).)*\1/gu)) {
      assert.doesNotMatch(literal, /!/, file + ': ' + literal);
      assert.doesNotMatch(literal, FOREIGN, file + ': ' + literal);
    }
  }
});

test('question bank: answers that can be recomputed are right (spot checks kept from the v24.7 review)', () => {
  const byId = new Map(bank.map(q => [q.id, q]));
  const answer = id => { const q = byId.get(id); return q.options[q.answer]; };
  const expected = {
    'math-7-14': '20', 'math-8-14': '56', 'math-9-14': '101', 'math-9-15': '1', 'math-10-14': '1.55', 'math-10-15': '3',
    'math-10-16': '32', 'math-11-13': '-1', 'math-11-15': '9', 'math-12-07': '24', 'math-12-13': '-0.5', 'math-12-14': '21', 'math-12-18': '108',
  };
  for (const [id, value] of Object.entries(expected)) assert.equal(answer(id).replace('−', '-'), value, id);
  // Wording fixed in the review: a clock has hands, a floor is a floor, and the names of a puzzle are given.
  assert.match(byId.get('math-6-11').prompt, /הַמָּחוֹג/);
  assert.match(byId.get('hebrew-10-07').prompt, /הָרִצְפָּה/);
  assert.match(byId.get('hebrew-8-02').prompt, /לְמַסְלוּל/);
  assert.equal(answer('hebrew-8-09'), 'מִסְגֶּרֶת');
  assert.equal(answer('hebrew-12-05'), 'חַשְׁמַלַּאי');
  assert.match(byId.get('logic-8-07').prompt, /גִּלְעָד, דָּן, רוֹן וְנָדָב/);
  assert.doesNotMatch(JSON.stringify(bank), /שְׁתַּיִם דַּקּוֹת/);
});

test('offline: code, bank and art of both features are in the shell list, and stay small', async () => {
  const manifest = JSON.parse(await read('offline-manifest.json'));
  let bytes = 0;
  for (const pack of packs) {
    for (const file of await walk(pack)) {
      assert.ok(manifest.shell.includes(file), file + ' is downloaded for offline use');
      assert.ok(manifest.files[file], file + ' is hashed');
      bytes += manifest.files[file][1];
    }
  }
  assert.ok(bytes < 1.5 * 1048576, 'both features together stay under 1.5 MB: ' + bytes);
  for (const list of Object.values(manifest.games)) for (const p of list) assert.doesNotMatch(p, /learning-v2|progress-board/, 'not part of a game pack');
});
