// Ships v24.8 "harder" (Roy, 21/11/2026): a lock that is harder to get and to keep, more enemy hulls, a bit more enemy fire, all behind
// `?navalHarder=0`. The model is driven through its real inputs; the numbers of whole stages come from workout/island/tools/naval-harder-sim.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createNavalModel} from '../workout/island/minigames/naval.mjs';
import {navalCampaignStage} from '../workout/island/minigames/naval-campaign.mjs';
import {navalBattleCampaign} from '../workout/island/minigames/naval-battle.mjs';
import {navalLockPick,NAVAL_LOCK_DEFAULTS} from '../workout/island/minigames/naval-lockon.mjs';
import {NAVAL_V241_DEFAULTS,NAVAL_V241_WORDS} from '../workout/island/minigames/naval-v241.mjs';
import {navalHarderEnabled,NAVAL_HARDER_DEFAULTS,navalHarderConfig,navalHarderStage,navalHarderPick,navalHarderRadar,navalHarderNeed,navalTrackRate,navalTrackQuality,navalTrackStep,navalEvadeSpeed,navalHarderCampaign} from '../workout/island/minigames/naval-harder.mjs';
import {seededRandom} from '../workout/island/minigames/context.mjs';
import {playStage} from './helpers/naval-kid-bot.mjs';
const read=path=>readFile(new URL(path,import.meta.url),'utf8');
const cfg=JSON.parse(await read('../workout/island/data/config.json')).minigames,nb=cfg.navalDuel,phone={...cfg,width:844,height:390},FRAME=1/60;
const naval=(stage,seed,harder,extra={})=>createNavalModel({config:phone,balance:nb,level:stage,seed,random:seededRandom(seed),navalBattle:true,navalHarder:harder,...extra});
const hulls=m=>m.enemies.filter(e=>e.behavior!=='base');
/** Seconds from a tap on the Lock button to the lock, with the ship standing still. */
function lockSeconds(stage,seed,harder){const m=naval(stage,seed,harder);for(let i=0;i<40;i++)m.update(FRAME,{});m.update(FRAME,{lockSmart:true});if(!m.radar)return null;const t0=m.time;for(let i=0;i<60*12;i++){m.update(FRAME,{});if(m.homing)return m.time-t0;if(!m.radar)return null;}return null;}

test('harder: the switch and the tuning live in config.json',()=>{
 assert.equal(navalHarderEnabled(''),true);assert.equal(navalHarderEnabled('?navalHarder=1'),true);assert.equal(navalHarderEnabled('?navalHarder=0'),false);assert.equal(navalHarderEnabled('?navalBattle=0&navalHarder=0'),false);
 assert.ok(nb.harder,'config.json navalDuel.harder');
 assert.deepEqual(JSON.parse(JSON.stringify(navalHarderConfig(nb))),JSON.parse(JSON.stringify(NAVAL_HARDER_DEFAULTS)),'the defaults in the module are the values in config.json');
 assert.equal(navalHarderConfig({harder:{lock:{turnShare:.5}}}).lock.turnShare,.5);assert.deepEqual(navalHarderConfig({}).fleet,NAVAL_HARDER_DEFAULTS.fleet);
});

test('harder: every lock number is harder than v24.7 at stage 1 and harder still at stage 30',()=>{
 const a=navalHarderStage(1,nb),z=navalHarderStage(30,nb);
 assert.ok(a.lock.pickScale<1&&z.lock.pickScale<a.lock.pickScale);
 assert.ok(a.lock.needScale>1&&z.lock.needScale>a.lock.needScale);
 assert.ok(a.lock.rangeScale<1&&z.lock.rangeScale<a.lock.rangeScale);
 assert.ok(a.lock.marginScale<1&&z.lock.marginScale<a.lock.marginScale&&a.lock.graceScale<1&&z.lock.graceScale<a.lock.graceScale);
 assert.ok(z.evade.speed>a.evade.speed&&a.evade.speed>1);
 assert.ok(a.fleet.extraShips>=1&&z.fleet.extraShips>=a.fleet.extraShips);
 assert.ok(a.fire.totalRate>1&&a.fire.totalRate<=1.35&&z.fire.totalRate<=1.35,'a bit more fire, not a lot');
 // Out-of-range stages clamp.
 assert.deepEqual(navalHarderStage(0,nb).lock,a.lock);assert.deepEqual(navalHarderStage(99,nb).lock,z.lock);
 const pick=navalHarderPick(NAVAL_LOCK_DEFAULTS,a);assert.equal(pick.pickPixels,NAVAL_LOCK_DEFAULTS.pickPixels*a.lock.pickScale);assert.equal(navalHarderPick(NAVAL_LOCK_DEFAULTS,null),NAVAL_LOCK_DEFAULTS);
 const r=navalHarderRadar(NAVAL_V241_DEFAULTS.radar,z);assert.ok(r.range<NAVAL_V241_DEFAULTS.radar.range&&r.breakMargin<NAVAL_V241_DEFAULTS.radar.breakMargin&&r.graceSeconds<NAVAL_V241_DEFAULTS.radar.graceSeconds);
 assert.equal(navalHarderRadar(NAVAL_V241_DEFAULTS.radar,null),NAVAL_V241_DEFAULTS.radar);assert.equal(navalHarderNeed(3.5,null),3.5);assert.ok(navalHarderNeed(3.5,a)>3.5);
});

test('harder: a finger must land nearer the hull to pick it',()=>{
 const enemies=[{index:0,active:true,hp:1,x:200,z:0,heading:Math.PI/2,hullScale:1}],project=(x,z)=>({x:400+z,y:200-(x-200),depth:1});
 const hard=navalHarderStage(1,nb),far={x:400,y:200+30};
 assert.equal(navalLockPick(enemies,project,far,844,390,NAVAL_LOCK_DEFAULTS,nb),0,'v24.7 picks a finger 30 px under the hull line');
 assert.equal(navalLockPick(enemies,project,far,844,390,navalHarderPick(NAVAL_LOCK_DEFAULTS,hard),nb),null,'the smaller window does not');
 assert.equal(navalLockPick(enemies,project,{x:400,y:210},844,390,navalHarderPick(NAVAL_LOCK_DEFAULTS,navalHarderStage(30,nb)),nb),0,'a finger on the hull still picks it at stage 30');
});

test('harder: the tracker slows the gauge for a fast swing and loses it after a standstill',()=>{
 const hard=navalHarderStage(1,nb),l=hard.lock,dt=1/30;
 assert.equal(navalTrackQuality(0,hard),1);assert.equal(navalTrackQuality(l.slowSpeed,hard),1);assert.equal(navalTrackQuality(l.breakSpeed,hard),0);assert.equal(navalTrackQuality(l.breakSpeed*3,hard),0);
 const mid=navalTrackQuality((l.slowSpeed+l.breakSpeed)/2,hard);assert.ok(Math.abs(mid-.5)<1e-9);
 // A hull 200 away that crosses at 40 units a second swings 40/200 rad/s; the rate is its speed across the line of sight.
 const rate=navalTrackRate({bearing:0,heading:0},{bearing:40/200*dt,heading:0,distance:200},dt,hard);assert.ok(Math.abs(rate-40)<1e-6,String(rate));
 // The player's own turn adds `turnShare` units per degree a second; the first frame (no history) is calm.
 const turn=navalTrackRate({bearing:0,heading:0},{bearing:0,heading:80*Math.PI/180*dt,distance:200},dt,hard);assert.ok(Math.abs(turn-80*l.turnShare)<1e-6);assert.equal(navalTrackRate(null,{bearing:1,heading:1,distance:200},dt,hard),0);
 let st=null,frames=0;do{st=navalTrackStep(st,l.breakSpeed+1,dt,hard);frames++;}while(!st.broken&&frames<999);assert.ok(Math.abs(frames*dt-l.breakSeconds)<=dt+1e-9,'lost after breakSeconds at a standstill');
 assert.equal(navalTrackStep({lost:.5},0,dt,hard).lost,0,'a calm frame forgives');
 // Evasion eases toward the faster speed and back.
 let v=10;for(let i=0;i<90;i++)v=navalEvadeSpeed(v,10,true,dt,hard);assert.ok(Math.abs(v-10*hard.evade.speed)<.05);for(let i=0;i<90;i++)v=navalEvadeSpeed(v,10,false,dt,hard);assert.ok(Math.abs(v-10)<.05);
});

test('harder: more hulls, more on the water at once, a bit more fire and a longer clock at stages 1, 15 and 30',()=>{
 for(const stage of [1,5,10,15,20,25,30]){
  const stock=navalBattleCampaign(navalCampaignStage(nb,stage,1),nb,stage),on=navalHarderCampaign(stock,nb,stage),h=on.harder;
  const moving=c=>c.fleet.filter(r=>r.behavior!=='base').length;
  assert.equal(moving(on),moving(stock)+h.fleet.extraShips,`stage ${stage} hulls`);assert.ok(h.fleet.extraShips>=1&&h.fleet.extraShips<=2);
  assert.ok(on.settings.concurrent>stock.settings.concurrent||stock.settings.concurrent>=NAVAL_HARDER_DEFAULTS.fleet.maxConcurrent,`stage ${stage} at once`);assert.ok(on.settings.concurrent<=NAVAL_HARDER_DEFAULTS.fleet.maxConcurrent);
  assert.ok(on.settings.seconds>stock.settings.seconds,`stage ${stage} clock`);assert.equal(on.settings.waves,on.fleet.length);
  // Shots a second of the hulls on the water: `totalRate` of v24.7 (a bit more, never more than 1.35x).
  const rate=c=>c.settings.concurrent/c.settings.enemyTactics.fireSeconds,ratio=rate(on)/rate(stock);assert.ok(Math.abs(ratio-h.fire.totalRate)<1e-9&&ratio>1.1&&ratio<=1.35,`stage ${stage} fire x${ratio}`);
  // The added escorts never come after the boss or the base rows, and the stock rows keep their order.
  const first=on.fleet.findIndex(r=>r.harder),boss=on.fleet.findIndex(r=>r.boss||r.behavior==='base');assert.ok(boss<0||first<boss);
  assert.deepEqual(on.fleet.filter(r=>!r.harder),stock.fleet);
  // The stock campaign is not edited.
  assert.equal(stock.harder,undefined);
 }
});

test('harder: the model without the switch is v24.7, with it the fleet is larger from the first frame',()=>{
 for(const stage of [1,15,30]){
  const off=naval(stage,2,false),plain=createNavalModel({config:phone,balance:nb,level:stage,seed:2,random:seededRandom(2),navalBattle:true}),on=naval(stage,2,true);
  assert.equal(off.harder,null);assert.equal('harder' in off.snapshot(),false,'the v24.7 snapshot has no new key');assert.equal(on.snapshot().harder.trackBreaks,0);
  for(let i=0;i<120;i++){off.update(FRAME,{});plain.update(FRAME,{});on.update(FRAME,{});}
  assert.deepEqual(off.enemies.map(e=>[e.x,e.z,e.hp]),plain.enemies.map(e=>[e.x,e.z,e.hp]));
  assert.ok(hulls(on).length>hulls(off).length,`stage ${stage}: ${hulls(on).length} > ${hulls(off).length}`);
  const live=m=>hulls(m).filter(e=>e.active&&e.hp>0).length;assert.ok(live(on)>live(off),`stage ${stage} on the water: ${live(on)} > ${live(off)}`);
 }
});

test('harder: the radar needs longer for the same hull, and a ship that sails fast across and turns loses the acquisition',()=>{
 for(const stage of [1,30]){const off=lockSeconds(stage,1,false),on=lockSeconds(stage,1,true);assert.ok(off!==null&&on!==null,`stage ${stage} locks ${off} ${on}`);assert.ok(on>=off*1.08,`stage ${stage}: ${on} s > ${off} s`);assert.ok(on<=off*1.6,'still a lock a child can wait for');}
 // Weaving at full speed: the gauge of the harder radar lags behind the clock or the acquisition is lost with its own word.
 const run=harder=>{const m=naval(30,3,harder);for(let i=0;i<40;i++)m.update(FRAME,{});let lost=0,lag=0,locks=0,seen=null;
  for(let i=0;i<60*25&&!m.result;i++){const inp={moveX:Math.sin(i/22),moveZ:Math.cos(i/31)};if(!m.radar&&!m.homing)inp.lockSmart=true;m.update(FRAME,inp);
   if(m.radarLost&&m.radarLost.reason==='track'&&m.radarLost.time!==seen){seen=m.radarLost.time;lost++;}if(m.radar)lag=Math.max(lag,(m.time-m.radar.at)/m.radar.need-m.radar.progress);if(m.homing)locks++;}
  return {lost,locks,breaks:m.snapshot().harder?.trackBreaks??0};};
 const off=run(false),on=run(true);
 assert.equal(off.lost,0);assert.equal(off.breaks,0);
 assert.ok(on.locks<off.locks,`a weaving ship holds a lock for fewer frames: ${on.locks} < ${off.locks}`);
 assert.equal(on.lost,on.breaks);
 assert.ok(NAVAL_V241_WORDS.track&&!/[؀-ۿ]/.test(NAVAL_V241_WORDS.track));
});

test('harder: the hull the radar is on sails faster, and a locked shell still meets it',()=>{
 const m=naval(10,1,true);for(let i=0;i<40;i++)m.update(FRAME,{});m.update(FRAME,{lockSmart:true});assert.ok(m.radar);const index=m.radar.index;
 for(let i=0;i<90;i++)m.update(FRAME,{});
 const target=m.enemies.find(e=>e.index===index),other=m.enemies.find(e=>e.index!==index&&e.active&&e.patrol&&e.behavior===target.behavior);
 assert.ok(Math.abs(target.patrol.speed-target.patrol.cruise*m.harder.evade.speed)<.2,`evading ${target.patrol.speed} of ${target.patrol.cruise}`);
 if(other)assert.ok(Math.abs(other.patrol.speed-other.patrol.cruise)<1e-6);
 // Locked shells (stages 1, 10 and 30, a still ship): the forecast flies the same faster patrol, so they land.
 let shots=0,hit=0;
 for(const stage of [1,10,30]){const g=naval(stage,2,true);let last=null;const locked=new Set();
  for(let i=0;i<60*40&&!g.result;i++){const inp={};if(!g.homing&&!g.radar)inp.lockSmart=true;if(g.homing&&i%20===0)inp.quickShot=true;if(g.ammoIndex!==0)inp.ammoIndex=0;const f=g.fired;g.update(FRAME,inp);if(g.fired>f&&g.ball.lockShot)locked.add(g.ball.shotId);
   const ls=g.lastShot;if(ls&&ls.shotId!==last){last=ls.shotId;if(!locked.has(ls.shotId))continue;shots++;if(ls.actual.victim!==null)hit++;}}}
 assert.ok(shots>=8,`locked shells ${shots}`);assert.ok(hit/shots>=.85,`locked shells that land: ${hit}/${shots}`);
});

test('harder: the child bot still wins stage 1 (at least 60% of the seeds), with more hulls sunk',()=>{
 let wins=0,ships=0;const seeds=[1,2,3,4,5];
 for(const seed of seeds){let made=null;const r=playStage((s,sd)=>made=naval(s,sd,true),1,seed,{balance:nb,style:'lockButton',notice:.6});if(r.outcome==='win')wins++;ships=hulls(made).length;}
 assert.ok(wins/seeds.length>=.6,`stage 1 wins ${wins}/${seeds.length}`);assert.equal(ships,hulls(naval(1,1,false)).length+1);
});

test('harder: the browser session reads the switch once, the input layer uses the smaller window, nothing new is fetched',async()=>{
 const model=await read('../workout/island/minigames/naval.mjs'),controls=await read('../workout/island/minigames/naval-controls.mjs'),harder=await read('../workout/island/minigames/naval-harder.mjs');
 assert.match(model,/navalBattle:navalBattleEnabled\(\),navalHarder:navalHarderEnabled\(\)/);assert.match(controls,/navalHarderPick\(lc,m\.harder\)/);
 assert.doesNotMatch(harder,/fetch\(|XMLHttpRequest|WebSocket|import\(/);
 const manifest=JSON.parse(await read('../workout/island/offline-manifest.json'));assert.ok(manifest.shell.includes('minigames/naval-harder.mjs'));
});
