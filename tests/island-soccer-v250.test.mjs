// Soccer v25.0 (24/11/2026): team defence (second man, marking, shadows), the free-kick wall, the aimed free kick and corner, the curled
// shot, taps on the pitch, the closer camera. `?soccerV250=0` (or each part's own flag) gives back v24.9; engine rules are off without a
// page so every earlier contract keeps testing the earlier match.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSoccer} from '../workout/island/minigames/soccer.mjs';
import {expandSoccerConfig} from '../workout/island/minigames/soccer-squad.mjs';
import {applySoccerFull,soccerFullCamera} from '../workout/island/minigames/soccer-full.mjs';
import {applySoccerPitchV23,applySoccerControlV23} from '../workout/island/minigames/soccer-v23.mjs';
import {applySoccerV249View,SOCCER_V249} from '../workout/island/minigames/soccer-r249.mjs';
import {createSoccerShowTimeline,soccerShowConfig} from '../workout/island/minigames/soccer-show.mjs';
import {SOCCER_V250,soccerV250Rules,soccerCam250Enabled,soccerTap250Enabled,soccerAim250Enabled,applySoccerV250View,soccerDefenceLevel,soccerDefencePlan,soccerWall,soccerWallBlock,soccerCurvedLaunch,soccerCurveIntent,soccerFreeKickAimed,soccerAimStart,soccerAimMove,soccerFreeKickLaunch,soccerFlightPath,soccerAimGuide,soccerTapPass,soccerTapSpace,soccerTapMate,soccerIsTap,soccerSaveReplay250Enabled} from '../workout/island/minigames/soccer-r250.mjs';

const base=JSON.parse(readFileSync(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames.soccer;
const full=()=>applySoccerControlV23(applySoccerPitchV23(expandSoccerConfig(applySoccerFull(base,{v241:true}))),'v23');
const dt=1/60,idle={moveX:0,moveZ:0};
const withLocation=(search,fn)=>{const had=Object.getOwnPropertyDescriptor(globalThis,'location');try{globalThis.location={search};return fn();}finally{if(had)Object.defineProperty(globalThis,'location',had);else delete globalThis.location;}};
const ALL={defence:true,wall:true,aim:true,curve:true,tap:true,keeper:true},NONE={defence:false,wall:false,aim:false,curve:false,tap:false,keeper:false};
const match=(v250,{stage=4,seed=5}={})=>createSoccer({config:full(),seed,stage,difficulty:'normal',role:'field',airVersion:'v23',v241:true,v249:true,v250});
/** Everyone but the child's player out of the way; he stands at (x, z) with the ball. */
function stageMoment(g,[x,z]=[0,0]){
  const s=g.getState(),me=s.players[s.controlled];
  for(const q of s.players){if(q.role==='keeper'||q.id===me.id)continue;q.x=q.team===0?-30:44;q.z=(q.id%10-4.5)*5.5;q.vx=q.vz=0;q.think=9;q.cooldown=9;}
  Object.assign(me,{x,z,vx:0,vz:0,fx:1,fz:0,cooldown:0});Object.assign(s.ball,{x:x+.45,z,y:.11,vx:0,vz:0,vy:0,curve:0,owner:me.id,lastTeam:0,lastPlayer:me.id,grace:0,flight:null,shot:null});s.passTarget=null;
  return {s,me,mates:s.players.filter(q=>q.team===0&&q.role!=='keeper'&&q.id!==me.id),rivals:s.players.filter(q=>q.team===1&&q.role!=='keeper')};
}
const drain=(g,into)=>{for(const e of g.drainEvents())into.push(e);return into;};

test('switches: on a page every v25.0 part is on, its own flag or ?soccerV250=0 gives back v24.9, node keeps v24.9 unless asked',()=>{
  withLocation('',()=>{assert.deepEqual(soccerV250Rules(),ALL);assert.equal(soccerCam250Enabled(),true);assert.equal(soccerTap250Enabled(),true);assert.equal(soccerAim250Enabled(),true);});
  withLocation('?soccerV250=0',()=>{assert.deepEqual(soccerV250Rules(),NONE);assert.equal(soccerCam250Enabled(),false);assert.equal(soccerTap250Enabled(),false);});
  for(const [key,q] of [['defence','?soccerDefence250=0'],['wall','?soccerWall250=0'],['aim','?soccerAim250=0'],['curve','?soccerCurve250=0'],['tap','?soccerTap250=0'],['keeper','?soccerKeeper250=0']])withLocation(q,()=>assert.deepEqual(soccerV250Rules(),{...ALL,[key]:false},q));
  withLocation('?soccerCam250=0',()=>{assert.equal(soccerCam250Enabled(),false);assert.equal(soccerTap250Enabled(),true);});
  withLocation('?soccerV249=0',()=>assert.deepEqual(soccerV250Rules(),ALL,'the v24.9 switch does not switch v25.0'));
  assert.deepEqual(soccerV250Rules(),NONE,'node: off');assert.equal(soccerCam250Enabled(),false);assert.equal(soccerTap250Enabled(),false);
  assert.deepEqual(soccerV250Rules(true),ALL);assert.deepEqual(soccerV250Rules({wall:true}),{...NONE,wall:true});
  withLocation('',()=>assert.deepEqual(soccerV250Rules(false),NONE,'an option wins over the page'));
});

test('v25.0 off is v24.9 tick for tick: the same seed gives the same match with the option false and with no option; the small match never takes it',()=>{
  const run=(v250,config=full())=>{const g=createSoccer({config,seed:77,stage:4,difficulty:'normal',role:'field',airVersion:'v23',v241:true,v249:true,...(v250===undefined?{}:{v250})});let n=0;const sum=[];
    while(!g.result&&n<60*60){const s=g.getState();g.update(dt,{moveX:Math.sin(n/40),moveZ:Math.cos(n/55),passPressed:n%47===0,kickHeld:n%130<8,sprintHeld:n%200<90,tap:n%300===150?{mate:3}:undefined});if(n%300===0)sum.push([s.ball.x.toFixed(4),s.ball.z.toFixed(4),s.controlled,...s.score].join(','));n++;}
    return sum.join('|');};
  assert.equal(run(undefined),run(false));
  assert.notEqual(run(undefined),run(true),'and the rules do change the match when on');
  const small=applySoccerControlV23(applySoccerPitchV23(expandSoccerConfig(base)),'v23');
  assert.equal(run(true,small),run(false,small),'the small match (`?soccerFull=0`) stays as it was');
});

test('defence level: the rival grows into it stage by stage, the tutorial stage has none, the child\'s team always defends together',()=>{
  assert.equal(soccerDefenceLevel(1,1),null);
  const levels=[2,3,4,5,9].map(stage=>soccerDefenceLevel(1,stage));
  for(const l of levels)assert.ok(l&&l.double);
  for(let i=1;i<levels.length;i++)assert.ok(levels[i].markers>=levels[i-1].markers&&levels[i].close>=levels[i-1].close&&levels[i].shadows>=levels[i-1].shadows&&levels[i].gap<=levels[i-1].gap);
  assert.equal(soccerDefenceLevel(1,30),levels.at(-1),'later stages keep the last level');
  assert.equal(soccerDefenceLevel(0,1),SOCCER_V250.defence.home);
});

test('defence plan: a second man in the carrier\'s way, markers goal-side and ball-side in the box, a shadow for the runner; the presser, the child and a side in possession get no job',()=>{
  const cfg=full(),hx=cfg.pitch.length/2,level={double:true,close:1.2,markers:3,shadows:2};
  // team 1 defends the goal at x = +52.5 (its attacking direction is -1). Team 0 carrier at x = 20 running at that goal.
  const P=(id,team,x,z,extra={})=>({id,team,role:'field',x,z,vx:0,vz:0,...extra});
  const players=[P(0,0,20,0,{vx:5}),P(1,0,44,6),P(2,0,46,-7),P(3,0,27,-14,{vx:4}),P(4,0,0,0),
    P(5,1,18.6,.4),P(6,1,27,3),P(7,1,41,2),P(8,1,43,-3),P(9,1,35,-9),P(10,1,30,16),{id:11,team:1,role:'keeper',x:51,z:0}];
  const state={players,ball:{x:20.5,z:0,owner:0}};
  const plan=soccerDefencePlan(1,state,cfg,{dir:-1,level});
  assert.ok(plan);assert.equal(plan[5],undefined,'the nearest man is the presser: the tactics already send him');
  assert.equal(plan[6].duty,'double');assert.ok(plan[6].x>22&&plan[6].x<26.5&&Math.abs(plan[6].z)<1.5,'goal-side of where the ball will be: he holds the carrier up');
  const marks=Object.entries(plan).filter(([,j])=>j.duty==='mark').map(([id,j])=>[Number(id),j]);
  assert.deepEqual(marks.map(([,j])=>j.mark).sort(),[1,2],'both attackers in the box are marked');
  for(const [id,j] of marks){const a=players[j.mark];assert.ok(j.x>a.x,'goal-side of his man ('+id+')');assert.ok(Math.hypot(j.x-a.x,j.z-a.z)<2,'tight');assert.ok(Math.abs(j.z)<Math.abs(a.z),'and toward the ball');}
  const shadow=Object.entries(plan).find(([,j])=>j.duty==='shadow');assert.ok(shadow&&shadow[1].mark===3,'the runner ahead of the ball is followed');assert.ok(shadow[1].x>players[3].x);
  assert.equal(new Set(Object.keys(plan)).size,Object.keys(plan).length);assert.ok(!Object.keys(plan).includes('11'),'never the keeper');
  // limits and exclusions
  assert.equal(soccerDefencePlan(1,state,cfg,{dir:-1,level:null}),null);
  assert.equal(soccerDefencePlan(0,state,cfg,{dir:1,level}),null,'the side with the ball does not defend');
  assert.equal(soccerDefencePlan(1,{players,ball:{x:0,z:0,owner:null}},cfg,{dir:-1,level}),null,'a loose ball: the tactics decide');
  assert.equal(soccerDefencePlan(1,{players:players.map(p=>p.id===0?{...p,hands:true}:p),ball:state.ball},cfg,{dir:-1,level}),null);
  const without=soccerDefencePlan(1,state,cfg,{dir:-1,level,exclude:6});assert.ok(without[6]===undefined&&Object.values(without).some(j=>j.duty==='double'),'the excluded player (the child) takes no job, another closes');
  const one=soccerDefencePlan(1,state,cfg,{dir:-1,level:{double:false,markers:1,shadows:0}});assert.deepEqual(Object.values(one).map(j=>j.duty),['mark']);assert.equal(Object.values(one)[0].mark,2,'the attacker nearest the goal first');
  // far up the pitch nobody doubles
  const far=soccerDefencePlan(1,{players:players.map(p=>p.id===0?{...p,x:-20}:p.id===5?{...p,x:-21}:p),ball:{x:-19.5,z:0,owner:0}},cfg,{dir:-1,level});
  assert.ok(!far||!Object.values(far).some(j=>j.duty==='double'),'no second man '+(hx+20)+' m from his goal');
  // the marker keeps his man while another defender is only a little nearer
  const sticky=players.map(p=>p.id===7?{...p,mark250:2,x:43.6,z:-1}:p),kept=soccerDefencePlan(1,{players:sticky,ball:state.ball},cfg,{dir:-1,level});
  assert.equal(kept[7].mark,2);
});

test('defence in the match: with v25.0 the rival puts a second man in front of the child\'s carrier and men on the attackers in the box; off, it does not',()=>{
  const play=v250=>{
    const g=match(v250,{stage:5}),{s,me,mates,rivals}=stageMoment(g,[14,0]);
    mates[0].x=44;mates[0].z=5;mates[1].x=45;mates[1].z=-6;
    rivals.forEach((q,i)=>{q.x=22+i*2.6;q.z=(i%2?1:-1)*(3+i*1.7);q.think=0;q.cooldown=0;});
    const duties=new Set();let closest=Infinity;
    for(let i=0;i<70;i++){g.update(dt,{moveX:.4,moveZ:0});for(const q of s.players)if(q.team===1&&q.role!=='keeper'){duties.add(q.duty);if(q.duty==='double')closest=Math.min(closest,Math.hypot(q.x-s.ball.x,q.z-s.ball.z));}}
    return {duties,closest,plan:g.defencePlan(1)};
  };
  const on=play(true),off=play(false);
  assert.ok(on.duties.has('double')&&on.duties.has('mark'),[...on.duties].join(','));assert.ok(on.closest<4,'the second man got to '+on.closest.toFixed(1)+' m');
  assert.ok(!off.duties.has('double'));assert.equal(off.plan,null,'v24.9: no plan');
});

test('wall: 9.15 m from the ball on the line to the goal, more men nearer the goal, none out of range; a low drive into a man is knocked away',()=>{
  const cfg=full(),W=SOCCER_V250.wall,players=[];for(let i=0;i<10;i++)players.push({id:i,team:1,role:'field',x:20+i*3,z:(i%2?1:-1)*i*2});players.push({id:10,team:1,role:'keeper',x:51,z:0},{id:11,team:0,role:'field',x:30,z:6});
  const state={players},r={type:'freeKick',team:0,x:30,z:6},wall=soccerWall(r,state,cfg,1);
  assert.equal(wall.length,3,'23 m out: three men');
  const goal={x:52.5,z:0},range=Math.hypot(goal.x-r.x,goal.z-r.z),ux=(goal.x-r.x)/range,uz=(goal.z-r.z)/range;
  for(const w of wall){const d=Math.hypot(w.x-r.x,w.z-r.z),along=(w.x-r.x)*ux+(w.z-r.z)*uz,across=Math.abs(-(w.x-r.x)*uz+(w.z-r.z)*ux);
    assert.ok(d>=cfg.rules.freeKickSpace,'legal distance: '+d.toFixed(2));assert.ok(along>9&&along<9.7&&across<1.3,'between the ball and the goal');assert.ok(players[w.id].team===1&&players[w.id].role!=='keeper');}
  assert.ok(Math.abs(Math.hypot(wall[1].x-wall[0].x,wall[1].z-wall[0].z)-W.gap)<1e-6,'shoulder to shoulder');
  assert.equal(new Set(wall.map(w=>w.id)).size,3);
  assert.equal(soccerWall({...r,x:36,z:3},state,cfg,1).length,4,'17 m out: four');assert.equal(soccerWall({...r,x:24,z:8},state,cfg,1).length,2,'30 m out: two');
  assert.equal(soccerWall({...r,x:0},state,cfg,1),null,'from the half-way line there is no wall');assert.equal(soccerWall({...r,x:46,z:2},state,cfg,1),null,'too close');
  assert.equal(soccerWall({...r,type:'corner'},state,cfg,1),null);assert.equal(soccerWall(r,{players:players.slice(10)},cfg,1),null,'nobody to stand in it');
  // the block
  const man={x:39,z:3.4},ball={x:38.7,z:3.5,y:.6,vx:22,vz:-5};
  const out=soccerWallBlock(man,ball,.2);assert.ok(out&&out.vx<0&&out.vy>0,'knocked back');assert.ok(Math.hypot(out.vx,out.vz)<Math.hypot(ball.vx,ball.vz)*.6,'most of its pace is gone');
  assert.notEqual(Math.sign(soccerWallBlock(man,ball,.2).vz-out.vx*(-5/22)),Math.sign(soccerWallBlock(man,ball,.8).vz-soccerWallBlock(man,ball,.8).vx*(-5/22)),'either side');
  assert.equal(soccerWallBlock(man,{...ball,y:W.height+.2},.2),null,'over his head');assert.equal(soccerWallBlock(man,{...ball,x:37},.2),null,'not at him');assert.equal(soccerWallBlock(man,{...ball,vx:3,vz:0},.2),null,'a rolling ball is just trapped');
});

test('wall in the match: the defenders walk into the wall and face the ball; a low shot at it is blocked, and with the wall off there is none',()=>{
  const play=v250=>{
    const g=match(v250),s=g.getState();g.restartAt('freeKick',1,-30,-5);
    let n=0;while(s.phase!=='restartReady'&&n++<60*12)g.update(dt,idle);
    const r=s.restart,wall=(r.wall||[]).map(id=>s.players[id]);
    return {g,s,r,wall,ready:s.phase==='restartReady'};
  };
  const on=play({wall:true}),off=play(false);
  assert.ok(on.ready&&off.ready);assert.equal(off.r.wall,undefined);
  assert.ok(on.wall.length>=3);
  for(const p of on.wall){assert.equal(p.team,0,'the child\'s team defends this one');assert.notEqual(p.id,on.s.controlled,'the child keeps his own player');
    const d=Math.hypot(p.x-on.r.x,p.z-on.r.z);assert.ok(d>9.1&&d<10.2,'in the wall: '+d.toFixed(2));assert.ok((on.r.x-p.x)*p.fx+(on.r.z-p.z)*p.fz>d*.9,'facing the ball');}
  // the rival takes it: a ball driven at a man of the wall in the moment after the kick is knocked away, whatever the rival aimed at
  {const {g,s,r}=on,ids=[...r.wall],ev=[];let n=0;while(s.phase!=='playing'&&n++<60*8){g.update(dt,idle);drain(g,ev);}
    assert.equal(s.phase,'playing','the rival took the kick');const man=s.players[ids[1]],ux=(man.x-r.x)/Math.hypot(man.x-r.x,man.z-r.z),uz=(man.z-r.z)/Math.hypot(man.x-r.x,man.z-r.z);
    Object.assign(s.ball,{x:man.x-ux*1.1,z:man.z-uz*1.1,y:.7,vx:ux*21,vz:uz*21,vy:0,curve:0,owner:null,flight:null,lastTeam:1,grace:0});
    for(let i=0;i<8;i++){g.update(dt,idle);drain(g,ev);}
    const block=ev.find(e=>e.type==='wall-block');assert.ok(block,'blocked: '+ev.map(e=>e.type).join(','));assert.equal(block.team,0);assert.ok(s.ball.vx*ux+s.ball.vz*uz<0||s.ball.owner!==null,'the ball came back off him');}
  // and whole matches with the wall never break
  for(let seed=1;seed<=3;seed++){const g=createSoccer({config:full(),seed,stage:6,difficulty:'normal',role:'field',airVersion:'v23',v241:true,v249:true,v250:{wall:true}}),s=g.getState();g.restartAt('freeKick',1,-33,2);
    const ev=[];let n=0;while(n++<60*12){g.update(dt,idle);drain(g,ev);}
    assert.ok(ev.some(e=>e.type==='shot'&&e.team===1),'the rival shot');for(const e of ev)if(e.type==='wall-block')assert.equal(e.team,0);assert.ok(Number.isFinite(s.ball.x)&&Number.isFinite(s.ball.z));}
});

test('curl: the solved launch lands on the target whatever the bend, at the asked height; the intent needs a real turn of the stick',()=>{
  const cfg=full(),from={x:20,z:5,y:.11},target={x:52.5,z:-2};
  for(const curve of [0,.9,-.9,1.6,-1.6]){
    const L=soccerCurvedLaunch(from,target,24,curve,cfg,{vy:5,height:1.5}),path=soccerFlightPath(from,L,cfg,40),end=path.at(-1);
    assert.ok(Math.hypot(end.x-target.x,end.z-target.z)<.9,`curve ${curve}: ends ${Math.hypot(end.x-target.x,end.z-target.z).toFixed(2)} m from the target`);
    assert.ok(Math.abs(end.y-1.5)<.5,'height on arrival '+end.y.toFixed(2));assert.equal(L.curve,curve);
    // the bend: the middle of the flight is off the straight line, on the side the rate says
    const mid=path[20],off=((target.x-from.x)*(mid.z-from.z)-(target.z-from.z)*(mid.x-from.x))/Math.hypot(target.x-from.x,target.z-from.z);
    if(curve)assert.ok(off*curve<-.6,`curve ${curve}: ${off.toFixed(2)} m off the line at half way`);else assert.ok(Math.abs(off)<.05);
  }
  const C=SOCCER_V250.curve,at=deg=>({x:Math.cos(deg*Math.PI/180),z:Math.sin(deg*Math.PI/180)});
  assert.equal(soccerCurveIntent(at(0),at(10)),0,'a small correction is not a curl');assert.equal(soccerCurveIntent(at(0),null),0);assert.equal(soccerCurveIntent(null,at(40)),0);
  assert.equal(soccerCurveIntent(at(0),at(60),C.minCharge/2),0,'a tap is not curled');
  const left=soccerCurveIntent(at(0),at(40)),right=soccerCurveIntent(at(0),at(-40)),hard=soccerCurveIntent(at(0),at(90));
  assert.ok(left>0&&right<0&&Math.abs(left+right)<1e-9,'the side the stick turned to');assert.ok(hard>left&&hard<=C.rate[1]+1e-9&&left>=C.rate[0]);
  assert.ok(soccerCurveIntent(at(170),at(-150))>0,'across the wrap of the angle');
});

test('curl in the match: the stick turned while the shot button is held curls the shot (and the keeper finds it harder); a straight hold does not',()=>{
  const play=(turn,v250=true)=>{
    const g=match(v250),{s}=stageMoment(g,[26,9]),ev=[];
    for(let i=0;i<8;i++){g.update(dt,{moveX:1,moveZ:-.2});drain(g,ev);}
    for(let i=0;i<16;i++){g.update(dt,{moveX:1,moveZ:-.2,kickHeld:true});drain(g,ev);}
    const a=turn?{moveX:.5,moveZ:-1}:{moveX:1,moveZ:-.2};
    for(let i=0;i<14;i++){g.update(dt,{...a,kickHeld:true});drain(g,ev);}
    g.update(dt,{...a,kickHeld:false});drain(g,ev);const curve=s.ball.curve,shot=s.ball.shot?{...s.ball.shot}:null;
    return {shot:ev.find(e=>e.type==='shot'),curve,meta:shot};
  };
  const curled=play(true),straight=play(false),off=play(true,false);
  assert.ok(curled.shot&&curled.shot.curl==='curl','the shot is announced as curled');assert.ok(Math.abs(curled.curve)>.8,'the ball carries the bend: '+curled.curve.toFixed(2));assert.equal(curled.meta.curved,true);
  assert.ok(straight.shot&&!straight.shot.curl);assert.ok(Math.abs(straight.curve)<.5,'only the small spin an aimed shot always had');assert.ok(!straight.meta.curved);
  assert.ok(off.shot&&!off.shot.curl,'v24.9: no curl');assert.ok(Math.abs(off.curve)<.5);
});

test('aimed free kick: the target starts toward the far post, the stick moves it between the posts, the launch clears the wall and curls in',()=>{
  const cfg=full(),A=SOCCER_V250.aim,r={type:'freeKick',team:0,x:30,z:6};
  assert.equal(soccerFreeKickAimed(r,cfg,1),true);assert.equal(soccerFreeKickAimed({...r,x:5},cfg,1),false,'too far to shoot');assert.equal(soccerFreeKickAimed({...r,type:'corner'},cfg,1),false);
  const aim=soccerAimStart(r,cfg,1);assert.equal(aim.x,52.5);assert.ok(aim.z<0,'the far side from a kick on +z');
  const z0=aim.z;soccerAimMove(aim,r,0,1,.5,cfg,1);assert.ok(Math.abs(aim.z-(z0+A.speed*.5))<1e-9);
  for(let i=0;i<200;i++)soccerAimMove(aim,r,0,1,.1,cfg,1);assert.ok(Math.abs(aim.z-(cfg.pitch.goalWidth/2-A.postInset))<1e-9,'never outside the post');
  soccerAimMove(aim,r,1,0,1,cfg,1);assert.equal(aim.x,52.5,'the stick\'s other axis does nothing here');
  // every target and power: the flight ends at the target under the bar, and is over or round the wall where the wall stands
  const state={players:Array.from({length:6},(_,i)=>({id:i,team:1,role:'field',x:38+i,z:i}))},wall=soccerWall(r,state,cfg,1);
  for(const z of [-3.1,-1.5,0,1.5,3.1])for(const power of [0,.5,1]){
    const target={x:52.5,z},L=soccerFreeKickLaunch(r,target,power,17+10*power,cfg),path=soccerFlightPath({x:r.x,z:r.z},L,cfg,60),end=path.at(-1);
    assert.ok(Math.hypot(end.x-52.5,end.z-z)<.8,`z ${z} power ${power}: ends ${Math.hypot(end.x-52.5,end.z-z).toFixed(2)} m off`);
    assert.ok(end.y<cfg.pitch.goalHeight-.2&&end.y>.2,'under the bar: '+end.y.toFixed(2));assert.ok(Math.abs(L.curve)>0);
    for(const q of path)for(const w of wall)if(Math.hypot(q.x-w.x,q.z-w.z)<SOCCER_V250.wall.radius)assert.ok(q.y>SOCCER_V250.wall.height,`z ${z} power ${power}: over the wall (${q.y.toFixed(2)} m)`);
  }
  // the guide the view draws
  const s={phase:'restartReady',restart:{...r,aim250:{x:52.5,z:-2}},charging:false,charge:0};
  const guide=soccerAimGuide(s,cfg);assert.ok(guide.points.length>=10&&!guide.flat);assert.equal(guide.target.z,-2);assert.ok(Math.hypot(guide.points.at(-1).x-52.5,guide.points.at(-1).z+2)<1.2);
  assert.equal(soccerAimGuide({...s,restart:{...r}},cfg),null,'no target: no guide');assert.equal(soccerAimGuide({...s,phase:'playing'},cfg),null);assert.equal(soccerAimGuide({...s,restart:{...s.restart,team:1}},cfg),null);
});

test('aimed free kick in the match: the stick moves the target, the shot button sends a curling ball over the wall at it; off, the free kick is v24.9\'s',()=>{
  const play=(v250,seed=5)=>{
    const g=match(v250,{seed}),s=g.getState(),ev=[];g.restartAt('freeKick',0,30,6);
    let n=0;while(s.phase!=='restartReady'&&n++<60*12)g.update(dt,idle);
    const start=s.restart.aim250?{...s.restart.aim250}:null,wall=s.restart.wall?.length||0,taker=s.restart.player;
    for(let i=0;i<20;i++)g.update(dt,{moveX:0,moveZ:1});const moved=s.restart?.aim250?{...s.restart.aim250}:null;
    for(let i=0;i<30;i++)g.update(dt,{...idle,kickHeld:true});
    let peak=0,cross=null,curve=0;for(let i=0;i<60*4;i++){const bx=s.ball.x;g.update(dt,idle);drain(g,ev);peak=Math.max(peak,s.ball.y);curve=Math.max(curve,Math.abs(s.ball.curve||0));if(cross===null&&bx<52.5&&s.ball.x>=52.2&&s.ball.owner===null)cross={z:s.ball.z,y:s.ball.y};if(s.phase==='goal'||ev.some(e=>e.type==='possession'||e.type==='parry'||e.type==='wall-block'||e.type==='post'))break;}
    return {start,moved,wall,taker,shot:ev.find(e=>e.type==='shot'),peak,curve,cross,goal:s.phase==='goal',ev:ev.map(e=>e.type)};
  };
  const on=play(true);
  assert.ok(on.start&&on.moved,'the child\'s free kick in range has a target');assert.ok(on.moved.z>on.start.z+1,'the stick moved it: '+on.start.z.toFixed(2)+' -> '+on.moved.z.toFixed(2));
  assert.ok(on.wall>=2,'the rival built a wall');assert.equal(on.shot?.curl,'free');assert.ok(on.peak>2,'over the wall: peak '+on.peak.toFixed(2));assert.ok(on.curve>.5,'curling');
  assert.ok(!on.ev.includes('wall-block'),'the aimed kick is not blocked by the wall');
  let near=0,tries=0;for(let seed=1;seed<=6;seed++){const r=play(true,seed);if(r.cross){tries++;if(Math.abs(r.cross.z-r.moved.z)<1.2)near++;}}
  assert.ok(tries===0||near>=tries-1,'the ball reaches the goal line at the target ('+near+' of '+tries+')');
  const off=play(false);assert.equal(off.start,null);assert.equal(off.wall,0);assert.ok(!off.shot?.curl);
});

test('aimed corner: the stick moves a ring inside the penalty area and the shot button crosses to it for a team-mate',()=>{
  const cfg=full(),A=SOCCER_V250.aim,r={type:'corner',team:0,x:52.2,z:33.7},aim=soccerAimStart(r,cfg,1);
  assert.ok(aim.x>52.5-cfg.pitch.penaltyDepth&&aim.x<52.5&&aim.z<0,'in front of goal, the far half');
  for(let i=0;i<100;i++)soccerAimMove(aim,r,-1,1,.1,cfg,1);
  assert.ok(Math.abs(aim.x-(52.5-cfg.pitch.penaltyDepth+A.cornerInset))<1e-9&&Math.abs(aim.z-(cfg.pitch.penaltyWidth/2-A.cornerInset))<1e-9,'kept inside the area');
  for(let i=0;i<100;i++)soccerAimMove(aim,r,1,-1,.1,cfg,1);assert.ok(aim.x<52.5-A.cornerInset,'and off the goal line');
  const guide=soccerAimGuide({phase:'restartReady',restart:{...r,aim250:{x:44,z:2}}},cfg);assert.equal(guide.flat,true);assert.ok(Math.max(...guide.points.map(q=>q.y))>3,'an arc');
  // in the match
  const g=match(true),s=g.getState(),ev=[];g.restartAt('corner',0,52,33);
  let n=0;while(s.phase!=='restartReady'&&n++<60*12)g.update(dt,idle);
  assert.ok(s.restart.aim250);const before={...s.restart.aim250};
  for(let i=0;i<24;i++)g.update(dt,{moveX:-1,moveZ:.6});const target={...s.restart.aim250};assert.ok(target.x<before.x-2&&target.z>before.z+1);
  for(let i=0;i<8;i++)g.update(dt,{...idle,kickHeld:true});
  for(let i=0;i<120&&!ev.some(e=>e.type==='loft');i++){g.update(dt,idle);drain(g,ev);}
  const loft=ev.find(e=>e.type==='loft');assert.ok(loft,'the corner is a high ball: '+ev.map(e=>e.type).join(','));
  assert.ok(Math.hypot(loft.x-target.x,loft.z-target.z)<1.6,'to the ring: '+Math.hypot(loft.x-target.x,loft.z-target.z).toFixed(2)+' m off');
  assert.equal(s.players[loft.target].team,0);assert.notEqual(s.players[loft.target].role,'keeper');
});

test('taps: a tap picks the team-mate under the finger; the pass is on the ground with a clear lane, high over a rival, ahead of a runner; open grass gets the nearest runner',()=>{
  const T=SOCCER_V250.tap,cfg=full();
  assert.equal(soccerTapMate([{id:3,x:100,y:100},{id:4,x:140,y:100}],{x:128,y:104}),4);assert.equal(soccerTapMate([{id:3,x:100,y:100}],{x:100+T.pixels+3,y:100}),null);assert.equal(soccerTapMate([],{x:0,y:0}),null);
  assert.equal(soccerIsTap(120,4),true);assert.equal(soccerIsTap(T.maxMs+40,4),false,'a hold is not a tap');assert.equal(soccerIsTap(100,T.maxMove+6),false,'a drag is the stick');
  const me={id:0,team:0,role:'field',x:0,z:0},mate={id:1,team:0,role:'field',x:14,z:-6,vx:0,vz:0},keeper={id:2,team:0,role:'keeper',x:-50,z:0},rival={id:5,team:1,role:'field',x:30,z:20};
  const state=(players,ball={x:.4,z:0,owner:0})=>({players,ball});
  const ground=soccerTapPass(me,mate,state([me,mate,rival]),cfg,1);assert.deepEqual([ground.mate,ground.loft,ground.through],[1,false,false]);assert.ok(Math.hypot(ground.x-14,ground.z+6)<.01);
  const blocked=soccerTapPass(me,mate,state([me,mate,{...rival,x:7,z:-3}]),cfg,1);assert.equal(blocked.loft,true,'a rival in the lane: over him');assert.ok(blocked.power>=.36&&blocked.power<=1);
  const far=soccerTapPass(me,{...mate,x:34,z:-10},state([me,mate,rival]),cfg,1);assert.equal(far.loft,true,'beyond the ground range');
  const runner={...mate,vx:6},through=soccerTapPass(me,runner,state([me,runner,rival]),cfg,1);assert.equal(through.through,true);assert.ok(through.x>runner.x+3,'ahead of his run');
  assert.equal(soccerTapPass(me,keeper,state([me,keeper]),cfg,1),null);assert.equal(soccerTapPass(me,me,state([me]),cfg,1),null);assert.equal(soccerTapPass(me,rival,state([me,rival]),cfg,1),null);assert.equal(soccerTapPass(me,null,state([me]),cfg,1),null);
  // open grass
  const near={id:3,team:0,role:'field',x:16,z:-12,vx:5,vz:0},other={id:4,team:0,role:'field',x:-10,z:8,vx:0,vz:0};
  const space=soccerTapSpace(me,{x:22,z:-10},state([me,near,other,rival]),cfg,1);assert.deepEqual([space.mate,space.through,space.space,space.loft],[3,true,true,false]);assert.ok(Math.abs(space.x-22)<1e-9);
  assert.equal(soccerTapSpace(me,{x:2,z:1},state([me,near]),cfg,1),null,'at his own feet: nothing');assert.equal(soccerTapSpace(me,{x:-20,z:0},state([me,near]),cfg,1),null,'far behind him: nothing');
  assert.equal(soccerTapSpace(me,{x:22,z:-10},state([me,other]),cfg,1),null,'nobody can get there');
  const deep=soccerTapSpace({...me,x:30},{x:52,z:0},state([{...me,x:30},{...near,x:40,z:2}],{x:30.4,z:0,owner:0}),cfg,1);assert.ok(deep.x<=52.5-cfg.pitch.goalAreaDepth-.5+1e-9,'never into the keeper\'s hands');
  const forced=soccerTapSpace(me,{x:3,z:2},state([me,other]),cfg,1,{force:true});assert.equal(forced.loft,true,'a corner always crosses');
});

test('taps in the match: with the ball the tap passes to that team-mate and he becomes the child\'s player; in defence it selects him; at a set piece it is the pass; off, nothing',()=>{
  const pass=v250=>{const g=match(v250),{s,me,mates}=stageMoment(g,[2,3]),mate=mates[0],ev=[];mate.x=15;mate.z=-9;mate.cooldown=0;
    g.update(dt,{...idle,tap:{mate:mate.id}});drain(g,ev);for(let i=0;i<200&&!ev.some(e=>e.type==='possession');i++){g.update(dt,idle);drain(g,ev);}
    return {tap:ev.find(e=>e.type==='tap-pass'),pass:ev.find(e=>e.type==='pass'),controlled:s.controlled,owner:s.ball.owner,mate:mate.id,me:me.id};};
  const on=pass(true),off=pass(false);
  assert.ok(on.tap&&on.tap.target===on.mate&&!on.tap.space);assert.equal(on.pass.target,on.mate);assert.equal(on.controlled,on.mate,'the receiver is selected');assert.equal(on.owner,on.mate,'and has the ball');
  assert.equal(off.tap,undefined);assert.equal(off.controlled,off.me,'v24.9: the tap does nothing');
  // one tap object is one order, however many frames carry it
  {const g=match(true),{s,mates}=stageMoment(g,[2,3]),ev=[],tap={mate:mates[0].id};mates[0].x=15;mates[0].z=-9;for(let i=0;i<90;i++){g.update(dt,{...idle,tap});drain(g,ev);}assert.equal(ev.filter(e=>e.type==='tap-pass').length,1);assert.ok(s);}
  // open grass
  {const g=match(true),{s,mates}=stageMoment(g,[0,4]),ev=[];mates[0].x=8;mates[0].z=-10;mates[0].vx=5;g.update(dt,{...idle,tap:{x:20,z:-9}});drain(g,ev);
    const tap=ev.find(e=>e.type==='tap-pass');assert.ok(tap?.space,'a ball into space');assert.equal(tap.target,mates[0].id);assert.equal(ev.find(e=>e.type==='pass')?.kind,'through');assert.ok(Math.abs(s.passTarget.x-20)<1e-6);}
  // defence: the tap selects
  {const g=match(true),{s,me,mates,rivals}=stageMoment(g,[-20,10]),ev=[];const mate=mates[0];mate.x=-6;mate.z=-8;rivals[0].x=2;rivals[0].z=-2;Object.assign(s.ball,{x:1.6,z:-2,owner:rivals[0].id,lastTeam:1,lastPlayer:rivals[0].id});
    g.update(dt,{...idle,tap:{mate:mate.id}});drain(g,ev);assert.equal(s.controlled,mate.id);assert.ok(ev.some(e=>e.type==='switch'&&e.tap));assert.notEqual(s.controlled,me.id);
    const before=s.controlled;g.update(dt,{...idle,tap:{x:5,z:5}});assert.equal(s.controlled,before,'a tap on grass without the ball does nothing');}
  // the child's free kick: a tap on a team-mate passes to him
  {const g=match(true),s=g.getState(),ev=[];g.restartAt('freeKick',0,-10,8);let n=0;while(s.phase!=='restartReady'&&n++<60*12)g.update(dt,idle);
    const taker=s.restart.player,mate=s.players.filter(q=>q.team===0&&q.role!=='keeper'&&q.id!==taker).sort((a,b)=>Math.hypot(a.x+10,a.z-8)-Math.hypot(b.x+10,b.z-8))[0];
    for(let i=0;i<40;i++)g.update(dt,idle);g.update(dt,{...idle,tap:{mate:mate.id}});for(let i=0;i<120&&!ev.some(e=>e.type==='pass'||e.type==='loft');i++){g.update(dt,idle);drain(g,ev);}
    const out=ev.find(e=>e.type==='pass'||e.type==='loft');assert.ok(out,'the kick was taken');assert.equal(out.target,mate.id,'to the tapped team-mate');}
});

test('camera: the page gets a camera closer than v24.9\'s (the players about a quarter taller on the screen); the small match and node keep theirs',()=>{
  const cfg=applySoccerV249View(full(),{enabled:true,look:false}),next=applySoccerV250View(cfg,{enabled:true,saveReplay:false}),C=SOCCER_V250.camera;
  assert.equal(applySoccerV250View(cfg,{enabled:false,saveReplay:false}),cfg);assert.equal(applySoccerV250View(cfg),cfg,'node: unchanged');
  assert.ok(next.full.camera.base<SOCCER_V249.camera.base&&next.full.camera.near<SOCCER_V249.camera.near&&next.full.camera.far<=SOCCER_V249.camera.far);
  assert.equal(next.view.camera.nearDistance,C.base);assert.equal(cfg.full.camera.base,SOCCER_V249.camera.base,'the source config is not touched');assert.equal(applySoccerV250View(next,{enabled:true,saveReplay:false}),next,'idempotent');
  const state={attackDir:1,controlled:0,phase:'playing',restart:null,players:[{x:0,z:0}],ball:{x:.5,z:0,y:.11,vx:0,vz:0,owner:0}};
  const settle=config=>{let c=null;for(let i=0;i<400;i++)c=soccerFullCamera(state,844/390,config,c,1/30);return c;};
  const before=settle(cfg),after=settle(next),gain=before.distance/after.distance;
  assert.ok(gain>1.18&&gain<1.4,`players ${(gain*100-100).toFixed(0)}% taller on the screen`);
  // the goal is still in the frame when the ball is in the box
  const box={...state,players:[{x:44,z:0}],ball:{...state.ball,x:44.5}},c=settle({...next}),inBox=(()=>{let k=null;for(let i=0;i<400;i++)k=soccerFullCamera(box,844/390,next,k,1/30);return k;})();
  const halfWidth=inBox.distance*Math.tan(next.view.camera.fovDegrees*Math.PI/360)*(844/390);assert.ok(inBox.x+halfWidth>52.5,'the goal line is on the screen ('+(inBox.x+halfWidth).toFixed(1)+')');assert.ok(c);
  // the aimed corner: the camera looks toward the target in the box (v24.9's camera stays on the flag)
  const corner={...state,phase:'restartReady',restart:{type:'corner',team:0,x:52.2,z:33.7,aim250:{x:45,z:-1.5}},players:[{x:52,z:33}],ball:{...state.ball,x:52.2,z:33.7}};
  const aimed=(config=>{let k=null;for(let i=0;i<400;i++)k=soccerFullCamera(corner,844/390,config,k,1/30);return k;});
  assert.ok(aimed(next).z<aimed(cfg).z-8,'toward the box: '+aimed(cfg).z.toFixed(1)+' -> '+aimed(next).z.toFixed(1));
  const small={...cfg,full:undefined};assert.equal(applySoccerV250View(small,{enabled:true,saveReplay:false}),small);
});

test('save replay: a save pushed round the post is replayed while the corner is set up; a rebound into play, or the switch off, is not',()=>{
  const cfg=full(),on=applySoccerV250View(cfg,{enabled:false,saveReplay:true}),show=soccerShowConfig(on),off=soccerShowConfig(cfg);
  assert.equal(show.short.parry,true);assert.ok(!off.short.parry,'v24.9: no replay of a parry');assert.equal(applySoccerV250View(on,{enabled:false,saveReplay:true}),on,'idempotent');
  withLocation('?soccerSaveReplay250=0',()=>assert.equal(soccerSaveReplay250Enabled(),false));withLocation('',()=>assert.equal(soccerSaveReplay250Enabled(),true));assert.equal(soccerSaveReplay250Enabled(),false,'node');
  const recorder=clock=>({clock,oldest:Math.max(0,clock-4.5),latest:clock,strike:()=>null,ballAt:(t,o)=>{o.x=51;o.y=.6;o.z=2;return o;}});
  const live=()=>({phase:'playing',attackDir:1,score:[0,0],controlled:0,players:[{x:0,z:0,hands:false}],ball:{x:50,y:.5,z:2,vx:0,vz:0,owner:null}});
  const run=(config,kind)=>{const tl=createSoccerShowTimeline(config,cfg.pitch),s=live();for(let i=0;i<300;i++)tl.update(s,1/60,recorder(i/60));
    tl.event({type:'parry',kind,team:1,player:0},5);tl.update(s,1/60,recorder(5.1));const during=tl.phase;s.phase='restart';s.restart={type:'corner'};tl.update(s,1/60,recorder(5.6));return {during,tl};};
  const a=run(show,'corner');assert.equal(a.during,'live','play is never stopped for it');assert.equal(a.tl.phase,'short');assert.equal(a.tl.hold,true);assert.equal(a.tl.shortAnchor.kind,'save');
  assert.equal(run(show,'rebound').tl.phase,'live');assert.equal(run(off,'corner').tl.phase,'live');
});

test('keeper balance and wiring: the rival keeper\'s bonus is a v25.0 number; the session, the view and the styles carry the new parts',()=>{
  assert.ok(SOCCER_V250.keeper.rivalKeeperSave>=SOCCER_V249.rival.rivalKeeperSave,'never easier to score than v24.9');
  const read=name=>readFileSync(new URL('../workout/island/minigames/'+name,import.meta.url),'utf8'),session=read('soccer-session.mjs'),view=read('soccer-view.mjs'),css=read('g3h-soccer.css'),engine=read('soccer.mjs');
  assert.match(session,/applySoccerV250View\(applySoccerV249View\(/);assert.match(session,/soccerTap250Enabled\(\)/);assert.match(session,/sampled\.tap=tapOrder/);assert.match(session,/soccerIsTap\(performance\.now\(\)-down\.at/);
  assert.match(session,/node!==canvas&&node!==pad&&node!==zone/,'a tap never starts on a button');
  assert.match(view,/soccerAimGuide\(s,config,guideOut\)/);assert.match(view,/screenPoint\(x,y,z\)/);assert.match(view,/groundPoint\(px,py\)/);
  assert.match(css,/\.soccer-tap-ring\{position:fixed/);
  assert.match(engine,/const v250=config\.full\?soccerV250Rules\(v250Option\):soccerV250Rules\(false\)/,'full match only');
  assert.match(engine,/v250\.keeper\?V250\.keeper\.rivalKeeperSave\+\(V250\.keeper\.early\[Math\.round\(stage\)-1\]\|\|0\):V249\.rival\.rivalKeeperSave/);
  const early=SOCCER_V250.keeper.early;for(let i=1;i<early.length;i++)assert.ok(early[i]<=early[i-1]&&early[i]>=0,'the early bonus fades stage by stage');assert.ok(early.length<=2,'from stage 3 the rival keeper is v24.9\'s');
  const reach=SOCCER_V250.keeper.reach;for(let i=1;i<reach.length;i++)assert.ok(reach[i]<=reach[i-1]&&reach[i]>=0);assert.ok(reach.length<=2&&reach[0]<=.6,'a longer reach at the first two stages only');
  assert.match(engine,/v250\.keeper&&p\.team===1\?V250\.keeper\.reach\[Math\.round\(stage\)-1\]\|\|0:0/);
});

test('Hebrew in the new module and its texts: no Arabic letters and no exclamation marks',()=>{
  const src=readFileSync(new URL('../workout/island/minigames/soccer-r250.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(src,/[؀-ۿ]/);assert.doesNotMatch(src.replace(/!==|!=|!\w|!\(|!\[|!\$|!s\.|!\s*\w/g,''),/[֐-׿][^'"`\n]*!/);
  const session=readFileSync(new URL('../workout/island/minigames/soccer-session.mjs',import.meta.url),'utf8');
  for(const text of ['החומה חסמה','בעיטה מסובבת','כדור לעומק','המקל מכוון את ההגבהה','בעיטה חופשית · המקל מכוון']){assert.ok(session.includes(text),text);assert.doesNotMatch(text,/[!؀-ۿ]/);}
});
