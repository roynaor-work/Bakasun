import {assistedPassDestination} from './soccer-assistance.mjs';
import {teamPassPoint,passLaneClearance} from './soccer-teamplay.mjs';
import {SOCCER_RESTART_SEQUENCES,sampleSoccerRestartBall} from './soccer-restart-motion.mjs';
import {createLoftFlight,safeLoftPoint} from './soccer-loft.mjs';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const PROFILES=Object.freeze(Object.fromEntries(Object.entries(SOCCER_RESTART_SEQUENCES).map(([kind,profile])=>[kind,Object.freeze({...profile,clip:kind})])));

/** Rules v1: a free kick and a penalty are standing kicks, so they reuse the goal-kick clip and
 * its release clock (0.528 s to contact) instead of a new authored sequence. */
const CLIP_ALIASES=Object.freeze({freeKick:'goalKick',penalty:'goalKick'});
export function restartClipKind(kind){return CLIP_ALIASES[kind]||kind;}
/** The simulation owns the release clock. Clips only display that same clock. */
export function restartActionProfile(kind){
  const p=PROFILES[restartClipKind(kind)];if(!p)throw Error(`Unknown soccer restart action: ${kind}`);
  return p;
}
export function sampleRestartAction(kind,elapsed,out={}){
  kind=restartClipKind(kind);
  const p=restartActionProfile(kind),t=clamp(Number.isFinite(elapsed)?elapsed:0,0,p.duration);
  out.kind=kind;out.elapsed=t;out.duration=p.duration;out.contact=p.contact;
  out.progress=t/p.duration;out.released=t+1e-8>=p.contact;
  out.stage=t+1e-8>=p.duration?'complete':out.released?'followThrough':'windup';
  return out;
}
/** Presentation-space ball path before contact. Forward/side follow the taker's
 * facing, height is world metres. The view uses the actual animated palms when
 * a rig is present; this path also keeps simulation/debug fallbacks coherent. */
export function restartBallPose(kind,elapsed,out={}){
  return sampleSoccerRestartBall(kind,elapsed,out);
}

/** A keeper's hand pass retains its bounded launch speed. Choose a natural
 * flight time for the same nearby receiver rather than firing a full shot or
 * raising the sphere to the old fixed chest height at the release event. */
export function createKeeperThrowFlight(ball,destination,c,power=0){
  const minimum=c.goalkeeping.throwMinSpeed||0,maximum=c.goalkeeping.throwMaxSpeed||9.5;
  let target=safeLoftPoint(destination,c),range=distance(ball,target);
  const maxSeconds=1.6,limit=maximum*maxSeconds*.93;
  if(range>limit){const u=limit/range;target=safeLoftPoint({x:ball.x+(target.x-ball.x)*u,z:ball.z+(target.z-ball.z)*u},c);range=distance(ball,target);}
  const speed=clamp((minimum+maximum)/2+clamp(power,0,1)*(maximum-minimum)/2,minimum,maximum);
  let seconds=clamp(range/Math.max(.1,speed),.18,maxSeconds),flight;
  for(let i=0;i<8;i++){
    flight=createLoftFlight(ball,target,c,power,{durationSeconds:seconds});
    if(Math.hypot(flight.vx,flight.vz)<=maximum+1e-8)break;
    seconds+=c.match.fixedStep;
  }
  return flight;
}

/** A keeper's punt is a long, high kick downfield: it lands on the grass near a
 * forward team-mate when one is in the power-chosen range band, otherwise
 * straight ahead at that range. Reads visible positions only. */
export function puntDestination(p,s,c,power=0){
  const d=s.attackDir*(p.team===0?1:-1),k=c.goalkeeping,b=s.ball;
  const min=k.puntMinDistance??14,max=Math.max(min,k.puntMaxDistance??30),range=min+(max-min)*clamp(Number.isFinite(power)?power:0,0,1);
  let best=null,value=-Infinity;
  for(const q of s.players){
    if(q.team!==p.team||q.id===p.id||q.role==='keeper'||q.recover>0||q.slideTime>0)continue;
    const point=teamPassPoint(q,c),ahead=(point.x-b.x)*d,reach=distance(point,b);
    if(ahead<min*.6||reach>max+4)continue;
    let open=8;for(const r of s.players)if(r.team!==p.team)open=Math.min(open,distance(r,point));
    const score=open*1.2-Math.abs(reach-range)*.6+ahead*.15;
    if(score>value){value=score;best={q,point};}
  }
  // A team-mate standing short of the range band receives the punt ahead of them
  // and runs onto it (the landing stays on their line from the keeper).
  let point=best?best.point:{x:b.x+d*range,z:b.z*.5};
  if(best){const reach=distance(point,b);if(reach<range&&reach>1e-6){const u=range/reach;point={x:b.x+(point.x-b.x)*u,z:b.z+(point.z-b.z)*u};}}
  const landing=safeLoftPoint(point,c);
  return {...landing,target:best?best.q.id:null,distance:distance(landing,b),kind:'punt'};
}
/** Flight time grows with range so the punt is a visible high arc (about 1.1 to 2.1 seconds). */
export function createKeeperPuntFlight(ball,destination,c,power=0){
  const range=distance(ball,destination),speed=c.goalkeeping.puntSpeed??13;
  return createLoftFlight(ball,destination,c,power,{durationSeconds:clamp(range/Math.max(1,speed),1.1,2.1)});
}

/** The throw's receiving choice is shared by simulation and its aiming cue. */
export function restartThrowTarget(p,r,s,c,long=false){
  const reach=c.restarts.throwReach||9,mates=s.players.filter(q=>q.team===p.team&&q.id!==p.id&&q.role!=='keeper'),rivals=s.players.filter(q=>q.team!==p.team);
  let best=null,value=-Infinity,nearest=null,nearestDistance=Infinity;
  const d=s.attackDir*(p.team===0?1:-1);
  for(const q of mates){
    const actual=distance(q,r);if(actual<nearestDistance){nearest=q;nearestDistance=actual;}
    const point=teamPassPoint(q,c),range=distance(point,r);if(range>reach)continue;
    const half={x:(r.x+point.x)/2,z:(r.z+point.z)/2};let open=6,lane=4;
    for(const rival of rivals){open=Math.min(open,distance(rival,point));lane=Math.min(lane,passLaneClearance(rival,half,point));}
    const score=open+lane*1.5-(lane<1.2?6:0)+range*(long ? .3 : -.15)+(point.x-r.x)*d*.05;
    if(score>value){value=score;best=q;}
  }
  return best||nearest;
}

/** Aim a restart from its reserved ball spot without changing the freely
 * controlled receiver. Reuse `out`; ordinary play returns before allocating.
 * Hand throws deliberately have no foot-cross loft arc. */
export function restartAimPreview(s,c,out,solveDestination=assistedPassDestination){
  const r=s.restart;
  if(!r||!s.charging||!s.phase?.startsWith('restart'))return null;
  const p=s.players.find(q=>q.id===r.player);if(!p)return null;
  out=out||{};
  const shot=s.chargeKind==='shot',active=shot?s.kickAim:s.passAim;
  const manual=active?.manual?active:s.actionAim?.manual?s.actionAim:null;
  const d=s.attackDir*(p.team===0?1:-1),cap=shot?c.physics.chargeSeconds:c.passing.chargeSeconds;
  const rawPower=clamp(s.charge/cap,0,1),power=shot&&r.type!=='throwIn'?Math.max(c.restarts.defaultCornerPower,rawPower):rawPower;
  let aim=manual||s.aim||{x:d,z:0},x,z,loft=false,height=0;
  if(r.type==='throwIn'){
    const mate=!manual&&!s.moving?restartThrowTarget(p,r,s,c,shot):null;
    if(mate){const point=teamPassPoint(mate,c);aim={x:point.x-r.x,z:point.z-r.z};}
    const dx=aim.x,dz=-Math.sign(r.z)*Math.max(c.restarts.inwardMinimum,Math.abs(aim.z)),length=Math.hypot(dx,dz)||1;
    const range=c.restarts.throwReach||9;
    out.aimX=dx/length;out.aimZ=dz/length;x=r.x+out.aimX*range;z=r.z+out.aimZ*range;
  }else if(shot&&(r.type==='freeKick'||r.type==='penalty')){
    // Rules v1: the shot button at a free kick or penalty is a real shot, so the cue is a straight line at the aim, not a pass arc.
    const length=Math.hypot(aim.x,aim.z)||1;out.aimX=aim.x/length;out.aimZ=aim.z/length;x=r.x+out.aimX*10;z=r.z+out.aimZ*10;
  }else{
    const ball={...s.ball,x:r.x,z:r.z},state={...s,controlled:p.id,ball,aim,passAim:manual||null};
    const destination=solveDestination(state,c,power);
    x=destination.x;z=destination.z;
    const dx=x-r.x,dz=z-r.z,length=Math.hypot(dx,dz)||1;
    out.aimX=dx/length;out.aimZ=dz/length;
    loft=destination.kind==='loft';height=loft?createLoftFlight(ball,destination,c,power).flight.height:0;
  }
  out.playerId=p.id;out.originX=out.fromX=r.x;out.originZ=out.fromZ=r.z;
  out.x=x;out.z=z;out.height=height;out.power=power;out.loft=loft;out.handThrow=r.type==='throwIn';return out;
}

/** Make the set-piece plan once, from observed positions. Slots remain attached
 * to IDs during the walk so crossing runners do not exchange jobs each tick.
 * Returns sparse ID-indexed targets; IDs need not equal roster array indexes. */
export function createRestartLayout(r,s,c){
  const hx=c.pitch.length/2,hz=c.pitch.width/2,d=s.attackDir*(r.team===0?1:-1),inward=-Math.sign(r.z)||1;
  const inset=Math.max(c.rules.restartPlayerInset||.5,c.rules.playerBoundary||.1),targets=[];
  const put=(p,x,z,duty)=>{targets[p.id]={x:clamp(x,-hx+inset,hx-inset),z:clamp(z,-hz+inset,hz-inset),duty};};
  const mates=s.players.filter(p=>p.team===r.team&&p.id!==r.player&&p.role!=='keeper');
  mates.sort((a,b)=>r.type==='throwIn'?distance(a,r)-distance(b,r)||a.id-b.id:(b.role==='striker')-(a.role==='striker')||a.id-b.id);
  for(const p of s.players)if(p.role==='keeper'&&p.id!==r.player){const pd=s.attackDir*(p.team===0?1:-1);put(p,-pd*(hx-c.ai.keeperInset),clamp(r.z*.15,-c.pitch.goalWidth/3,c.pitch.goalWidth/3),'restart-keeper');}
  if(r.type==='penalty'){
    // Rules v1: only the taker and the keeper stay in the area; both teams line the edge of the box.
    const edge=d*(hx-c.pitch.penaltyDepth-1.2),rivals=s.players.filter(p=>p.team!==r.team&&p.role!=='keeper').sort((a,b)=>a.id-b.id);
    mates.forEach((p,i)=>put(p,edge,(i%2?1:-1)*(1.6+Math.floor(i/2)*2.4),'penalty-wait'));
    rivals.forEach((p,i)=>put(p,edge-d*1.2,(i%2?-1:1)*(2.8+Math.floor(i/2)*2.4),'penalty-wait'));
    return targets;
  }
  for(let i=0;i<mates.length;i++){
    const p=mates[i];
    if(r.type==='throwIn'){
      const offsets=c.restarts.supportOffsets||[[2.5,3.5],[-2,2.5]],o=offsets[i];
      if(o)put(p,r.x+d*o[0],r.z+inward*o[1],i?'throw-outlet':'throw-run');
      else put(p,r.x-d*(5+(i-2)*3),r.z+inward*Math.min(hz,7+(i-2)*2),'throw-cover');
    }else if(r.type==='corner'){
      // Near post, far post and edge of area occupy different corridors.
      const points=[[hx-c.pitch.penaltySpot,Math.sign(r.z)*c.pitch.goalWidth*.24],[hx-c.pitch.penaltySpot-1.6,-Math.sign(r.z)*c.pitch.goalWidth*.33],[hx-c.pitch.penaltyDepth-2,Math.sign(r.z)*2.8]];
      const q=points[i]||[hx-c.pitch.penaltyDepth-5-(i-3)*3,(i%2?1:-1)*hz*.45];
      put(p,d*q[0],q[1],i===0?'corner-near':i===1?'corner-far':'corner-cover');
    }else if(r.type==='freeKick'){
      // Rules v1: one runner toward goal, one wide outlet, the rest cover behind the ball.
      const ahead=Math.min(8,Math.max(2,(hx-2-r.x*d)));
      const q=i===0?[r.x+d*ahead,r.z*.4]:i===1?[r.x+d*Math.min(3,ahead),r.z+inward*4]:[r.x-d*(4+(i-2)*2.5),r.z*.5+(i%2?1:-1)*3];
      put(p,q[0],q[1],i===0?'free-kick-run':i===1?'free-kick-outlet':'free-kick-cover');
    }else{
      // A short outlet on either side and a central forward beyond the press.
      const q=i===0?[-hx+c.pitch.penaltyDepth+8,0]:[-hx+c.pitch.penaltyDepth+1.5+(i-1)*1.2,(i%2?1:-1)*Math.min(hz-inset,c.pitch.penaltyWidth/2+1)];
      put(p,d*q[0],d*q[1],i===0?'goal-kick-run':'goal-kick-outlet');
    }
  }
  const rivals=s.players.filter(p=>p.team!==r.team&&p.role!=='keeper');
  rivals.sort((a,b)=>a.id-b.id);
  const available=mates.slice(),space=r.type==='throwIn'?(c.restarts.opponentSpace||3.5):r.type==='corner'?3:r.type==='freeKick'?(c.rules.freeKickSpace||9.15):0;
  for(const p of rivals){
    let mark=null,cost=Infinity;
    for(const q of available){const t=targets[q.id],v=distance(p,t);if(v<cost||v===cost&&q.id<mark.id){mark=q;cost=v;}}
    if(mark){available.splice(available.indexOf(mark),1);const t=targets[mark.id];let x=t.x+d*1.4,z=t.z;
      if(r.type==='goalKick')x=d*Math.max(x*d,-hx+c.pitch.penaltyDepth+2.2);
      const dx=x-r.x,dz=z-r.z,l=Math.hypot(dx,dz);if(space&&l<space){x=r.x+(l?dx/l:-d)*space;z=r.z+(l?dz/l:inward)*space;}
      put(p,x,z,'restart-mark');
    }else put(p,r.x+d*Math.max(space,4+targets.filter(Boolean).length*.15),r.z*.3,'restart-zone');
  }
  return targets;
}

/** Human receivers keep their movement input; callers use this for AI only. */
export function restartTarget(p,r,s,c){
  if(!r.targets)r.targets=createRestartLayout(r,s,c);
  return r.targets[p.id]||null;
}
