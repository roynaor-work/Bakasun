// Headless measurement of AI keeper distribution: node measure.mjs [out.json]
// Compares ?keeperKick=0 (before) with the default (after) on the real model.
import {readFile,writeFile} from 'node:fs/promises';
import {createSoccer} from '../../minigames/soccer.mjs';
const c=JSON.parse(await readFile(new URL('../../data/config.json',import.meta.url),'utf8')).minigames.soccer,dt=c.match.fixedStep,hx=c.pitch.length/2;
const deg=r=>r*180/Math.PI;
function run({seed,kind,mateX,mateZ,before}){
 globalThis.location={search:before?'?keeperKick=0':''};
 const game=createSoccer({config:c,seed,stage:1,difficulty:'normal',role:'field',league:true}),s=game.getState();game.clearInput();
 for(const p of s.players){p.cooldown=100;p.recover=0;p.slideTime=0;p.vx=p.vz=0;}s.controlled=0;s.switchCooldown=100;
 const k=s.players[2],d=s.attackDir;
 for(const p of s.players)if(p.team===0&&p.role!=='keeper'){p.x=-hx+(kind==='throw'?mateX:40);p.z=kind==='throw'?mateZ:0;}
 for(const p of s.players)if(p.team===1){p.x=hx-6;p.z=(p.id%3-1)*6;}
 Object.assign(k,{x:-d*(hx-2.5),z:0,hands:true,hold:0,cooldown:0,think:100,recover:0,fx:1,fz:0});
 Object.assign(s.ball,{owner:2,x:k.x+d*c.goalkeeping.holdForward,z:0,y:c.goalkeeping.holdHeight,vx:0,vz:0,vy:0,lastTeam:0,lastPlayer:2});
 let t=0,tw=null,tr=null,dirBall=null,at=null,end=null,maxTurn=0,lastYaw=null,yawAtRel=null;
 for(let i=0;i<Math.ceil(8/dt);i++){s.idle=kind==='throw'?2:0;game.update(dt,{});const ev=game.drainEvents();t+=dt;
  if(tw===null&&ev.some(e=>e.type==='distribution-windup'))tw=t;
  if(tw!==null&&tr===null&&s.ball.owner!==2){tr=t;const b=s.ball,f=b.flight;dirBall=Math.atan2(f?f.z-k.z:b.vz,f?f.x-k.x:b.vx);at={x:k.x,z:k.z};yawAtRel=Math.atan2(k.fz,k.fx);}
  if(tr!==null){const yaw=Math.atan2(k.fz,k.fx);if(k.restartMotion){end={x:k.x,z:k.z,yaw,t:t-tr};}
   if(!k.restartMotion||t-tr>1.5)break;}
 }
 if(tr===null||!end)return null;
 const dx=end.x-at.x,dz=end.z-at.z,along=dx*Math.cos(dirBall)+dz*Math.sin(dirBall);
 let dy=end.yaw-dirBall;dy=deg(Math.atan2(Math.sin(dy),Math.cos(dy)));
 let dr=yawAtRel-dirBall;dr=deg(Math.atan2(Math.sin(dr),Math.cos(dr)));
 let turn=end.yaw-yawAtRel;turn=deg(Math.atan2(Math.sin(turn),Math.cos(turn)));
 return {kind:k.restartMotion?.kind||(kind==='throw'?'keeperThrow':'keeperPunt'),releaseSeconds:+(tr-tw).toFixed(3),followSeconds:+end.t.toFixed(2),facingVsBallAtContactDeg:+dr.toFixed(1),facingVsBallClipEndDeg:+dy.toFixed(1),bodyTurnAfterContactDeg:+turn.toFixed(1),bodyTravelAlongBallDirAfterContactM:+along.toFixed(2)};
}
const out={before:[],after:[]};
for(const before of [true,false])for(const kind of ['throw','punt'])for(const seed of [1,2,3,4,5,6])for(const [mateX,mateZ] of [[11,6],[9,-8],[13,0]]){
 if(kind==='punt'&&mateX!==11)continue;const r=run({seed,kind,mateX,mateZ,before});if(r)out[before?'before':'after'].push({seed,mate:kind==='throw'?[mateX,mateZ]:null,...r});}
const summarize=a=>{const g=k=>a.filter(r=>r.kind===k);const m=(x,f)=>x.length?+(x.map(f).reduce((p,q)=>p+q,0)/x.length).toFixed(2):null;return Object.fromEntries(['keeperThrow','keeperPunt'].map(k=>[k,{n:g(k).length,avgReleaseSeconds:m(g(k),r=>r.releaseSeconds),avgFacingVsBallAtContactDeg:m(g(k),r=>Math.abs(r.facingVsBallAtContactDeg)),avgBodyTurnAfterContactDeg:m(g(k),r=>Math.abs(r.bodyTurnAfterContactDeg)),avgFacingVsBallClipEndDeg:m(g(k),r=>Math.abs(r.facingVsBallClipEndDeg)),avgTravelAlongBallDirM:m(g(k),r=>r.bodyTravelAlongBallDirAfterContactM),minTravelAlongBallDirM:g(k).length?Math.min(...g(k).map(r=>r.bodyTravelAlongBallDirAfterContactM)):null}]));};
out.summary={before:summarize(out.before),after:summarize(out.after)};
console.log(JSON.stringify(out.summary,null,1));
if(process.argv[2])await writeFile(process.argv[2],JSON.stringify(out,null,1));
