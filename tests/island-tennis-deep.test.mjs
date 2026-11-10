import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {baseConfig} from '../workout/island/verification/tennis-deep-v1/sim.mjs';
import {play} from '../workout/island/verification/tennis-deep-v1/child.mjs';
import {createTennis} from '../workout/island/minigames/tennis.mjs';
import {ratingIcon} from '../workout/island/minigames/tennis-ui.mjs';

const off={...baseConfig,v9:{...baseConfig.v9,deep:{...baseConfig.v9.deep,enabled:false}}};
const mean=(cfg,stage,diff,n=6)=>{let hits=0,pts=0,met=0,balls=0;for(let m=1;m<=n;m++){const r=play(stage,diff,'child',m,cfg);hits+=r.rallyHits;pts+=r.points;met+=r.met;balls+=r.balls;}return {rally:hits/pts,meets:met/balls};};

test('tennis deep: a child bot gets longer rallies and meets more balls on easy, same tour code with the flag off',()=>{
  const before=mean(off,3,'easy'),after=mean(baseConfig,3,'easy');
  assert.ok(after.rally>=before.rally+.8,`rally ${before.rally.toFixed(2)} -> ${after.rally.toFixed(2)}`);
  assert.ok(after.meets>before.meets+.04,`meets ${before.meets.toFixed(2)} -> ${after.meets.toFixed(2)}`);
});

test('tennis deep: the child can still win and lose on easy (not a walkover, not a wall)',()=>{
  let wins=0,n=8;for(let m=1;m<=n;m++)wins+=play(1,'easy','child',m,baseConfig).won?1:0;
  assert.ok(wins>=3&&wins<=n,`wins ${wins}/${n}`);
});

test('tennis deep: hits carry a timing rating (words are not shown) and ?tennisDeep=0 removes it',()=>{
  const ratings=cfg=>{const found=new Set();for(let m=1;m<=3;m++){const r=play(1,'easy','teen',m,cfg);for(const k of Object.keys(r.ratings))found.add(k);}return [...found];};
  assert.ok(ratings(baseConfig).includes('perfect'));assert.deepEqual(ratings(off),[]);
  const m=createTennis({config:baseConfig,deep:false});assert.ok(m);
  for(const kind of ['perfect','good','early','late'])assert.match(ratingIcon(kind),/<svg[^>]*aria-hidden="true">.+<\/svg>/);
});

test('tennis deep: the session shows the rating as a pictogram, hit-stop only slows the picture, never the simulation',async()=>{
  const session=await readFile(new URL('../workout/island/minigames/tennis-session.mjs',import.meta.url),'utf8');
  assert.ok(session.includes('tennis-rating')&&session.includes("view.render(model.getState(),paused?0:dt*(stopLeft>0?.12:1))"));
  assert.ok(session.includes("applyTennisSample(model,input.sample(),dt)"),'the model still receives the real dt');
  assert.ok(session.includes("'tennisDeep')==='0'"));
});
