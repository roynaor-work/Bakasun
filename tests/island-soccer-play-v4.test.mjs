import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applySoccerTeams,SOCCER_PRODUCT_TEAMS} from '../workout/island/minigames/soccer-teams.mjs';
import {soccerKeeperV11Enabled,soccerV11States,soccerV11DiveClip,soccerV11DivePlan} from '../workout/island/minigames/soccer-codex-motion.mjs';

const config=JSON.parse(readFileSync(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames.soccer;
const clips=JSON.parse(readFileSync(new URL('../workout/island/assets/soccer-v11/clips.json',import.meta.url),'utf8'));

test('product preset gets up from a slide in 1.1 s (+0.5), 6-a-side keeps 0.6', () => {
  const product=applySoccerTeams(config,SOCCER_PRODUCT_TEAMS);
  assert.equal(product.slide.recoverSeconds,1.1);
  assert.equal(product.slide.variants.straight.recoverSeconds,1.1);
  assert.equal(product.slide.variants.fast.recoverSeconds,1.25);
  assert.equal(product.slide.maxTotalSeconds,1.7);
  assert.equal(applySoccerTeams(config,'6'),config,'6-a-side is the untouched config');
  assert.equal(config.slide.recoverSeconds,0.6,'input not mutated');
});
test('v11 keeper dive: opt-in flag, states load, dive plan uses the catch event', () => {
  assert.equal(soccerKeeperV11Enabled(''),false);
  assert.equal(soccerKeeperV11Enabled('?soccerKeeperV11=1'),true);
  const states=soccerV11States(clips);
  assert.ok(states.v11_keeper_dive_left&&states.v11_keeper_dive_right);
  assert.equal(soccerV11DiveClip(true,.1,n=>Boolean(states[n])),'v11_keeper_dive_left');
  assert.equal(soccerV11DiveClip(false,.8,n=>Boolean(states[n])),'v11_keeper_dive_right');
  assert.equal(soccerV11DiveClip(true,1.6,n=>Boolean(states[n])),null,'high balls stay on the v8 dives');
  const plan=soccerV11DivePlan(states.v11_keeper_dive_left);
  assert.ok(plan.contact>1&&plan.rate>=1&&plan.rate<2,JSON.stringify(plan));
});
test('every v11 state is a well-formed clip (18 bones, key times 0..1, no snap above the gate)', () => {
  for(const [id,s] of Object.entries(clips.states)){
    assert.equal(s.keyframes[0].time,0,id);assert.equal(s.keyframes.at(-1).time,1,id);
    assert.equal(Object.keys(s.keyframes[0].rotations).length,18,id);assert.ok(s.maxKeyDeg<70,id);
  }
});
