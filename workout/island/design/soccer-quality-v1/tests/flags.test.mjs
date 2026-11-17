import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.env.SOCCER_QUALITY_SOURCE;
if(!root)throw Error('SOCCER_QUALITY_SOURCE must point to a separately patched checkout');
const {soccerQualityFlags,applySoccerQuality}=await import(pathToFileURL(resolve(root,'workout/island/minigames/soccer-quality.mjs')));
const {soccerFullEnabled,soccerHalfSeconds}=await import(pathToFileURL(resolve(root,'workout/island/minigames/soccer-full.mjs')));
test('quality experiment is off unless the exact URL flag opts in',()=>{
  for(const query of ['','?soccerQuality=0','?soccerQuality=1','?soccerQuality=v2','?soccerQualityLoft=true'])assert.equal(soccerQualityFlags(query).enabled,false);
  const base={physics:{test:1}};assert.equal(applySoccerQuality(base,soccerQualityFlags('')),base);
});
test('bundle and individual switches isolate every component without mutating config',()=>{
  const all=soccerQualityFlags('?soccerQuality=v1');
  for(const name of ['loft','passing','keeper','team','difficulty','eleven'])assert.equal(all[name],true);
  assert.equal(soccerQualityFlags('?soccerQuality=v1&soccerQualityKeeper=0').keeper,false);
  const one=soccerQualityFlags('?soccerQualityPass=1');assert.equal(one.passing,true);assert.equal(one.loft,false);
  const base={physics:{test:1}},after=applySoccerQuality(base,one);
  assert.equal(base.quality,undefined);assert.equal(after.physics,base.physics);assert.ok(Object.isFrozen(after.quality));
});
test('quality eleven selects the same full-match length for session and result checks',()=>{
  const balance={match:{halfSeconds:45}};
  for(const query of ['?soccerFull=0&soccerQuality11=1','?soccerTeams=6&soccerQuality=v1']){
    assert.equal(soccerFullEnabled(undefined,query),true);
    assert.equal(soccerHalfSeconds(balance,{search:query}),90);
    assert.equal(soccerHalfSeconds(balance,{search:query,drill:true}),45);
  }
  assert.equal(soccerFullEnabled(false,'?soccerQuality=v1'),false,'explicit API option wins');
  assert.equal(soccerFullEnabled(undefined,'?soccerFull=0'),false);
});
