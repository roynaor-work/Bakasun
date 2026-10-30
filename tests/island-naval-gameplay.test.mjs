import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createNavalModel,navalTargetable} from '../workout/island/minigames/naval.mjs';
import {navalCampaignStage,navalMissionState,navalAmmoBudget,extendNavalProgress} from '../workout/island/minigames/naval-campaign.mjs';
import {seededRandom} from '../workout/island/minigames/context.mjs';
import {gameResult} from '../workout/island/minigames/result.mjs';
import {navalCameraPose,navalWorldPoint,projectNavalPoint} from '../workout/island/minigames/naval-camera.mjs';
import {navalSolveLaunch,navalLaunch} from '../workout/island/minigames/naval-ballistics.mjs';
import {navalStagePressure} from '../workout/island/minigames/naval-campaign.mjs';

const config=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames,b=config.navalDuel;
const make=(level=1,seed=0,extra={})=>createNavalModel({config,balance:b,level,seed,random:seededRandom(seed),...extra});
function advance(m,seconds,input={}){for(let i=0;i<Math.ceil(seconds/.02)&&!m.result;i++)m.update(.02,input);}
function pilot(m,memory={}){
 const live=m.enemies.filter(e=>e.active&&e.hp>0),target=live.find(e=>!b.shipTypes[e.kind].submarine||e.depth<=b.combat.submarineHitDepth)||live[0];
 if(!target)return {};
 const heal=m.lives<m.maxLives*.5&&m.ammo[5]>0;
 const kind=heal?5:[1,2,0,4].find(i=>m.ammo[i]>0)??0;
 const input={ammoIndex:kind};
 if(m.playerShip.x<145){input.moveZ=-1;input.moveX=0;}
 // A skilled player turns and elevates the turret by hand onto the lead point
 // (25/10/2026: there is no lock reticle any more; the same physics flies the shell).
 const cycle=m.time%1.04;
 if(kind!==5&&kind!==1){const options={power:1,wind:m.wind,ammo:kind,pressure:navalStagePressure(m.settings.difficulty??1)},first=navalSolveLaunch(m.playerShip,target,options,b),flight=navalLaunch({ship:m.playerShip,...options,...first},b).duration,s=navalSolveLaunch(m.playerShip,{x:target.x+(target.vx||0)*flight,z:target.z+(target.vz||0)*flight},options,b);Object.assign(input,{aimYaw:s.yaw,aimElevation:s.elevation,aimPower:s.power});}
 if(cycle<.58)input.aimHeld=true;
 else if(!memory.released){input.fireRelease=true;memory.released=true;}
 if(cycle<.06)memory.released=false;
 return input;
}

test('Naval campaign has thirty localized encounters with enough offensive supply before purchases',()=>{
 assert.equal(b.levels.length,30);
 for(let level=1;level<=30;level++)for(const seed of [0,3,17]){
  const c=navalCampaignStage(b,level,seed),budget=navalAmmoBudget(b,c.settings,c.fleet);
  assert.equal(c.fleet.length,c.settings.waves);assert.ok(c.mission.id);assert.ok(c.mission.brief);
  assert.ok(budget.ratio>=2,`stage ${level}, seed ${seed}: ${JSON.stringify(budget)}`);
 }
 const first=navalCampaignStage(b,1,3);assert.ok(first.fleet.every(e=>!b.shipTypes[e.kind].submarine),'the introductory encounter must not surprise a new player with submerged targets');
});

for(const level of [1,10,20,30])for(const seed of [0,3,17])test(`Naval stage ${level} seed ${seed}: hold-release pilot reaches a bounded valid result with starter equipment`,()=>{
 const m=make(level,seed),memory={};
 for(let frame=0;frame<30000&&!m.result;frame++)m.update(.02,pilot(m,memory));
 assert.equal(m.result?.outcome,'win',JSON.stringify({level,seed,phase:m.phase,hp:m.lives,time:m.time,ammo:m.ammo,fleet:m.enemyFleetHp}));
 assert.ok(m.ammo.every(n=>Number.isFinite(n)&&n>=0));assert.ok(m.time<=m.settings.seconds+3);
 const result=gameResult(m.result,{config,level},b);assert.ok(result);assert.ok(result.stars>=1&&result.stars<=3);assert.ok(result.money>=m.settings.winMoney);
});

test('Naval inactivity defeats cleanly; a fresh retry resets battle resources without consuming equipment',()=>{
 const equipment=Object.freeze({hull:1.2,damage:1.2,rate:1.2,ammo:1,shield:2}),m=make(10,3,{equipment});
 advance(m,m.settings.seconds+5);assert.equal(m.result?.outcome,'lose');
 assert.equal(gameResult(m.result,{config,level:10},b).stars,0);
 const retry=make(10,3,{equipment});assert.equal(retry.result,undefined);assert.equal(retry.lives,retry.maxLives);assert.deepEqual(retry.ammo,retry.settings.ammunition);assert.deepEqual(retry.equipment,equipment);assert.equal(retry.fired,0);
});

test('Naval exhausting combat weapons while retaining repair and mines cannot stall a round',()=>{
 const m=make(1,0);m.ammo.fill(0);m.ammo[3]=1;m.ammo[5]=1;
 advance(m,8);
 assert.ok(m.result||[0,1,2,4].some(i=>m.ammo[i]>0),'a useful weapon must become available or the encounter must resolve');
});

test('Naval the last guided projectile can complete the encounter before exhaustion resolves',()=>{
 const m=make(1,0,{equipment:{damage:100}});m.ammo.fill(0);m.ammo[1]=1;
 m.update(.02,{ammoIndex:1,targetX:m.enemyShip.x,targetZ:m.enemyShip.z,firing:true});
 assert.equal(m.result,undefined);assert.equal(m.ammo[1],0);
 advance(m,5);assert.equal(m.result?.outcome,'win');
});

test('Naval target selection sends a guided shot to the chosen concurrent hull only',()=>{
 const m=make(10,0),first=m.enemies[0].hp,second=m.enemies[1].hp;
 m.update(.02,{ammoIndex:1,selectTargetIndex:1,aimHeld:true});
 assert.equal(m.lockedTargetIndex,1);assert.equal(m.selectedTargetIndex,1);
 m.update(.02,{fireRelease:true});advance(m,3);
 assert.equal(m.enemies[0].hp,first);assert.ok(m.enemies[1].hp<second);assert.equal(m.lastFeedback.kind,'hit');
});

test('Naval first simulation step does not teleport the visible opening fleet',()=>{
 for(const level of [1,10,30]){
  const m=make(level,3),before=m.enemies.filter(e=>e.active).map(e=>({index:e.index,x:e.x,z:e.z}));m.update(.001,{});
  for(const p of before){const e=m.enemies[p.index];assert.ok(Math.hypot(e.x-p.x,e.z-p.z)<.25,`stage ${level} hull ${e.index} jumped ${Math.hypot(e.x-p.x,e.z-p.z)}`);}
 }
});

test('Naval enemy telegraph fixes its impact point before firing and leaves time to evade',()=>{
 const balance=structuredClone(b);balance.levels[0].enemyTactics={...balance.levels[0].enemyTactics,fireSeconds:.2,telegraphSeconds:1.8};
 const m=make(1,0,{balance});advance(m,.22);const e=m.enemies[0];assert.ok(e.warning>1.7);assert.equal(m.enemyFired,0);
 const target={x:e.attack.x,z:e.attack.z},hp=m.lives;advance(m,.8,{moveX:1});assert.deepEqual({x:e.attack.x,z:e.attack.z},target);
 assert.equal(m.enemyFired,0);advance(m,1.05,{moveX:1});assert.equal(m.enemyFired,1);assert.ok(m.enemyShots.length>0);
 assert.deepEqual({x:m.enemyShots[0].targetX,z:m.enemyShots[0].targetZ},target);
 advance(m,1.5,{moveX:1});assert.equal(m.lives,hp);assert.equal(m.lastFeedback.kind,'evaded');
});

test('Naval brief weapon recovery blocks rapid taps without consuming their ammunition',()=>{
 const m=make(10,0),supply=m.ammo[2];m.update(.02,{ammoIndex:2,targetX:200,targetZ:130,firing:true});assert.equal(m.ammo[2],supply-1);
 m.update(.02,{});m.update(.02,{firing:true});assert.equal(m.ammo[2],supply-1);
 advance(m,.8);m.update(.02,{firing:true});assert.equal(m.ammo[2],supply-2);
});

test('Naval torpedo collision catches a nearby hull before its distant endpoint',()=>{
 const m=make(1,0),e=m.enemies[0],hp=e.hp;/* 27/10: patrolling hulls sail broadside to the player, so an adjacent launch starts just short of the beam. */m.playerShip.x=e.x-(b.aim.hullBeam/2+b.ballistics.pivotForward+b.ballistics.barrelLength+3);m.playerShip.z=e.z;
 m.update(.02,{ammoIndex:2,targetX:e.x+80,targetZ:e.z,firing:true});advance(m,.12);
 assert.ok(e.hp<hp,'crossing the actual hull must hit even before the chosen sea endpoint');
 assert.equal(m.lastFeedback.kind,'hit');
});

test('Naval repair restores hull without rewarding hit points or reducing the accuracy of identical offensive shots',()=>{
 const run=repair=>{
  const m=make(1,0,{equipment:{damage:100}});
  if(repair){m.playerShip.hp-=1;m.update(.02,{ammoIndex:5,firing:true});assert.equal(m.lives,m.maxLives);assert.equal(m.score,0);m.update(.02,{});}
  m.update(.02,{ammoIndex:1,targetX:m.enemyShip.x,targetZ:m.enemyShip.z,firing:true});advance(m,5);assert.equal(m.result?.outcome,'win');return m.result;
 };
 const clean=run(false),repaired=run(true);assert.equal(repaired.score,clean.score);assert.equal(repaired.performance,clean.performance);
});

test('Naval screen-relative helm produces travel in both axes and no idle heading spin',()=>{
 const m=make(1,0),p={...m.playerShip};advance(m,.8,{moveX:1,moveZ:0});
 assert.ok(Math.hypot(m.playerShip.x-p.x,m.playerShip.z-p.z)>5,'a horizontal steering input must move the boat, not spin in place');
 const z=m.playerShip.z;advance(m,.8,{moveZ:-1});assert.ok(m.playerShip.x>p.x+5,'forward steering advances into the combat area');assert.ok(Number.isFinite(z));
 advance(m,2);const settled={...m.playerShip};advance(m,.5);
 assert.ok(Math.hypot(m.playerShip.x-settled.x,m.playerShip.z-settled.z)<2,'released helm must settle');
 assert.ok(Math.abs(m.playerShip.heading-settled.heading)<.05,'idle boat must not keep rotating');
});

test('Naval pause equivalent advances neither combat nor input; same seed remains deterministic',()=>{
 const m=make(20,17),before=m.snapshot();m.update(0,{fireRelease:true,moveX:1});assert.deepEqual(m.snapshot(),before);
 const run=()=>{const n=make(20,17),memory={};for(let i=0;i<2000&&!n.result;i++)n.update(.02,pilot(n,memory));return n.snapshot();};assert.deepEqual(run(),run());
});

for(const [width,height]of [[844,390],[740,360],[1440,900]])test(`Naval battle camera at ${width}x${height} keeps the player and three separated targets visible during turns`,()=>{
 const ship={x:60,z:-55,heading:0},enemies=[{x:340,z:-65,active:true,hp:2,hullScale:1},{x:360,z:0,active:true,hp:2,hullScale:1.25},{x:330,z:65,active:true,hp:2,hullScale:1}];
 let camera;
 for(let i=0;i<180;i++){
  ship.heading=i/179*Math.PI*2;
  camera=navalCameraPose(ship,enemies[1],i>90,b,camera,.02,{battle:true,enemies,width,height});
  for(const entity of [ship,...enemies]){
   const point=projectNavalPoint(navalWorldPoint(entity.x,entity.z,b),camera,width,height);
   assert.ok(point.depth>0&&point.x>0&&point.x<width&&point.y>height*.05&&point.y<height*.95,JSON.stringify({width,height,i,point,camera}));
  }
 }
});

test('Naval submerged hulls reject shell and water torpedo targeting while guided ordnance remains usable',()=>{
 const sub={active:true,hp:2,kind:b.shipTypes.findIndex(t=>t.submarine),depth:1};
 assert.ok(sub.kind>=0);assert.equal(navalTargetable(sub,0,b),false);assert.equal(navalTargetable(sub,2,b),false);assert.equal(navalTargetable(sub,1,b),true);
});

test('Naval priority missions complete from their actual targets rather than requiring withdrawn escorts',()=>{
 for(const [id,selected]of [['flagship',{boss:true}],['intercept',{behavior:'flank'}],['subhunt',{behavior:'dive'}]]){
  const enemies=[{hp:0,...selected},{hp:9,boss:false,behavior:'patrol'}],state=navalMissionState({id},enemies);
  assert.equal(state.complete,true,id);assert.equal(state.completed,1);assert.equal(state.total,1);
 }
 assert.equal(navalMissionState({id:'fleet'},[{hp:0},{hp:1}]).complete,false);
});

test('Naval ten-stage content adapter preserves every old star without mutating its input',()=>{
 for(const completed of [false,true]){
  const old={stage:10,stars:[1,2,3,1,2,3,1,2,3,completed?2:0]},before=structuredClone(old),next=extendNavalProgress(old,30);
  assert.deepEqual(old,before);assert.deepEqual(next.stars.slice(0,10),old.stars);assert.equal(next.stars.length,30);assert.equal(next.stage,completed?11:10);assert.ok(next.stars.slice(10).every(n=>n===0));
 }
 const partial={stage:4,stars:[1,2,3,0,0,0,0,0,0,0]};assert.equal(extendNavalProgress(partial,30).stage,4);
 const invalid={stage:4,stars:[1,2,0,0,0,0,0,0,0,0]};assert.equal(extendNavalProgress(invalid,30),invalid);
});
