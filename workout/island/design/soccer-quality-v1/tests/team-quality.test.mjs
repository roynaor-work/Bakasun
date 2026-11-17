import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {teamRuntime,tacticalProbe,chaseProbe,elevenProbe,returnMotionProbe} from '../sim/team-fixtures.mjs';
const runtime=await teamRuntime(resolve(process.env.SOCCER_QUALITY_SOURCE||process.cwd()));
const {base,qualityTeamConfig,qualityTeamTarget}=runtime;
assert.equal(typeof qualityTeamConfig,'function','Apply patches to a temporary clean copy and set SOCCER_QUALITY_SOURCE to that repository root.');
test('disabled team/difficulty/eleven gates return exact existing objects',()=>{
 const c=structuredClone(base),s={players:[],phase:'playing'},fallback={x:3,z:4,duty:'cover'};
 assert.equal(qualityTeamConfig(c),c);assert.equal(qualityTeamTarget({team:0},s,c,fallback),fallback);
});
test('configuration is pure and idempotent through session transforms and spread clones',()=>{
 const c={...structuredClone(base),quality:{difficulty:true,eleven:true}},snapshot=structuredClone(c),tuned=qualityTeamConfig(c);
 assert.deepEqual(c,snapshot);assert.equal(tuned.pitch.length,105);assert.equal(tuned.pitch.width,68);assert.equal(qualityTeamConfig(tuned),tuned);
 const expanded=runtime.expandSoccerConfig({...tuned,view:{...tuned.view}}),again=qualityTeamConfig(expanded);
 assert.equal(again,expanded);assert.deepEqual(again.difficulties,tuned.difficulties);assert.equal(c.team.players.length,4);
 for(const name of ['easy','normal','hard'])for(const key of ['coinMultiplier','bonusStars'])assert.equal(tuned.difficulties[name][key],base.difficulties[name][key]);
});
test('quality target preserves manual control, rival AI, keepers, press, restarts and receiving runs',()=>{
 const c={...base,quality:{team:true}},fallback={x:3,z:4,duty:'cover'},owner={id:0,team:0,x:0,z:0},p={id:1,team:0,role:'support'},s={players:[owner,p],controlled:0,elapsed:0,phase:'playing',ball:{owner:0},attackDir:1};
 const snapshot=structuredClone(s);
 for(const q of [{...p,id:0},{...p,team:1},{...p,role:'keeper'},{...p,recover:1},{...p,slideTime:1}])assert.equal(qualityTeamTarget(q,s,c,fallback),fallback);
 assert.equal(qualityTeamTarget(p,{...s,phase:'restartReady'},c,fallback),fallback);
 assert.equal(qualityTeamTarget(p,{...s,passTarget:{player:1}},c,fallback),fallback);
 assert.equal(qualityTeamTarget(p,s,c,{...fallback,duty:'press'}).duty,'press');assert.deepEqual(s,snapshot);
});
test('paired tactical snapshots improve open support lanes and return target geometry',()=>{
 const before=tacticalProbe(runtime),after=tacticalProbe(runtime,{enabled:true});
 assert.equal(after.attackingTargets,before.attackingTargets);assert.equal(after.returnTargets,before.returnTargets);assert.ok(after.finite);
 assert.ok(after.meanLaneClearance>=before.meanLaneClearance*1.10);assert.ok(after.returnAnchorRms<=before.returnAnchorRms*.8);
});
test('actual movement recovers to the defensive block within eight seconds',()=>{
 const before=returnMotionProbe(runtime),after=returnMotionProbe(runtime,{enabled:true});
 assert.equal(after.initialRms,before.initialRms);assert.ok(after.at4Seconds<before.at4Seconds);assert.ok(after.at8Seconds<before.at8Seconds);assert.ok(after.at8Seconds<3);
});
test('actual-engine approach speed distinguishes all opponent levels at early and late stages',()=>{
 for(const stage of [2,5,12,30]){const rows=['easy','normal','hard'].map(difficulty=>chaseProbe(runtime,{enabled:true,stage,difficulty}));assert.ok(rows.every(r=>r.arrived));assert.ok(rows[0].seconds>=rows[1].seconds*1.08);assert.ok(rows[1].seconds>=rows[2].seconds*1.04);}
});
test('both existing full formations run 60 seconds with 22 finite actors and stable legacy IDs',()=>{
 for(const formation of ['4-4-2','4-3-3']){const r=elevenProbe(runtime,{formation});assert.equal(r.actors,22);assert.equal(r.savedCards,4);assert.equal(r.invalid,0);for(const t of r.teams){assert.equal(t.count,11);assert.equal(t.keepers,1);assert.equal(t.uniqueRoles,11);}assert.deepEqual(r.legacySlots.map(p=>p.id),[0,1,2,3,4,5,6,7]);assert.deepEqual(r.legacySlots.map(p=>p.role),base.players.roster.map(p=>p.role));}
});
