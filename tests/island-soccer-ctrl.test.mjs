import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSoccer} from '../workout/island/minigames/soccer.mjs';
import {createSoccerGestureRecognizer,shapeStick,soccerDesignLayout} from '../workout/island/minigames/soccer-design-controls.mjs';

const read=async p=>readFile(new URL('../workout/island/'+p,import.meta.url),'utf8');
const config=JSON.parse(await read('data/config.json')).minigames.soccer,interaction=JSON.parse(await read('design/controls/interaction.json')),contract=JSON.parse(await read('design/controls/soccer.json'));
const dt=config.match.fixedStep,th=interaction.gesture_thresholds;

function rig({cooldown=0}={}){
  const game=createSoccer({config,stage:1,difficulty:'normal',seed:19,random:()=>.5}),s=game.getState();
  game.clearInput();s.attackDir=1;s.controlled=0;s.switchCooldown=1e9;s.mode='attack';
  for(const p of s.players)Object.assign(p,{x:p.team===0?-12:12,z:(p.id%3-1)*8,recover:p.id===0?0:1e9,cooldown:0,vx:0,vz:0,slideTime:0,hands:false,fx:p.team===0?1:-1,fz:0});
  Object.assign(s.players[0],{x:0,z:0,cooldown});Object.assign(s.ball,{owner:0,x:config.physics.dribbleOffset,z:0,y:config.physics.ballRadius,vx:0,vz:0,vy:0,grace:100,lastTeam:0,lastPlayer:0,flight:null,shot:null,thrower:null});
  let clock=0;const rec=createSoccerGestureRecognizer({thresholds:th,feel:config.controls.stick,onCancel:()=>game.clearInput()});rec.setEnabled(true);rec.setState('attack',['stick','kick','pass','sprint','switch']);
  const frame=()=>{game.update(dt,rec.sample(1,clock,{kick:{x:1,z:0},pass:{x:1,z:0}}));clock+=dt*1000;return s;};
  return {game,s,rec,frame,get clock(){return clock;}};
}
const stickRect={left:12,top:274,width:104,height:104,right:116,bottom:378},button={left:752,top:298,width:80,height:80,right:832,bottom:378};

test('ctrl-soccer: the stick is on the left and the actions on the right, in both orientations, whatever was saved',async()=>{
  for(const [w,h] of [[844,390],[390,844]]){
    const l=soccerDesignLayout(contract,w,h,true);
    assert.equal(l.stick.anchor_x,'left');assert.ok(l.stick.x+l.stick.width<w/2,'stick in the left half');
    for(const slot of ['primary','secondary','sprint','trick'])assert.equal(l[slot].anchor_x,'right',slot+' on the right');
  }
  const session=await read('minigames/soccer-session.mjs'),activity=await read('ui/activity.mjs');
  assert.ok(!session.includes('handednessKey'),'a saved island.soccer.handed value is never read by the soccer session');
  assert.ok(/handed=true/.test(session),'the soccer session is always right-handed layout (stick left)');
  assert.ok(!/this\.soccerHandedness\(\)/.test(activity),'no handedness switch in the soccer menu');
  assert.ok(/id==='tennis'\)dialog\.append\(this\.soccerHandedness/.test(activity),'tennis keeps its own switch');
  assert.ok(!/soccer\]\s*\.soccer-controls\.left-handed/.test(await read('minigames/soccer-controls.css')+await read('styles.css')),'no soccer left-handed CSS');
});

test('ctrl-soccer: stick curve has a small dead zone, reaches full at saturation and stays monotonic',()=>{
  const f=config.controls.stick;
  assert.equal(shapeStick(0,th,f),0);assert.equal(shapeStick(f.deadZone-.001,th,f),0);assert.ok(shapeStick(f.deadZone+.03,th,f)>0);
  assert.equal(shapeStick(f.saturation,th,f),1);assert.equal(shapeStick(1,th,f),1);
  let prev=-1;for(let m=0;m<=1.001;m+=.01){const v=shapeStick(m,th,f);assert.ok(v>=prev-1e-9);prev=v;}
  assert.ok(f.deadZone<th.stick_dead_zone,'dead zone is smaller than the contract default');
  assert.equal(shapeStick(.5,th,null),.5,'without feel the contract stick stays linear');assert.equal(shapeStick(.09,th,null),0);
});

test('ctrl-soccer: sprint gating still reads the physical tilt, not the curve',()=>{
  const r=rig();r.rec.beginStick(1,64+52*.85,326,stickRect,0);r.frame();
  for(let i=0;i<30;i++)r.frame();assert.equal(r.rec.snapshot.autoSprint,false,'85% of the travel is below the 90% sprint threshold');
  const q=rig();q.rec.beginStick(1,64+52*.95,326,stickRect,0);for(let i=0;i<30;i++)q.frame();assert.equal(q.rec.snapshot.autoSprint,true);
});

test('ctrl-soccer: touch to visible motion is within 100 ms (6 frames) and the controlled player picks up speed faster than before',()=>{
  const r=rig(),p=r.s.players[0];r.rec.beginStick(1,64+52,326,stickRect,r.clock);
  let moved=null,top=config.players.speed+(p.speed-1)*config.players.speedPerRank,reach63=null;
  for(let i=1;i<=12;i++){r.frame();const shown=r.game.renderState().players[0];if(moved===null&&Math.abs(shown.x)>.05)moved=i;if(reach63===null&&Math.hypot(p.vx,p.vz)>=top*.63)reach63=i;}
  assert.ok(moved!==null&&moved<=6,'5 cm of shown movement in '+moved+' frames');assert.ok(reach63<=4,'63% speed in '+reach63+' frames');
});

test('ctrl-soccer: stopping and reversing are snappier than the AI motion (stop within 10 frames, no long slide)',()=>{
  const r=rig(),p=r.s.players[0];r.rec.beginStick(1,64+41,326,stickRect,r.clock);for(let i=0;i<40;i++)r.frame();const x0=p.x;
  r.rec.end(1,105,326,r.clock);let stop=null;for(let i=1;i<=30;i++){r.frame();if(stop===null&&Math.hypot(p.vx,p.vz)<.1*top(p)){stop=i;}}
  assert.ok(stop<=11,'stopped after '+stop+' frames');assert.ok(p.x-x0<.5,'slide '+(p.x-x0));
  function top(q){return config.players.speed+(q.speed-1)*config.players.speedPerRank;}
});

test('ctrl-soccer: multi-touch stick + sprint + kick registers in the same sample',()=>{
  const r=rig();
  assert.equal(r.rec.beginStick(1,64+40,326,stickRect,0),true);assert.equal(r.rec.begin('sprint',2,792,258,{left:752,top:226,width:80,height:64,right:832,bottom:290},0),true);assert.equal(r.rec.begin('kick',3,792,338,button,0),true);
  r.frame();const input=r.rec.sample(1,16,{});assert.ok(input.moveX>.5&&input.sprintHeld&&input.kickHeld);
});

test('ctrl-soccer: a tap in the last 180 ms of kick cooldown is buffered, an earlier one is dropped',()=>{
  const fire=(cooldown,name,node,type)=>{const r=rig({cooldown});r.rec.begin(name,5,node.left+40,node.top+40,node,r.clock);r.frame();r.rec.end(5,node.left+40,node.top+40,r.clock);for(let i=0;i<40;i++){r.frame();if(r.game.drainEvents().some(e=>e.type===type))return i+1;}return null;};
  const pass={left:680,top:314,width:64,height:64,right:744,bottom:378};
  assert.ok(fire(.1,'kick',button,'shot')!==null,'shot kept');assert.ok(fire(.1,'pass',pass,'pass')!==null,'pass kept');
  assert.equal(fire(.5,'kick',button,'shot'),null,'a tap far from the end of cooldown is not queued');
});

test('ctrl-soccer: swipe aim survives the release and manual aim is not overridden by assist',()=>{
  const r=rig();r.rec.begin('kick',7,792,338,button,0);r.rec.move(7,822,308,0);const held=r.rec.sample(1,0,{kick:{x:1,z:0}});r.rec.end(7,822,308,0);const after=r.rec.sample(1,16,{kick:{x:1,z:0}});
  assert.equal(held.kickAim.manual,true);assert.equal(after.kickAim.manual,true);assert.ok(Math.abs(after.kickAim.z+.707)<.01);
});
