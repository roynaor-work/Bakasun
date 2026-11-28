// Soccer v24.9 (22/11/2026): the tackle lunge, the pull to a loose ball, parried saves (corners and rebounds), the passer's run, the keeper
// balance, the closer camera with larger markers and the quiet HUD. `?soccerV249=0` (or each part's own flag) gives back v24.8; engine rules
// are off without a page so every earlier contract keeps testing the earlier match.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSoccer} from '../workout/island/minigames/soccer.mjs';
import {expandSoccerConfig} from '../workout/island/minigames/soccer-squad.mjs';
import {applySoccerFull,SOCCER_FULL,soccerFullCamera} from '../workout/island/minigames/soccer-full.mjs';
import {applySoccerPitchV23,applySoccerControlV23} from '../workout/island/minigames/soccer-v23.mjs';
import {soccerFxSound} from '../workout/island/minigames/soccer-v24.mjs';
import {SOCCER_V249,soccerV249Rules,soccerCam249Enabled,soccerHud249Enabled,soccerLook249Enabled,applySoccerV249View,soccerLungeAllowed,soccerLungeTarget,soccerMagnetSteer,soccerParry,soccerGoTarget,soccerCueShown} from '../workout/island/minigames/soccer-r249.mjs';

const base=JSON.parse(readFileSync(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames.soccer;
const full=()=>applySoccerControlV23(applySoccerPitchV23(expandSoccerConfig(applySoccerFull(base,{v241:true}))),'v23');
const dt=1/60,idle={moveX:0,moveZ:0};
const withLocation=(search,fn)=>{const had=Object.getOwnPropertyDescriptor(globalThis,'location');try{globalThis.location={search};return fn();}finally{if(had)Object.defineProperty(globalThis,'location',had);else delete globalThis.location;}};
const ALL={lunge:true,magnet:true,parry:true,go:true,keeper:true},NONE={lunge:false,magnet:false,parry:false,go:false,keeper:false};

test('switches: on a page every v24.9 part is on, its own flag or ?soccerV249=0 gives back v24.8, node keeps v24.8 unless asked',()=>{
  withLocation('',()=>{assert.deepEqual(soccerV249Rules(),ALL);assert.equal(soccerCam249Enabled(),true);assert.equal(soccerHud249Enabled(),true);assert.equal(soccerLook249Enabled(),true);});
  withLocation('?soccerV249=0',()=>{assert.deepEqual(soccerV249Rules(),NONE);assert.equal(soccerCam249Enabled(),false);assert.equal(soccerHud249Enabled(),false);assert.equal(soccerLook249Enabled(),false);});
  for(const [key,q] of [['lunge','?soccerLunge=0'],['magnet','?soccerMagnet=0'],['parry','?soccerParry=0'],['go','?soccerGo=0'],['keeper','?soccerKeeper249=0']])withLocation(q,()=>assert.deepEqual(soccerV249Rules(),{...ALL,[key]:false},q));
  withLocation('?soccerCam249=0',()=>{assert.equal(soccerCam249Enabled(),false);assert.equal(soccerHud249Enabled(),true);});
  withLocation('?soccerHud249=0',()=>{assert.equal(soccerHud249Enabled(),false);assert.equal(soccerCam249Enabled(),true);});
  withLocation('?soccerLook=0',()=>{assert.equal(soccerLook249Enabled(),false);assert.equal(soccerCam249Enabled(),true);});
  assert.deepEqual(soccerV249Rules(),NONE,'node: off');assert.equal(soccerCam249Enabled(),false);assert.equal(soccerHud249Enabled(),false);assert.equal(soccerLook249Enabled(),false);
  assert.deepEqual(soccerV249Rules(true),ALL);assert.deepEqual(soccerV249Rules({parry:true}),{...NONE,parry:true});
  withLocation('',()=>assert.deepEqual(soccerV249Rules(false),NONE,'an option wins over the page'));
});

test('v24.9 off is v24.8 tick for tick: the same seed gives the same match with the option false and with no option',()=>{
  const run=v249=>{const g=createSoccer({config:full(),seed:77,stage:4,difficulty:'normal',role:'field',airVersion:'v23',v241:true,...(v249===undefined?{}:{v249})});let n=0;const sum=[];
    while(!g.result&&n<60*60){const s=g.getState();g.update(dt,{moveX:Math.sin(n/40),moveZ:Math.cos(n/55),passPressed:n%47===0,kickHeld:n%130<8,sprintHeld:n%200<90});if(n%300===0)sum.push([s.ball.x.toFixed(4),s.ball.z.toFixed(4),s.controlled,...s.score].join(','));n++;}
    return sum.join('|');};
  assert.equal(run(undefined),run(false));
  assert.notEqual(run(undefined),run(true),'and the rules do change the match when on');
});

test('lunge: only at a rival carrier on the ground, beyond the tackle reach and inside the range; the target leads the carrier',()=>{
  const p={x:0,z:0,team:0},rival={team:1,vx:5,vz:0,hands:false},L=SOCCER_V249.lunge;
  assert.equal(soccerLungeAllowed(p,{x:2,z:0,y:.11},rival,1.2),true);
  assert.equal(soccerLungeAllowed(p,{x:1,z:0,y:.11},rival,1.2),false,'inside the reach it is an ordinary tackle');
  assert.equal(soccerLungeAllowed(p,{x:L.range+.2,z:0,y:.11},rival,1.2),false,'too far');
  assert.equal(soccerLungeAllowed(p,{x:2,z:0,y:.11},null,1.2),false,'a loose ball is not tackled');
  assert.equal(soccerLungeAllowed(p,{x:2,z:0,y:.11},{team:0},1.2),false,'never at a team-mate');
  assert.equal(soccerLungeAllowed(p,{x:2,z:0,y:.11},{team:1,hands:true},1.2),false,'never at a keeper holding the ball');
  assert.equal(soccerLungeAllowed(p,{x:2,z:0,y:2},rival,1.2),false,'not at a ball in the air');
  const t=soccerLungeTarget({x:2,z:1},rival);assert.ok(Math.abs(t.x-(2+5*L.lead))<1e-9&&t.z===1);
});

test('lunge in the match: a tackle pressed two metres from the rival carrier closes the gap and resolves the tackle; with v24.9 off the press does nothing',()=>{
  const play=v249=>{
    const g=createSoccer({config:full(),seed:5,stage:4,difficulty:'normal',role:'field',airVersion:'v23',v241:true,v249}),s=g.getState();
    const me=s.players[s.controlled],rival=s.players.find(q=>q.team===1&&q.role!=='keeper');
    // every other player far away, the rival carrier 2.2 m in front of the child's player
    for(const q of s.players){q.x=q.team===0?-40:40;q.z=(q.id%11)*3-15;q.vx=q.vz=0;}
    me.x=0;me.z=0;rival.x=2.2;rival.z=0;rival.think=9;rival.cooldown=9;Object.assign(s.ball,{x:rival.x-.4,z:0,y:.11,vx:0,vz:0,vy:0,owner:rival.id,lastTeam:1,lastPlayer:rival.id,grace:0,flight:null});
    const startGap=Math.hypot(s.ball.x-me.x,s.ball.z-me.z),events=[];
    g.update(dt,{...idle,passPressed:true});events.push(...g.drainEvents());
    let closest=startGap;for(let i=0;i<30;i++){g.update(dt,idle);events.push(...g.drainEvents());closest=Math.min(closest,Math.hypot(rival.x-me.x,rival.z-me.z));}
    return {startGap,closest,types:events.map(e=>e.type),moved:Math.hypot(me.x,me.z)};
  };
  const on=play({lunge:true}),off=play(false);
  assert.ok(on.startGap>full().steal.reach&&on.startGap<SOCCER_V249.lunge.range,'the set-up is a step out of reach');
  assert.ok(on.types.includes('lunge'),'the lunge is announced');assert.ok(on.types.includes('steal'),'the tackle is tried on arrival: '+on.types.join(','));
  assert.ok(on.moved>.5,'the idle stick did not stop him: he ran '+on.moved.toFixed(2)+' m');
  assert.ok(!off.types.includes('lunge')&&!off.types.includes('steal'),'v24.8: the early press is lost');assert.ok(off.moved<.2);
});

test('magnet: a stick pushed roughly at a loose ball bends to it; elsewhere, far away, owned or high balls leave the stick alone',()=>{
  const p={x:0,z:0},ball={x:3,z:1,y:.11,vx:0,vz:0,owner:null},M=SOCCER_V249.magnet;
  const bent=soccerMagnetSteer(p,ball,1,0);assert.ok(bent&&bent.z>.1&&bent.x>.8,'bent toward +z');assert.ok(Math.abs(Math.hypot(bent.x,bent.z)-1)<1e-9,'the stick keeps its length');
  const half=soccerMagnetSteer(p,ball,.5,0);assert.ok(Math.abs(Math.hypot(half.x,half.z)-.5)<1e-9);
  assert.equal(soccerMagnetSteer(p,ball,-1,0),null,'the child runs the other way');
  assert.equal(soccerMagnetSteer(p,ball,0,-1),null,'outside the cone');
  assert.equal(soccerMagnetSteer(p,{...ball,x:M.range+2},1,0),null,'far');
  assert.equal(soccerMagnetSteer(p,{...ball,owner:4},1,0),null,'owned');
  assert.equal(soccerMagnetSteer(p,{...ball,y:2},1,0),null,'high');
  assert.equal(soccerMagnetSteer(p,ball,0,0),null,'idle stick');
  const lead=soccerMagnetSteer(p,{...ball,vz:-10},1,0);assert.ok(lead.z<bent.z,'it aims where the ball will be');
});

test('parry: slow shots are caught, hard ones may be pushed round the post (never into the goal mouth) or back into play',()=>{
  const P=SOCCER_V249.parry,shot={ball:{x:-51,z:2.8},dir:1,goalX:-52.5,side:1,goalWidth:7.32,stretch:.8};
  assert.equal(soccerParry({...shot,speed:P.minSpeed-1,roll:0,roll2:.5}),null,'a slow ball is held');
  assert.equal(soccerParry({...shot,speed:20,roll:.99,roll2:.5}),null,'above the chance: a catch');
  assert.equal(soccerParry({...shot,speed:20,stretch:0,roll:P.chance[0]+.01,roll2:.5}),null,'at his body the chance is the low one');
  const corner=soccerParry({...shot,speed:20,roll:.01,roll2:.5});assert.equal(corner.kind,'corner');assert.ok(corner.vx<0&&corner.vz>0,'toward his own goal line, outside the post');
  // every corner path meets the line outside the post, for every start the keeper can reach
  for(let i=0;i<400;i++){const ball={x:-52.5+.2+(i%20)*.12,z:-3.6+(i%37)*.2},side=i%2?1:-1,out=soccerParry({...shot,ball,side,speed:20,roll:.001*(i%50),roll2:(i%10)/10});
    if(out?.kind==='corner'){const t=(-52.5-ball.x)/out.vx,z=ball.z+out.vz*t;assert.ok(t>0&&Math.abs(z)>7.32/2+.5,`corner path clear of the goal (${i}: z ${z.toFixed(2)})`);}
    if(out?.kind==='rebound')assert.ok(out.vx>0,'a rebound goes up the pitch');}
  const rebound=soccerParry({...shot,speed:20,roll:.6,roll2:.5});assert.equal(rebound.kind,'rebound');
  assert.equal(soccerFxSound({type:'parry'},null),'v24/keeper-catch','the gloves are heard');
});

test('parry in matches: corners happen, no own goal comes from a parry, and the match never breaks',()=>{
  let corners=0,rebounds=0,errors=0;
  for(let seed=0;seed<6;seed++){
    const g=createSoccer({config:full(),seed:900+seed,stage:6,difficulty:'normal',role:'field',airVersion:'v23',v241:true,v249:true});let n=0,parryAt=-9,parryTeam=null;
    while(!g.result&&n<60*200){try{g.update(dt,idle);}catch{errors++;break;}n++;const s=g.getState();
      for(const e of g.drainEvents()){if(e.type==='parry'){parryAt=s.elapsed;parryTeam=e.team;if(e.kind==='corner')corners++;else rebounds++;}
        if(e.type==='restart'&&e.restart==='corner'&&s.elapsed-parryAt<1.5)assert.equal(e.team,1-parryTeam,'the corner goes to the shooting side');
        assert.ok(Number.isFinite(s.ball.x)&&Number.isFinite(s.ball.z));}}
  }
  assert.equal(errors,0);assert.ok(corners+rebounds>0,'parries happened in six matches: '+corners+' corners, '+rebounds+' rebounds');
});

test('one-two: after his own pass the child\'s player keeps running up the pitch for a moment, inside the pitch',()=>{
  const G=SOCCER_V249.go,t=soccerGoTarget({x:10,z:8},1,52.5,34);
  assert.equal(t.duty,'go');assert.ok(Math.abs(t.x-(10+G.advance))<1e-9);assert.ok(t.z<8&&t.z>0,'drifts inside');
  assert.equal(soccerGoTarget({x:50,z:0},1,52.5,34).x,52.5-G.goalInset,'never into the goal');
  assert.equal(soccerGoTarget({x:-50,z:0},-1,52.5,34).x,-52.5+G.goalInset);
});

test('camera and markers: the page gets the closer camera, the goal line in the frame and larger markers; the small match keeps its camera',()=>{
  const cfg=full(),next=applySoccerV249View(cfg,{enabled:true}),C=SOCCER_V249.camera;
  assert.equal(applySoccerV249View(cfg,{enabled:false}),cfg);assert.equal(applySoccerV249View(cfg),cfg,'node: unchanged');
  assert.ok(next.full.camera.base<SOCCER_FULL.camera.base&&next.full.camera.near<SOCCER_FULL.camera.near,'closer');
  assert.equal(next.full.camera.edgeX,C.edgeX);assert.equal(next.view.camera.nearDistance,C.base);assert.equal(cfg.full.camera.base,SOCCER_FULL.camera.base,'the source config is not touched');
  assert.equal(next.v249View.ballScale,SOCCER_V249.view.ballScale);assert.equal(applySoccerV249View(next,{enabled:true}),next,'idempotent');
  // the ball in the six-yard box of the goal the child attacks: the goal line is nearer the middle of the frame than in v24.8
  const state={attackDir:1,controlled:0,phase:'playing',restart:null,players:[{x:46,z:0}],ball:{x:47.5,z:0,y:.11,vx:0,vz:0,owner:null}};
  const settle=config=>{let c=null;for(let i=0;i<400;i++)c=soccerFullCamera(state,844/390,config,c,1/30);return c;};
  const before=settle(cfg),after=settle(next);
  assert.ok(after.x>before.x+2,`the camera follows further toward the goal line (${before.x.toFixed(1)} -> ${after.x.toFixed(1)})`);
  assert.ok(after.distance<before.distance,'and stands closer');
  const small={...cfg,full:undefined},smallNext=applySoccerV249View(small,{enabled:true});assert.equal(smallNext.view,small.view);assert.ok(smallNext.v249View);
});

test('quiet HUD: ordinary touches show no text pill, calls and a lost ball still do; the session and the view are wired',()=>{
  for(const key of ['pass','loft','shot','header','received','switch','steal'])assert.equal(soccerCueShown(key,{enabled:true}),false,key);
  for(const key of ['blocked','heavyTouch','dive'])assert.equal(soccerCueShown(key,{enabled:true}),true,key);
  assert.equal(soccerCueShown('pass',{enabled:false}),true,'v24.8 shows every cue');assert.equal(soccerCueShown('pass'),true,'node: v24.8');
  const session=readFileSync(new URL('../workout/island/minigames/soccer-session.mjs',import.meta.url),'utf8'),view=readFileSync(new URL('../workout/island/minigames/soccer-view.mjs',import.meta.url),'utf8'),css=readFileSync(new URL('../workout/island/minigames/g3h-soccer.css',import.meta.url),'utf8');
  assert.match(session,/applySoccerV249View\(applySoccerControlV23\(/);assert.match(session,/soccerCueShown\(key,\{enabled:hud249\}\)/);assert.match(session,/soccer-fixture-away/);
  assert.match(session,/event\.type==='foul'\)\{feedback\.textContent/,'the referee\'s calls keep their text');
  assert.match(css,/\.soccer-fixture\.soccer-fixture-away\{opacity:0/);
  assert.match(view,/look249=config\.v249View\|\|null/);assert.match(view,/ballRoot\.scale\.setScalar\(config\.v249View\.ballScale\)/);
});

test('Hebrew in the new module and its texts: no Arabic letters and no exclamation marks',()=>{
  for(const file of ['soccer-r249.mjs','soccer-look249.mjs']){const src=readFileSync(new URL('../workout/island/minigames/'+file,import.meta.url),'utf8');
    assert.doesNotMatch(src,/[؀-ۿ]/,file);assert.doesNotMatch(src.replace(/!==|!=|!\w|!\(|!\[|!\$|!s\.|!\s*\w/g,''),/[֐-׿][^'"`\n]*!/,file);}
});

test('look: the joints\' rest scales widen the shoulders, lengthen the arms and shrink the head and boots; the head keeps its shape; wired behind ?soccerLook=0',async()=>{
  const {SOCCER_LOOK249,applySoccerLook249,soccerLook249Proportions}=await import('../workout/island/minigames/soccer-look249.mjs');
  const bone=()=>({scale:{v:[1,1,1],set(x,y,z){this.v=[x,y,z];}}}),bones=Object.fromEntries(['Root','Hips','Spine','Chest','Neck','Head','LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand','LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot'].map(n=>[n,bone()]));
  assert.equal(applySoccerLook249(bones),7);assert.equal(applySoccerLook249(null),0);
  const L=SOCCER_LOOK249,c=bones.Chest.scale.v,n=bones.Neck.scale.v,h=bones.Head.scale.v;
  for(let i=0;i<3;i++)assert.ok(Math.abs(c[i]*n[i]*h[i]-L.head)<1e-9,'chest x neck x head = one uniform head scale');
  for(const side of ['Left','Right']){const a=bones[side+'Arm'].scale.v;assert.ok(a[0]===a[1]&&a[1]===a[2]&&a[0]>1,'a uniform, longer arm (no shear at the elbow)');const f=bones[side+'Foot'].scale.v;assert.ok(f[0]===f[1]&&f[0]<1);}
  for(const name of ['Hips','Spine','LeftUpLeg','LeftLeg','RightUpLeg','RightLeg','LeftForeArm','LeftHand'])assert.deepEqual(bones[name].scale.v,[1,1,1],name+' untouched: the legs keep the feet on the grass');
  const p=soccerLook249Proportions();assert.ok(p.after.shoulderJoints>p.before.shoulderJoints&&p.after.arm>p.before.arm&&p.after.headsTall>p.before.headsTall);
  assert.ok(p.after.arm>=.56&&p.after.arm<=.6,'the arm reaches an adult length for this height: '+p.after.arm);
  const character=readFileSync(new URL('../workout/island/minigames/soccer-design-character.mjs',import.meta.url),'utf8'),light=readFileSync(new URL('../workout/island/minigames/soccer-lighting.mjs',import.meta.url),'utf8');
  assert.match(character,/if\(config\.v249Look&&!athleteV3\)applySoccerLook249\(inst\.bones\)/);assert.match(light,/config\.v249Look\?new T\.DirectionalLight\(SOCCER_LOOK249\.fillColor,SOCCER_LOOK249\.fill\)/);
  const cfg=full();assert.equal(applySoccerV249View(cfg,{enabled:false,look:true}).v249Look,true);assert.equal(applySoccerV249View(cfg,{enabled:true,look:false}).v249Look,undefined);
  // the shared athlete body files (also basketball's) are not edited by this round
  const shared=readFileSync(new URL('../workout/island/minigames/athlete-body-v22.mjs',import.meta.url),'utf8');assert.doesNotMatch(shared,/249/);
});
