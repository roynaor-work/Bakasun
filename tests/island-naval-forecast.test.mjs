// Honest aim (29/10/2026): the mark forecasts the moving fleet with the live
// patrol rules, so a release on the green mark hits, also a quarter second late.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createNavalModel} from '../workout/island/minigames/naval.mjs';
import {seededRandom} from '../workout/island/minigames/context.mjs';
import {navalStagePressure} from '../workout/island/minigames/naval-campaign.mjs';
import {navalLaunch,navalLanding,navalMuzzle,navalPredict} from '../workout/island/minigames/naval-ballistics.mjs';
import {navalReachAim,navalReachRange} from '../workout/island/minigames/naval-controls.mjs';
import {navalForecast,navalForecastConfig} from '../workout/island/minigames/naval-forecast.mjs';
import {drawNavalAimMarks,navalArcColor} from '../workout/island/minigames/naval-marks.mjs';

const config=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames,b=config.navalDuel,R=navalReachRange(b),DT=1/60;
const make=(level,seed)=>createNavalModel({config,balance:b,level,seed,random:seededRandom(seed)});
const run=(m,seconds,input={})=>{for(let t=0;t<seconds-1e-9;t+=DT)m.update(DT,input);};
const launchOf=(m,level,yaw,v)=>{const a=navalReachAim(v,b,0);return navalLaunch({ship:m.playerShip,yaw,elevation:a.elevation,power:a.power,wind:m.wind,ammo:0,pressure:navalStagePressure(level)},b);};
/** Yaw and reach (what the drag sets) that land the shell on a water point. */
function aimAt(m,level,target){
 let yaw=Math.atan2(target.z-m.playerShip.z,target.x-m.playerShip.x),v=14;
 for(let pass=0;pass<8;pass++){
  const mz=navalMuzzle(m.playerShip,yaw,b),cy=Math.cos(yaw),sy=Math.sin(yaw),want=(target.x-mz.x)*cy+(target.z-mz.z)*sy;let lo=R.min,hi=R.max;
  for(let i=0;i<36;i++){const mid=(lo+hi)/2,l=launchOf(m,level,yaw,mid),q=navalLanding(l);if((q.x-l.origin.x)*cy+(q.z-l.origin.z)*sy<want)lo=mid;else hi=mid;}
  v=(lo+hi)/2;const q=navalLanding(launchOf(m,level,yaw,v));yaw+=Math.atan2((target.z-q.z)*cy-(target.x-q.x)*sy,Math.max(1,Math.hypot(q.x-mz.x,q.z-mz.z)));
 }
 return {yaw,v,...navalReachAim(v,b,0)};
}
const hold=s=>({aimHeld:true,aimYaw:s.yaw,aimElevation:s.elevation,aimPower:s.power});
const fire=(m,s)=>{m.update(DT,{...hold(s),aimHeld:false,fireRelease:true});for(let i=0;i<400&&!m.lastShot;i++)m.update(DT,{});return m.lastShot;};
const along=(e,u,w=0)=>({x:e.x+Math.cos(e.heading)*u*b.aim.hullLength-Math.sin(e.heading)*w*b.aim.hullBeam,z:e.z+Math.sin(e.heading)*u*b.aim.hullLength+Math.cos(e.heading)*w*b.aim.hullBeam});

test('The shot record forecasts the moving fleet: predicted contact equals the live outcome, shot for shot',()=>{
 let shots=0,hits=0;
 for(const level of [1,3,10])for(let seed=0;seed<3;seed++)for(const moment of [4,9])for(const u of [-1.05,-.9,-.5,0,.6,.95,1.1]){
  const m=make(level,seed);run(m,moment);const e=m.enemies.find(q=>q.active&&q.hp>0),s=aimAt(m,level,along(e,u));
  const shot=fire(m,s);assert.ok(shot,'the shot resolves');shots++;
  const said=shot.predicted.contact,got=shot.actual;
  assert.equal(got.victim??null,said?.index??null,`level ${level} seed ${seed} t ${moment} u ${u}: the forecast names the hull that is really hit`);
  assert.equal(Boolean(got.critical),Boolean(said?.critical),'and whether it is the centre');
  if(said){hits++;assert.ok(Math.hypot(got.x-said.x,got.z-said.z)<1e-6,'at the forecast point');}
 }
 assert.ok(shots>=120&&hits>=40&&hits<shots,`a real mix of hits and misses (${hits}/${shots})`);
});

test('A release on the green mark hits, also when the thumb lifts a quarter second later; the old still-hull mark did not',()=>{
 let green=0,oldFalse=0;const reaction=navalForecastConfig(b).reactionSeconds;
 const aimed=(level,seed,moment,settings)=>{const m=make(level,seed);run(m,moment-2*DT);m.update(DT,hold(settings));m.update(DT,hold(settings));return m;};
 for(const level of [3,10])for(let seed=0;seed<3;seed++)for(const moment of [5,11]){
  const probe=make(level,seed);run(probe,moment);const target=probe.enemies.find(q=>q.active&&q.hp>0);
  for(const u of [-1.2,-1.05,-.95,-.85,-.7,0,.7,.85,.95,1.05,1.2])for(const w of [0,1.4]){
   const settings=aimAt(probe,level,along(target,u,w)),m=aimed(level,seed,moment,settings),s=m.snapshot().prediction;
   assert.ok(s.forecast,'the forecast is on while aiming');
   if(s.kind!=='hull'&&s.kind!=='critical'){
    const still=navalPredict(m.prediction.launch,m.enemies.filter(e=>e.active&&e.hp>0),b,4).contact;
    if(still&&fire(m,settings).actual.victim===null)oldFalse++;continue;
   }
   green++;
   for(const lateBy of [0,reaction]){const late=aimed(level,seed,moment,settings);run(late,lateBy,hold(settings));
    assert.notEqual(fire(late,settings).actual.victim,null,`level ${level} seed ${seed} u ${u} w ${w}: green, released ${lateBy}s later, must hit`);}
  }
 }
 assert.ok(green>=40,`enough green releases were checked (${green})`);
 assert.ok(oldFalse>=1,`the sweep contains releases the old still-hull mark called a hit that missed (${oldFalse})`);
});

test('A shell that passes a hull too high to touch gets a chevron above that hull, never a landing mark on its picture',()=>{
 let found=0;
 for(const level of [1,3])for(let seed=0;seed<3;seed++){
  const m=make(level,seed);run(m,6);const e=m.enemies.find(q=>q.active&&q.hp>0);
  for(const behind of [60,80,110]){
   const settings=aimAt(m,level,{x:e.x+behind,z:e.z});m.update(DT,hold(settings));m.update(DT,hold(settings));
   const s=m.snapshot().prediction;if(!s.over)continue;found++;
   assert.equal(s.kind,'water');assert.equal(s.contact,null);assert.equal(s.over.index,e.index);
   const calls=[],p=new Proxy({},{get:(t,k)=>k in t?t[k]:k==='getTransform'?()=>({a:1}):k==='canvas'?{width:844,clientWidth:844}:(...a)=>calls.push(k),set:(t,k,v)=>{t[k]=v;return true;}});
   const project=(x,z,y=0)=>({...m.screenPoint(x,z,y),depth:1}),drawn=drawNavalAimMarks(p,{...m,aiming:true,prediction:m.prediction,enemies:m.enemies},project,b);
   assert.ok(drawn.over,'chevron drawn');assert.equal(drawn.x,undefined,'no landing mark');assert.equal(calls.filter(k=>k==='ellipse').length,drawn.lead?2:0,'only the lead ring, never a landing ring');assert.ok(calls.filter(k=>k==='stroke').length>=(drawn.lead?8:4),'the chevrons (and lead) are stroked, not only traced');
   const top=project(e.x,e.z,6.2*(e.hullScale||1));assert.ok(drawn.over.y<=top.y+1,'the chevron sits above the hull picture');
  }
 }
 assert.ok(found>=3,`over cases were produced (${found})`);
});

test('The arc colour follows the mark; the lead ring appears from stage 3 only; the camera still leans on the still-hull prediction',()=>{
 const look=b.aimLook;assert.equal(navalArcColor('hull',look),look.hull.color);assert.equal(navalArcColor('critical',look),look.critical.color);assert.equal(navalArcColor('water',look),look.arc);
 for(const [level,expect] of [[1,false],[3,true],[10,true]]){
  const m=make(level,1);run(m,7);const e=m.enemies.find(q=>q.active&&q.hp>0),s=aimAt(m,level,{x:e.x,z:e.z});m.update(DT,hold(s));m.update(DT,hold(s));
  const pr=m.snapshot().prediction;assert.equal(Boolean(pr.lead),expect,`stage ${level}`);
  if(expect)assert.ok(Math.hypot(pr.lead.to.x-pr.lead.from.x,pr.lead.to.z-pr.lead.from.z)>.5,'the lead shows motion');
  const still=navalPredict(m.prediction.launch,m.enemies.filter(q=>q.active&&q.hp>0),b,4).end;assert.ok(Math.hypot(m.aim.x-still.x,m.aim.z-still.z)<1e-9,'camera input unchanged');
 }
});

test('The forecast is pure and cheap enough for every aiming frame',()=>{
 const m=make(10,2);run(m,9);const e=m.enemies.find(q=>q.active&&q.hp>0),s=aimAt(m,10,{x:e.x,z:e.z}),launch=launchOf(m,10,s.yaw,s.v);
 const before=JSON.stringify(m.enemies.map(q=>[q.x,q.z,q.heading,q.patrol&&q.patrol.x]));
 const opts={time:m.time,player:m.playerShip,concurrent:m.settings.concurrent,fleetLength:m.enemies.length,drift:m.settings.drift};
 const a=navalForecast(launch,m.enemies,opts,b),c=navalForecast(launch,m.enemies,opts,b);
 assert.deepEqual(a,c,'same state and launch, same answer');assert.equal(JSON.stringify(m.enemies.map(q=>[q.x,q.z,q.heading,q.patrol&&q.patrol.x])),before,'the live fleet is untouched');
 const t0=performance.now();for(let i=0;i<200;i++)navalForecast(launch,m.enemies,{...opts,delay:i%2?.25:0},b);const ms=(performance.now()-t0)/200;
 assert.ok(ms<2,`average ${ms.toFixed(3)} ms per forecast`);
});
