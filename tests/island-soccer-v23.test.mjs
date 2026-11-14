import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {soccerSwitchVersion,soccerGlitchVersion,soccerPitchVersion,soccerAirVersion,soccerTapSoundVersion,switchSnapMotion,SOCCER_SWITCH_SNAP,
  movingWithHysteresis,createLocomotionGate,heldClipRelease,soccerPitchV23,applySoccerPitchV23,goalKickSpot,soccerMarkingRects,penaltyArcAngles,
  aerialMeet,headerAim,soccerQuietButton} from '../workout/island/minigames/soccer-v23.mjs';
import {createSoccerGestureRecognizer} from '../workout/island/minigames/soccer-design-controls.mjs';
import {createSoccer} from '../workout/island/minigames/soccer.mjs';
import {applySoccerTeams,SOCCER_PRODUCT_TEAMS} from '../workout/island/minigames/soccer-teams.mjs';
import {expandSoccerConfig} from '../workout/island/minigames/soccer-squad.mjs';

const base=JSON.parse(readFileSync(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames.soccer;
const product=pitch=>pitch==='v23'?applySoccerPitchV23(expandSoccerConfig(applySoccerTeams(base,SOCCER_PRODUCT_TEAMS)),'v23'):expandSoccerConfig(applySoccerTeams(base,SOCCER_PRODUCT_TEAMS));
const dt=1/60,idle={moveX:0,moveZ:0};
const thresholds=JSON.parse(readFileSync(new URL('../workout/island/design/controls/interaction.json',import.meta.url),'utf8')).gesture_thresholds;

test('flags: v23 by default, each ?soccerX=v22 (or the option) restores v22 on its own', () => {
  for(const [fn,name] of [[soccerSwitchVersion,'soccerSwitch'],[soccerGlitchVersion,'soccerGlitch'],[soccerPitchVersion,'soccerPitch'],[soccerAirVersion,'soccerAir'],[soccerTapSoundVersion,'soccerTapSound']]){
    assert.equal(fn(undefined,''),'v23',name);assert.equal(fn(undefined,`?${name}=v22`),'v22',name);assert.equal(fn(undefined,`?${name}=0`),'v22',name);
    assert.equal(fn('v22','?x=1'),'v22',name);assert.equal(fn('v23',`?${name}=v22`),'v23','an explicit option wins');
  }
  assert.equal(soccerSwitchVersion(undefined,'?soccerPitch=v22'),'v23','flags are independent');
});

test('switch v23: the switch fires on the press (v22: on the release)', () => {
  const rect={left:600,right:664,top:300,bottom:364,width:64,height:64};
  for(const [press,expectOnPress] of [[true,true],[false,false]]){
    const r=createSoccerGestureRecognizer({thresholds,switchOnPress:press});r.setEnabled(true);r.setState('defense',['stick','kick','pass','sprint','switch']);
    assert.ok(r.begin('switch',7,630,330,rect,0));
    assert.equal(r.sample(1,10).switchPlayer,expectOnPress,`press ${press}`);
    r.end(7,630,330,90);
    assert.equal(r.sample(1,100).switchPlayer,!expectOnPress,'exactly one switch per tap');
    assert.equal(r.sample(1,120).switchPlayer,false);
  }
});

test('switch v23: a held stick survives a change of control state; buttons do not (v22 dropped the stick until the thumb lifted)', () => {
  const stickRect={left:80,right:184,top:250,bottom:354,width:104,height:104};
  for(const keep of [true,false]){
    let cancels=0;const r=createSoccerGestureRecognizer({thresholds,keepStick:keep,onCancel:()=>cancels++});r.setEnabled(true);r.setState('attack',['stick','kick','pass','sprint','switch']);
    assert.ok(r.beginStick(1,132,302,stickRect,0));r.move(1,132+52,302,16,[]);
    r.begin('pass',2,700,330,{left:680,right:744,top:314,bottom:378,width:64,height:64},20);
    assert.ok(r.sample(1,30).moveX>.9);assert.equal(r.sample(1,31).passHeld,true);
    r.setState('defense',['stick','kick','pass','sprint','switch']);
    const after=r.sample(1,40);
    assert.equal(after.passHeld,false,'a held button never carries into the new state');
    if(keep){assert.ok(after.moveX>.9,'the thumb still steers');r.move(1,132,302-52,50,[]);assert.ok(r.sample(1,60).moveZ<-.9,'and keeps steering');assert.equal(r.snapshot.stickMode,'move');}
    else{assert.equal(after.moveX,0);r.move(1,132,302-52,50,[]);assert.equal(r.sample(1,60).moveZ,0,'v22: the stick is gone until a new touch');}
    assert.ok(cancels>=1);
  }
});

test('switch v23: the snap motion lasts SOCCER_SWITCH_SNAP.seconds and only raises the controlled player\'s response', () => {
  const human={acceleration:22,deceleration:17,turnRate:18,turnDrive:.4,lowSpeedTurnBoost:2.5};
  const snap=switchSnapMotion(human,.05);assert.ok(snap.turnRate>=SOCCER_SWITCH_SNAP.turnRate&&snap.acceleration>=SOCCER_SWITCH_SNAP.acceleration&&snap.turnDrive>human.turnDrive);
  assert.equal(switchSnapMotion(human,SOCCER_SWITCH_SNAP.seconds),null);assert.equal(switchSnapMotion(human,-1),null);
  assert.equal(switchSnapMotion({...human,acceleration:60},.01).acceleration,60,'never slower than the base');
});

/** A real match: run until the child defends, then press switch with the stick held across the selected player's run. */
function switchResponse(version){
  const config=product('v22');const out=[];
  for(let seed=1;seed<=24&&out.length<12;seed++){
    const g=createSoccer({config,seed,stage:3,difficulty:'normal',switchVersion:version});const s=g.getState();
    let t=0;while(t<40&&!(s.mode==='defense'&&s.phase==='playing'&&s.elapsed>3))g.update(dt,{moveX:.3,moveZ:0}),t+=dt;
    if(s.mode!=='defense')continue;
    const before=s.controlled;g.update(dt,{moveX:0,moveZ:0,switchPlayer:true});
    const id=s.controlled;if(id===before)continue;
    const p=s.players[id],speed=Math.hypot(p.vx,p.vz);const dir=speed>1?{x:-p.vz/speed,z:p.vx/speed}:{x:-1*s.attackDir,z:0};
    let reached=null;for(let i=1;i<=40&&s.controlled===id;i++){g.update(dt,{moveX:dir.x,moveZ:dir.z});const along=p.vx*dir.x+p.vz*dir.z;if(reached===null&&along>=2)reached=i;}
    if(reached!==null)out.push(reached*1000/60);
  }
  return out;
}
test('switch v23: a newly selected player runs along a stick held across his run within 120 ms (v22 needs longer)', () => {
  const v23=switchResponse('v23'),v22=switchResponse('v22');
  assert.ok(v23.length>=6&&v22.length>=6,`enough switches (${v23.length}, ${v22.length})`);
  const median=a=>[...a].sort((x,y)=>x-y)[Math.floor(a.length/2)];
  assert.ok(median(v23)<=120,`v23 median ${median(v23)} ms`);assert.ok(median(v23)<median(v22),`v23 ${median(v23)} < v22 ${median(v22)}`);
});

test('glitch v23: the moving flag has hysteresis, a locomotion clip dwells, a slow-down needs a real loss of speed', () => {
  assert.equal(movingWithHysteresis(.3,false),false);assert.equal(movingWithHysteresis(.3,true),true);assert.equal(movingWithHysteresis(.5,false),true);assert.equal(movingWithHysteresis(.1,true),false);
  const gate=createLocomotionGate({enabled:true});let flips=0,last=false;
  for(let i=0;i<120;i++){const m=gate.update(.2+.06*Math.sin(i*1.3),dt);if(m!==last)flips++;last=m;}
  assert.equal(flips,0,'a keeper shuffling at 0.14-0.26 m/s no longer flips idle/walk (the single 0.2 m/s edge flipped every few frames)');
  gate.changed();assert.equal(gate.canChange(),false);for(let i=0;i<11;i++)gate.update(3,dt);assert.equal(gate.canChange(),true);
  const g2=createLocomotionGate({enabled:true});g2.update(4,dt);g2.update(3.84,dt);assert.equal(g2.decelerating,false,'one frame 0.16 m/s slower is not a brake');
  for(let i=0;i<8;i++)g2.update(3.84-.25*(i+1),dt);assert.equal(g2.decelerating,true);
  assert.equal(createLocomotionGate({enabled:false}),null);assert.equal(g2.turnAllowed(1),false);assert.equal(g2.turnAllowed(3),true);
  assert.equal(heldClipRelease('v10_cut_90_left',false),.7);assert.equal(heldClipRelease('v9_run_brake',false),.2);
  assert.ok(heldClipRelease('v10_cut_90_left',true)<.3&&heldClipRelease('v9_run_brake',true)<.1&&heldClipRelease('v10_first_touch_inside_running_quick',true)>.33,'the selected player keeps the first touch past its contact (0.33 s) only');
});

test('pitch v23: real markings scaled to the 8-a-side pitch; the goal is the real 7.32 x 2.44 m', () => {
  const v22=product('v22').pitch,p=product('v23').pitch;
  assert.equal(p.length,v22.length);assert.equal(p.width,v22.width,'the pitch size is kept (68 x 42 m: inside FA 9v9 and FFF football a 8 sizes)');
  assert.equal(p.goalWidth,7.32);assert.equal(p.goalHeight,2.44);
  const near=(a,b,e=.05)=>Math.abs(a-b)<=e;
  assert.ok(near(p.penaltyDepth,16.5*68/105)&&near(p.penaltyWidth,40.32*42/68,.1),`area ${p.penaltyDepth} x ${p.penaltyWidth}`);
  assert.ok(near(p.goalAreaDepth,5.5*68/105)&&near(p.goalAreaWidth,18.32*42/68,.1),`goal area ${p.goalAreaDepth} x ${p.goalAreaWidth}`);
  assert.ok(near(p.penaltySpot,11*68/105));assert.ok(p.arcRadius>5&&p.arcRadius<6.5&&p.centreRadius===p.arcRadius);
  // proportions a viewer checks
  assert.ok(p.goalAreaWidth/p.goalWidth>1.5&&p.goalAreaWidth>p.goalWidth+2,'the goal area is wider than the goal (v22 drew it 5.8 m for a 6.19 m goal)');
  assert.ok(p.penaltyWidth/p.goalWidth>=3.39&&p.penaltyWidth/p.width>.55&&p.penaltyWidth/p.width<.62,'the area spans about 59% of the width, as on a full pitch');
  assert.ok(p.penaltySpot/p.penaltyDepth>.6&&p.penaltySpot/p.penaltyDepth<.72);
  assert.ok(v22.penaltyWidth<15&&v22.penaltyDepth<8.1,'v22 area was 8.0 x 15.0 m');
  {const c=product('v22');assert.equal(applySoccerPitchV23(c,'v22'),c,'?soccerPitch=v22 leaves the config untouched');}
  assert.equal(applySoccerPitchV23(applySoccerPitchV23(product('v22'),'v23'),'v23').pitch.penaltyDepth,p.penaltyDepth,'applied once');
  const rects=soccerMarkingRects(p,1);assert.ok(rects.some(r=>Math.abs(r.x-(p.length/2-p.goalAreaDepth))<1e-9&&Math.abs(r.sz-p.goalAreaWidth)<1e-9),'the goal-area line is drawn from the numbers the simulation uses');
  const arc=penaltyArcAngles(p);assert.ok(arc&&arc.half>0&&arc.half<Math.PI/2);
  assert.ok(Math.abs(p.penaltySpot+arc.radius*Math.cos(0)-(p.penaltySpot+arc.radius))<1e-9&&p.penaltySpot+arc.radius>p.penaltyDepth,'the arc reaches past the area line');
});

test('pitch v23: a goal kick sits inside the drawn goal area, a corner inside its arc; v22 placed the goal kick on the simulation corner', () => {
  const p=product('v23').pitch,hx=p.length/2;
  for(const side of [-1,1])for(const z of [-1,1]){const spot=goalKickSpot(side,z,p);assert.ok(Math.abs(spot.x)<=hx&&Math.abs(spot.x)>=hx-p.goalAreaDepth&&Math.abs(spot.z)<=p.goalAreaWidth/2,'inside the area');}
  // the model, through a real ball out over the goal line
  for(const pitch of ['v23','v22']){
    const config=product(pitch),g=createSoccer({config,seed:5,stage:2,difficulty:'normal'}),s=g.getState();
    Object.assign(s.ball,{owner:null,x:config.pitch.length/2-1,z:config.pitch.goalWidth/2+3,y:.11,vx:12,vz:0,vy:0,lastTeam:0,lastPlayer:0,grace:0,flight:null});
    for(let i=0;i<10&&!s.restart;i++)g.update(dt,idle);
    assert.equal(s.restart?.type,'goalKick',pitch);
    const inArea=Math.abs(s.restart.x)>=config.pitch.length/2-config.pitch.goalAreaDepth-1e-6&&Math.abs(s.restart.z)<=config.pitch.goalAreaWidth/2+1e-6;
    if(pitch==='v23')assert.ok(inArea&&Math.abs(s.restart.z)<config.pitch.goalAreaWidth/2-.1,'v23: inside the drawn area');
    else assert.ok(Math.abs(Math.abs(s.restart.z)-config.pitch.goalAreaWidth/2)<1e-9,'v22: on the corner of the simulation goal area');
  }
  const config=product('v23'),g=createSoccer({config,seed:6,stage:2,difficulty:'normal'}),s=g.getState();
  Object.assign(s.ball,{owner:null,x:config.pitch.length/2-1,z:config.pitch.goalWidth/2+4,y:.11,vx:12,vz:0,vy:0,lastTeam:1,lastPlayer:3,grace:0,flight:null});
  for(let i=0;i<10&&!s.restart;i++)g.update(dt,idle);
  assert.equal(s.restart?.type,'corner');const corner=Math.hypot(config.pitch.length/2-Math.abs(s.restart.x),config.pitch.width/2-Math.abs(s.restart.z));
  assert.ok(corner<=config.pitch.cornerRadius,'inside the corner arc');
});

/** The child's carrier with the stick pointing at an open team-mate ahead. */
function carrier(config,seed=4){
  const g=createSoccer({config,seed,stage:2,difficulty:'normal'}),s=g.getState();
  for(let i=0;i<40;i++)g.update(dt,{moveX:.6,moveZ:0});g.drainEvents();return {g,s};
}
test('air v23: the lob button plays a high pass at once (v22 ignored it)', () => {
  const config=product('v23');
  for(const version of ['v23','v22']){
    const g=createSoccer({config,seed:4,stage:2,difficulty:'normal',airVersion:version}),s=g.getState();
    for(let i=0;i<40;i++)g.update(dt,{moveX:.6,moveZ:0});g.drainEvents();
    assert.equal(s.ball.owner,s.controlled);const kicker=s.controlled,me=s.players[kicker];
    // fixture: no rival close enough to block the ball as it leaves the foot
    for(const p of s.players)if(p.team===1&&Math.hypot(p.x-me.x,p.z-me.z)<5){p.z+=p.z>=me.z?6:-6;}
    g.update(dt,{moveX:.8,moveZ:.2,lobPressed:true});g.update(dt,{moveX:.8,moveZ:.2});
    const events=g.drainEvents().map(e=>e.type);
    if(version==='v23'){assert.ok(events.includes('loft'),events.join());let peak=0;for(let i=0;i<60;i++){g.update(dt,idle);peak=Math.max(peak,s.ball.y);}assert.ok(peak>2,`a high ball (${peak.toFixed(2)} m)`);assert.notEqual(s.ball.lastPlayer===kicker&&s.ball.owner===kicker,true);}
    else assert.ok(!events.includes('loft')&&s.ball.owner===kicker,'v22: no lob channel');
  }
});

/** A loft coming down near the controlled player (a team-mate's cross into the box, or a rival's into the child's half). */
function incoming(config,{rival=false,seed=7}={}){
  const g=createSoccer({config,seed,stage:4,difficulty:'normal'}),s=g.getState();
  for(let i=0;i<5;i++)g.update(dt,idle);
  const hx=config.pitch.length/2,d=s.attackDir,me=s.players[s.controlled];
  const x=rival?-d*(hx-config.pitch.penaltyDepth+2):d*(hx-config.pitch.penaltyDepth+2);
  Object.assign(me,{x,z:0,vx:0,vz:0,cooldown:0,recover:0,slideTime:0});
  for(const p of s.players)if(p!==me&&Math.hypot(p.x-x,p.z)<4){p.x+=p.team===0?-8*d:8*d;}
  const from={x:x-d*(rival?-14:14),z:6};
  Object.assign(s.ball,{owner:null,thrower:null,shot:null,x:from.x,z:from.z,y:.5,lastTeam:rival?1:0,lastPlayer:rival?3:1,grace:0,curve:0,
    flight:{kind:'scripted',fromX:from.x,fromZ:from.z,x:x+d*.6,z:.3,height:3.2,duration:1.25,age:.25},vx:0,vz:0,vy:0});
  return {g,s,me};
}
test('air v23: a header press while the ball is on its way is kept until it arrives and heads at goal', () => {
  const config=product('v23'),{g,s,me}=incoming(config);
  g.update(dt,{...idle,kickHeld:true});
  assert.ok(s.headerArm&&s.headerArm.player===me.id,'armed, not a missed kick');
  let header=null;for(let i=0;i<90&&!header;i++){g.update(dt,{...idle,kickHeld:i<4});header=g.drainEvents().find(e=>e.type==='header'||e.type==='clearance');}
  assert.equal(header?.type,'header');assert.equal(header.player,me.id);
  const d=s.attackDir;assert.ok(s.ball.vx*d>4,'toward the rival goal');
  const toLine=(d*config.pitch.length/2-s.ball.x)/s.ball.vx,zAt=s.ball.z+s.ball.vz*toLine;assert.ok(Math.abs(zAt)<config.pitch.goalWidth,'between the posts or close');
});
test('air v23: in the own half a rival high ball is headed away (a clearance), not toward the own goal', () => {
  const config=product('v23'),{g,s,me}=incoming(config,{rival:true});
  g.update(dt,{...idle,kickHeld:true});assert.ok(s.headerArm);
  let header=null;for(let i=0;i<90&&!header;i++){g.update(dt,idle);header=g.drainEvents().find(e=>e.type==='header'||e.type==='clearance');}
  assert.equal(header?.type,'clearance');assert.equal(header.player,me.id);assert.ok(s.ball.vx*s.attackDir>0,'away from the own goal');
});
test('air v22: the same press is not kept (the header window is the old 1.5 m reach only)', () => {
  const config=product('v23');const g=createSoccer({config,seed:7,stage:4,difficulty:'normal',airVersion:'v22'});
  const s=g.getState();g.update(dt,idle);g.update(dt,{...idle,kickHeld:true});assert.equal(s.headerArm,null);
});
test('air v23: aerialMeet finds the head-height crossing; headerAim aims between the posts in attack and wide upfield in defence', () => {
  const c={aerial:{minHeight:1,maxHeight:2.4,reach:1.5},physics:{ballRadius:.11},ball:{gravity:12}};
  const meet=aerialMeet({x:10,z:0},{x:0,z:0,y:.11,flight:{fromX:0,fromZ:0,x:11,z:0,height:3,duration:1.2,age:0}},c,{horizon:1.4});
  assert.ok(meet&&meet.y>=1&&meet.y<=2.4&&meet.t<1.2);
  assert.equal(aerialMeet({x:30,z:0},{x:0,z:0,y:.11,flight:{fromX:0,fromZ:0,x:11,z:0,height:3,duration:1.2,age:0}},c),null,'too far');
  const pitch=product('v23').pitch,att=headerAim({x:25,z:2},{x:25,z:2,y:1.6},1,0,pitch),def=headerAim({x:-25,z:3},{x:-25,z:3,y:1.6},1,0,pitch,{defending:true});
  assert.ok(att.x>0&&!att.clear);assert.ok(def.clear&&def.x>0&&def.z>0,'clear forward and to the same side');
});

test('tap sound v23: soccer action buttons are quiet, other buttons keep the shell chirp', () => {
  const button={closest:sel=>sel==='.soccer-controls button'?button:null};
  assert.equal(soccerQuietButton(button,'v23'),true);assert.equal(soccerQuietButton(button,'v22'),false);
  assert.equal(soccerQuietButton({closest:()=>null},'v23'),false);assert.equal(soccerQuietButton(null,'v23'),false);
});

test('pitch v23: at kickoff the kicker stands at the ball and the other team waits outside the centre circle (v22: 0.8 m behind, rival 2.8 m away)', () => {
  for(const pitch of ['v23','v22']){
    const config=product(pitch),g=createSoccer({config,seed:9,stage:3,difficulty:'normal'}),s=g.getState();
    const kicker=s.players[s.ball.owner],gap=Math.hypot(kicker.x-s.ball.x,kicker.z-s.ball.z);
    const rivalNearest=Math.min(...s.players.filter(p=>p.team!==kicker.team).map(p=>Math.hypot(p.x,p.z)));
    if(pitch==='v23'){assert.ok(Math.abs(gap-config.physics.dribbleOffset)<1e-9,`kicker at the dribble offset (${gap})`);assert.ok(rivalNearest>=config.pitch.centreRadius,'outside the circle');}
    else{assert.ok(Math.abs(gap-config.ai.kickoffOwnerX)<1e-9);assert.ok(rivalNearest<3);}
    for(const p of s.players)assert.ok(p.x*s.attackDir*(p.team===0?1:-1)<=1e-9,'every player in his own half');
  }
});

test('pitch v23: the AI keeps the tuned area numbers (pitch.play); the keeper reach grows with the real goal', () => {
  const v22=product('v22'),v23=product('v23');
  assert.deepEqual(v23.pitch.play,{penaltyDepth:v22.pitch.penaltyDepth,penaltyWidth:v22.pitch.penaltyWidth,penaltySpot:v22.pitch.penaltySpot,goalWidth:v22.pitch.goalWidth});
  const grow=v23.pitch.goalWidth/v22.pitch.goalWidth;assert.ok(Math.abs(v23.ai.keeperBaseReach/v22.ai.keeperBaseReach-grow)<.01);
  assert.equal(v22.pitch.play,undefined);
});
