import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {afterEach, test} from 'node:test';
import {fireCertificate, validCertificate} from '../workout/island/activity/fire-certificates.mjs';
import {createEngine} from '../workout/island/engine/engine.mjs';
import {loadData} from '../workout/island/engine/load-data.mjs';
import {seededRandom} from '../workout/island/minigames/context.mjs';
import {createFireModel} from '../workout/island/minigames/fire.mjs';
import {gameResult} from '../workout/island/minigames/result.mjs';
import {pilotInput} from '../workout/island/tests/pilot.mjs';
import {ActivityInterface} from '../workout/island/ui/activity.mjs';

const island = new URL('../workout/island/', import.meta.url);
const data = await loadData(island, async url => ({ok: true, json: async () => JSON.parse(await readFile(url, 'utf8'))}));
const config = data.config.minigames;
const balance = config.fireRescue;
const enabled = '?balanceFireCertificate=1';
const setQuery = search => { globalThis.location = new URL(search, 'https://example.test/'); };
afterEach(() => { delete globalThis.location; delete globalThis.document; });

function play(level, query) {
  setQuery(query);
  const model = createFireModel({config, balance, level, random: seededRandom(1701)});
  const memory = {};
  for (let i = 0; i < 15000 && !model.result; i++) {
    model.update(1 / 60, pilotInput('fireRescue', model, model.balance, memory));
  }
  assert.ok(model.result, 'stage finished through the street model');
  return model.result;
}

test('all four levels with no citizens can award three certificate stars without reporting a rescue', () => {
  const affected = balance.levels.flatMap((level, i) => level.rescueCount === 0 ? [i + 1] : []);
  assert.deepEqual(affected, [1, 2, 11, 13]);
  for (const level of affected) {
    const baseline = play(level, '');
    const result = play(level, enabled);
    assert.equal(baseline.certificate.stars, 2);
    assert.equal(result.outcome, 'win');
    assert.equal(result.summary.rescued, 0);
    assert.equal(result.certificate.stars, 3);
    assert.ok(validCertificate(result.certificate));
    assert.deepEqual({...result, certificate: baseline.certificate}, baseline);
    assert.deepEqual(gameResult(result, {config, level}, balance), gameResult(baseline, {config, level}, balance));
  }
});

test('the waiver requires the exact flag, a winning round, and zero available rescue targets', () => {
  const round = {won: true, time: 1, seconds: 100, rescued: false, rescueCount: 0, wasted: 0, used: 10};
  const stars = overrides => fireCertificate({...round, ...overrides}, balance.certificate).stars;
  for (const query of ['', '?balanceFireCertificate=0', '?balanceFireCertificate=true', '?balanceFire=1']) {
    setQuery(query);
    assert.equal(stars({}), 2);
  }
  setQuery(enabled);
  assert.equal(stars({won: false}), 0);
  assert.equal(stars({time: 100}), 2);
  assert.equal(stars({wasted: 10}), 2);
  assert.equal(stars({time: 100, wasted: 10}), 1);
  assert.equal(stars({rescueCount: 1}), 2);
  assert.equal(stars({rescueCount: 1, rescued: true}), 3);
  assert.equal(stars({rescueCount: undefined}), 2, 'legacy callers retain the observed-rescue criterion');

  assert.equal(balance.levels[3].mission?.requiredRescues || 0, 0);
  assert.ok(balance.levels[3].rescueCount > 0);
  const control = play(4, '');
  assert.equal(control.certificate.rescue, false);
  assert.deepEqual(play(4, enabled), control);
});

test('winning certificate survives an engine save and the card explains the completion star after flag removal', () => {
  const result = play(1, enabled);
  let saved;
  const storage = {getItem: () => saved ?? null, setItem: (_key, value) => { saved = value; }};
  const engine = createEngine(data, {storage});
  engine.state.buildings.push({id: 'certificate-test', typeId: 'fireStation', x: 12, z: 0, level: 1});
  let finish;
  const game = engine.registry.minigames.get('fireRescue');
  engine.registry.minigames.set('fireRescue', {...game, start: ctx => { finish = ctx.finish; return {dispose() {}}; }});
  assert.ok(engine.startMinigame('fireRescue', {level: 1}).ok);
  assert.deepEqual(finish(result).result.certificate, result.certificate);
  setQuery('');
  const restored = createEngine(data, {storage});
  const certificate = restored.state.fireCertificates[0];
  assert.deepEqual(certificate, result.certificate);

  // Exercise the card shared by the result dialog and saved collection.
  globalThis.document = {createElement: () => ({
    dataset: {}, children: [], append(...nodes) { this.children.push(...nodes); }, setAttribute() {}
  })};
  const card = (record, level) => ActivityInterface.prototype.certificateCard.call({
    engine: restored, data, t: key => key
  }, record, level);
  const completion = card(certificate, 1).children[5];
  assert.equal(completion.textContent, 'fire.completedWithoutRescue');
  assert.equal(completion.className, 'earned');
  assert.equal(card(certificate, 4).children[5].textContent, 'fire.rescue');
  const old = {fast: true, rescue: false, careful: true, stars: 2};
  assert.ok(validCertificate(old));
  assert.equal(card(old, 1).children[5].textContent, 'fire.rescue');
  setQuery(enabled);
  assert.equal(card(old, 1).children[5].textContent, 'fire.noRescueGoal');
});
