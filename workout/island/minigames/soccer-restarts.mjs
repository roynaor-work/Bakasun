import {assistedPassDestination} from './soccer-assistance.mjs';
import {teamPassPoint,passLaneClearance} from './soccer-teamplay.mjs';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const PROFILES=Object.freeze({
  throwIn:Object.freeze({duration:.65,contact:.32,clip:'throwIn'}),
  corner:Object.freeze({duration:.5,contact:.22,clip:'corner'}),
  goalKick:Object.freeze({duration:.65,contact:.35,clip:'goalKick'}),
  keeperThrow:Object.freeze({duration:.65,contact:.32,clip:'keeperThrow'}),
  keeperPunt:Object.freeze({duration:.7,contact:.35,clip:'keeperPunt'}),
});
const BALL_POSES={
  throwIn:[[0,1.48,.27],[.17,2.05,-.14],[.32,2.1,.08]],
  keeperThrow:[[0,1.12,.28],[.18,.82,-.15],[.32,.92,.4]],
  keeperPunt:[[0,1.12,.28],[.16,1.12,.28],[.35,.25,.5]],
  corner:[[0,.18,.55],[.22,.18,.55]],goalKick:[[0,.18,.55],[.35,.18,.55]],
};

/** The simulation owns the release clock. Clips only display that same clock. */
export function restartActionProfile(kind){
  const p=PROFILES[kind];if(!p)throw Error(`Unknown soccer restart action: ${kind}`);
  return p;
}
export function sampleRestartAction(kind,elapsed,out={}){
  const p=restartActionProfile(kind),t=clamp(Number.isFinite(elapsed)?elapsed:0,0,p.duration);
  out.kind=kind;out.elapsed=t;out.duration=p.duration;out.contact=p.contact;
  out.progress=t/p.duration;out.released=t+1e-8>=p.contact;
  out.stage=t>=p.duration?'complete':out.released?'followThrough':'windup';
  return out;
}
/** Presentation-space ball path before contact. Forward/side follow the taker's
 * facing, height is world metres. The view uses the actual animated palms when
 * a rig is present; this path also keeps simulation/debug fallbacks coherent. */
export function restartBallPose(kind,elapsed,out={}){
  const p=restartActionProfile(kind),t=clamp(Number.isFinite(elapsed)?elapsed:0,0,p.contact);
  const keys=BALL_POSES[kind];
  let i=0;while(i<keys.length-2&&keys[i+1][0]<t)i++;
  const a=keys[i],b=keys[i+1],u=clamp((t-a[0])/(b[0]-a[0]),0,1),w=u*u*(3-2*u);
  out.height=a[1]+(b[1]-a[1])*w;out.forward=a[2]+(b[2]-a[2])*w;out.side=0;return out;
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
export function restartAimPreview(s,c,out){
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
  }else{
    const ball={...s.ball,x:r.x,z:r.z},state={...s,controlled:p.id,ball,aim,passAim:manual||null};
    const destination=assistedPassDestination(state,c,power);
    x=destination.x;z=destination.z;
    const dx=x-r.x,dz=z-r.z,length=Math.hypot(dx,dz)||1;
    out.aimX=dx/length;out.aimZ=dz/length;
    loft=destination.kind==='loft';height=loft?c.passing.loftMinHeight+power*c.passing.loftExtraHeight:0;
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
    }else{
      // A short outlet on either side and a central forward beyond the press.
      const q=i===0?[-hx+c.pitch.penaltyDepth+8,0]:[-hx+c.pitch.penaltyDepth+1.5+(i-1)*1.2,(i%2?1:-1)*Math.min(hz-inset,c.pitch.penaltyWidth/2+1)];
      put(p,d*q[0],d*q[1],i===0?'goal-kick-run':'goal-kick-outlet');
    }
  }
  const rivals=s.players.filter(p=>p.team!==r.team&&p.role!=='keeper');
  rivals.sort((a,b)=>a.id-b.id);
  const available=mates.slice();
  for(const p of rivals){
    let mark=null,cost=Infinity;
    for(const q of available){const t=targets[q.id],v=distance(p,t);if(v<cost||v===cost&&q.id<mark.id){mark=q;cost=v;}}
    if(mark){available.splice(available.indexOf(mark),1);const t=targets[mark.id];let x=t.x+d*1.4,z=t.z;
      if(r.type==='goalKick')x=d*Math.max(x*d,-hx+c.pitch.penaltyDepth+2.2);
      const space=r.type==='throwIn'?(c.restarts.opponentSpace||3.5):r.type==='corner'?3:0;
      const dx=x-r.x,dz=z-r.z,l=Math.hypot(dx,dz);if(space&&l<space){x=r.x+(l?dx/l:-d)*space;z=r.z+(l?dz/l:inward)*space;}
      put(p,x,z,'restart-mark');
    }else put(p,r.x+d*(4+targets.filter(Boolean).length*.15),r.z*.3,'restart-zone');
  }
  return targets;
}

/** Human receivers keep their movement input; callers use this for AI only. */
export function restartTarget(p,r,s,c){
  if(!r.targets)r.targets=createRestartLayout(r,s,c);
  return r.targets[p.id]||null;
}
