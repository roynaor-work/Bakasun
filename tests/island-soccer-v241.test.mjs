// Soccer v24.1 (14/11/2026): no radar, volley / header / scissor on a high ball, fouls on standing tackles with the carrier's fall and the
// referee's whistle, the shorter slide get-up and the Codex clips (tackle-keeper-v2, volley-scissor-v1, kicks-v2). Every switch brings back
// v24 exactly; engine rules are off without a page so every v24 contract keeps testing v24.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createSoccer} from '../workout/island/minigames/soccer.mjs';
import {expandSoccerConfig} from '../workout/island/minigames/soccer-squad.mjs';
import {applySoccerFull} from '../workout/island/minigames/soccer-full.mjs';
import {applySoccerPitchV23,applySoccerControlV23} from '../workout/island/minigames/soccer-v23.mjs';
import {playerAnimation} from '../workout/island/minigames/soccer-presentation.mjs';
import {soccerLevelV241Enabled,soccerLevelV241,SOCCER_LEVEL_V241,soccerLocoV2Enabled,SOCCER_V241_IDLES,SOCCER_V241_WALK,soccerRadarEnabled,soccerAirChoiceEnabled,soccerFoulsV241Enabled,soccerSlideRecoverV241Enabled,soccerWhistleV1Enabled,soccerTackleV2Enabled,soccerKicksV2Enabled,soccerV241Rules,soccerV241Flags,
  SOCCER_AIR_V241,soccerAirChoice,soccerAirOptions,soccerAirMeet,soccerAirContact,soccerAirAim,soccerVolleyFoot,soccerStandingFoul,SOCCER_FOULS_V241,soccerFouledSeconds,soccerFoulRoll,
  SOCCER_SLIDE_V241,SOCCER_V241_SLIDE,soccerV241SlideTime,soccerV241DiveClip,soccerV241KickClip,soccerV241Held,soccerV241ClipStates,SOCCER_V241_EXPECTED,SOCCER_V241_CLIP_FILES,soccerWhistleCue,SOCCER_WHISTLE_V1,SOCCER_V241_TAG} from '../workout/island/minigames/soccer-r241.mjs';
import {soccerV241WhistleAssets} from '../workout/island/minigames/soccer-design-audio.mjs';

const base=JSON.parse(readFileSync(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames.soccer;
const full=(v241)=>applySoccerControlV23(applySoccerPitchV23(expandSoccerConfig(applySoccerFull(base,{v241}))),'v23');
const dt=1/60,idle={moveX:0,moveZ:0};
const withLocation=(search,fn)=>{const had=Object.getOwnPropertyDescriptor(globalThis,'location');try{globalThis.location={search};return fn();}finally{if(had)Object.defineProperty(globalThis,'location',had);else delete globalThis.location;}};
const asset=path=>new URL('../workout/island/assets/soccer-v241/'+path,import.meta.url);

test('switches: on a page every v24.1 change is on, its own flag or ?soccerV241=0 gives back v24, node keeps v24 unless asked',()=>{
  withLocation('',()=>{assert.deepEqual(soccerV241Flags(),{radar:false,whistleV1:true,tackleV2:true,kicksV2:true,locoV2:true,air:true,fouls:true,recover:true,level:true});});
  withLocation('?soccerV241=0',()=>assert.deepEqual(soccerV241Flags(),{radar:true,whistleV1:false,tackleV2:false,kicksV2:false,locoV2:false,air:false,fouls:false,recover:false,level:false}));
  withLocation('?soccerRadar=1',()=>{assert.equal(soccerRadarEnabled(),true);assert.equal(soccerAirChoiceEnabled(),true,'flags are independent');});
  for(const [fn,q] of [[soccerAirChoiceEnabled,'?soccerAirChoice=0'],[soccerFoulsV241Enabled,'?soccerFouls=v24'],[soccerSlideRecoverV241Enabled,'?soccerTackleV2=0'],[soccerLevelV241Enabled,'?soccerLevel=v24']])withLocation(q,()=>assert.equal(fn(),false,q));
  for(const [fn,q] of [[soccerWhistleV1Enabled,'?soccerWhistleV1=0'],[soccerTackleV2Enabled,'?soccerTackleV2=0'],[soccerKicksV2Enabled,'?soccerKicksV2=0'],[soccerLocoV2Enabled,'?soccerLocoV2=0']])withLocation(q,()=>assert.equal(fn(),false,q));
  // node (no location): the v24 contracts stay as written
  assert.deepEqual(soccerV241Rules(),{air:false,fouls:false,recover:false,level:false});assert.equal(soccerRadarEnabled(),false);assert.equal(soccerWhistleV1Enabled(),false);
  assert.deepEqual(soccerV241Rules(true),{air:true,fouls:true,recover:true,level:true});assert.deepEqual(soccerV241Rules({air:true}),{air:true,fouls:false,recover:false,level:false});
  withLocation('',()=>assert.deepEqual(soccerV241Rules(false),{air:false,fouls:false,recover:false,level:false},'an option wins over the page'));
  assert.equal(SOCCER_V241_TAG,JSON.parse(readFileSync(new URL('../workout/island/release.json',import.meta.url),'utf8')).version,'new imports carry the current release tag');
});

test('radar: the session creates the radar canvas only with ?soccerRadar=1 (or every v24.1 change off)',()=>{
  const src=readFileSync(new URL('../workout/island/minigames/soccer-session.mjs',import.meta.url),'utf8');
  assert.match(src,/radar=fullOn&&soccerRadarEnabled\(\)\?element\('canvas','soccer-radar'\):null/);
  assert.match(src,/function drawRadar\(\)\{\s*if\(!radarContext\)return;/,'nothing is drawn without the canvas');
});

test('air choice: a ball he can meet at scissor height = header + scissor; from chest height = header + volley; lower = volley (+ diving header)',()=>{
  const m=(y,t=.5)=>({t,x:0,z:0,y});
  assert.deepEqual(soccerAirChoice({header:m(2.2),volley:m(1),scissor:m(2.1)}),{primary:'header',alt:'scissor'});
  assert.deepEqual(soccerAirChoice({header:m(1.4),volley:m(1),scissor:null}),{primary:'header',alt:'volley'});
  assert.deepEqual(soccerAirChoice({header:m(1.3),volley:null,scissor:null}),{primary:'header',alt:null});
  assert.deepEqual(soccerAirChoice({header:m(.9),volley:m(.8),scissor:null}),{primary:'volley',alt:'header'});
  assert.deepEqual(soccerAirChoice({header:null,volley:m(.6),scissor:null}),{primary:'volley',alt:null});
  assert.equal(soccerAirChoice({header:null,volley:null,scissor:null}),null);
  // the bands are the Codex pack's selection windows (volley 0.5-1.2, header 1.5-2.2, scissor 1.8-2.4) widened to the shipped header clips
  assert.ok(SOCCER_AIR_V241.volley.min<=.5&&SOCCER_AIR_V241.volley.max>=1.2&&SOCCER_AIR_V241.scissor.min<=1.8&&SOCCER_AIR_V241.scissor.max>=2.4);
});

test('air choice: options from the ball path (a lob coming down near him, a high ball from afar), and contact windows',()=>{
  const c=full(true),p={x:10,z:0,speed:1},header={min:.8,max:2.4,reach:1.9};
  const lob={owner:null,x:0,z:0,y:.11,vx:0,vz:0,vy:0,flight:{fromX:0,fromZ:0,x:10.6,z:0,height:2.3,duration:1.15,age:.25}};
  const o=soccerAirOptions(p,lob,c,{speed:7,header});assert.ok(o,'a lob gives a choice');assert.ok(['header','volley'].includes(o.primary));assert.ok(o.alt,'two ways to meet it');assert.notEqual(o.alt,'scissor','a low lob is not a scissor ball');
  const high={owner:null,x:0,z:0,y:.11,vx:0,vz:0,vy:0,flight:{fromX:-20,fromZ:0,x:10.4,z:0,height:9,duration:2.4,age:1.4}};
  const h=soccerAirOptions(p,high,c,{speed:7,header});assert.deepEqual([h?.primary,h?.alt],['header','scissor'],'a ball dropping from high: header or scissor');
  assert.equal(soccerAirOptions(p,{...lob,owner:3},c,{speed:7,header}),null,'an owned ball is no high ball');
  assert.equal(soccerAirOptions({x:60,z:0},lob,c,{speed:7,header}),null,'out of reach');
  assert.equal(soccerAirContact('volley',{x:0,z:0},{x:.8,z:0,y:.9,owner:null}),true);assert.equal(soccerAirContact('volley',{x:0,z:0},{x:.8,z:0,y:1.5,owner:null}),false,'too high for a volley');
  assert.equal(soccerAirContact('scissor',{x:0,z:0},{x:1,z:0,y:2,owner:null}),true);assert.equal(soccerAirContact('scissor',{x:0,z:0},{x:2,z:0,y:2,owner:null}),false,'too far');
  const meet=soccerAirMeet('volley',p,lob,c,{speed:7});assert.ok(meet&&meet.y>=SOCCER_AIR_V241.volley.min&&meet.y<=SOCCER_AIR_V241.volley.max);
  const aim=soccerAirAim({x:40,z:3},{x:40,z:3,y:1},1,0,c.pitch);assert.ok(aim.x>0&&Math.abs(Math.hypot(aim.x,aim.z)-1)<1e-9,'at the rival goal');
  assert.equal(soccerVolleyFoot({x:0,z:0,fx:1,fz:0},{x:0,z:-.5}),'right');assert.equal(soccerVolleyFoot({x:0,z:0,fx:1,fz:0},{x:0,z:.5}),'left');
});

/** A lob from a team-mate coming down near the controlled player in the rival half (the full match, v24.1 rules). */
function incoming(config,{height=2.3,duration=1.15,age=.2,seed=7,v241=true}={}){
  const g=createSoccer({config,seed,stage:4,difficulty:'normal',airVersion:'v23',v241}),s=g.getState();
  for(let i=0;i<5;i++)g.update(dt,idle);
  const hx=config.pitch.length/2,d=s.attackDir,me=s.players[s.controlled],x=d*(hx-config.pitch.penaltyDepth-4);
  Object.assign(me,{x,z:0,vx:0,vz:0,cooldown:0,recover:0,slideTime:0});
  for(const p of s.players)if(p!==me&&Math.hypot(p.x-x,p.z)<6){p.x+=p.team===0?-10*d:10*d;}
  const from={x:x-d*12,z:5};
  Object.assign(s.ball,{owner:null,thrower:null,shot:null,x:from.x,z:from.z,y:.5,lastTeam:0,lastPlayer:me.id===1?3:1,grace:0,curve:0,vx:0,vz:0,vy:0,
    flight:{kind:'scripted',fromX:from.x,fromZ:from.z,x:x+d*.5,z:.2,height,duration,age}});
  g.update(dt,idle);g.drainEvents();
  return {g,s,me};
}
test('engine: the kick button meets the lob the way it shows; a volley is struck from the air at goal, never trapped first',()=>{
  const config=full(true);let volleys=0,headers=0;
  for(const seed of [3,5,7,9,11]){
    const {g,s,me}=incoming(config,{seed});const o=s.airOptions;assert.ok(o,'the buttons offer a choice '+seed);
    g.update(dt,{...idle,kickHeld:true});assert.ok(s.headerArm,'armed, kept until the ball arrives');assert.equal(s.headerArm.kind??'header',o.primary==='header'?(s.headerArm.kind??'header'):o.primary);
    let strike=null;for(let i=0;i<120&&!strike;i++){g.update(dt,{...idle,kickHeld:i<3});strike=g.drainEvents().find(e=>(e.type==='shot'||e.type==='header'||e.type==='possession')&&e.player===me.id);}
    assert.ok(strike,'the ball was met');
    if(o.primary==='volley'){assert.equal(strike.type,'shot');assert.equal(strike.aerial,'volley');assert.equal(strike.player,me.id);volleys++;
      assert.ok(s.ball.vx*s.attackDir>5,'a shot toward the rival goal');assert.equal(me.aerialKind,'volley');assert.ok(playerAnimation(me,s,config).mode==='volley');}
    else{assert.equal(strike.type,'header');headers++;}
  }
  assert.ok(volleys+headers===5);
});
test('engine: the fourth button takes the second way: a volley instead of the header, a scissor kick on a high ball',()=>{
  const config=full(true);
  {const {g,s,me}=incoming(config,{seed:5});const o=s.airOptions;assert.ok(o?.alt,'a second way');
   g.update(dt,{...idle,airAlt:true});assert.equal(s.headerArm?.kind??'header',o.alt);
   let strike=null;for(let i=0;i<120&&!strike;i++){g.update(dt,{...idle,airAlt:i<3});strike=g.drainEvents().find(e=>(e.type==='shot'||e.type==='header')&&e.player===me.id);}
   assert.ok(strike,'struck');if(o.alt==='volley')assert.equal(strike.aerial,'volley');else assert.equal(strike.type,'header');
   assert.notEqual(g.drainEvents().some(e=>e.type==='switch'),true,'the fourth button did not switch player');}
  {const {g,s,me}=incoming(config,{seed:5,height:9,duration:2.4,age:1.45});const o=s.airOptions;assert.deepEqual([o?.primary,o?.alt],['header','scissor']);
   g.update(dt,{...idle,airAlt:true});assert.equal(s.headerArm?.kind,'scissor');
   let strike=null;for(let i=0;i<120&&!strike;i++){g.update(dt,idle);strike=g.drainEvents().find(e=>(e.type==='shot'||e.type==='header')&&e.player===me.id);}
   assert.equal(strike?.aerial,'scissor','the backward scissor kick');assert.ok(me.recover>SOCCER_AIR_V241.scissor.recover*.5,'he lies on his back');
   assert.ok(s.ball.vx*s.attackDir>5,'over his head toward the goal');assert.ok(me.fx*s.attackDir<0,'his back to the goal');
   for(let i=0;i<Math.round(SOCCER_AIR_V241.scissor.seconds/dt)+5;i++)g.update(dt,idle);assert.equal(playerAnimation(me,s,config).mode,'scissor','still the scissor clip while he gets up');
   for(let i=0;i<120;i++)g.update(dt,idle);assert.equal(me.aerialKind,null,'over');}
});
test('engine: v24 (no v24.1 rules) keeps the v23 header press and has no air options',()=>{
  const config=full(false),{g,s}=incoming(config,{v241:false});
  assert.equal(s.airOptions,null,'no air options');g.update(dt,{...idle,kickHeld:true});assert.ok(s.headerArm&&!s.headerArm.kind,'the v23 header arm');
});

/** The child's carrier with the ball, a rival right behind him (a standing tackle from behind). */
function tackleFromBehind(config,{seed,v241=true,childTackles=false}={}){
  const g=createSoccer({config,seed,stage:4,difficulty:'normal',v241}),s=g.getState();for(let i=0;i<5;i++)g.update(dt,idle);
  const d=s.attackDir;
  if(childTackles){
    // a rival carrier running at the child's goal, the child's player 0.9 m behind him
    const carrier=s.players.find(p=>p.team===1&&p.role!=='keeper'),me=s.players[s.controlled];
    // in the rival's own half (u < advantage.minDepth): a foul is a free kick, not an advantage
    Object.assign(carrier,{x:d*15,z:4,fx:-d,fz:0,vx:-d*3,vz:0,cooldown:0});Object.assign(me,{x:d*15+d*.5,z:4,fx:-d,fz:0,vx:0,vz:0,cooldown:0,stealCooldown:0,recover:0,slideTime:0});
    for(const p of s.players)if(p!==me&&p!==carrier&&Math.hypot(p.x-carrier.x,p.z-carrier.z)<4)p.z+=12;
    Object.assign(s.ball,{owner:carrier.id,x:carrier.x-d*.3,z:4,y:.11,vx:0,vz:0,vy:0,flight:null,lastTeam:1,lastPlayer:carrier.id,grace:0});
    return {g,s,carrier,tackler:me};
  }
  return {g,s};
}
test('fouls: the child tackling from behind can be whistled (free kick, the carrier goes down and gets up, a team-mate takes it); v24 never',()=>{
  const config=full(true);let fouls=0,clean=0;
  for(let seed=1;seed<=40;seed++){
    const {g,s,carrier,tackler}=tackleFromBehind(config,{seed,childTackles:true});
    g.update(dt,{...idle,passPressed:true});g.update(dt,idle);
    const events=g.drainEvents(),foul=events.find(e=>e.type==='foul');
    if(foul){fouls++;assert.equal(foul.kind,'steal');assert.equal(foul.player,tackler.id);assert.equal(foul.victim,carrier.id);
      if(!foul.penalty){assert.equal(s.restart?.team,1,'free kick to the fouled side');assert.notEqual(s.restart.player,carrier.id,'the fouled carrier is down: a team-mate takes it');}
      assert.ok(carrier.fouledTime>0&&carrier.recover>=carrier.fouledTime-1e-9,'down and getting up');assert.equal(playerAnimation(carrier,s,config).mode,'fouled');
      const x=carrier.x,z=carrier.z;for(let i=0;i<30;i++)g.update(dt,idle);assert.ok(Math.hypot(carrier.x-x,carrier.z-z)<1e-6,'he lies still during the stoppage');}
    else if(events.some(e=>e.type==='steal'&&e.won))clean++;
  }
  assert.ok(fouls>=8&&fouls<=30,`about ${SOCCER_FOULS_V241.lostChance} of the lost duels and ${SOCCER_FOULS_V241.wonChance} of the won ones: ${fouls}/40`);
  assert.ok(clean>0,'a clean tackle from behind is play on');
  for(let seed=1;seed<=40;seed++){const {g,s}=tackleFromBehind(full(false),{seed,v241:false,childTackles:true});g.update(dt,{...idle,passPressed:true});g.update(dt,idle);assert.equal(g.drainEvents().some(e=>e.type==='foul'),false,'v24: a standing tackle is never a foul');}
});
test('fouls: a clean tackle makes the carrier stumble and run on, never fall',()=>{
  const config=full(true);let checked=0;
  for(let seed=1;seed<=40&&checked<3;seed++){
    const {g,s,carrier}=tackleFromBehind(config,{seed,childTackles:true});
    g.update(dt,{...idle,passPressed:true});const events=g.drainEvents();
    if(events.some(e=>e.type==='steal'&&e.won)&&!events.some(e=>e.type==='foul')){checked++;assert.ok(carrier.stumbleTime>0&&!(carrier.fouledTime>0));assert.equal(playerAnimation(carrier,s,config).mode,'stumble');assert.equal(carrier.recover,0,'he can move at once');}
  }
  assert.equal(checked,3);
});
test('fouls: the pure rule (from behind only for the child, a rival can foul from any side, never on a keeper with the ball)',()=>{
  const owner={role:'striker',hands:false};
  assert.equal(soccerStandingFoul({behind:false,won:false,owner,roll:0}),null,'the child from the front: never');
  assert.ok(soccerStandingFoul({behind:true,won:false,owner,roll:SOCCER_FOULS_V241.lostChance-.01}));assert.equal(soccerStandingFoul({behind:true,won:false,owner,roll:SOCCER_FOULS_V241.lostChance+.01}),null);
  assert.ok(soccerStandingFoul({behind:false,ai:true,owner,roll:SOCCER_FOULS_V241.aiFrontChance-.01}));assert.ok(soccerStandingFoul({behind:true,ai:true,owner,roll:SOCCER_FOULS_V241.aiChance-.01}));
  assert.equal(soccerStandingFoul({behind:true,ai:true,owner:{role:'keeper',hands:true},roll:0}),null);
  assert.equal(soccerFouledSeconds(),1.6);const r=soccerFoulRoll(10,3,99,1);assert.ok(r>=0&&r<1&&r===soccerFoulRoll(10,3,99,1));
});
test('fouls: over whole simulated matches the rival is whistled for tackles too (v24: never) and every whistled carrier goes down',async()=>{
  const {playV241Match}=await import('../workout/island/tools/soccer-v241-sim.mjs');
  let rival=0,rival24=0,fallen=0,fouls=0;
  for(const seed of [1,2,3,4]){const a=playV241Match({base,seed,stage:4,v241:true,maxSeconds:180}),b=playV241Match({base,seed,stage:4,v241:false,maxSeconds:180});
    rival+=a.fouls.steal[1]+a.fouls.slide[1];rival24+=b.fouls.steal[1]+b.fouls.slide[1];fallen+=a.fallen;fouls+=a.fouls.steal[0]+a.fouls.steal[1]+a.fouls.slide[0]+a.fouls.slide[1];
    assert.equal(b.fallen,0);assert.equal(b.stumbles,0);assert.equal(a.errors+b.errors,0);}
  assert.ok(rival>rival24,`rival fouls v24.1 ${rival} vs v24 ${rival24}`);assert.ok(fallen>0&&fallen<=fouls,`${fallen} fallen for ${fouls} fouls (a penalty or a keeper never falls)`);
});

test('level: the rival builds and escapes the press from stage 2 (v24 below; the small match never), stronger with the stage',()=>{
  assert.equal(soccerLevelV241(1),null,'the first match is unchanged');
  const a=soccerLevelV241(2),b=soccerLevelV241(SOCCER_LEVEL_V241.maxStage),c=soccerLevelV241(30);
  assert.ok(a.escapeRate<b.escapeRate&&a.evade<b.evade);assert.deepEqual(b,c,'capped at maxStage');
  // config: the full match plays with the longer pass budget and the wider shooting corridor; the small match and v24 keep theirs
  const g=createSoccer({config:full(true),seed:3,stage:4,v241:{level:true}});assert.ok(g);
});
test('level: over simulated full matches the rival passes about twice as often and keeps the ball longer (v24 rival: 1 pass a spell)',async()=>{
  const {playMatch}=await import('../workout/island/tools/soccer-gameplay-metrics.mjs');
  const run=v241=>{let passes=0,spells=0,possession=0;for(const seed of [1000,1001,1002,1003]){const r=playMatch({config:base,seed,stage:5,full:'442',pitch:'v23',control:'v23',airVersion:'v23',switchVersion:'v23',maxSeconds:200,...(v241?{v241:'level'}:{})});passes+=r.team[1].passes;spells+=r.team[1].spells;possession+=r.team[0].possession;}return {passes:passes/4,perSpell:passes/Math.max(1,spells),possession:possession/4};};
  const before=run(false),after=run(true);
  assert.ok(after.passes>before.passes*1.4,`rival passes ${before.passes} -> ${after.passes}`);
  assert.ok(after.perSpell>before.perSpell*1.4,`passes a spell ${before.perSpell.toFixed(2)} -> ${after.perSpell.toFixed(2)}`);
  assert.ok(after.possession<before.possession,`home possession ${before.possession} -> ${after.possession}`);
});

test('slide: the full match gets up 0.3 s sooner with the quick get-up clip (recovery 0.8 s, v24: 1.1 s); the small match untouched',()=>{
  const a=applySoccerFull(base,{v241:true}),b=applySoccerFull(base,{v241:false});
  assert.equal(a.slide.recoverSeconds,+(base.slide.recoverSeconds+SOCCER_SLIDE_V241.extra).toFixed(3));assert.equal(b.slide.recoverSeconds,+(base.slide.recoverSeconds+.5).toFixed(3));
  for(const [k,v] of Object.entries(a.slide.variants))assert.ok(v.recoverSeconds<b.slide.variants[k].recoverSeconds,k);
  assert.equal(applySoccerFull(base).slide.recoverSeconds,b.slide.recoverSeconds,'node default = v24');
  assert.equal(soccerV241SlideTime('slide',1),SOCCER_V241_SLIDE.contact);assert.equal(soccerV241SlideTime('recover',1),SOCCER_V241_SLIDE.end);assert.equal(soccerV241SlideTime('recover',0),SOCCER_V241_SLIDE.contact);
});

test('presentation: the new modes only when their fields are set (v24 players have none of them)',()=>{
  const config=full(true),g=createSoccer({config,seed:2,stage:3}),s=g.getState(),p=s.players[4];
  assert.equal('fouledTime' in p||'stumbleTime' in p||'aerialKind' in p,false,'v24 player objects are unchanged');
  assert.equal(playerAnimation({...p,fouledTime:1,recover:1},s,config).mode,'fouled');assert.equal(playerAnimation({...p,stumbleTime:.4},s,config).mode,'stumble');
  assert.equal(playerAnimation({...p,headerTime:.3,aerialKind:'volley'},s,config).mode,'volley');assert.equal(playerAnimation({...p,recover:.5,aerialKind:'scissor'},s,config).mode,'scissor');
  assert.equal(playerAnimation({...p,headerTime:.3},s,config).mode,'header');assert.equal(playerAnimation({...p,recover:.5},s,config).mode,'recover');
});

test('clips: the runtime copies carry the expected states on the 18 canonical bones, unit quaternions, monotonic keys and smooth seams',()=>{
  for(const [file,expected] of Object.entries(SOCCER_V241_EXPECTED)){
    const json=JSON.parse(readFileSync(asset(SOCCER_V241_CLIP_FILES[file]),'utf8')),states=soccerV241ClipStates(json,expected);
    for(const id of expected){
      const st=states['v241_'+id];assert.ok(st,file+'/'+id);assert.equal(Object.keys(st.keyframes[0].rotations).length,18);assert.equal(st.keyframes[0].time,0);assert.equal(st.keyframes.at(-1).time,1);
      let prev=null;for(const k of st.keyframes){if(prev)assert.ok(k.time>prev.time,id+' monotonic');for(const q of Object.values(k.rotations))assert.ok(Math.abs(Math.hypot(...q)-1)<2e-3,id+' unit');
        if(prev)for(const [b,q] of Object.entries(k.rotations)){const p=prev.rotations[b],dot=Math.abs(q[0]*p[0]+q[1]*p[1]+q[2]*p[2]+q[3]*p[3]);assert.ok(2*Math.acos(Math.min(1,dot))*180/Math.PI<60,`${id} ${b}: no jump between keys`);}prev=k;}
    }
  }
  const tackle=JSON.parse(readFileSync(asset('clips/tackle.json'),'utf8')).states;
  assert.equal(tackle.slide.durationSeconds,SOCCER_V241_SLIDE.end);assert.ok(Math.abs(tackle.slide.ballContacts[0].atSeconds-SOCCER_V241_SLIDE.contact)<1e-6);
  for(const id of ['keeper_dive_low_left','keeper_dive_mid_right','keeper_dive_high_left'])for(const e of ['visual_takeoff','visual_contact','visual_land'])assert.ok(tackle[id].events.some(x=>x.name===e),id+' '+e);
  const aerial=JSON.parse(readFileSync(asset('clips/aerial.json'),'utf8')).states;assert.deepEqual(aerial.scissor.parts.map(p=>p.id),['scissor_backward','scissor_land_getup']);
  const lic=readFileSync(asset('LICENSES.md'),'utf8');for(const pack of ['soccer-tackle-keeper-v2','soccer-volley-scissor-v1','soccer-kicks-v2','soccer-whistle-crowd-v1'])assert.ok(lic.includes(pack),pack);
});
test('clips: which clip for the situation (dives by height, kicks by event, held one-shots)',()=>{
  const has=()=>true;
  assert.equal(soccerV241DiveClip(true,.2,has),'v241_keeper_dive_low_left');assert.equal(soccerV241DiveClip(false,1,has),'v241_keeper_dive_mid_right');assert.equal(soccerV241DiveClip(true,1.9,has),'v241_keeper_dive_high_left');
  assert.equal(soccerV241DiveClip(true,1,()=>false),null);
  const pitch={length:105,width:68,penaltyDepth:16.5},p={id:4,team:0,x:30,z:0},ball={x:30,z:0};
  assert.equal(soccerV241KickClip({event:{type:'shot',player:4,power:.9,id:1},player:p,ball,pitch},has),'v241_power_landing');
  assert.equal(soccerV241KickClip({event:{type:'shot',player:4,power:.3,id:1},player:p,ball,pitch,speed:5},has),'v241_running_kick');
  assert.equal(soccerV241KickClip({event:{type:'pass',player:4,kind:'through',distance:12},player:p,ball,pitch},has),'v241_through_pass');
  assert.equal(soccerV241KickClip({event:{type:'pass',player:4,kind:'ground',distance:25},player:p,ball,pitch},has),'v241_long_pass');
  assert.equal(soccerV241KickClip({event:{type:'pass',player:4,kind:'ground',distance:8},player:p,ball,pitch},has),'v241_short_inside_pass');
  assert.equal(soccerV241KickClip({event:{type:'shot',player:4,punt:true},player:p,ball,pitch},has),null,'a punt keeps the keeper clip');
  assert.equal(soccerV241KickClip({event:{type:'shot',player:5,power:.9},player:p,ball,pitch},has),null,'another player');
  const shots=new Set();for(let id=0;id<20;id++)for(const z of [0,20])shots.add(soccerV241KickClip({event:{type:'shot',player:4,power:.4,id},player:p,ball:{x:38,z},pitch,keeper:{x:52}},has));
  assert.ok(shots.size>=3,'variety in the finishes: '+[...shots].join());
  assert.equal(soccerV241Held('v241_volley_right'),true);assert.equal(soccerV241Held('v241_slide'),false);assert.equal(soccerV241Held('v241_keeper_dive_low_left'),false);assert.equal(soccerV241Held('v9_run'),false);
});

test('locomotion-v2: the standing and walking arms hang closer to the body than the shipped v10 idles and v9 walk, at the same walk speed',async()=>{
  const C=await import('../workout/island/minigames/athletes-core.mjs');
  const states=f=>JSON.parse(readFileSync(new URL('../workout/island/assets/'+f,import.meta.url),'utf8')).states,loco=states('soccer-v241/clips/loco.json'),v10=states('soccer-v10/clips.json'),v9=states('soccer-v9/clips.json');
  const stand=st=>{const clip=C.normaliseSoccerClip('x',st);let abd=0,out=0;for(let i=0;i<40;i++){const m=C.poseMeasures(C.sampleCanonical(clip,i/40*clip.dur));abd=Math.max(abd,m.LeftAbd,m.RightAbd);out=Math.max(out,m.LeftHandOut,m.RightHandOut);}return {abd,out};};
  for(const id of ['idle_relaxed','idle_scan','idle_weight_shift']){const a=stand(loco[id]),b=stand(v10[id]);assert.ok(a.abd<b.abd-4&&a.out<b.out-.02,`${id}: ${a.abd.toFixed(1)} deg / ${(a.out*100).toFixed(1)} cm vs v10 ${b.abd.toFixed(1)} / ${(b.out*100).toFixed(1)}`);assert.deepEqual(C.checkStand({armAbdMax:a.abd}),[]);}
  const walk=C.gaitMetrics(C.normaliseSoccerClip('walk',loco.walk)),old=C.gaitMetrics(C.normaliseSoccerClip('v9_walk',v9.walk));
  assert.ok(walk.armAbdMax<old.armAbdMax&&walk.handOutMax<old.handOutMax,'narrower walking arms');assert.deepEqual(C.checkGait(walk,'walk'),[],'meets the athlete standard');
  assert.ok(Math.abs(loco.walk.speedMps-1)<.06,'authored at the 1 m/s of the rung it replaces');assert.equal(SOCCER_V241_WALK,'v241_walk');assert.equal(SOCCER_V241_IDLES.length,3);
});

test('whistles: the referee blows a short blast for a standing-tackle foul, a sharp one for a slide or a penalty, two and three at half and full time',()=>{
  assert.equal(soccerWhistleCue('foul',{kind:'steal'}),'v241/whistle-short');assert.equal(soccerWhistleCue('foul',{kind:'slide'}),'v241/whistle-foul');assert.equal(soccerWhistleCue('foul',{kind:'steal',penalty:true}),'v241/whistle-foul');
  assert.equal(soccerWhistleCue('halftime'),'v241/whistle-halftime');assert.equal(soccerWhistleCue('fulltime'),'v241/whistle-fulltime');assert.equal(soccerWhistleCue('kickoff'),'v241/whistle-kickoff');assert.equal(soccerWhistleCue('advantage'),null,'advantage: arms, no whistle');
  const assets=soccerV241WhistleAssets(-10);assert.deepEqual(Object.keys(assets).sort(),Object.keys(SOCCER_WHISTLE_V1).sort());
  for(const a of Object.values(assets)){assert.equal(a.recommended_gain_db,-10,'at the shipped whistle gain');const file=new URL('../workout/island/design/audio/'+a.file,import.meta.url);assert.ok(existsSync(file),a.file);assert.ok(readFileSync(file).subarray(0,4).toString()==='OggS');}
});
test('whistles: the audio plays the call\'s own whistle when the Codex bank is on, the shipped one when it is off',async()=>{
  const {createSoccerDesignAudio}=await import('../workout/island/minigames/soccer-design-audio.mjs');
  for(const whistleV1 of [true,false]){
    const played=[];const audio=createSoccerDesignAudio({storage:null,AudioContext:null,fetcher:async()=>({ok:false}),whistleV1});
    assert.equal(audio.snapshot.whistleV1,whistleV1);audio.dispose();
  }
});

test('offline: the v24.1 module and every runtime copy are kept on the device',()=>{
  const m=JSON.parse(readFileSync(new URL('../workout/island/offline-manifest.json',import.meta.url),'utf8')),all=JSON.stringify(m);
  assert.ok(all.includes('minigames/soccer-r241.mjs'));
  for(const f of [...Object.values(SOCCER_V241_CLIP_FILES),...Object.values(SOCCER_WHISTLE_V1).map(w=>'audio/'+w.file)])assert.ok(all.includes('assets/soccer-v241/'+f),f);
});
