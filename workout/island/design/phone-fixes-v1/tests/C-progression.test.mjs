import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';

// A new, explicit modern-game progression contract, separate from the historical
// pre-v9/v14/v15 timing and piercing benchmarks. All 90 legitimate-gear runs
// (30 stages x seeds 1,3,7) must win before their clocks expire, with finite
// scores and bounded real rewards.
// The pilot uses ordinary inputs, both fire buttons and missiles, at 844x390's
// collision aspect. No enemy HP, lives, shields, timers or damage is injected.
const root=process.env.PHONE_FIX_ROOT||fileURLToPath(new URL('../../../../../',import.meta.url));
const load=p=>import(pathToFileURL(path.join(root,p)).href);
const {createAlienModel}=await load('workout/island/minigames/alien-flight-model.mjs');
const {seededRandom}=await load('workout/island/minigames/context.mjs');
const {install}=await load('workout/island/extensions/alien-defense.mjs');
const config=JSON.parse(await readFile(path.join(root,'workout/island/data/config.json'),'utf8')).minigames,balance=config.alienDefense;
const data={config:{minigames:config},extensions:{alienDefense:{id:'alienDefense'}}};
let game;install({registerMinigame:value=>{game=value;}},data);
const mode=process.env.PHONE_FIX_PROGRESSION_MODE||'after';
assert.ok(['baseline','after','rollback'].includes(mode));
const profile={equipment:Object.fromEntries(Object.entries(balance.equipment).map(([id,track])=>[id,track.levels.at(-1).value])),permanentUpgrades:Object.fromEntries(balance.campaign.choiceIds.map(id=>[id,balance.campaign.maxStack])),hangar:{rapid:balance.hangar.maxRank,shield:2},power:1.45};
const phoneAspect=(844/390)/(360/480),dt=1/30;
function pilot(m){
 const target=m.aliens.filter(a=>a.entry<=0).sort((a,b)=>b.y-a.y)[0]||m.aliens[0],cross=[];
 for(const bolt of m.bolts){const t=(m.player.y-bolt.y)/(bolt.vy||1);if(t>0&&t<1.4)cross.push(bolt.x+(bolt.vx||0)*t);}
 for(const alien of m.aliens)if(alien.diveAge>=0&&alien.y>m.player.y-160)cross.push(alien.x);
 let want=target?target.x:m.player.x;
 const safe=x=>cross.every(c=>Math.abs(c-x)>25);
 if(!safe(want)){out:for(let d=0;d<=360;d+=3)for(const sign of [1,-1]){const x=m.player.x+sign*d;if(x>18&&x<342&&safe(x)){want=x;break out;}}}
 return {moveX:Math.max(-1,Math.min(1,(want-m.player.x)/12)),firing:true,vulcan:true,nova:m.aliens.length>3&&!m.nova.flight&&!m.nova.life};
}

test('C modern progression: all 90 legitimate-gear phone runs win; no clock losses and bounded real rewards',async t=>{
 const previous=globalThis.location;globalThis.location={search:mode==='rollback'?'?phoneFixC=0':''};
 t.after(()=>{if(previous===undefined)delete globalThis.location;else globalThis.location=previous;});
 const rows=[];
 for(const seed of [1,3,7])for(let level=1;level<=30;level++){
  const m=createAlienModel({config,balance,level,random:seededRandom(seed),completion:'waves',roundChoices:false,...profile});m.effectAspect=phoneAspect;
  assert.equal(m.v25,true,'the current gameplay route is exercised');assert.equal(m.arsenalOn,true);
  for(let frame=0;frame<30*800&&!m.result;frame++)m.update(dt,pilot(m));
  assert.ok(m.result,`stage ${level}, seed ${seed} must settle`);
  assert.ok(m.time<m.settings.seconds,`stage ${level}, seed ${seed}: no timeout`);
  assert.ok(Number.isSafeInteger(m.result.score)&&m.result.score>=0&&m.result.score<=m.settings.scoreLimit);
  assert.ok(Number.isFinite(m.result.performance)&&m.result.performance>=0&&m.result.performance<=1);
  if(m.result.outcome==='lose')assert.equal(m.lives,0,'losses must be recorded as life deaths, not a blocked clock');
  const reward=game.onResult(m.result,{engine:{data},config,level});assert.ok(reward);
  assert.ok(Number.isSafeInteger(reward.money)&&reward.money>=0&&reward.money<=m.settings.winMoney+Math.floor(m.settings.rewardScoreLimit/balance.pointsPerCoin));
  assert.ok(m.result.outcome==='win'?reward.stars>=1&&reward.stars<=3:reward.stars===0);
  rows.push({seed,level,outcome:m.result.outcome,time:+m.time.toFixed(3),budget:m.settings.seconds,lives:m.lives,wave:m.wave,aliens:m.aliens.length,kills:m.snapshot().kills,score:m.result.score,reward});
 }
 const wins=rows.filter(r=>r.outcome==='win'),lifeDeaths=rows.filter(r=>r.outcome==='lose');
 const summary={mode,root,viewport:{width:844,height:390},aspect:phoneAspect,clock:'model dt=1/30',pilot:'every-frame predictive dodge, lowest target, both fire buttons and missiles',profile,physicalPhone:false,scope:'All 90 runs with earned/purchased gear must win; this is not a beginner win-rate claim.',runs:rows.length,wins:wins.length,lifeDeaths,averageWinSeconds:+(wins.reduce((n,r)=>n+r.time,0)/wins.length).toFixed(3),rows};
 if(process.env.PHONE_FIX_PROGRESSION_OUTPUT)await writeFile(process.env.PHONE_FIX_PROGRESSION_OUTPUT,JSON.stringify(summary,null,2)+'\n');
 assert.equal(wins.length,90,`every stage/seed must retain a winning path; life deaths: ${JSON.stringify(lifeDeaths.map(r=>({level:r.level,seed:r.seed})))}`);
 console.log(JSON.stringify({mode,runs:rows.length,wins:wins.length,lifeDeaths:lifeDeaths.map(r=>({level:r.level,seed:r.seed,time:r.time})),averageWinSeconds:summary.averageWinSeconds}));
});
