import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHoopsEngine,NO_INPUT,HOOPS_SPRINT_MIN_ENERGY} from '../workout/island/minigames/hoops-engine.mjs';
import {initialHoops,matchTeams,userCards,validHoops} from '../workout/island/minigames/hoops-franchise.mjs';
import {RATING_KEYS} from '../workout/island/minigames/hoops-league.mjs';
import {runtimeRatings,playerAbilities,positionName,abilitySummary} from '../workout/island/minigames/hoops-roles.mjs';

const cfg=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames.streetSlam;
const setup=matchTeams(cfg,initialHoops(cfg));
const uniform=()=>({...Object.fromEntries(RATING_KEYS.map(k=>[k,70])),height:200});
function fixture(seed,pos='SF',ratings=uniform(),autopilot=false){
 const teams=structuredClone(setup.teams);teams[0].players[0].pos=pos;teams[0].players[0].ratings={...ratings};
 const e=createHoopsEngine({config:cfg,seed,teams,userTeam:0,profile:'quick',autopilot}),a=e.debug.api,s=a.S,p=a.onCourt(0)[0];
 e.debug.setPhase('live');s.clock=80;s.shotClock=24;
 for(const t of [0,1])a.onCourt(t).forEach((q,i)=>{e.debug.place(q.id,-11+t*2.5,-6+i*3);q.think=1e6;q.goal=null;q.intent={x:0,z:0,speed:0,face:null,sprint:false};});
 e.debug.give(p.id);s.controlled=p.id;e.drainEvents();return {e,a,s,p};
}
function shotTrial(seed,pos,dist,driving=false){
 const {e,a,p}=fixture(seed,pos),side=a.side(0),rim=e.court.rim(side);e.debug.place(p.id,rim.x-side*dist,0);p.vx=driving?side*4:0;
 a.startShot(p,false);let release=null,scored=false;
 for(let n=0;n<300;n++){
  e.step(NO_INPUT);const events=e.drainEvents();release=release||events.find(ev=>ev.type==='release');
  if(events.some(ev=>ev.type==='score')){scored=true;break;}
  if(events.some(ev=>ev.type==='miss'))break;
 }
 assert.ok(release,'the actual shot was released');return {type:release.shotType,chance:release.chance,scored};
}

test('five runtime profiles retain full role names, six visible abilities and trained ratings without changing saves',()=>{
 const h=initialHoops(cfg),before=JSON.stringify(h),cards=userCards(h);matchTeams(cfg,h);
 assert.equal(JSON.stringify(h),before);assert.equal(validHoops(h,cfg),true);
 const profiles=Object.fromEntries(['PG','SG','SF','PF','C'].map(pos=>[pos,playerAbilities({pos,ratings:uniform()})]));
 assert.ok(profiles.PG.passing>profiles.SG.passing&&profiles.PG.speed>profiles.C.speed);
 assert.ok(profiles.SG.shooting>profiles.SF.shooting&&profiles.SG.shooting>profiles.C.shooting);
 assert.ok(profiles.SF.dunk>profiles.SG.dunk&&profiles.SF.speed>profiles.PF.speed);
 assert.ok(profiles.PF.rebound>profiles.SF.rebound&&profiles.PF.defense>profiles.PG.defense);
 assert.ok(profiles.C.rebound>profiles.PF.rebound&&profiles.C.dunk>profiles.PG.dunk);
 assert.equal(new Set(Object.values(profiles).map(JSON.stringify)).size,5);
 assert.equal(positionName('PG'),'פוינט גארד');assert.equal(positionName('SG'),'שוטינג גארד');
 for(const card of cards){assert.equal(card.positionName,positionName(card.pos));assert.match(abilitySummary(card),/קליעה \d+ · הטבעה \d+ · ריבאונד \d+ · הגנה \d+ · מסירה \d+ · מהירות \d+/);}
 const trained={pos:'SG',ratings:{...uniform(),three:96}},copy=structuredClone(trained);assert.equal(runtimeRatings(trained).three,99);assert.deepEqual(trained,copy);
 const {e,p}=fixture(1,'PG'),snap=e.snapshot().players.find(q=>q.id===p.id);assert.equal(snap.pos,'PG');assert.equal(snap.positionName,positionName('PG'));assert.deepEqual(snap.abilities,p.abilities);
});

test('same-seed actual shots: a shooting guard scores more open threes; a center selects and finishes more dunks',t=>{
 const sum={SG:{makes:0,chance:0},C:{makes:0,chance:0}},n=192;
 for(let seed=1;seed<=n;seed++)for(const pos of ['SG','C']){const r=shotTrial(seed,pos,7.4);sum[pos].makes+=r.scored;sum[pos].chance+=r.chance;}
 t.diagnostic('open threes, same '+n+' seeds: '+JSON.stringify(sum));
 assert.ok(sum.SG.makes>=sum.C.makes+8,JSON.stringify(sum));assert.ok((sum.SG.chance-sum.C.chance)/n>.05);
 const finish={PG:{dunks:0,makes:0},C:{dunks:0,makes:0}},m=96;
 for(let seed=1;seed<=m;seed++)for(const pos of ['PG','C']){const r=shotTrial(seed,pos,1.2,true);finish[pos].dunks+=r.type==='dunk';finish[pos].makes+=r.scored;}
 t.diagnostic('driving finishes, same '+m+' seeds: '+JSON.stringify(finish));
 assert.equal(finish.C.dunks,m);assert.equal(finish.PG.dunks,0);assert.ok(finish.C.makes>=finish.PG.makes+12,JSON.stringify(finish));
});

function reboundTrial(seed,strongFirst){
 const {e,a,s,p}=fixture(seed,'C'),q=a.onCourt(1)[0];
 const center=runtimeRatings({pos:'C',ratings:uniform()}),guard=runtimeRatings({pos:'PG',ratings:uniform()});p.r=strongFirst?center:guard;q.r=strongFirst?guard:center;
 e.debug.place(p.id,0,-.4);e.debug.place(q.id,0,.4);
 Object.assign(s.ball,{state:'loose',owner:null,x:0,z:0,y:1,vx:0,vy:0,vz:0,lastTouch:0,missShot:{team:1},touchedRim:true});
 s.autopilot=true;e.step(NO_INPUT);const ev=e.drainEvents().find(x=>x.type==='rebound');assert.ok(ev);assert.equal(a.byId(ev.playerId).stats.reb,1);return ev.playerId===p.id;
}
test('same-seed contested rebounds follow ability rather than roster order',t=>{
 let highFirst=0,lowFirst=0;const n=128;for(let seed=1;seed<=n;seed++){highFirst+=reboundTrial(seed,true);lowFirst+=reboundTrial(seed,false);}
 t.diagnostic('first player rebound wins with strong/weak abilities: '+highFirst+'/'+lowFirst+' of '+n);
 assert.ok(highFirst>n*.8);assert.ok(lowFirst<n*.2);
});

test('AI chooses an open three for the shooter and a drive for the center on the same late-clock seeds',t=>{
 const counts={SG:0,C:0};for(let seed=1;seed<=32;seed++)for(const pos of ['SG','C']){
  const {e,a,s,p}=fixture(seed,pos,uniform(),true),side=a.side(0),rim=e.court.rim(side);e.debug.place(p.id,rim.x-side*7.4,0);s.shotClock=4;
  for(const team of s.teams)team.ai={assign:{},plan:null,planT:0,lastPossession:s.possession,transition:0};p.think=0;e.step(NO_INPUT);
  counts[pos]+=p.act==='shoot';if(pos==='C')assert.ok(!p.act&&p.goal&&Math.abs(p.goal.x-rim.x)<1.5,'center drives into the clear lane');
 }
 t.diagnostic('immediate shooting decisions, same 32 seeds: '+JSON.stringify(counts));assert.equal(counts.SG,32);assert.equal(counts.C,0);
});

test('passing accuracy, defensive contest and running speed use their actual ratings',()=>{
 function pass(pos){const {e,a,p}=fixture(25,pos),q=a.onCourt(0)[1];e.debug.place(p.id,2,-3);e.debug.place(q.id,2,5);a.startPass(p,q,'chest');for(let i=0;i<40;i++){e.step(NO_INPUT);const ev=e.drainEvents().find(x=>x.type==='pass');if(ev)return ev;}assert.fail('pass not released');}
 const pg=pass('PG'),center=pass('C');assert.ok(pg.precision>center.precision);assert.ok(pg.speed>center.speed);
 function contest(rating){const {e,a,p}=fixture(77,'SG'),q=a.onCourt(1)[0],rim=e.court.rim(a.side(0));e.debug.place(p.id,rim.x-7.4,0);e.debug.place(q.id,p.x+.8,0);q.r.perimD=rating;a.startShot(p,false);for(let i=0;i<90;i++){e.step(NO_INPUT);const ev=e.drainEvents().find(x=>x.type==='release');if(ev)return ev;}assert.fail('shot not released');}
 const weak=contest(30),strong=contest(95);assert.ok(strong.contest>weak.contest);assert.ok(strong.chance<weak.chance);
 function run(pos){const {e,p}=fixture(81,pos);e.debug.place(p.id,-7,0);for(let i=0;i<60;i++)e.step({...NO_INPUT,move:{x:1,z:0},sprint:true});return {x:p.x,snap:e.snapshot().players.find(q=>q.id===p.id),e,p};}
 const fast=run('PG'),slow=run('C');assert.ok(fast.x>slow.x+.15,JSON.stringify({fast:fast.x,slow:slow.x}));assert.ok(fast.snap.maxSpeed>slow.snap.maxSpeed);assert.ok(fast.snap.maxSpeed>Math.hypot(fast.snap.vx,fast.snap.vz)-.01);
 fast.e.debug.setEnergy(fast.p.id,HOOPS_SPRINT_MIN_ENERGY/2);assert.ok(fast.e.snapshot().players.find(q=>q.id===fast.p.id).maxSpeed<fast.snap.maxSpeed);
});
