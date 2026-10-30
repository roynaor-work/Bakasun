// Basketball feel round (27/10/2026): shot meter zones, release on the button, fouls only for
// jumping into the shooter, clean straight-up blocks, rebound jumps that reach the ball, short
// and long passes, and the defender switch. Engine level; the touch controls are in the
// browser test (workout/island/tests/hoops-browser.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHoopsEngine,NO_INPUT} from '../workout/island/minigames/hoops-engine.mjs';
import {initialHoops,matchTeams} from '../workout/island/minigames/hoops-franchise.mjs';

const root=new URL('../workout/island/',import.meta.url);
const config=JSON.parse(await readFile(new URL('data/config.json',root),'utf8')),cfg=config.minigames.streetSlam;
const IN=(o={})=>({...NO_INPUT,move:{x:0,z:0},...o});

/** A live game with the child in control (no autopilot), stopped at the first held ball. */
function live(seed=5){
 const g=matchTeams(cfg,initialHoops(cfg),{stage:1});
 const e=createHoopsEngine({config:cfg,seed,teams:g.teams,userTeam:0,profile:'quick',difficulty:'easy'});
 for(let i=0;i<60*30&&!(e.snapshot().phase==='live'&&e.snapshot().ball.state==='held');i++)e.step(NO_INPUT);
 e.drainEvents();return e;
}
const api=e=>e.debug.api,S=e=>e.debug.state;
/** Keep the other team far away so nobody steals or fouls by accident. */
function clearOpponents(e,team=1){let k=0;for(const p of api(e).onCourt(team)){e.debug.place(p.id,-api(e).side(1-team)*12,-6+k*3);k++;}}
/** The child's player with the ball, standing still at a jump-shot spot. */
function setShooter(e,dist=6){
 const s=S(e),me=api(e).onCourt(0)[0],side=api(e).side(0),rim=e.court.rim(side);
 e.debug.give(me.id);s.controlled=me.id;e.debug.place(me.id,rim.x-side*dist,0.4);me.face=side>0?Math.PI/2:-Math.PI/2;
 s.shotClock=24;s.clock=80;clearOpponents(e);return me;
}
function shootWithRelease(e,offset,{hold=false}={}){
 const me=setShooter(e);const ev=[];
 e.step(IN({shootDown:true}));ev.push(...e.drainEvents());
 assert.equal(me.act,'shoot');assert.equal(me.shot.held,true,'a jump shot waits for the release');
 const target=me.shot.releaseAt+offset;
 for(let i=0;i<200&&me.act==='shoot'&&!me.shot?.released;i++){
  const up=!hold&&me.actT>=target;clearOpponents(e);e.step(IN({shootUp:up}));ev.push(...e.drainEvents());if(up&&!hold)break;
 }
 for(let i=0;i<30;i++){e.step(NO_INPUT);ev.push(...e.drainEvents());if(ev.some(x=>x.type==='release'))break;}
 return {me,ev,timing:ev.find(x=>x.type==='timing'),release:ev.find(x=>x.type==='release')};
}

test('shot meter: green at the ideal release, yellow on both sides, red beyond',()=>{
 const w=cfg.shot.window,g=w*cfg.shot.green,y=w*cfg.shot.yellow;
 const cases=[[0,'green'],[g*0.5,'green'],[-(g+y)/2,'yellow'],[(g+y)/2,'yellow'],[-(y+w)/2,'red']];
 const quality={};
 for(const [off,zone] of cases){
  const r=shootWithRelease(live(31),off);
  assert.ok(r.timing,'a timing grade for '+off);assert.equal(r.timing.zone,zone,`offset ${off.toFixed(3)} is ${zone}`);
  assert.ok(r.release,'the ball leaves the hand');quality[zone]=Math.max(quality[zone]??0,r.release.quality);
 }
 assert.ok(quality.green>quality.yellow&&quality.yellow>quality.red,'green beats yellow beats red: '+JSON.stringify(quality));
 assert.ok(cfg.shot.green<cfg.shot.yellow&&cfg.shot.yellow<1);
});

test('the ball leaves on the release: a late release is possible, holding on is late and red',()=>{
 const late=shootWithRelease(live(32),cfg.shot.window*cfg.shot.green*0.6);
 assert.equal(late.timing.zone,'green','a slightly late release is still green');
 assert.equal(late.timing.early,false);
 const held=shootWithRelease(live(33),0,{hold:true});
 assert.ok(held.release,'held too long, the shot still goes');assert.equal(held.timing.zone,'red');assert.equal(held.timing.early,false);
 // a layup is not timed: no meter, released by the move
 const e=live(34),me=setShooter(e,1.2);e.step(IN({shootDown:true}));
 assert.ok(['layup','dunk'].includes(me.shot.type));assert.equal(me.shot.held,false);
 assert.equal(e.snapshot().players.find(p=>p.id===me.id).shotHeld,false,'no meter for a layup');
});

/** A defender in the air next to a shooter, with a given speed into him. Counts shooting fouls. */
function contactFouls(speedInto,{tries=120,userDefends=false}={}){
 let fouls=0;
 for(let k=0;k<tries;k++){
  const e=live(100+k%7),s=S(e);
  const offTeam=userDefends?1:0,defTeam=1-offTeam,sh=api(e).onCourt(offTeam)[0],d=api(e).onCourt(defTeam)[0];
  const side=api(e).side(offTeam),rim=e.court.rim(side);
  e.debug.give(sh.id);e.debug.place(sh.id,rim.x-side*6,0);
  if(userDefends)s.controlled=d.id;
  api(e).startShot(sh,false);
  e.debug.place(d.id,sh.x-side*0.5,0.05);
  d.air=0;d.airDur=0.7;d.jumpMax=0.5;d.act='block';d.vx=side*speedInto;d.vz=0;
  for(let i=0;i<3;i++){e.step(NO_INPUT);}
  if(sh.shot?.contact)fouls++;
 }
 return fouls/tries;
}

test('fouls: a straight-up jump in front of the shooter is clean, jumping into him can be a foul',()=>{
 assert.equal(contactFouls(0),0,'verticality: no foul');
 assert.ok(contactFouls(4.5)>0.15,'flying into the shooter is called');
 assert.ok(cfg.contact.userScale<1,'the child is whistled less than the computer');
 // the child's block button kills the run-up, so a block is a straight jump
 const e=live(41),s=S(e),opp=api(e).onCourt(1)[0],me=api(e).onCourt(0)[0];
 e.debug.give(opp.id);s.controlled=me.id;e.debug.place(me.id,opp.x+1,opp.z);me.vx=5;me.vz=0;
 api(e).startShot(opp,false);e.step(IN({shootDown:true}));
 assert.ok(me.air>=0,'the defender jumps');assert.ok(Math.hypot(me.vx,me.vz)<3,'no lunge into the shooter');
});

test('fouls per game come down to a realistic level',()=>{
 let fouls=0,games=0;
 for(const seed of [500,501,502]){
  const g=matchTeams(cfg,initialHoops(cfg),{stage:1});
  const e=createHoopsEngine({config:cfg,seed,teams:g.teams,userTeam:0,profile:'quick',difficulty:g.difficulty,assist:g.assist,autopilot:true});
  for(let n=0;n<60*60*30&&e.snapshot().phase!=='final';n++){e.step(NO_INPUT);fouls+=e.drainEvents().filter(x=>x.type==='foul').length;}
  games++;
 }
 // quick = 6 minutes of game clock; the NBA has about 1.7 fouls per team-minute... for two teams ~10 per 6 minutes at most
 assert.ok(fouls/games<=10,'fouls per quick game: '+fouls/games);
});

test('rebound: a jump far from the ball runs there and jumps on arrival, blocks are judged once',()=>{
 const e=live(51),s=S(e),me=api(e).onCourt(0)[0],opp=api(e).onCourt(1)[0];
 const side=api(e).side(1),rim=e.court.rim(side);
 e.debug.give(opp.id);e.debug.place(opp.id,rim.x-side*6,0);api(e).startShot(opp,false);
 s.controlled=me.id;e.debug.place(me.id,rim.x-side*5.5,4.5);
 for(let i=0;i<120&&!(s.ball.state==='shot');i++)e.step(NO_INPUT);
 assert.equal(s.ball.state,'shot');
 const d0=Math.hypot(me.x-rim.x,me.z-rim.z);
 e.step(IN({shootDown:true}));assert.ok(me.jumpQueue,'too far: the jump waits until he gets there');
 let jumped=false;for(let i=0;i<70;i++){e.step(NO_INPUT);if(e.drainEvents().some(x=>x.type==='jump'&&x.playerId===me.id)){jumped=true;break;}}
 assert.ok(Math.hypot(me.x-rim.x,me.z-rim.z)<d0-1,'ran towards the rim');
 assert.ok(jumped||s.ball.state!=='shot','jumped when he arrived (or the ball was already gone)');
 assert.ok(cfg.rebound.airRadius>cfg.rebound.radius,'a jumping player reaches further');
 assert.ok(cfg.jump.cooldown<=0.5,'short wait between jumps');
});

test('passing: a tap goes to the near man, a long press to the far one',()=>{
 const e=live(61),s=S(e),[me,a,b,c,d]=api(e).onCourt(0);
 e.debug.give(me.id);s.controlled=me.id;
 e.debug.place(me.id,0,0);e.debug.place(a.id,3,0);e.debug.place(b.id,13,0.5);e.debug.place(c.id,-10,6);e.debug.place(d.id,-11,-6);
 clearOpponents(e);
 const near=api(e).choosePassTarget(me,{x:1,z:0},false),far=api(e).choosePassTarget(me,{x:1,z:0},true);
 assert.equal(near.id,a.id,'short pass to the man 3 m away');assert.equal(far.id,b.id,'long pass to the man 13 m away');
 e.step(IN({passPress:true,move:{x:1,z:0}}));
 assert.equal(me.act,'pass');assert.equal(me.act2.target,a.id);assert.equal(me.act2.kind,'chest');
 const e2=live(61),s2=S(e2),[m2,a2,b2]=api(e2).onCourt(0);
 e2.debug.give(m2.id);s2.controlled=m2.id;e2.debug.place(m2.id,0,0);e2.debug.place(a2.id,3,0);e2.debug.place(b2.id,13,0.5);clearOpponents(e2);
 e2.step(IN({passPress:true,passLong:true,move:{x:1,z:0}}));
 assert.equal(m2.act2.target,b2.id);assert.equal(m2.act2.kind,'lob','a long pass over 9 m is a lob');
});

test('defence: when the other team gets the ball the child takes the nearest defender',()=>{
 const e=live(71),s=S(e),opp=api(e).onCourt(1)[0],mine=api(e).onCourt(0);
 s.controlled=mine[0].id;e.debug.place(mine[0].id,-12,0);e.debug.place(mine[3].id,opp.x+0.8,opp.z);
 e.debug.give(mine[1].id);s.controlled=mine[0].id;e.debug.give(opp.id);
 assert.equal(s.controlled,mine[3].id);
});

test('defence: with the stick idle the child\'s defender runs back between his man and the rim',()=>{
 assert.equal(cfg.player.defenseAssist,true);
 const e=live(81),s=S(e),opp=api(e).onCourt(1),mine=api(e).onCourt(0);
 const h=opp[0];e.debug.give(h.id);
 const me=mine[0];s.controlled=me.id;if(s.teams[0].ai?.assign)s.teams[0].ai.assign[me.id]=h.id;
 const rim=e.court.rim(api(e).side(1));
 e.debug.place(h.id,rim.x-api(e).side(1)*7,0);e.debug.place(me.id,-rim.x*0.6,5);
 const gap0=()=>{const k=Math.min(cfg.player.assistGapBall/Math.max(0.6,api(e).dist(h,rim)),0.85);return {x:h.x+(rim.x-h.x)*k,z:h.z+(rim.z-h.z)*k};};
 const d0=Math.hypot(me.x-gap0().x,me.z-gap0().z);
 for(let i=0;i<90;i++){h.vx=h.vz=0;e.step(NO_INPUT);if(s.ball.state!=='held'||s.possession!==1)break;}
 const d1=Math.hypot(me.x-gap0().x,me.z-gap0().z);
 assert.ok(d1<d0-3,`ran back towards the guarding spot: ${d0.toFixed(1)} -> ${d1.toFixed(1)}`);
 // the stick still wins: pushing away moves him away
 for(let i=0;i<60;i++)e.step(IN({move:{x:-Math.sign(rim.x),z:0}}));
 assert.ok(Math.sign(rim.x)*me.vx<0,'the stick overrides the assist');
});
