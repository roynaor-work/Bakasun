import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
const root=resolve(process.env.PHONE_FIX_ROOT||fileURLToPath(new URL('../',import.meta.url)));
const {createTennis,predictLanding}=await import(pathToFileURL(resolve(root,'workout/island/minigames/tennis.mjs')));
const config=JSON.parse(readFileSync(resolve(root,'workout/island/data/config.json'),'utf8')).minigames.tennis;
const dt=config.simulation.step;
function serveAt(value,{seed=4107,difficulty='easy',rank=1,enabled=true}={}){
 const model=createTennis({config,seed,difficulty,ranks:{speed:1,hit:1,serve:rank},phoneFixE:enabled}),s=model.getState();
 model.update(0,{serve:true});model.update(0,{});
 while(s.serveMeter+1e-9<value)model.update(dt);
 model.update(0,{serve:true});model.update(0,{});
 return {model,s,shot:structuredClone(s.shot),landing:predictLanding(s.ball,config)};
}
test('E: serve power and quality decrease away from purple, including inside green',()=>{
 const samples=[.5,.56,.64,.72,.81,.94].map(value=>serveAt(value).shot);
 for(let i=1;i<samples.length;i++){
  assert.ok(samples[i].quality<samples[i-1].quality,`quality ${samples[i-1].quality} -> ${samples[i].quality}`);
  assert.ok(samples[i].power<samples[i-1].power,`power ${samples[i-1].power} -> ${samples[i].power}`);
 }
});
test('E: early red hits the physical net and late red lands beyond the service line',()=>{
 for(const [value,reason]of [[.08,'net'],[.93,'out']]){
  const {model,s,shot}=serveAt(value);assert.equal(shot.serveFault,reason);
  for(let i=0;i<500&&s.phase==='rally';i++)model.update(dt);
  assert.equal(s.faults,1);assert.equal(s.event.type,'fault');assert.equal(s.event.reason,reason);
 }
});
test('E: yellow fault rate rises with distance; green remains playable at every difficulty/rank',()=>{
 const counts=[];
 for(const offset of [.02,.08]){
  let faults=0;
  for(let seed=1;seed<=128;seed++)faults+=Boolean(serveAt(.5+config.serve.green.easy/2+offset,{seed}).shot.serveFault);
  counts.push(faults);
 }
 assert.ok(counts[0]>0&&counts[1]>counts[0]+40,JSON.stringify(counts));
 for(const difficulty of ['easy','normal','hard'])for(const rank of [1,5])for(const seed of [1,42,129]){
  const {shot,landing}=serveAt(.5,{seed,difficulty,rank});assert.equal(shot.serveFault,null);assert.ok(Math.abs(landing.z)<=config.court.serviceLength);
 }
});
test('E: a poor second serve awards one double-fault point',()=>{
 const {model,s}=serveAt(.93);
 for(let i=0;i<500&&s.phase==='rally';i++)model.update(dt);
 assert.equal(s.faults,1);
 model.update(0,{serve:true});model.update(0,{});while(s.serveMeter<.93)model.update(dt);model.update(0,{serve:true});model.update(0,{});
 for(let i=0;i<500&&s.phase==='rally';i++)model.update(dt);
 assert.equal(s.pointNumber,1);assert.equal(s.score.points[1],1);assert.equal(s.event.reason,'doubleFault');
});
if(process.env.PHONE_FIX_ROLLBACK==='1')test('E rollback: disabled model retains v24.1 quality/power, yellow safety and red long serve',()=>{
 const yellow=serveAt(.8,{enabled:false}).shot,red=serveAt(.94,{enabled:false}).shot;
 assert.equal(yellow.quality,1);assert.equal(yellow.serveFault,null);assert.equal(red.quality,1);assert.equal(red.serveFault,null);
 assert.equal(yellow.power,config.player.servePowerByRank[0]);assert.ok(Math.abs(red.targetZ)>config.court.serviceLength);
});
