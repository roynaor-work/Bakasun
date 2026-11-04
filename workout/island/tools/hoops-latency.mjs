// Engine-level response timings for the basketball controls (headless, deterministic).
// Each result is in 60 Hz engine steps; one step = 16.67 ms. Screen latency also adds the wait
// for the next fixed step (0..1 step, avg 0.5) and the one-step render interpolation delay.
// Usage: node workout/island/tools/hoops-latency.mjs [json-out]
import {readFileSync,writeFileSync} from 'node:fs';
import {createHoopsEngine,NO_INPUT} from '../minigames/hoops-engine.mjs';
import {initialHoops,matchTeams} from '../minigames/hoops-franchise.mjs';
const cfg=JSON.parse(readFileSync(new URL('../data/config.json',import.meta.url),'utf8')).minigames.streetSlam;
const DT=1000/60,out={};
function fresh(seed=7){
 const setup=matchTeams(cfg,initialHoops(cfg),{stage:1});
 const e=createHoopsEngine({config:cfg,seed,teams:setup.teams,userTeam:0,profile:'standard',difficulty:setup.difficulty,assist:setup.assist});
 for(let i=0;i<60*12&&e.snapshot().phase!=='live';i++)e.step(NO_INPUT);
 // deterministic scene (same as the browser QA fixture): AI frozen, user holds the ball at rest
 e.setTacticsData(null);const S=e.debug.state,A=e.debug.api;
 S.phase='live';S.phaseT=0;S.pending=null;S.inbound=null;S.ft=null;S.autopilot=false;S.clock=60;S.shotClock=24;S.shotClockOn=true;S.stoppage=null;
 const home=A.onCourt(0),away=A.onCourt(1),side=A.side(0);
 for(const p of [...home,...away]){p.act=null;p.actT=0;p.act2=null;p.shot=null;p.move=null;p.fake=null;p.air=-1;p.jumpH=0;p.jumpQueue=null;p.stumble=0;p.energy=.9;p.sprinting=false;
  for(const k of Object.keys(p.cd))p.cd[k]=0;p.think=1e9;p.goal=null;p.goalSpeed=0;p.intent={x:0,z:0,speed:0,face:null,sprint:false};p.vx=p.vz=0;p.paintT=0;}
 home.forEach((p,i)=>e.debug.place(p.id,side*(i?10:6),i?i*2-6:0));away.forEach((p,i)=>e.debug.place(p.id,-side*7,i*1.2-2.4));
 const sel=home[0];e.debug.give(sel.id);S.controlled=sel.id;S.frontcourtSet=true;S.lastPossessionTick=S.tick;e.step(NO_INPUT);
 return e;
}
const me=e=>{const s=e.snapshot();return s.players.find(p=>p.id===s.controlled);};
const inp=(o)=>({...NO_INPUT,move:{x:0,z:0},...o});
// 1) joystick start: user player holds the ball and settles; full tilt then half tilt
function startResponse(tilt){
 const e=fresh();for(let i=0;i<40;i++)e.step(NO_INPUT);
 const p0=me(e),x0=p0.x,z0=p0.z,res={};
 for(let n=1;n<=60;n++){e.step(inp({move:{x:tilt,z:0}}));const p=me(e),d=Math.hypot(p.x-x0,p.z-z0);
  for(const [k,v] of [['d2cm',.02],['d5cm',.05],['d20cm',.2]])if(res[k]==null&&d>=v)res[k]=n;
  if(res.v1==null&&Math.hypot(p.vx,p.vz)>=1)res.v1=n;}
 return res;
}
out.startFull=startResponse(1);out.startHalf=startResponse(.5);out.startLight=startResponse(.25);
// 2) release: running at full speed, stick released -> steps to speed < 0.5 m/s
{const e=fresh();for(let i=0;i<90;i++)e.step(inp({move:{x:1,z:0}}));
 const v0=Math.hypot(me(e).vx,me(e).vz);let n=0;while(n<120){e.step(NO_INPUT);n++;if(Math.hypot(me(e).vx,me(e).vz)<.5)break;}out.stop={fromSpeed:+v0.toFixed(2),toHalfMs:null,steps:n};
 const e2=fresh();for(let i=0;i<90;i++)e2.step(inp({move:{x:1,z:0}}));let h=0;while(h<120){e2.step(NO_INPUT);h++;if(Math.hypot(me(e2).vx,me(e2).vz)<v0/2)break;}out.stop.halfSteps=h;}
// 3) direction reversal: running +x then stick -x -> steps until vx<0
{const e=fresh();for(let i=0;i<90;i++)e.step(inp({move:{x:1,z:0}}));let n=0;while(n<120){e.step(inp({move:{x:-1,z:0}}));n++;if(me(e).vx<0)break;}out.reverse={steps:n};}
// 4) shot: press, hold k steps, release; steps from press to ball release event
function shotRelease(holdSteps){
 const e=fresh();const p=me(e);if(!(e.snapshot().ball.owner===p.id)){return {skipped:true};}
 for(let i=0;i<20;i++)e.step(NO_INPUT);
 e.drainEvents();let n=0,rel=null,hold=holdSteps;
 e.step(inp({shootDown:true}));n++;
 for(let i=0;i<180&&rel==null;i++){const up=n===hold;e.step(inp({shootUp:up}));n++;for(const ev of e.drainEvents())if(ev.type==='release')rel??=n;}
 return {releaseSteps:rel,holdSteps};
}
out.shot=[1,3,8,20,45].map(shotRelease);
// 5) steal: user defends one metre from the handler; press -> steal/stealMiss resolution; then block jump press -> airborne
{const e=fresh(),S=e.debug.state,A=e.debug.api,away=A.onCourt(1)[0],me0=A.onCourt(0)[0];
 e.debug.give(away.id);S.possession=1;S.controlled=me0.id;e.debug.place(away.id,-3,0);e.debug.place(me0.id,-3+1.0,0);e.step(NO_INPUT);e.drainEvents();
 let n=0,res=null;e.step(inp({passPress:true}));n++;
 for(;n<60&&res==null;n++){e.step(NO_INPUT);for(const ev of e.drainEvents())if(/^steal(Miss)?$|^foul$/.test(ev.type))res??=n+1;}
 out.steal={pressToResolveSteps:res,note:'steal.reachAt='+cfg.steal.reachAt+' s ties the resolution to the reach animation'};}
// 6) player switch: press switch with a defender, then stick: steps until new player's velocity follows
function switchResponse(){
 const e=fresh();const api=e.debug?.api,S=e.debug?.state;if(!S)return {skipped:true};
 // hand the ball to the opponent point guard, make the user control a far player
 const opp=S.teams[1].roster.find(p=>p.onCourt),mine=S.teams[0].roster.filter(p=>p.onCourt);
 S.ball.owner=opp.id;S.ball.state='held';S.possession=1;
 for(let i=0;i<60;i++)e.step(NO_INPUT);
 const before=e.snapshot().controlled;let n=0,changed=null,follow=null;
 const press=inp({switchPress:true,move:{x:1,z:0}});
 e.step(press);n++;
 for(;n<90;n++){e.step(inp({move:{x:1,z:0}}));const s=e.snapshot();if(changed==null&&s.controlled!==before)changed=n;
  if(changed!=null&&follow==null){const p=s.players.find(q=>q.id===s.controlled);if(p.vx>=1)follow=n;}if(follow!=null)break;}
 return {controlChangedStep:changed,velocityFollowsStep:follow};
}
out.switch=switchResponse();
for(const k of ['startFull','startHalf','startLight'])out[k].ms=Object.fromEntries(Object.entries(out[k]).filter(([a])=>a!=='ms').map(([a,v])=>[a,v==null?null:Math.round(v*DT)]));
console.log(JSON.stringify(out,null,1));
if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(out,null,1));
