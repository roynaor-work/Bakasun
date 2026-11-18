// Soccer full (11 against 11 on a 105 x 68 m pitch, soccer-full.mjs): the switch, the squad and its kickoff, the block (back line with
// the ball, compact without it), zonal marking, set pieces, the advantage call, the camera, the radar, the LOD bodies and the result check.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from '../workout/island/vendor/three.module.js';
import {createSoccer} from '../workout/island/minigames/soccer.mjs';
import {expandSoccerConfig} from '../workout/island/minigames/soccer-squad.mjs';
import {applySoccerTeams} from '../workout/island/minigames/soccer-teams.mjs';
import {applySoccerPitchV23,applySoccerControlV23} from '../workout/island/minigames/soccer-v23.mjs';
import {createRestartLayout} from '../workout/island/minigames/soccer-restarts.mjs';
import {soccerResult} from '../workout/island/minigames/soccer-result.mjs';
import {soccerFullEnabled,soccerFullFormation,applySoccerFull,SOCCER_FULL,SOCCER_FULL_SQUADS,SOCCER_FULL_ROLE_GROUP,soccerFullBackLine,soccerFullAnchor,soccerFullMarkable,soccerAdvantage,soccerFullCamera,soccerFullLodLevel,soccerRadarLayout,soccerRadarPoint,drawSoccerRadar,soccerHalfSeconds} from '../workout/island/minigames/soccer-full.mjs';
import {clusterGeometry,athleteLodGeometries,SOCCER_FULL_LOD_TARGETS,loadAthleteLodAssets,addHandGloveAttribute,SOCCER_FULL_LOD_ASSETS} from '../workout/island/minigames/soccer-full-lod.mjs';
import {fileURLToPath} from 'node:url';

const base=JSON.parse(readFileSync(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames.soccer;
/** The session's order: full preset, squad, v23 markings, v23 control. */
const fullConfig=(formation='4-4-2')=>applySoccerControlV23(applySoccerPitchV23(expandSoccerConfig(applySoccerFull(base,{formation}))));
const small=()=>applySoccerControlV23(applySoccerPitchV23(expandSoccerConfig(applySoccerTeams(base,'8'))));
const withLocation=(search,fn)=>{const had=Object.getOwnPropertyDescriptor(globalThis,'location');try{globalThis.location={search};return fn();}finally{if(had)Object.defineProperty(globalThis,'location',had);else delete globalThis.location;}};
const withoutLocation=fn=>{const had=Object.getOwnPropertyDescriptor(globalThis,'location');try{delete globalThis.location;return fn();}finally{if(had)Object.defineProperty(globalThis,'location',had);}};

test('switch: on by default on the page, ?soccerFull=0 and an explicit ?soccerTeams= give back the v24 match, off without a page',()=>{
  withLocation('',()=>assert.equal(soccerFullEnabled(),true));
  withLocation('?dev=1',()=>assert.equal(soccerFullEnabled(),true));
  for(const q of ['?soccerFull=0','?soccerFull=off','?soccerFull=v24','?soccerTeams=8','?soccerTeams=11'])withLocation(q,()=>assert.equal(soccerFullEnabled(),false,q));
  withLocation('?soccerTeams=8&soccerFull=1',()=>assert.equal(soccerFullEnabled(),true,'an explicit soccerFull=1 wins'));
  withoutLocation(()=>{assert.equal(soccerFullEnabled(),false,'node: the v24 contracts stay as written');assert.equal(soccerFullEnabled(true),true);assert.equal(soccerFullEnabled(undefined,''),true);});
  withLocation('',()=>assert.equal(soccerFullEnabled(false),false,'an option wins over the page'));
  assert.equal(soccerFullFormation(undefined,''),'4-4-2');assert.equal(soccerFullFormation(undefined,'?soccerFormation=433'),'4-3-3');assert.equal(soccerFullFormation('4-3-3'),'4-3-3');
});

test('config: the real 105 x 68 m pitch and markings, 11 a side, 90 s halves, speeds and the broadcast camera',()=>{
  const before=structuredClone(base),c=fullConfig();
  assert.deepEqual(base,before,'the island config is not mutated');
  assert.equal(c.pitch.length,105);assert.equal(c.pitch.width,68);
  for(const [k,v] of Object.entries({penaltyDepth:16.5,penaltyWidth:40.32,goalAreaDepth:5.5,goalAreaWidth:18.32,penaltySpot:11,arcRadius:9.15,centreRadius:9.15,goalWidth:7.32,goalHeight:2.44}))assert.equal(c.pitch[k],v,k);
  assert.equal(c.players.roster.length,22);assert.equal(c.match.halfSeconds,90);assert.equal(c.full.version,'v1');
  // players 7.2 m/s (sprint 10.5), shots 19-30 m/s: a fast pitch for a child, not a superhuman one
  assert.ok(c.players.speed>6.8&&c.players.speed<8.2,'player speed '+c.players.speed);
  assert.ok(c.physics.shotSpeed>=17&&c.physics.shotSpeed<=21&&c.physics.shotSpeed+c.physics.shotBoost<=32,'shot speed '+c.physics.shotSpeed+'+'+c.physics.shotBoost);
  assert.equal(c.view.camera.fovDegrees,SOCCER_FULL.camera.fovDegrees);assert.equal(c.view.camera.elevationDegrees,SOCCER_FULL.camera.elevationDegrees);
  assert.ok(c.rules.advantage.seconds>0);
  assert.equal(applySoccerFull(c),c,'idempotent');
});

test('squad: 4-4-2 = a keeper, four defenders, four midfielders, two strikers; 4-3-3 too; numbers unique; the four saved cards kept',()=>{
  for(const [formation,shape] of [['4-4-2',{keeper:1,back:4,mid:4,fwd:2}],['4-3-3',{keeper:1,back:4,mid:3,fwd:3}]]){
    const c=fullConfig(formation),g=createSoccer({config:c,seed:3,stage:3}),s=g.getState();
    assert.equal(s.players.length,22);assert.equal(c.team.players.length,4,'the four saved player cards');
    for(const team of [0,1]){
      const members=s.players.filter(p=>p.team===team),groups={keeper:0,back:0,mid:0,fwd:0};
      for(const p of members)groups[SOCCER_FULL_ROLE_GROUP[p.tacticalRole]]++;
      assert.deepEqual(groups,shape,formation);
      assert.equal(new Set(members.map(p=>p.tacticalRole)).size,11);
      assert.equal(new Set(members.map(p=>p.card.number)).size,11,'shirt numbers unique');
    }
    assert.deepEqual(g.tacticalMetrics().roles,[...SOCCER_FULL_SQUADS[formation].roles],'the tactics controller plays the eleven roles');
  }
});

test('kickoff: everyone in his half and on the formation spot, the rivals outside the centre circle, the taker at the ball',()=>{
  const c=fullConfig(),hx=c.pitch.length/2,hz=c.pitch.width/2;
  {
    const g=createSoccer({config:c,seed:9,stage:4}),s=g.getState();
    assert.equal(s.ball.owner,s.players.find(p=>p.team===0&&p.role==='striker').id,'the child\'s striker kicks off');
    const owner=s.players[s.ball.owner];
    assert.ok(Math.hypot(owner.x-s.ball.x,owner.z-s.ball.z)<1,'taker at the ball');
    for(const p of s.players){
      const d=s.attackDir*(p.team===0?1:-1);
      assert.ok(p.x*d<=.6,`player ${p.id} (${p.tacticalRole}) in his own half`);assert.ok(Math.abs(p.x)<hx&&Math.abs(p.z)<hz);
      if(p.team!==owner.team)assert.ok(Math.hypot(p.x,p.z)>=c.pitch.centreRadius,'rivals outside the circle');
    }
    for(let i=0;i<22;i++)for(let j=i+1;j<22;j++)assert.ok(Math.hypot(s.players[i].x-s.players[j].x,s.players[i].z-s.players[j].z)>.8,`spots ${i}/${j} apart`);
    const lb=s.players.find(p=>p.team===0&&p.tacticalRole==='LB'),rb=s.players.find(p=>p.team===0&&p.tacticalRole==='RB');
    assert.ok(lb.z<-hz*.5&&rb.z>hz*.5,'full backs wide on their own sides (the tactics package z)');
  }
});

test('block: the back line rises and drops with the ball and stays goal-side of it; compact and narrow without the ball',()=>{
  const lines=[0,.15,.3,.5,.7,.9,1].map(u=>soccerFullBackLine('defense',u));
  for(let i=1;i<lines.length;i++)assert.ok(lines[i]>=lines[i-1]-1e-9,'monotonic');
  assert.ok(lines.at(-1)-lines[0]>.25,'the line travels more than a quarter of the pitch');
  assert.ok(soccerFullBackLine('defense',.05)<=.05+SOCCER_FULL.shape.defense.ahead+1e-9,'never far in front of a ball deep in the own half');
  assert.ok(soccerFullBackLine('attack',.6)<=.6-SOCCER_FULL.shape.attack.behind+1e-9,'attacking, the back line stays behind the ball');
  assert.equal(soccerFullBackLine('corner',.5),null);
  // In the model: a rival carrier at five depths; the home back four follow (targets of the tactics controller the AI runs to).
  const c=fullConfig(),hx=c.pitch.length/2;let previous=-Infinity;const widths={};
  for(const x of [-35,-15,0,15,35]){
    const g=createSoccer({config:c,seed:2,stage:4}),s=g.getState(),rival=s.players.find(p=>p.team===1&&p.tacticalRole==='LCM');
    s.ball.owner=rival.id;s.ball.x=rival.x=x;s.ball.z=rival.z=4;s.ball.lastTeam=1;
    const back=s.players.filter(p=>p.team===0&&SOCCER_FULL_ROLE_GROUP[p.tacticalRole]==='back'),line=back.reduce((a,p)=>a+g.tacticalTarget(p).x,0)/back.length;
    assert.ok(line>previous+2,`home back line moves up with the ball (${line.toFixed(1)} at ball ${x})`);previous=line;
    assert.ok(line<x+1,'goal-side of the ball');
    const outfield=s.players.filter(p=>p.team===0&&p.role!=='keeper'&&p.id!==s.controlled).map(p=>g.tacticalTarget(p));
    widths[x]=Math.max(...outfield.map(t=>t.z))-Math.min(...outfield.map(t=>t.z));
    assert.ok(Math.max(...outfield.map(t=>t.x))-Math.min(...outfield.map(t=>t.x))<48,'compact block (back line to strikers under 48 m)');
  }
  // with the ball the team spreads wider than the defending block
  const g=createSoccer({config:c,seed:2,stage:4}),s=g.getState(),mine=s.players.find(p=>p.team===0&&p.tacticalRole==='LCM');s.ball.owner=mine.id;s.ball.x=mine.x=10;s.ball.z=mine.z=4;
  const outfield=s.players.filter(p=>p.team===0&&p.role!=='keeper'&&p.id!==mine.id).map(p=>g.tacticalTarget(p));
  assert.ok(Math.max(...outfield.map(t=>t.z))-Math.min(...outfield.map(t=>t.z))>widths[15]+4,'wider in possession');
  assert.ok(hx>0);
});

test('anchors and marking: every role inside the pitch, the keeper left to keeperTarget; zonal outside the danger area',()=>{
  const c=fullConfig(),hx=c.pitch.length/2,hz=c.pitch.width/2,phase={positions:Object.fromEntries(SOCCER_FULL_SQUADS['4-4-2'].roles.map((r,i)=>[r,{x:.1+.08*i,y:.05+.07*i}]))};phase.positions.LCB={x:.35,y:.2};
  for(const id of ['defense','defensive_transition','build_up','attack'])for(const role of SOCCER_FULL_SQUADS['4-4-2'].roles){
    const a=soccerFullAnchor(role,id,phase,{x:12,z:-20},1,c.pitch.length,c.pitch.width);
    if(role==='GK'){assert.equal(a,null);continue;}
    assert.ok(Math.abs(a.x)<=hx&&Math.abs(a.z)<=hz,role);
  }
  assert.equal(soccerFullMarkable({x:-30,z:0},{x:20,z:0},1,hx),true,'inside 36 m of the own goal');
  assert.equal(soccerFullMarkable({x:0,z:20},{x:20,z:-20},1,hx),false,'midfield, far from the ball: zonal');
  assert.equal(soccerFullMarkable({x:10,z:0},{x:20,z:0},1,hx),true,'near the ball');
});

test('set pieces on the full pitch: only the players the restart needs get a spot, their markers are the nearest rivals',()=>{
  const c=fullConfig(),g=createSoccer({config:c,seed:4,stage:4}),s=g.getState(),hx=c.pitch.length/2,hz=c.pitch.width/2;
  for(const [type,x,z] of [['corner',hx-.5,hz-.5],['goalKick',-(hx-5),3],['throwIn',10,hz],['freeKick',20,5]]){
    const taker=s.players.find(p=>p.team===0&&p.role!=='keeper'),r={type,team:0,player:type==='goalKick'?s.players.find(p=>p.team===0&&p.role==='keeper').id:taker.id,x,z};
    const targets=createRestartLayout(r,s,c),mates=s.players.filter(p=>p.team===0&&p.role!=='keeper'&&p.id!==r.player&&targets[p.id]);
    assert.equal(mates.length,c.full.restartPlayers[type],type+' spots');
    const rivals=s.players.filter(p=>p.team===1&&p.role!=='keeper'&&targets[p.id]);
    assert.ok(rivals.length<=mates.length,'a marker for each spot at most');
    const unassigned=s.players.filter(p=>p.team===1&&p.role!=='keeper'&&!targets[p.id]);assert.ok(unassigned.length>=10-mates.length,'the rest hold the restart shape');
  }
});

test('advantage: a foul on a carrier who keeps the ball in the rivals half is played on; a turnover brings the free kick back',()=>{
  const c=fullConfig();
  assert.equal(soccerAdvantage({penalty:true},{id:0,team:0},{attackDir:1,ball:{owner:0,x:20}},c),false,'never on a penalty');
  assert.equal(soccerAdvantage({},{id:0,team:0},{attackDir:1,ball:{owner:0,x:-20}},c),false,'own half: the free kick');
  assert.equal(soccerAdvantage({},{id:0,team:0},{attackDir:1,ball:{owner:0,x:20}},c),true);
  assert.equal(soccerAdvantage({},{id:0,team:0},{attackDir:1,ball:{owner:3,x:20}},c),false,'he lost it: the free kick');
  assert.equal(soccerAdvantage({},{id:0,team:0},{attackDir:1,ball:{owner:0,x:20}},small()),false,'the small match keeps its rules');
  // In the model: a rival slides late into the child's carrier in the rivals' half (a late slide that loses the duel is always a foul).
  const scene=seed=>{
    const g=createSoccer({config:c,seed,stage:5,difficulty:'normal'}),s=g.getState(),carrier=s.players[s.ball.owner],tackler=s.players.find(p=>p.team===1&&p.role!=='keeper');
    for(const p of s.players)if(p!==carrier&&p!==tackler&&p.role!=='keeper'){p.x=-40+(p.id%5)*3;p.z=-25+(p.id%7)*7;}
    carrier.x=22;carrier.z=0;carrier.fx=1;carrier.fz=0;carrier.vx=carrier.vz=0;s.ball.x=22.4;s.ball.z=0;s.ball.grace=0;
    tackler.x=22.45;tackler.z=2.1;tackler.fx=0;tackler.fz=-1;tackler.slideKind='straight';tackler.slideTime=c.slide.variants.straight.seconds;tackler.slideX=0;tackler.slideZ=-1;tackler.slideAttempted=false;tackler.slideWon=false;tackler.recover=0;tackler.cooldown=0;
    const events=[];for(let i=0;i<30&&!events.some(e=>e.type==='advantage'||e.type==='foul');i++){g.update(1/60,{});events.push(...g.drainEvents());}
    return {g,s,events};
  };
  let seen=null;
  for(let seed=1;seed<=120&&!seen;seed++){
    const run=scene(seed);if(run.events.some(e=>e.type==='advantage'))seen={...run,seed};
  }
  assert.ok(seen,'a rear slide that lost the duel was played as advantage');
  const {g,s}=seen;assert.equal(s.phase,'playing','no stoppage');
  const at=seen.events.find(e=>e.type==='advantage');
  // the child's team then loses the ball: the free kick is given where the foul was
  const rival=s.players.find(p=>p.team===1&&p.role!=='keeper'&&p.id!==at.player);s.ball.owner=rival.id;s.ball.lastTeam=1;rival.x=s.ball.x;rival.z=s.ball.z;
  let after=[];for(let i=0;i<3;i++){g.update(1/60,{});after.push(...g.drainEvents());}
  const foul=after.find(e=>e.type==='foul');assert.ok(foul&&foul.advantage===true,'the foul is called back');
  assert.ok(String(s.phase).startsWith('restart')&&s.restart.type==='freeKick'&&s.restart.team===0,'free kick to the fouled team');
  assert.ok(Math.hypot(s.restart.x-at.x,s.restart.z-at.z)<1.5,'at the foul');
  // and when the child keeps the ball, the advantage simply runs out: no whistle, no free kick
  const again=scene(seen.seed),later=[],foulAt=again.events.find(e=>e.type==='advantage');assert.ok(foulAt);
  const tackler=again.s.players[foulAt.player];tackler.x=-30;tackler.z=-20;// the tackler is left behind on the grass
  for(let i=0;i<Math.ceil((c.rules.advantage.seconds+.2)*60);i++){const p=again.s.players[again.s.ball.owner];if(p){p.x=22;p.z=0;p.vx=p.vz=0;}g.drainEvents();again.g.update(1/60,{});later.push(...again.g.drainEvents());}
  assert.ok(later.some(e=>e.type==='advantage-over'),'over after advantage.seconds: '+JSON.stringify(later.map(e=>e.type)));assert.ok(!later.some(e=>e.type==='foul'));assert.equal(again.s.phase,'playing');
});

test('camera: follows the ball with lead, keeps the selected player in frame, zooms out for a fast ball and in near the box',()=>{
  const c=fullConfig(),g=createSoccer({config:c,seed:6,stage:4}),s=g.getState(),aspect=844/390;
  const still=soccerFullCamera(s,aspect,c,null,0);
  assert.ok(still.zoom>=c.full.camera.near&&still.zoom<=c.full.camera.far);assert.equal(still.direction,s.attackDir);
  const fast={...s,ball:{...s.ball,owner:null,vx:24,vz:0}},quick=soccerFullCamera(fast,aspect,c,null,0);
  assert.ok(quick.zoom>still.zoom+3,'zooms out for a long ball');assert.ok(quick.x>still.x,'leads the ball');
  const me=s.players[s.controlled],players=s.players.map(p=>p===me?{...p,x:42,z:2}:p);
  const box={...s,players,ball:{...s.ball,owner:null,x:44,z:0,vx:0,vz:0}},near=soccerFullCamera(box,aspect,c,null,0);
  assert.ok(near.zoom<still.zoom,'a little closer in the box');
  assert.ok(Math.abs(near.x)<=c.pitch.length/2-c.full.camera.edgeX+1e-9,'the centre stays on the pitch');
  // smoothing: one frame moves only part of the way, the zoom eases
  const step=soccerFullCamera(fast,aspect,c,still,1/60);assert.ok(step.x>still.x&&step.x<quick.x);assert.ok(step.zoom>still.zoom&&step.zoom<quick.zoom);
  // the selected player far from the ball is framed (the hard fit grows the distance)
  const apart={...s,controlled:s.players.find(p=>p.team===0&&p.tacticalRole==='LB').id};const fit=soccerFullCamera(apart,aspect,c,null,0);
  assert.ok(fit.distance>=fit.zoom-1e-9);
});

test('LOD level: near, middle, far by distance with hysteresis; lower tiers pull the edges in',()=>{
  const L=SOCCER_FULL.lod;
  assert.equal(soccerFullLodLevel(10,1,0),0);assert.equal(soccerFullLodLevel(40,0,0),1);assert.equal(soccerFullLodLevel(80,1,0),2);
  assert.equal(soccerFullLodLevel(L.near+1,0,0),0,'hysteresis keeps a near body near');assert.equal(soccerFullLodLevel(L.near+1,1,0),1);
  assert.equal(soccerFullLodLevel(L.far-1,2,0),2,'and a far one far');
  assert.equal(soccerFullLodLevel(25,1,2),1,'tier 2: 25 m is already the middle level');assert.equal(soccerFullLodLevel(25,1,0),0);assert.equal(soccerFullLodLevel(35,1,3),2,'tier 3: 35 m is far');
});

test('LOD bodies: the real v2 / v22 bodies at about 1,500 and 400 triangles, same skeleton weights, height and colour regions',async()=>{
  globalThis.self??=globalThis;const {GLTFLoader}=await import('../workout/island/vendor/GLTFLoader.js');
  const load=file=>{const bytes=readFileSync(new URL('../workout/island/'+file,import.meta.url)),buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),error=console.error;console.error=()=>{};
    return new Promise((resolve,reject)=>new GLTFLoader().parse(buffer,'',resolve,reject)).finally(()=>{console.error=error;});};
  for(const file of ['assets/soccer-v24/body/models/soccer.glb','assets/athlete-body-v22/models/soccer.glb']){
    const gltf=await load(file);let mesh=null;gltf.scene.traverse(o=>{if(!mesh&&o.isSkinnedMesh)mesh=o;});
    const src=mesh.geometry,[middle,far]=athleteLodGeometries(T,src,'body');
    const n=g=>g.index.count/3,[t1,t2]=SOCCER_FULL_LOD_TARGETS.body.map(l=>l.triangles);
    assert.ok(n(middle)<=t1*1.08&&n(middle)>=t1*.8,file+' middle '+n(middle));assert.ok(n(far)<=t2*1.08&&n(far)>=t2*.7,file+' far '+n(far));
    assert.ok(n(src)>5000,'the full body');
    src.computeBoundingBox();for(const g of [middle,far]){
      assert.ok(Math.abs(g.boundingBox.max.y-src.boundingBox.max.y)<.12&&Math.abs(g.boundingBox.min.y-src.boundingBox.min.y)<.12,'height kept');
      const w=g.attributes.skinWeight,si=g.attributes.skinIndex;for(let i=0;i<w.count;i++){const sum=w.getX(i)+w.getY(i)+w.getZ(i)+w.getW(i);assert.ok(Math.abs(sum-1)<1e-4);for(let k=0;k<4;k++)assert.ok(si.getComponent(i,k)<mesh.skeleton.bones.length);}
      const regions=g=>new Set(Array.from({length:g.attributes._region.count},(_,i)=>g.attributes._region.getX(i)));
      assert.deepEqual([...regions(g)].sort(),[...regions(src)].sort(),'every colour region survives');
      for(const name of Object.keys(src.attributes))assert.ok(g.attributes[name],'attribute '+name);
    }
    assert.equal(athleteLodGeometries(T,src,'body')[0],middle,'cached per source');
    assert.throws(()=>clusterGeometry(T,src,0));
  }
});

test('radar: the whole pitch fits, the child attacks to the right in both halves, the far touchline at the top; one dot each',()=>{
  const c=fullConfig(),L=soccerRadarLayout(132,86,c.pitch);
  assert.ok(L.w<=132-10+1e-9&&L.h<=86-10+1e-9&&Math.abs(L.w/L.h-105/68)<1e-9);
  for(const dir of [1,-1]){
    const goal=soccerRadarPoint(dir*52.5,0,dir,L),own=soccerRadarPoint(-dir*52.5,0,dir,L);assert.ok(goal.x>own.x,'attacks to the right');
    const far=soccerRadarPoint(0,-dir*34,dir,L);assert.ok(Math.abs(far.y-L.oy)<1e-9,'the far touchline (away from the camera) at the top');
  }
  const g=createSoccer({config:c,seed:1,stage:2}),calls=[];const ctx=new Proxy({},{get:(o,k)=>k in o?o[k]:(...a)=>{calls.push(k);},set:(o,k,v)=>{o[k]=v;return true;}});
  const dots=drawSoccerRadar(ctx,g.getState(),L,{pitch:c.pitch,frame:[{x:-20,z:10},{x:20,z:10},{x:40,z:-60},{x:-40,z:-60}]});
  assert.equal(dots,23,'22 players and the ball');assert.ok(calls.filter(k=>k==='arc').length>=23);
});

test('result: the full match is checked against its own two 90 s halves on the page, the small one against the island config',()=>{
  const ctx={level:2,seed:7,difficulty:'normal'},payload=durationSeconds=>({outcome:'win',score:2,soccer:{won:true,goalsFor:2,goalsAgainst:0,stage:2,stars:3,seed:7,durationSeconds,difficulty:'normal'}});
  withLocation('',()=>{assert.equal(soccerHalfSeconds(base),90);assert.ok(soccerResult(payload(180),ctx,base));assert.equal(soccerResult(payload(base.match.halfSeconds*2),ctx,base),null);});
  withLocation('?soccerFull=0',()=>{assert.equal(soccerHalfSeconds(base),base.match.halfSeconds);assert.ok(soccerResult(payload(base.match.halfSeconds*2),ctx,base));assert.equal(soccerResult(payload(180),ctx,base),null);});
  withoutLocation(()=>assert.ok(soccerResult(payload(base.match.halfSeconds*2),ctx,base),'node: as before'));
});

test('a full 11 against 11 match plays out: two halves, goals, the ball in every third, no stuck ball, every player inside',()=>{
  const c=fullConfig(),g=createSoccer({config:c,seed:11,stage:3,difficulty:'normal'}),s=g.getState(),hx=c.pitch.length/2,hz=c.pitch.width/2;
  let n=5;const rnd=()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};
  const thirds=[0,0,0],events={};let still=0,maxStill=0,last={x:0,z:0},t=0;
  while(!g.result&&t<500){
    const p=s.players[s.controlled],goalX=s.attackDir*hx,mine=s.ball.owner===p.id,dx=mine?goalX-p.x:s.ball.x-p.x,dz=mine?-p.z*.3:s.ball.z-p.z,l=Math.hypot(dx,dz)||1;
    g.update(1/30,{moveX:dx/l,moveZ:dz/l,kickHeld:mine&&Math.abs(goalX-p.x)<22&&rnd()<.3,passPressed:mine?rnd()<.03:rnd()<.08,sprintHeld:rnd()<.5});t+=1/30;
    for(const e of g.drainEvents())events[e.type]=(events[e.type]||0)+1;
    if(s.phase==='playing'){const u=(s.ball.x+hx)/(2*hx);thirds[u<1/3?0:u<2/3?1:2]++;still=Math.hypot(s.ball.x-last.x,s.ball.z-last.z)<3?still+1/30:0;if(!still)last={x:s.ball.x,z:s.ball.z};maxStill=Math.max(maxStill,still);}
    for(const q of s.players)assert.ok(Number.isFinite(q.x)&&Math.abs(q.x)<=hx&&Math.abs(q.z)<=hz);
  }
  assert.ok(g.result,'the match ends');assert.equal(g.result.durationSeconds,180);
  assert.ok(events.halftime===1&&events.fulltime===1);assert.ok((events.goal||0)>=1,'goals: '+JSON.stringify(events));
  assert.ok((events.pass||0)>=10&&(events.shot||0)>=3,'passes and shots');
  assert.ok(thirds.every(v=>v>0),'the ball visits every third');assert.ok(maxStill<8,'no ball stuck for long: '+maxStill.toFixed(1));
});

test('the small v24 match is untouched by the full module: same squad, pitch and kickoff with or without it',()=>{
  const c=small(),g=createSoccer({config:c,seed:5,stage:5}),s=g.getState();
  assert.equal(c.full,undefined);assert.equal(s.players.length,16);assert.equal(c.pitch.length,68);assert.equal(c.match.halfSeconds,base.match.halfSeconds);
  assert.equal(c.rules.advantage,undefined);assert.equal(g.tacticalMetrics().formation,'4-3-3');
  const again=createSoccer({config:small(),seed:5,stage:5}).getState();
  assert.deepEqual(s.players.map(p=>[p.x,p.z,p.tacticalRole]),again.players.map(p=>[p.x,p.z,p.tacticalRole]));
});

test('Codex athlete-lod-v1: the soccer LOD1 / LOD2 load as the far bodies, on the same skeleton as the v2 body, within 1,500 / 400 triangles',async()=>{
  globalThis.self??=globalThis;const {GLTFLoader}=await import('../workout/island/vendor/GLTFLoader.js');
  // node: the loader reads the pack's files from disk (the page fetches them; textures are not needed for the geometry)
  class DiskLoader extends GLTFLoader{loadAsync(url){const bytes=readFileSync(fileURLToPath(url)),buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),error=console.error;console.error=()=>{};
    return new Promise((resolve,reject)=>this.parse(buffer,url.slice(0,url.lastIndexOf('/')+1),resolve,reject)).finally(()=>{console.error=error;});}}
  const [lod1,lod2]=await loadAthleteLodAssets({T,GLTFLoader:DiskLoader});
  assert.equal(SOCCER_FULL_LOD_ASSETS.id,'athlete-lod-v1');
  assert.ok(lod1.index.count/3<=1500&&lod1.index.count/3>=1200,'LOD1 '+lod1.index.count/3);assert.ok(lod2.index.count/3<=400&&lod2.index.count/3>=300,'LOD2 '+lod2.index.count/3);
  for(const g of [lod1,lod2]){for(const name of ['position','normal','uv','color','_region','skinIndex','skinWeight','_glove'])assert.ok(g.attributes[name],name);
    assert.ok(Array.from({length:g.attributes._glove.count},(_,i)=>g.attributes._glove.getX(i)).some(v=>v===1),'hand vertices marked for the keepers\' gloves');}
  // the very same skeleton as the v24 v2 body the instances clone (names in order, inverse bind matrices, bind matrix)
  const skinned=async file=>{const g=await new DiskLoader().loadAsync(new URL('../workout/island/'+file,import.meta.url).href);let m=null;g.scene.traverse(o=>{if(o.isSkinnedMesh&&(!m||o.geometry.index.count>m.geometry.index.count))m=o;});return m;};
  const v2=await skinned('assets/soccer-v24/body/models/soccer.glb'),pack=await skinned('design/athlete-lod-v1/models/soccer-lod1.glb');
  assert.deepEqual(pack.skeleton.bones.map(b=>b.name),v2.skeleton.bones.map(b=>b.name));
  pack.skeleton.boneInverses.forEach((m,i)=>m.elements.forEach((v,k)=>assert.ok(Math.abs(v-v2.skeleton.boneInverses[i].elements[k])<1e-6,'inverse bind '+i)));
  pack.bindMatrix.elements.forEach((v,k)=>assert.ok(Math.abs(v-v2.bindMatrix.elements[k])<1e-6,'bind matrix'));
  assert.equal((await loadAthleteLodAssets({T,GLTFLoader:DiskLoader}))[0],lod1,'loaded once per page');
  // the glove helper on a tiny geometry
  const g=new T.BufferGeometry();g.setAttribute('skinIndex',new T.BufferAttribute(new Uint16Array([8,0,0,0, 1,0,0,0]),4));g.setAttribute('skinWeight',new T.BufferAttribute(new Float32Array([.9,.1,0,0, 1,0,0,0]),4));
  const names=['Root','Hips','Spine','Chest','Neck','Head','LeftArm','LeftForeArm','LeftHand'];assert.equal(addHandGloveAttribute(T,g,names),1);assert.deepEqual(Array.from(g.attributes._glove.array),[1,0]);
});

test('LOD meshes on a player: same skeleton and bind, own colours, the shared material; setLod shows one level (the far one without hair)',async()=>{
  globalThis.self??=globalThis;const {GLTFLoader}=await import('../workout/island/vendor/GLTFLoader.js');
  const {createAthleteV22Instance}=await import('../workout/island/minigames/athlete-body-v22.mjs');
  const {cloneSoccerRig}=await import('../workout/island/minigames/soccer-rig.mjs');
  const parse=file=>{const bytes=readFileSync(new URL('../workout/island/'+file,import.meta.url)),buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),error=console.error;console.error=()=>{};
    return new Promise((resolve,reject)=>new GLTFLoader().parse(buffer,'',resolve,reject)).finally(()=>{console.error=error;});};
  const body=(await parse('assets/athlete-body-v22/models/soccer.glb')).scene,hair=(await parse('assets/athlete-body-v22/hair/crop.glb')).scene;body.updateMatrixWorld(true);
  const bones={};body.traverse(o=>{if(o.isBone)bones[o.name]=o;});
  const material=new T.MeshStandardMaterial({vertexColors:true}),source={bodies:{soccer:{scene:body,height:1.772,floor:-.018,bones,info:{height:1.8,width:1,depth:1}}},hair:{crop:hair},material};
  const lods={body:g=>athleteLodGeometries(T,g,'body'),hair:g=>athleteLodGeometries(T,g,'hair')};
  const inst=createAthleteV22Instance(T,source,{bodyId:'soccer',cloneRig:cloneSoccerRig,appearance:{skin:'#c08a68',hair:'#1f1712',hairStyle:'crop'},kit:{primary:'#ff0000'},lods});
  assert.equal(inst.lodCount,3);
  const byLevel=level=>inst.meshes.full.filter(m=>(m.userData.lod??0)===level);
  assert.equal(byLevel(0).length,2,'body + hair');assert.equal(byLevel(1).length,2,'body + hair');assert.equal(byLevel(2).length,1,'body only');
  const full=byLevel(0).find(m=>m.isSkinnedMesh);
  for(const m of [...byLevel(1),...byLevel(2)].filter(m=>m.isSkinnedMesh)){assert.equal(m.skeleton,full.skeleton,'shared skeleton');assert.ok(m.bindMatrix.equals(full.bindMatrix));assert.equal(m.material,full.material);assert.notEqual(m.geometry.attributes.color,full.geometry.attributes.color,'own colour copy');}
  // the shirt colour is painted on the LOD copies too
  const low=byLevel(1).find(m=>m.isSkinnedMesh),r=low.geometry.attributes._region,c=low.geometry.attributes.color;let shirt=-1;for(let i=0;i<r.count;i++)if(r.getX(i)===1){shirt=i;break;}
  assert.ok(shirt>=0&&c.getX(shirt)>.9&&c.getY(shirt)<.05,'red shirt on the middle level');
  assert.equal(inst.setLod(2),2);assert.ok(byLevel(2).every(m=>m.visible)&&byLevel(0).every(m=>!m.visible)&&byLevel(1).every(m=>!m.visible));
  assert.equal(inst.setLod(0),0);assert.ok(byLevel(0).every(m=>m.visible));
  inst.dispose();
});
