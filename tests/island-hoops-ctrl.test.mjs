// Street Slam control response (04/11): measurable response times on the 60 Hz engine, the stick
// always on the left (no handedness setting, saved values ignored) and the pass input buffer.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHoopsEngine,NO_INPUT} from '../workout/island/minigames/hoops-engine.mjs';
import {initialHoops,matchTeams} from '../workout/island/minigames/hoops-franchise.mjs';
const cfg=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames.streetSlam;
const src=f=>readFile(new URL('../workout/island/minigames/'+f,import.meta.url),'utf8');
function scene(){
 const setup=matchTeams(cfg,initialHoops(cfg),{stage:1});
 const e=createHoopsEngine({config:cfg,seed:7,teams:setup.teams,userTeam:0,profile:'standard',difficulty:setup.difficulty,assist:setup.assist});
 for(let i=0;i<720&&e.snapshot().phase!=='live';i++)e.step(NO_INPUT);
 e.setTacticsData(null);const S=e.debug.state,A=e.debug.api;
 S.phase='live';S.phaseT=0;S.pending=null;S.inbound=null;S.ft=null;S.autopilot=false;S.clock=60;S.shotClock=24;S.shotClockOn=true;S.stoppage=null;
 const home=A.onCourt(0),away=A.onCourt(1),side=A.side(0);
 for(const p of [...home,...away]){p.act=null;p.actT=0;p.act2=null;p.shot=null;p.move=null;p.fake=null;p.air=-1;p.jumpH=0;p.jumpQueue=null;p.stumble=0;p.energy=.9;p.sprinting=false;for(const k of Object.keys(p.cd))p.cd[k]=0;p.think=1e9;p.goal=null;p.goalSpeed=0;p.intent={x:0,z:0,speed:0,face:null,sprint:false};p.vx=p.vz=0;p.paintT=0;}
 home.forEach((p,i)=>e.debug.place(p.id,side*(i?10:6),i?i*2-6:0));away.forEach((p,i)=>e.debug.place(p.id,-side*7,i*1.2-2.4));
 const sel=home[0];e.debug.give(sel.id);S.controlled=sel.id;S.frontcourtSet=true;S.lastPossessionTick=S.tick;e.step(NO_INPUT);
 return {e,me:()=>{const s=e.snapshot();return s.players.find(p=>p.id===s.controlled);}};
}
const inp=o=>({...NO_INPUT,move:{x:0,z:0},...o});
test('stick start: visible motion (5 cm) within 2 steps = 33 ms of engine time, well under the 100 ms budget',()=>{
 for(const tilt of [1,.5]){const {e,me}=scene(),p0=me(),x0=p0.x,z0=p0.z;let n=0,d=0;
  while(n<10&&d<.05){e.step(inp({move:{x:tilt,z:0}}));n++;const p=me();d=Math.hypot(p.x-x0,p.z-z0);}
  assert.ok(n<=2,`tilt ${tilt}: ${n} steps`);assert.ok(n*1000/60<=100);}
});
test('stick tilt maps linearly to speed (a half tilt used to give 25% speed)',()=>{
 const {e,me}=scene();for(let i=0;i<150;i++)e.step(inp({move:{x:.5,z:0}}));
 const v=Math.hypot(me().vx,me().vz),full=(()=>{const s=scene();for(let i=0;i<150;i++)s.e.step(inp({move:{x:1,z:0}}));return Math.hypot(s.me().vx,s.me().vz);})();
 assert.ok(v/full>.4&&v/full<.6,`ratio ${v/full}`);
});
test('reversing the stick turns the player round in at most 14 steps (was 18)',()=>{
 const {e,me}=scene();for(let i=0;i<90;i++)e.step(inp({move:{x:1,z:0}}));let n=0;while(n<60){e.step(inp({move:{x:-1,z:0}}));n++;if(me().vx<0)break;}
 assert.ok(n<=14,`${n} steps`);
});
test('the first step response is for the child only: AI players keep their own acceleration',()=>{
 const {e}=scene(),S=e.debug.state,ai=S.teams[1].roster.find(p=>p.onCourt);
 ai.think=1e9;ai.intent={x:1,z:0,speed:1,face:null,sprint:false};e.step(NO_INPUT);
 assert.ok(Math.hypot(ai.vx,ai.vz)<.6,'AI speed after one step '+Math.hypot(ai.vx,ai.vz));
});
test('a pass pressed in the last 100 ms of a cross is buffered and thrown right after it',()=>{
 const probe=scene();probe.e.step(inp({movePress:true}));let len=0;while(probe.me().act==='cross'&&len<120){probe.e.step(NO_INPUT);len++;}
 assert.ok(len>8,'cross lasts '+len);
 const {e,me}=scene();e.step(inp({movePress:true}));for(let i=0;i<len-3;i++)e.step(NO_INPUT);assert.equal(me().act,'cross');
 e.step(inp({passPress:true}));assert.equal(e.snapshot().ball.owner,me().id,'not thrown yet');
 let passed=false;for(let i=0;i<30&&!passed;i++){e.step(NO_INPUT);if(e.drainEvents().some(ev=>ev.type==='pass'))passed=true;}
 assert.ok(passed,'buffered pass is released once the cross is over');
});
test('a pass pressed early in a cross is not kept past the window',()=>{
 const {e,me}=scene();e.step(inp({movePress:true}));e.step(NO_INPUT);e.step(inp({passPress:true}));
 let passed=false;for(let i=0;i<120;i++){e.step(NO_INPUT);if(e.drainEvents().some(ev=>ev.type==='pass'))passed=true;}
 assert.ok(!passed,'no late pass');
});
test('a stale buffered pass is dropped after the window',()=>{
 const {e,me}=scene();e.step(inp({movePress:true}));e.step(inp({passPress:true}));
 e.debug.state.tick+=30;for(let i=0;i<120;i++){e.step(NO_INPUT);}
 assert.equal(e.snapshot().ball.owner,me().id,'no late pass appears');
});
test('stick side: always left, no handedness setting and no saved value is read',async()=>{
 const controls=await src('hoops-controls.mjs'),session=await src('hoops-session.mjs'),css=await src('hoops.css');
 for(const text of [controls,session])assert.ok(!/rightHanded|handednessKey|getItem\([^)]*hand/i.test(text),'hoops reads no side setting');
 assert.ok(!/island\.(?:hoops|streetSlam)\.hand/.test(JSON.stringify(cfg)));
 const layouts=JSON.parse(await readFile(new URL('../workout/island/design/controls/hoops.json',import.meta.url),'utf8')).layouts;
 for(const name of ['844x390','390x844']){const {slots}=layouts[name],w=layouts[name].viewport.width;
  assert.equal(slots.stick.anchor_x,'left');assert.ok(slots.stick.x+slots.stick.width<=w/2);
  for(const key of ['primary','secondary','sprint','trick','support'])assert.equal(slots[key].anchor_x,'right',key+' action is on the right');}
 assert.ok(!/transition:transform/.test(css.split('\n').filter(l=>l.includes('hoops-knob')).join('\n')),'no smoothing delay on the knob');
});
