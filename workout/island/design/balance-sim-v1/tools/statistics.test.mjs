import test from 'node:test';
import assert from 'node:assert/strict';
import {wilson95,exactMcNemar,holmAdjust,normalizeGoals,summarizeDataset} from './summarize.mjs';
import {profiles} from './profiles.mjs';

test('zero wins are not proof of impossibility; known 95% bounds and exact paired test',()=>{
  const interval=wilson95(0,8);
  assert.ok(interval.low<1e-12);
  assert.ok(Math.abs(interval.high-.32440756488388023)<1e-12);
  assert.equal(wilson95(0,0),null);
  assert.equal(exactMcNemar(8,0),.007812500000000002);
  assert.equal(exactMcNemar(0,0),1);
  assert.equal(exactMcNemar(4,4),1);
});
test('Holm considers the entire declared family, including nonselected comparisons',()=>{
  const tests=[{id:'a',pExact:.01},{id:'b',pExact:.04},{id:'c',pExact:.03}];
  holmAdjust(tests);
  assert.deepEqual(tests.map(x=>x.pHolm),[.03,.06,.06]);
  assert.ok(tests.every(x=>x.holmFamilySize===3));
});
test('telemetry counts never become goals, and explicit optional failures remain visible',()=>{
  assert.deepEqual(normalizeGoals({killed:14,cleared:false}),[{id:'cleared',current:false,target:true,complete:false,optional:null}]);
  assert.equal(normalizeGoals([{id:'rescue',current:0,target:1,complete:false,optional:true}])[0].optional,true);
});
test('missing cells stay missing and racing league awards are undefined, not failed stars',()=>{
  const data={game:{id:'islandRacing',name:'מרוצים',stages:[31,32]},profiles,baseCommit:'test',sourceDigest:'test',fingerprint:'test',trials:[
    {game:'islandRacing',stage:31,profile:'regular',seed:1,outcome:'win',seconds:70,stars:0,falls:0,objectives:{won:true,threeStars:false},withinPatience:true,diagnostics:{mode:'league'}},
  ]};
  const result=summarizeDataset(data,{expectedSamples:1}),cell=result.cells.find(c=>c.stage===31&&c.profile==='regular');
  assert.equal(cell.starsMean,null);assert.equal(cell.threeStarRate,null);assert.equal(cell.fallsMean,0);
  assert.ok(!cell.goals.some(g=>/star/i.test(g.id)));
  const missing=result.cells.find(c=>c.stage===32&&c.profile==='regular');
  assert.equal(missing.n,0);assert.equal(missing.winRate,null);assert.equal(missing.timeMean,null);
  assert.equal(result.coverage.complete,false);
  assert.throws(()=>summarizeDataset({...data,trials:[...data.trials,...data.trials]}),/Duplicate/);
});
