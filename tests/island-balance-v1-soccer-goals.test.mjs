import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {campaignStage, leagueMatch, stageObjective} from '../workout/island/minigames/soccer-campaign.mjs';
import {createSoccer} from '../workout/island/minigames/soccer.mjs';
import {soccerResult} from '../workout/island/minigames/soccer-result.mjs';
import {applySoccerFull} from '../workout/island/minigames/soccer-full.mjs';
import {expandSoccerConfig} from '../workout/island/minigames/soccer-squad.mjs';
import {applySoccerPitchV23, applySoccerControlV23} from '../workout/island/minigames/soccer-v23.mjs';

const base = JSON.parse(readFileSync(new URL('../workout/island/data/config.json', import.meta.url))).minigames.soccer;
const hebrew = JSON.parse(readFileSync(new URL('../workout/island/data/strings.he.json', import.meta.url)));
const flag = '?balanceSoccerGoals=1';
const original = ['goals', 'passes', 'shots', 'tackles', 'passes', 'shots', 'tackles', 'tackles',
  'cleanSheet', 'cleanSheet', 'passes', 'shots', 'shots', 'shots', 'shots'];
const targets = [1, 2, 2, 1, 3, 2, 1, 1, 1, 1, 2, 2, 2, 2, 2];

function withQuery(search, run) {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'location');
  try {
    Object.defineProperty(globalThis, 'location', {configurable:true, value:{search}});
    return run();
  } finally {
    if (saved) Object.defineProperty(globalThis, 'location', saved);
    else delete globalThis.location;
  }
}

function startMatch(stage, options = {}) {
  const config = applySoccerControlV23(applySoccerPitchV23(expandSoccerConfig(applySoccerFull(base, {v241:true}))));
  return createSoccer({config, stage, seed:1, league:true, difficulty:leagueMatch(config, stage).difficulty,
    v241:true, aiVersion:'v2', rulesVersion:'v1', feelVersion:'v2', airVersion:'v23', ...options});
}

test('the flag replaces only the two repeated field objectives across all 15 fixtures', () => {
  for (const query of ['', '?balanceSoccerGoals=0', '?balanceSoccerGoals=true', '?soccerAir=v23', flag]) {
    withQuery(query, () => {
      for (let stage = 1; stage <= original.length; stage++) {
        const fixture = leagueMatch(base, stage);
        const legacy = campaignStage(fixture.tuning, base);
        const selected = campaignStage(fixture.tuning, base, fixture);
        const replacement = query === flag && ({8:'lofts', 13:'headers'})[stage];
        const id = replacement || original[stage - 1], target = replacement ? 1 : targets[stage - 1];
        const nameId = 'soccer.campaign.objective.' + id + (replacement ? '.one' : '');
        const objective = {id, nameId, target, optional:true};
        if (replacement) assert.equal(hebrew[nameId], id === 'lofts' ? 'הגביהו כדור אחד' : 'נגחו פעם אחת');
        assert.deepEqual(selected, {...legacy, objective});
        const state = startMatch(stage).getState();
        assert.deepEqual(state.campaign, selected);
        assert.deepEqual(stageObjective(state), {...objective, current:0, complete:false});
        assert.deepEqual(stageObjective({...state, role:'keeper'}), {...legacy.keeperObjective, current:0, complete:false});
      }
    });
  }
});

test('the same URL leaves the 30-stage non-league campaign intact', () => {
  for (let stage = 1; stage <= 30; stage++) {
    const legacy = withQuery('', () => startMatch(stage, {league:false}).getState().campaign);
    withQuery(flag, () => assert.deepEqual(startMatch(stage, {league:false}).getState().campaign, legacy));
  }
});

// Use the lob button from kickoff and the offered header when the ball descends.
// The model handles switching, contact, event counting and both full halves.
function play(stage, eventType) {
  const model = startMatch(stage), state = model.getState();
  let contact;
  for (let tick = 0; tick < 18000 && !model.result; tick++) {
    let input = {};
    if (tick <= 20) input = {moveZ:-1, lobPressed:tick === 20};
    else if (tick < 120) input = {kickHeld:state.airOptions?.primary === 'header', airAlt:state.airOptions?.alt === 'header'};
    model.update(1 / 60, input);
    const events = model.drainEvents();
    if (tick < 120 && !contact && events.some(event => event.team === 0 && event.type === eventType)) {
      contact = stageObjective(state);
    }
  }
  assert.ok(contact, 'expected a home ' + eventType + ' from the opening cross');
  assert.ok(model.result, 'the model reached the final whistle');
  const r = model.result, outcome = r.won ? 'win' : 'lose';
  const accepted = soccerResult({soccer:r, outcome, score:r.goalsFor}, {level:stage, seed:r.seed, difficulty:r.difficulty}, base);
  assert.ok(accepted, 'the shipped result validator accepted the completed game');
  return {contact, result:r, accepted};
}

for (const [stage, eventType, objectiveId] of [[8, 'loft', 'lofts'], [13, 'header', 'headers']]) {
  test('fixture ' + stage + ' awards its bonus on an actual home ' + eventType, () => {
    const before = withQuery('', () => play(stage, eventType));
    const after = withQuery(flag, () => play(stage, eventType));
    assert.equal(before.contact.id, original[stage - 1]);
    assert.deepEqual(after.contact, {id:objectiveId, nameId:'soccer.campaign.objective.' + objectiveId + '.one',
      optional:true, target:1, current:1, complete:true});
    assert.deepEqual(after.result, before.result);
    assert.deepEqual(after.accepted, before.accepted);
  });
}
