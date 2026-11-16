// v24.1 (14/11/2026), Roy after v24 on the phone.
// Ships: "it is nice to close on a target, but it needs time to lock, not at once, like a radar" (radar acquisition 0.8-1.5 s, a lock out of
// range breaks; `?navalRadar=v24`), "the screen ended while the helicopter was still in the air" (the stage waits for a clear sky;
// `?navalAirEnd=v24`), "no need to show hit or not, but the aiming itself can be better" (no words, a neutral ring, the radar's gun holds
// fire after the kill; `?navalHint=v24`, `?navalRadar=v24`), "the submarine came out of the water; it must never, only a torpedo hits it"
// (`?navalSub=v24`).
// Boars: "a little more sensitivity in the aim" (AIM241; `?boarAim=v24`) and "every weapon something different: the machine gun bullets,
// the cannon shells" (weapon-fx.mjs; `?boarFx=v24`).
// Pure rules, headless models through their real inputs, drawing on a recording canvas, data and wiring. The real phone paths (CDP touch at
// 844x390) are workout/island/tests/naval-boars-v241-browser.mjs and boar-aim-v24-browser.mjs (AIM=v241 against AIM=v24).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createNavalModel,navalTargetable} from '../workout/island/minigames/naval.mjs';
import {createNavalInput} from '../workout/island/minigames/naval-controls.mjs';
import {navalRadarV241,navalAirEndV241,navalHintV241,navalSubDeepV241,NAVAL_V241_DEFAULTS,navalV241Config,navalRadarSeconds,navalRadarBeep,navalRadarInRange,navalRadarRange,navalDeepTorpedoes,navalSkyBusy,NAVAL_V241_COLORS,NAVAL_V241_WORDS} from '../workout/island/minigames/naval-v241.mjs';
import {drawNavalV241} from '../workout/island/minigames/naval-v241-hud.mjs';
import {drawNavalV24,NAVAL_V24_WORDS} from '../workout/island/minigames/naval-v24-hud.mjs';
import {navalSubDepth,NAVAL_V24_COLORS} from '../workout/island/minigames/naval-v24.mjs';
import {navalSkyAngles} from '../workout/island/minigames/naval-air.mjs';
import {seededRandom} from '../workout/island/minigames/context.mjs';
import {playStage} from './helpers/naval-kid-bot.mjs';
import {AIM24,AIM241,V23,stickCurve,topSpeed} from '../workout/island/minigames/boar-island/aim-v24.mjs';
import {runTrials,makeStick} from '../workout/island/tests/boar-aim-model.mjs';
import {WEAPON_FX,weaponFx,shellLaunch,shellAt,shellApex} from '../workout/island/minigames/boar-island/weapon-fx.mjs';
import {WEAPON_ORDER,fam} from '../workout/island/minigames/boar-island/chain.mjs';
const read=path=>readFile(new URL(path,import.meta.url),'utf8');
const config=JSON.parse(await read('../workout/island/data/config.json')).minigames,nb=config.navalDuel,strings=JSON.parse(await read('../workout/island/data/strings.he.json'));
const FRAME=1/60,phone={...config,width:844,height:390},DEG=Math.PI/180;
function naval(stage,seed,search='',balance=nb){globalThis.location={search};try{return createNavalModel({config:phone,balance,level:stage,seed,random:seededRandom(seed),difficulty:stage});}finally{delete globalThis.location;}}
const run=(m,frames,input={})=>{for(let i=0;i<frames&&!m.result;i++)m.update(FRAME,typeof input==='function'?input(m,i):input);};
const dist=(m,e)=>Math.hypot(e.x-m.playerShip.x,e.z-m.playerShip.z);
const steer=(m,heading)=>{const d=Math.atan2(Math.sin(heading-(m.camera?.heading||0)),Math.cos(heading-(m.camera?.heading||0)));return {moveX:Math.sin(d),moveZ:-Math.cos(d)};};
function recorder(){const calls=[];const p=new Proxy({canvas:{clientWidth:844,width:844},calls},{get(t,k){if(k in t)return t[k];if(k==='measureText')return s=>({width:String(s).length*6});if(k==='createRadialGradient'||k==='createLinearGradient')return()=>({addColorStop(){}});return(...a)=>{calls.push([k,...a]);};},set(t,k,v){t[k]=v;calls.push(['set:'+String(k),v]);return true;}});return p;}
const texts=p=>p.calls.filter(c=>c[0]==='fillText').map(c=>c[1]);

// ---------------------------------------------------------------- Ships: rules
test('ships v24.1 flags: radar, clear sky, no hit words and the deep submarine are on by default; each one alone returns to v24',()=>{
 assert.equal(navalRadarV241(''),true);assert.equal(navalRadarV241('?navalRadar=v24'),false);assert.equal(navalAirEndV241(''),true);assert.equal(navalAirEndV241('?navalAirEnd=v24'),false);
 assert.equal(navalHintV241(''),true);assert.equal(navalHintV241('?navalHint=v24'),false);assert.equal(navalSubDeepV241(''),true);assert.equal(navalSubDeepV241('?navalSub=v24'),false);assert.equal(navalSubDeepV241('?navalSub=v23'),false);
 assert.equal(navalRadarV241('?navalAirEnd=v24'),true,'independent');
 const m=naval(11,1),old=naval(11,1,'?navalRadar=v24&navalAirEnd=v24&navalHint=v24&navalSub=v24');
 assert.equal(m.radarOn,true);assert.equal(m.hintV241,true);assert.equal(m.subDeep,true);assert.equal(old.radarOn,false);assert.equal(old.hintV241,false);assert.equal(old.subDeep,false);
 assert.equal(naval(3,1,'?navalAim=v23').radarOn,false,'the radar is part of the v24 aim (?navalAim=v23 keeps v23)');assert.equal(naval(3,1,'?navalLock=0').radarOn,false);
 assert.equal(navalV241Config({v241:{radar:{range:300}}}).radar.range,300);assert.equal(navalV241Config({v241:{radar:{range:300}}}).radar.max,NAVAL_V241_DEFAULTS.radar.max,'nested defaults kept');
});

test('radar lock time: 0.8 s for a near hull at stage 1 up to 1.5 s for a far hull late, longer with distance and stage, never outside 0.8-1.5',()=>{
 const c=NAVAL_V241_DEFAULTS.radar;assert.equal(navalRadarSeconds(60,1,'normal',c),.8);assert.ok(Math.abs(navalRadarSeconds(c.range,30,'normal',c)-1.5)<1e-9);
 for(let s=1;s<30;s++)assert.ok(navalRadarSeconds(200,s+1)>=navalRadarSeconds(200,s));for(let d=0;d<400;d+=20)assert.ok(navalRadarSeconds(d+20,10)>=navalRadarSeconds(d,10));
 for(const s of [1,10,30])for(const d of [0,150,340,500])for(const k of ['easy','normal','hard']){const t=navalRadarSeconds(d,s,k);assert.ok(t>=.8&&t<=1.5,`${s} ${d} ${k}: ${t}`);}
 assert.ok(navalRadarSeconds(250,12,'easy')<navalRadarSeconds(250,12,'normal')&&navalRadarSeconds(250,12,'hard')>navalRadarSeconds(250,12,'normal'));
 assert.ok(navalRadarBeep(0)>navalRadarBeep(.5)&&navalRadarBeep(.5)>navalRadarBeep(1),'the beeps quicken as the gauge fills');
 assert.equal(navalRadarRange(0),c.range);assert.equal(navalRadarInRange(c.range,0),true);assert.equal(navalRadarInRange(c.range+1,0),false);assert.equal(navalRadarInRange(c.range+c.breakMargin-1,0,true),true,'a held lock has a margin');
 assert.ok(c.range<392,'the radar reaches less far than the longest shell, so a far hull asks to sail closer');
 assert.equal(navalDeepTorpedoes(5,[6.82,6.82,6.82],2.1),3*4+2,'stage 27: three submarines, four hits each, two spare');assert.equal(navalDeepTorpedoes(5,[4.4],1.82),5,'never fewer than v24');
 assert.equal(navalSkyBusy([]),false);assert.equal(navalSkyBusy([{state:'in',h:14}]),true);assert.equal(navalSkyBusy([{state:'out',h:14}]),true,'flying away');assert.equal(navalSkyBusy([{state:'down',h:3}]),true,'still falling');assert.equal(navalSkyBusy([{state:'down',h:0}]),false);
});

// ---------------------------------------------------------------- Ships: the radar in the model
test('radar in the model: a tap starts an acquisition (no lock, the turret already swings), the lock comes after the measured time, a second tap fires right after it',()=>{
 for(const stage of [1,10,30]){const m=naval(stage,2);run(m,30);const e=m.enemies.find(x=>x.active&&x.hp>0),yaw0=m.yaw,need=navalRadarSeconds(dist(m,e),stage,m.difficulty);
  m.update(FRAME,{lockTap:e.index});assert.equal(m.homing,null,'no lock at the tap');assert.equal(m.radar.index,e.index);assert.ok(Math.abs(m.radar.need-need)<.02,`need ${m.radar.need} vs ${need}`);
  const t0=m.time;let at=null;for(let i=0;i<120&&at===null;i++){m.update(FRAME,{});if(m.homing)at=m.time;}
  assert.ok(at!==null&&Math.abs(at-t0-need)<=FRAME*1.5,`stage ${stage}: locked after ${(at-t0).toFixed(2)} s (need ${need.toFixed(2)})`);assert.ok(at-t0>=.8-FRAME&&at-t0<=1.5+FRAME);
  assert.notEqual(m.yaw,yaw0,'the turret swung toward the hull during the acquisition');assert.equal(m.snapshot().v241.radarLocks,1);}
 const q=naval(5,3);run(q,30);const e=q.enemies.find(x=>x.active&&x.hp>0);q.update(FRAME,{lockTap:e.index});q.update(FRAME,{lockTap:e.index});assert.equal(q.radar.queued,true,'the second tap waits for the lock');
 const f=q.fired;let firedAt=null,lockAt=null;for(let i=0;i<240&&firedAt===null;i++){q.update(FRAME,{});if(q.homing&&lockAt===null)lockAt=q.time;if(q.fired>f)firedAt=q.time;}
 assert.ok(lockAt!==null&&firedAt!==null&&firedAt>=lockAt&&firedAt-lockAt<.8,`fired ${firedAt?.toFixed(2)} after the lock ${lockAt?.toFixed(2)}`);
 const v24=naval(5,3,'?navalRadar=v24');run(v24,30);v24.update(FRAME,{lockTap:v24.enemies.find(x=>x.active&&x.hp>0).index});assert.ok(v24.homing,'?navalRadar=v24: locked at the tap');assert.equal(v24.radar,null);
});

test('radar in the model: a quick Fire tap during the acquisition waits for the lock; the Lock button acquires the top of the order and a second tap moves the acquisition on',()=>{
 const m=naval(10,2);run(m,60);m.update(FRAME,{lockSmart:true});const first=m.radar?.index;assert.ok(Number.isInteger(first),'the Lock button starts an acquisition');assert.equal(m.homing,null);
 m.update(FRAME,{lockSmart:true});assert.ok(m.radar&&m.radar.index!==first,'a second tap: the next hull');const second=m.radar.index;m.update(FRAME,{lockCycle:-1});assert.equal(m.radar.index,first,'a swipe back');
 const f=m.fired;m.update(FRAME,{quickShot:true});assert.equal(m.fired,f,'no hand shot from a quick tap while the radar acquires');assert.equal(m.radar.queued,true);
 let shot=false;for(let i=0;i<150&&!shot;i++){m.update(FRAME,{});shot=m.fired>f;}assert.ok(shot,'the queued tap is fired once locked');assert.equal(m.homing.index,first);void second;
});

test('radar range: a hull out of range is refused with its reason, and a lock breaks when its hull leaves the range (sailing away)',()=>{
 const m=naval(1,1);run(m,30);const e=m.enemies[0];m.update(FRAME,{lockTap:e.index});run(m,90);assert.ok(m.homing,'locked');
 let n=0;while(n<60*60&&m.homing){m.update(FRAME,steer(m,Math.atan2(m.playerShip.z-e.z+60,m.playerShip.x-e.x)));n++;}
 assert.equal(m.homing,null,`the lock broke (distance ${dist(m,e).toFixed(0)} after ${(n/60).toFixed(1)} s)`);assert.equal(m.radarLost.reason,'lost');assert.equal(m.unlocked.reason,'range');
 assert.ok(dist(m,e)>NAVAL_V241_DEFAULTS.radar.range+NAVAL_V241_DEFAULTS.radar.breakMargin-2,'only past the range and its margin');
 m.update(FRAME,{lockTap:e.index});assert.equal(m.radar,null,'out of range: no acquisition');assert.equal(m.radarLost.reason,'range');assert.ok(m.snapshot().v241.radarRefused>=1);
});

test('aim precision: tapping Fire every 0.4 s at a locked hull, the radar gun holds fire after the kill, so no locked shell flies into the empty sea after its hull sank (v24 sent some there)',()=>{
 const count=search=>{let shots=0,empty=0;for(const stage of [3,5,10,20])for(const seed of [1,2]){const m=naval(stage,seed,search);let last=null;
   // Only shells that left the locked gun count (a tap that lands in the very frame the lock drops is a hand shot, in v24 and v24.1 alike).
   const locked=new Set();for(let i=0;i<60*45&&!m.result;i++){const inp={moveX:Math.sin(i/120)*.5,moveZ:Math.cos(i/170)*.3};if(!m.homing&&!m.radar)inp.lockSmart=true;if(m.homing&&i%24===0)inp.quickShot=true;if(m.ammoIndex!==0)inp.ammoIndex=0;const f=m.fired;m.update(FRAME,inp);if(m.fired>f&&m.ball.lockShot)locked.add(m.ball.shotId);
    const ls=m.lastShot;if(ls&&ls.shotId!==last){last=ls.shotId;if(!locked.has(ls.shotId))continue;shots++;if(ls.actual.victim===null)empty++;}}}
  return {shots,empty};};
 const v241=count(''),v24=count('?navalRadar=v24');
 assert.ok(v24.empty>=3,`v24: ${v24.empty} of ${v24.shots} locked shells into the sea`);assert.equal(v241.empty,0,`v24.1: ${v241.empty} of ${v241.shots}`);assert.ok(v241.shots>=40);
});

test('the child bot with the radar (it waits for the gauge, sails in on "out of range"): 80-100% hits at stages 1, 5 and 10, stage 1 won, every lock 0.8-1.5 s',()=>{
 for(const stage of [1,5,10]){let f=0,h=0,wins=0;for(const seed of [1,2,3]){const r=playStage((s,sd)=>naval(s,sd),stage,seed,{balance:nb,style:'lockButton',notice:.6});f+=r.fired;h+=r.hits;if(r.outcome==='win')wins++;}
  assert.ok(h/f>=.8,`stage ${stage}: ${(100*h/f).toFixed(0)}%`);if(stage===1)assert.equal(wins,3,'stage 1 is won');}
 // lock times through the real input fields: Lock button, wait, measure
 const times=[];for(const stage of [2,8,16,26]){const m=naval(stage,4);run(m,40);m.update(FRAME,{lockSmart:true});const t0=m.time;if(!m.radar)continue;let at=null;for(let i=0;i<120&&at===null;i++){m.update(FRAME,{});if(m.homing)at=m.time;}if(at!==null)times.push(at-t0);}
 assert.ok(times.length>=3&&times.every(t=>t>=.8-FRAME&&t<=1.5+FRAME),JSON.stringify(times));
});

// ---------------------------------------------------------------- Ships: the sky at the end
function airStage(search,{leave=30}={}){const balance=structuredClone(nb);balance.levels[2].air={...balance.levels[2].air,from:2,every:99,count:1,kinds:['heli'],heli:{leaveAfter:leave}};return naval(3,5,search,balance);}
/** Sink the fleet through the lock (no Vulcan), then return the model. */
function sinkFleet(m){for(let i=0;i<60*120&&!m.result&&!m.missionState.complete;i++){const inp={skyMode:'manual'};if(!m.homing&&!m.radar)inp.lockSmart=true;if(m.homing?.status==='ready'&&m.cooldowns[0]<=0&&!m.ball.active)inp.quickShot=true;m.update(FRAME,inp);}return m;}
test('clear sky at the end: the fleet sinks with the helicopter up, the stage waits (clock still, no new aircraft) and ends once the Vulcan brings it down; ?navalAirEnd=v24 ends at once',()=>{
 const m=sinkFleet(airStage(''));assert.equal(m.missionState.complete,true,'the fleet is down');assert.ok(m.air.some(a=>a.state!=='down'),'the helicopter is still up');
 run(m,60*3,{skyMode:'manual'});assert.equal(m.result,undefined,'no end while the helicopter is up');assert.equal(m.airFinale,true);
 const left=m.remaining,spawned=m.vulcan&&m.snapshot().air.length;run(m,60*2,{skyMode:'manual'});assert.equal(m.remaining,left,'the clock stands still');assert.ok(m.air.length<=spawned,'no new aircraft');
 let n=0;while(!m.result&&n<60*30){const a=m.air.find(x=>x.state!=='down');const inp={skyMode:'manual'};if(a){const t=navalSkyAngles(m.playerShip,a,nb);Object.assign(inp,{skyHeld:true,skyYaw:t.yaw,skyPitch:t.pitch});}m.update(FRAME,inp);n++;}
 assert.equal(m.result?.outcome,'win','won once the sky is clear');assert.ok(m.vulcan.kills>=1,'shot down');assert.equal(m.air.length,0,'nothing left in the air');
 const old=sinkFleet(airStage('?navalAirEnd=v24'));run(old,60*3,{skyMode:'manual'});assert.equal(old.result?.outcome,'win','v24: the stage ends with the helicopter up');assert.ok(old.air.some(a=>a.state!=='down'));
 // A helicopter that is not shot down flies away after its time, and then the stage ends (it never waits forever).
 const away=sinkFleet(airStage('',{leave:20}));let k=0;while(!away.result&&k<60*40){away.update(FRAME,{skyMode:'manual'});k++;}assert.equal(away.result?.outcome,'win');assert.equal(away.air.length,0);
});

// ---------------------------------------------------------------- Ships: the deep submarine
test('deep submarine: under water from the first frame to the last (only the torpedo reaches it), enough torpedoes for every hit, an empty tube reloads; ?navalSub=v24 surfaces',()=>{
 const m=naval(11,3),sub=m.enemies.find(e=>e.subMode==='v24');assert.equal(sub.subDeep,true);assert.equal(sub.depth,1,'deep at creation');
 let up=0;for(let i=0;i<60*120&&!m.result;i++){m.update(FRAME,{moveX:Math.sin(i/90)*.4});if(sub.active&&sub.hp>0&&!(sub.depth>0))up++;}assert.equal(up,0,'never at the surface');
 for(const k of [0,1,3,4])assert.equal(navalTargetable(sub,k,nb),false,'ammo '+k);assert.equal(navalTargetable(sub,2,nb),true,'torpedo');
 assert.equal(navalSubDepth({subMode:'v24',subDeep:true,kind:3},.1,nb),1);assert.equal(navalSubDepth({subMode:'v24',kind:3},0,nb),0,'v24 starts up');
 const s27=naval(27,1);const deep=s27.enemies.filter(e=>e.subDeep);assert.equal(deep.length,3);const dmg=nb.levels[26].damage*nb.ammo[2].damage*(1+(nb.levels[26].weaponLevel-1)*.1);
 assert.ok(s27.torpedoes>=deep.reduce((n,e)=>n+Math.ceil(e.maxHp/dmg-1e-9),0),`stage 27 carries ${s27.torpedoes} torpedoes`);
 // An empty tube reloads one while a submarine is out.
 const r=naval(11,4);run(r,30);let fired=0;for(let i=0;i<60*40&&r.torpedoes>0&&!r.result;i++){r.update(FRAME,i%50===0?{torpedoShot:true}:{});}
 if(r.torpedoes===0&&!r.result&&r.enemies.some(e=>e.subDeep&&e.hp>0)){run(r,60*5.2);assert.equal(r.torpedoes,1,'one torpedo reloaded');assert.ok(r.snapshot().v241.torpedoReloads>=1);fired++;}
 assert.ok(fired||r.result||!r.enemies.some(e=>e.subDeep&&e.hp>0),'reload checked or the submarine already sunk');
 const v24=naval(11,3,'?navalSub=v24'),s=v24.enemies.find(e=>e.subMode==='v24');let surfaced=0;for(let i=0;i<60*40&&!v24.result;i++){v24.update(FRAME,{moveX:Math.sin(i/90)*.4});if(s.active&&s.hp>0&&!(s.depth>0))surfaced++;}assert.ok(surfaced>0,'?navalSub=v24: it surfaces');assert.equal(s.subDeep,undefined);
});

test('deep submarine: the child bot sinks it with torpedoes from its button (no surfacing needed) and wins the hunt',()=>{
 let wins=0,under=0;for(const seed of [1,2,3]){const r=playStage((s,sd)=>naval(s,sd),11,seed,{balance:nb,style:'lockButton',notice:.6});if(r.outcome==='win')wins++;under+=r.underwater;}
 assert.ok(wins>=2,`stage 11 won ${wins}/3`);assert.ok(under>=0);
});

// ---------------------------------------------------------------- Ships: drawing and input
test('v24.1 HUD: the radar gauge fills on the hull, a refused or lost lock says why and shows the radar ring, the clear-sky banner; v24 HUD: no hit words, a neutral ring',()=>{
 const project=(x,z,y=0)=>({x:422+z*1.2,y:300-(x-60)*.5-y,depth:1}),e={index:0,active:true,hp:1,x:200,z:10,heading:Math.PI,hullScale:1};
 const base={time:5,radarOn:true,enemies:[e],playerShip:{x:60,z:0},ammoIndex:0,air:[],airFinale:false};
 const p=recorder(),out=drawNavalV241(p,{...base,radar:{index:0,progress:.4,need:1.1,at:4.6,queued:false}},nb,project,844,390);
 assert.equal(out.radar.progress,.4);assert.equal(out.radar.offscreen,false);assert.ok(p.calls.some(c=>c[0]==='arc'),'the gauge');assert.equal(texts(p).length,0,'no words on an acquisition');
 const lost=drawNavalV241(recorder(),{...base,radarLost:{index:0,reason:'range',time:4.8}},nb,project,844,390);assert.equal(lost.lost.word,NAVAL_V241_WORDS.range);assert.equal(lost.rangeRing,NAVAL_V241_DEFAULTS.radar.range);
 assert.equal(drawNavalV241(recorder(),{...base,radarLost:{index:0,reason:'lost',time:4.8}},nb,project,844,390).lost.word,NAVAL_V241_WORDS.lost);
 const half=(x,z,y=0)=>({x:422+z*1.2,y:300-(x-60)*.5-y,depth:x>40?1:-1});assert.equal(drawNavalV241(recorder(),{...base,radarLost:{index:0,reason:'lost',time:4.8}},nb,half,844,390).rangeRing,NAVAL_V241_DEFAULTS.radar.range,'the part of the ring in front of the camera is drawn even when the rest passes behind it');
 assert.equal(drawNavalV241(recorder(),{...base,radarLost:{index:0,reason:'lost',time:1}},nb,project,844,390),null,'the reason fades');
 const sky=drawNavalV241(recorder(),{...base,airFinale:true,air:[{id:1,kind:'heli',state:'in',x:150,z:0,h:14}]},nb,project,844,390);assert.equal(sky.air.word,NAVAL_V241_WORDS.air);
 assert.equal(drawNavalV241(recorder(),{...base,radarOn:false,radar:{index:0,progress:.5}},nb,project,844,390),null);
 const m={time:2,enemyFireV24:false,subV24:false,aimV24:true,hintV241:true,result:null,enemies:[],air:[],enemyShots:[],aimHint:{index:0,from:{x:200,z:10},to:{x:210,z:20},chance:.2,status:'miss'},homing:null};
 const q=recorder(),a=drawNavalV24(q,m,nb,project,844,390);assert.equal(a.aim.word,null);assert.equal(a.aim.color,NAVAL_V241_COLORS.aim);assert.equal(texts(q).length,0,'no "hit" / "will not hit"');
 const v24=drawNavalV24(recorder(),{...m,hintV241:false},nb,project,844,390);assert.equal(v24.aim.word,NAVAL_V24_WORDS.miss);assert.equal(v24.aim.color,NAVAL_V24_COLORS.miss);
});

test('input layer: the Lock button rim fills with the acquisition (data-radar, --naval-radar) and is plain again once locked',()=>{
 const m=naval(10,2);run(m,30);const made=[],away={left:-1e4,right:-1e4,top:-1e4,bottom:-1e4,width:0,height:0};
 const el=(name,rect)=>{const props=new Map();const e={name,dataset:{},style:{setProperty(k,v){props.set(k,v);},removeProperty(){},props},listeners:new Map(),innerHTML:'',hidden:false,setAttribute(){},getAttribute:()=>null,remove(){},querySelector:()=>null,addEventListener(t,fn){e.listeners.set(t,[...(e.listeners.get(t)||[]),fn]);},closest:()=>null,getBoundingClientRect:()=>rect||{left:0,top:0,right:844,bottom:390,width:844,height:390},setPointerCapture(){}};return e;};
 const fire=el('fire',{left:734,right:822,top:280,bottom:368,width:88,height:88}),canvas=el('canvas'),controls={addEventListener(){},style:{setProperty(){},removeProperty(){}},dataset:{},classList:{toggle(){},remove(){},add(){}},querySelector:s=>s==='#shoot'?fire:null,prepend(){},append(){}};
 globalThis.window={addEventListener(){}};globalThis.document={addEventListener(){},createElement:tag=>{const e=el('made'+made.length,away);e.tag=tag;made.push(e);return e;}};globalThis.location={search:''};
 try{const input=createNavalInput({controls,canvas,balance:nb,t:k=>k},()=>m,()=>null),lockBtn=made.find(e=>e.className==='naval-lock-btn');
  lockBtn.listeners.get('pointerdown')[0]({pointerId:5,clientX:700,clientY:200,button:0,preventDefault(){}});lockBtn.listeners.get('pointerup')[0]({pointerId:5,clientX:701,clientY:200});
  m.update(FRAME,input.sample({}));assert.ok(m.radar,'the Lock button starts an acquisition');m.update(FRAME,input.sample({}));assert.equal(lockBtn.dataset.radar,'acquiring');const p1=+lockBtn.style.props.get('--naval-radar');assert.ok(p1>=0&&p1<1);
  for(let i=0;i<20;i++)m.update(FRAME,input.sample({}));assert.ok(+lockBtn.style.props.get('--naval-radar')>p1,'it fills');
  for(let i=0;i<120&&!m.homing;i++)m.update(FRAME,input.sample({}));input.sample({});assert.equal(lockBtn.dataset.radar,'none');assert.equal(lockBtn.dataset.locked,'true');input.dispose();}
 finally{delete globalThis.window;delete globalThis.document;delete globalThis.location;}
});

// ---------------------------------------------------------------- Boars: sensitivity
test('boars v24.1 stick: only the curve start and the slowdown over a boar change; a small push is a third faster, full tilt unchanged',()=>{
 for(const k of Object.keys(AIM24))if(!['LIN','FRICTION_MIN'].includes(k))assert.equal(AIM241[k],AIM24[k],k);
 assert.ok(AIM241.LIN>AIM24.LIN&&AIM241.FRICTION_MIN<AIM24.FRICTION_MIN);
 const px=(m,P)=>stickCurve(m,P)*topSpeed(1,0,844,390,P),r20=px(.2,AIM241)/px(.2,AIM24),r50=px(.5,AIM241)/px(.5,AIM24);
 assert.ok(r20>=1.25&&r20<=1.4,`20% push: x${r20.toFixed(2)}`);assert.ok(r50>1.05&&r50<r20,`50% push: x${r50.toFixed(2)}`);assert.equal(px(1,AIM241),px(1,AIM24),'full tilt');
 // over a boar at a small push the crosshair is no slower than v24 (the firmer slowdown eats the extra speed only at bigger pushes)
 assert.ok(px(.2,AIM241)*AIM241.FRICTION_MIN>=px(.2,AIM24)*AIM24.FRICTION_MIN-1e-9);
});

test('boars v24.1 in the child model (8-12 deg aim noise, 2400 boars a version): hits up, time onto a new boar down, fewer corrections, first hit sooner than v24',()=>{
 const agg=v=>{const s={hit:0,med:0,mean:0,strokes:0,first:0};let n=0;for(const sigmaDeg of [8,10,12])for(const seed of [1,2,3,4,5,6,7,8]){const r=runTrials({version:v,sigmaDeg,seed,trials:100});s.hit+=r.all.hitRate;s.med+=r.all.aimMedian;s.mean+=r.all.aimMean;s.strokes+=r.all.strokes;s.first+=r.all.firstHitMedian;n++;}for(const k in s)s[k]/=n;return s;};
 const a=agg('v24'),b=agg('v241');
 assert.ok(b.hit>=a.hit*1.03,`hits ${a.hit.toFixed(3)} -> ${b.hit.toFixed(3)}`);assert.ok(b.med<=a.med*.97,`median onto a boar ${a.med.toFixed(3)} -> ${b.med.toFixed(3)} s`);
 assert.ok(b.mean<=a.mean,`mean ${a.mean.toFixed(3)} -> ${b.mean.toFixed(3)}`);assert.ok(b.strokes<=a.strokes,`corrections ${a.strokes.toFixed(2)} -> ${b.strokes.toFixed(2)}`);assert.ok(b.first<=a.first,`first hit ${a.first.toFixed(3)} -> ${b.first.toFixed(3)}`);
 console.log('boars v24.1 model',JSON.stringify({v24:Object.fromEntries(Object.entries(a).map(([k,v])=>[k,+v.toFixed(3)])),v241:Object.fromEntries(Object.entries(b).map(([k,v])=>[k,+v.toFixed(3)]))}));
});

test('boars v24.1: a push away still leaves the boar, never slower than v24 below 60% tilt, a firm push within 0.65 s',()=>{
 const leave=(version,r,tilt)=>{const st=makeStick(version),c={x:400,y:200},tg={id:1,x:400,y:200,zones:[{x:400.3,y:200.5,r},{x:400,y:200,r:r*.3,crit:true}]};st.down(100,300);st.move(100+tilt*80,300);
  for(let i=1;i<=60*6;i++){st.step(1/60,c,version==='v23'?[]:[tg]);if(c.x-400>r+AIM24.FRICTION_PAD)return i/60;}return Infinity;};
 for(const r of [7,15,25])for(const tilt of [.2,.3,.4,.6,1]){const a=leave('v24',r,tilt),b=leave('v241',r,tilt),c=leave('v23',r,tilt);assert.ok(Number.isFinite(b),`r${r} tilt ${tilt}: stuck`);
  if(tilt<.6)assert.ok(b<=a+1e-9,`r${r} tilt ${tilt}: v24.1 ${b.toFixed(2)} s vs v24 ${a.toFixed(2)} s`);assert.ok(b<=c*1.6+.05,`r${r} tilt ${tilt}: v24.1 ${b.toFixed(2)} s vs v23 ${c.toFixed(2)} s`);if(tilt>=.4)assert.ok(b<=.65);}
});

// ---------------------------------------------------------------- Boars: a round, a look and a sound for every weapon
test('boars v24.1 weapons: every one of the 12 has its own round (bullets, pellets, shells, bolts by family), its own colours and its own sound',()=>{
 assert.deepEqual(Object.keys(WEAPON_FX).sort(),[...WEAPON_ORDER].sort(),'all twelve');
 const kind={mg:'bullet',shotgun:'pellet',cannon:'shell',tesla:'bolt'};for(const k of WEAPON_ORDER)assert.equal(weaponFx(k).kind,kind[fam(k)],k);
 const sounds=WEAPON_ORDER.map(k=>WEAPON_FX[k].sound);assert.equal(new Set(sounds).size,12,'twelve different sounds');
 const looks=WEAPON_ORDER.map(k=>{const w=WEAPON_FX[k];return [w.kind,w.glow||w.body||w.color,w.core||w.tracer||w.orb||'',w.len||w.radius||w.width,w.pair,w.strands,w.mortar].join('|');});assert.equal(new Set(looks).size,12,'twelve different looks');
 assert.equal(WEAPON_FX.mg2.pair,true,'the double gun fires a pair');assert.equal(WEAPON_FX.cannon3.mortar,true);assert.ok(WEAPON_FX.shotgun2.width>WEAPON_FX.shotgun.width,'heavier pellets');assert.equal(WEAPON_FX.tesla2.strands,2);
 for(const k of ['cannon','cannon2','cannon3'])assert.ok(WEAPON_FX[k].whistle,'a shell whistles in flight');
});

test('boars v24.1 shells: the arc lands on the aim point in v24\'s flight time at any frame rate, rises visibly, the mortar higher',()=>{
 const from={x:0,y:9,z:21},targets=[{x:0,y:1,z:-40},{x:12,y:.4,z:-15},{x:-20,y:2,z:-70}];
 for(const k of ['cannon','cannon2','cannon3'])for(const to of targets){const w=WEAPON_FX[k],v=shellLaunch(from,to,w.speed,w.gravity),straight=Math.hypot(to.x-from.x,to.y-from.y,to.z-from.z)/170;
  assert.ok(Math.abs(v.t-straight)<1e-9,`${k}: same flight time as v24's straight shell`);
  for(const dt of [1/60,1/30,.05]){let s=0,q;while(s+dt<v.t)s+=dt;q=shellAt(from,v,w.gravity,v.t);assert.ok(Math.hypot(q.x-to.x,q.y-to.y,q.z-to.z)<1e-6,`${k} lands on the point`);}
  let peak=-Infinity;for(let s=0;s<=v.t;s+=v.t/60){const q=shellAt(from,v,w.gravity,s),line=from.y+(to.y-from.y)*s/v.t;peak=Math.max(peak,q.y-line);}
  assert.ok(Math.abs(peak-shellApex(w.gravity,v.t))<.05,`${k} apex`);}
 const t=Math.hypot(0,8,61)/170;assert.ok(shellApex(WEAPON_FX.cannon.gravity,t)>.8,'a cannon shell at 60 m rises clearly over the straight line');assert.ok(shellApex(WEAPON_FX.cannon3.gravity,t)>shellApex(WEAPON_FX.cannon.gravity,t)*1.8,'the mortar lobs higher');
});

test('boars v24.1 wiring: game.js draws the rounds and plays the sounds behind ?boarFx=v24, the stick behind ?boarAim=v24; the island forwards both; versioned imports; offline',async()=>{
 const src=await read('../workout/island/minigames/boar-island/game.js'),session=await read('../workout/island/minigames/boar-session.mjs'),tag=JSON.parse(await read('../workout/island/release.json')).version,offline=JSON.parse(await read('../workout/island/offline-manifest.json'));
 assert.match(src,/const FX_V241=!LEGACY&&new URLSearchParams\(location\.search\)\.get\('boarFx'\)!=='v24';/);assert.match(src,/const AIM_V241=AIM_V24&&new URLSearchParams\(location\.search\)\.get\('boarAim'\)!=='v24';/);
 assert.ok(src.includes(`import {weaponFx,shellLaunch,shellAt} from './weapon-fx.mjs?v=${tag}';`));assert.ok(src.includes(`import {AIM24,AIM241} from './aim-v24.mjs?v=${tag}';`));
 assert.match(src,/createAimAssist\(AIM_V241\?AIM241:AIM24\)/);assert.match(src,/lin=AIM_V241\?AIM241\.LIN:STICK_LIN/);
 for(const s of ['mg2','mg3','shotgun2','shotgun3','cannon2','cannon3','tesla2','tesla3','shellWhistle','mortarWhistle'])assert.ok(src.includes(`case '${s}':`),'sound '+s);
 assert.match(src,/if\(look\)\{fxRound\(look,from,hit\.point\);if\(look\.pair&&i===0\)fxRound/,'every pellet and the pair');assert.match(src,/sfx\.play\(look\?look\.sound:'mg'\)/);
 assert.match(session,/if\(q\.get\('boarAim'\)==='v24'\)url\.searchParams\.set\('boarAim','v24'\);if\(q\.get\('boarFx'\)==='v24'\)url\.searchParams\.set\('boarFx','v24'\);/);
 for(const f of ['minigames/boar-island/weapon-fx.mjs','minigames/naval-v241.mjs','minigames/naval-v241-hud.mjs','minigames/naval-v241.css'])assert.ok(offline.shell.includes(f),'offline '+f);
 const naval=await read('../workout/island/minigames/naval.mjs');assert.ok(naval.includes(`from './naval-v241.mjs?v=${tag}';`)&&naval.includes(`from './naval-v241-hud.mjs?v=${tag}';`)&&naval.includes(`./naval-v241.css?v=${tag}`));
 assert.match(strings['minigame.navalDuel.help.1'],/המכ״ם/);assert.match(strings['minigame.navalDuel.help.1'],/כפתור הנעילה/);assert.match(strings['minigame.navalDuel.help.3'],/תמיד מתחת למים/);assert.match(strings['minigame.navalDuel.help.3'],/רק טורפדו/);assert.match(strings['minigame.navalDuel.help.3'],/סימון אדום/);
 assert.doesNotMatch(strings['naval.mission.brief.subhunt'],/טיל מונחה פוגע/);
});
