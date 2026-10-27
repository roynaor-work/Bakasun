/** Island Pro Basketball — 5 on 5 match engine.
 * Deterministic fixed step (1/60 s): same seed + same inputs = same game. No DOM, no Three.js.
 * The engine is the only source of truth for positions, possession, clocks, fouls, scoring and
 * the result. The view, the replay and the sound only read snapshots and ordered events. */
import {createCourt} from './hoops-court.mjs?v=island-alpine-20261027-1';
import {hoopsColliders,stepBall,launch,passVelocity} from './hoops-ball.mjs?v=island-alpine-20261027-1';
import {teamThink} from './hoops-ai.mjs?v=island-alpine-20261027-1';

export const HOOPS_DT=1/60;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const hyp=Math.hypot;
export const NO_INPUT=Object.freeze({move:{x:0,z:0},sprint:false,shootDown:false,shootUp:false,passPress:false,passDir:null,altPress:false,switchPress:false,timeoutPress:false,call:null});

export function mulberry32(seed){let a=seed>>>0;return {next(){a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;},get state(){return a;}};}

/** Effective rating 0..1 (fatigue lowers everything a little). */
function eff(p,key){return (p.r[key]/100)*(0.82+0.18*p.energy);}

export function createHoopsEngine({config,seed=1,teams,userTeam=0,profile='standard',difficulty='normal',mode='match',assist=0,autopilot=false}={}){
 const C=config,court=createCourt(C.court),cols=hoopsColliders(court,C.court),P=C.physics,R=C.rules,A=C.anim;
 const prof=R.profiles[profile]||R.profiles.standard,diff=C.ai.difficulty[difficulty]||C.ai.difficulty.normal;
 let rng,S,seq=0,queue=[],history=[],disposed=false;
 const rand=()=>rng.next();

 function emit(e){const ev={seq:++seq,tick:S.tick,time:S.tick*HOOPS_DT,...e};queue.push(ev);return ev;}

 function makePlayer(card,team,slot){
  return {id:card.id,team,slot,pos:card.pos,name:card.name,number:card.number,look:card.look||{},r:{...card.ratings},
   x:0,z:0,vx:0,vz:0,y:0,face:0,energy:card.energy??1,fouls:0,onCourt:true,
   act:null,actT:0,act2:null,shot:null,air:-1,airDur:0,jumpH:0,stumble:0,cd:{steal:0,jump:0,move:0,pickup:0},
   intent:{x:0,z:0,speed:0,face:null,sprint:false},think:0,paintT:0,role:null,
   stats:{pts:0,fgm:0,fga:0,tpm:0,tpa:0,ftm:0,fta:0,reb:0,oreb:0,ast:0,stl:0,blk:0,tov:0,pf:0,sec:0}};
 }

 function reset(newSeed){
  rng=mulberry32(newSeed>>>0);seq=0;queue=[];history=[];
  const T=teams.map((t,i)=>({index:i,id:t.id,name:t.name,colors:t.colors,tactics:{offense:t.tactics?.offense||'motion',defense:t.tactics?.defense||'man',pace:t.tactics?.pace??0.5},
   roster:t.players.map((card,k)=>makePlayer(card,i,k)),score:0,fouls:0,timeouts:R.timeouts,bonus:false,call:null,callT:0}));
  for(const t of T){
   const lineup=teams[t.index].lineup||t.roster.slice(0,5).map(p=>p.id);
   for(const p of t.roster)p.onCourt=lineup.includes(p.id);
   t.lineup=lineup.slice(0,5);
  }
  S={seed:newSeed>>>0,tick:0,mode,profile,phase:'pregame',phaseT:0,quarter:1,clock:prof.quarterSeconds,shotClock:R.shotClock,shotClockOn:true,
   teams:T,dir:[1,-1],possession:0,userTeam,controlled:null,
   ball:{x:0,y:1,z:0,vx:0,vy:0,vz:0,state:'dead',owner:null,hand:1,shot:null,pass:null,lastTouch:0,touchedRim:false,dribbleT:0},
   frontcourtSet:false,backcourtT:0,inbound:null,ft:null,lastScore:null,result:null,overtime:0,nextShotId:1,
   pending:null,deadT:0,arrow:1,replayMark:null,assist:clamp(assist,0,1),stoppage:null,lastFoul:null,lastViolation:null,autopilot};
  startJumpBall();
 }

 // ---------- helpers ----------
 const team=i=>S.teams[i];
 const onCourt=i=>team(i).roster.filter(p=>p.onCourt);
 const all=()=>[...onCourt(0),...onCourt(1)];
 const byId=id=>{for(const t of S.teams)for(const p of t.roster)if(p.id===id)return p;return null;};
 const side=i=>S.dir[i];
 const holder=()=>S.ball.state==='held'?byId(S.ball.owner):null;
 const dist=(a,b)=>hyp(a.x-b.x,a.z-b.z);
 function nearestTo(list,pt,exclude){let best=null,bd=1e9;for(const p of list){if(p===exclude)continue;const d=hyp(p.x-pt.x,p.z-pt.z);if(d<bd){bd=d;best=p;}}return best;}

 function setControlled(p){if(!p||p.team!==S.userTeam)return;if(S.controlled!==p.id){S.controlled=p.id;emit({type:'control',playerId:p.id});}}
 function autoControl(){
  const h=holder();
  if(h&&h.team===S.userTeam){setControlled(h);return;}
  const me=byId(S.controlled);
  if(!me||!me.onCourt){const b=S.ball;setControlled(nearestTo(onCourt(S.userTeam),b));}
 }

 function giveBall(p,reason){
  const b=S.ball,prevTeam=b.lastTouch,wasLoose=b.state!=='held';
  b.state='held';b.owner=p.id;b.shot=null;b.pass=null;b.vx=b.vy=b.vz=0;b.lastTouch=p.team;b.dribbleT=0;
  p.cd.pickup=0;
  if(reason==='rebound'||reason==='interception'){S.frontcourtSet=court.frontcourt(side(p.team),p.x);S.backcourtT=0;}
  if(S.possession!==p.team){
   S.possession=p.team;S.frontcourtSet=court.frontcourt(side(p.team),p.x);S.backcourtT=0;
   if(reason!=='inbound-ready'){S.shotClock=R.shotClock;S.shotClockOn=true;}
  }
  emit({type:'possession',playerId:p.id,team:p.team,reason});
  autoControl();
 }

 function ballLoose(vx,vy,vz,touchTeam){
  const b=S.ball;b.state='loose';b.owner=null;b.vx=vx;b.vy=vy;b.vz=vz;if(touchTeam!=null)b.lastTouch=touchTeam;b.shot=null;b.pass=null;
 }

 function placeFormation(){
  // jump ball: centres in the circle, the rest spread in their own half
  const spots=[[0.55,0],[3.2,-4.2],[3.2,4.2],[5.8,-2],[6.6,2.6]],order=['C','PF','SF','SG','PG'];
  for(const t of [0,1]){
   const list=onCourt(t).slice().sort((a,b)=>order.indexOf(a.pos)-order.indexOf(b.pos)),s=side(t);
   list.forEach((p,k)=>{const [u,v]=spots[k];p.x=-s*u;p.z=t?-v:v;p.vx=p.vz=0;p.face=s>0?Math.PI/2:-Math.PI/2;resetAct(p);});
  }
 }

 function resetAct(p){p.act=null;p.actT=0;p.shot=null;p.air=-1;p.y=0;p.stumble=0;}

 // ---------- phases ----------
 function startJumpBall(){
  S.phase='jumpball';S.phaseT=0;placeFormation();
  const b=S.ball;b.state='toss';b.owner=null;b.x=0;b.z=0;b.y=2.2;b.vx=b.vz=0;b.vy=4.6;
  S.controlled=null;autoControl();
  emit({type:'jumpBall',quarter:S.quarter});
 }

 function startInbound(teamIdx,spot,reason){
  S.phase='inbound';S.phaseT=0;S.ball.state='dead';S.ball.owner=null;S.ball.shot=null;S.ball.pass=null;
  const s=side(teamIdx),list=onCourt(teamIdx);
  // inbounder: prefer a non-PG
  const pg=list.find(p=>p.pos==='PG')||list[0];
  const inb=list.find(p=>p!==pg&&p.pos!=='C')||list.find(p=>p!==pg)||pg;
  S.inbound={team:teamIdx,inbounder:inb.id,receiver:pg.id,spot:{...spot},reason,delay:R.inboundDelay};
  inb.x=spot.x;inb.z=spot.z;inb.vx=inb.vz=0;resetAct(inb);
  inb.face=Math.atan2(-spot.x*0.2,-spot.z*0.2||(s>0?1:-1));
  const b=S.ball;b.x=inb.x;b.z=inb.z;b.y=1.1;
  S.possession=teamIdx;S.shotClock=reason==='side-14'?Math.max(S.shotClock,R.shotClockReset):(reason==='keep'?S.shotClock:R.shotClock);
  S.shotClockOn=true;S.frontcourtSet=court.frontcourt(s,spot.x)&&reason!=='score';S.backcourtT=0;
  emit({type:'inbound',team:teamIdx,reason,x:spot.x,z:spot.z});
  maybeSubstitute();
  autoControl();
  setControlled(byId(pg.id));
 }

 function deadBall(next,delay){S.phase='dead';S.phaseT=0;S.pending={next,delay};}

 function afterScore(scoringTeam){
  const other=1-scoringTeam,s=side(other);
  // inbound from under the basket the scoring team attacked (= the other team's own baseline)
  const spot={x:-s*(court.hx+0.4),z:-1.2};
  deadBall(()=>startInbound(other,spot,'score'),C.timing.afterScore);
 }

 function startFreeThrows(shooter,count,andOne){
  S.phase='freethrow';S.phaseT=0;S.ball.state='dead';S.ball.owner=shooter.id;S.ball.shot=null;S.ball.pass=null;
  S.ft={shooter:shooter.id,team:shooter.team,left:count,total:count,andOne:!!andOne,state:'setup',t:0};
  const s=side(shooter.team),spot=court.ftSpot(s);
  shooter.x=spot.x;shooter.z=spot.z;shooter.vx=shooter.vz=0;resetAct(shooter);shooter.face=s>0?Math.PI/2:-Math.PI/2;
  // lane spots
  const lane=[[1.2,2.5],[1.2,-2.5],[2.5,2.5],[2.5,-2.5],[3.8,2.5],[3.8,-2.5],[-2.0,4.0],[-2.0,-4.0],[-1.0,6.5]];
  let k=0;
  const defenders=onCourt(1-shooter.team),mates=onCourt(shooter.team).filter(p=>p!==shooter);
  const order=[...defenders.slice(0,2),...mates.slice(0,2),...defenders.slice(2,3),...mates.slice(2,3),...defenders.slice(3),...mates.slice(3)];
  for(const p of order){const [u,v]=lane[k++%lane.length];p.x=s*(court.rimX-u-0.4);p.z=v;p.vx=p.vz=0;resetAct(p);p.face=Math.atan2(s*court.rimX-p.x,-p.z);}
  S.ball.x=shooter.x;S.ball.z=shooter.z;S.ball.y=1.0;
  maybeSubstitute(true);
  setControlled(shooter.team===S.userTeam?shooter:byId(S.controlled));
  emit({type:'freeThrows',playerId:shooter.id,count});
 }

 function endQuarter(){
  emit({type:'quarterEnd',quarter:S.quarter,score:[team(0).score,team(1).score]});
  const regulation=4;
  if(S.quarter>=regulation&&team(0).score!==team(1).score){finish();return;}
  S.quarter++;
  if(S.quarter>regulation)S.overtime++;
  S.clock=S.quarter>regulation?prof.overtimeSeconds:prof.quarterSeconds;
  for(const t of S.teams)t.fouls=0,t.bonus=false;
  if(S.quarter===3){S.dir=[-1,1];}
  for(const t of S.teams)for(const p of t.roster)p.energy=Math.min(1,p.energy+C.fatigue.breakRecover);
  S.phase='break';S.phaseT=0;
  maybeSubstitute(true);
  const breakTime=C.timing.quarterBreak;
  S.pending={next:()=>{
   if(S.quarter===1||S.quarter>4&&S.quarter===5){startJumpBall();return;}
   // possession arrow alternates for the start of quarters 2-4
   const t=S.arrow;S.arrow=1-S.arrow;const s=side(t);startInbound(t,{x:-s*0.4,z:-(court.hz+0.4)},'quarter');
  },delay:breakTime};
 }

 function finish(){
  S.phase='final';S.phaseT=0;
  const sc=[team(0).score,team(1).score],won=sc[S.userTeam]>sc[1-S.userTeam];
  const box=S.teams.map(t=>t.roster.map(p=>({id:p.id,name:p.name,number:p.number,pos:p.pos,...p.stats,sec:Math.round(p.stats.sec)})));
  const mvp=[...box[S.userTeam]].sort((a,b)=>(b.pts+b.reb+b.ast*1.5+b.stl*2+b.blk*2)-(a.pts+a.reb+a.ast*1.5+a.stl*2+a.blk*2))[0];
  S.result={won,score:sc,userTeam:S.userTeam,quarters:S.quarter,overtime:S.overtime,profile,box,mvp:mvp?.id||null,seed:S.seed,
   teams:S.teams.map(t=>t.id),energy:S.teams.map(t=>t.roster.map(p=>({id:p.id,energy:+p.energy.toFixed(3)})))};
  emit({type:'final',score:sc,won});
 }

 // ---------- fouls & violations ----------
 function stopClockFor(reason){S.stoppage=reason;}

 function foul(offender,victim,kind,shooting){
  offender.fouls++;offender.stats.pf++;
  const ot=team(offender.team);
  const isDefensive=offender.team!==S.possession||kind==='shooting'||kind==='block';
  if(kind!=='offensive')ot.fouls++;
  const bonus=ot.fouls>=R.teamFoulBonus;
  S.lastFoul={offender:offender.id,victim:victim?.id,kind,team:offender.team};
  emit({type:'foul',playerId:offender.id,victimId:victim?.id||null,kind,personal:offender.fouls,teamFouls:ot.fouls,bonus});
  if(offender.fouls>=R.personalFoulLimit)emit({type:'foulOut',playerId:offender.id});
  if(kind==='offensive'){
   const t=1-offender.team,s=side(t);
   const h=holder();if(h)h.stats.tov++;
   deadBall(()=>startInbound(t,sidelineSpot(offender.x,t),'turnover'),C.timing.afterFoul);return;
  }
  if(shooting){deadBall(()=>startFreeThrows(victim,shooting.count,shooting.andOne),C.timing.afterFoul);return;}
  if(bonus){deadBall(()=>startFreeThrows(victim,2,false),C.timing.afterFoul);return;}
  const t=victim?victim.team:1-offender.team;
  const spot=sidelineSpot(victim?victim.x:offender.x,t);
  const s=side(t);
  const reason=court.frontcourt(s,spot.x)&&S.shotClock<R.shotClockReset?'side-14':'keep';
  deadBall(()=>startInbound(t,spot,reason),C.timing.afterFoul);
 }

 function sidelineSpot(x,t){
  const s=side(t),lim=court.hx-1.5,sx=clamp(x,-lim,lim);
  return {x:sx,z:(court.hz+0.4)*(sx*s>0?-1:1)*(S.tick%2?1:-1)};
 }

 function violation(kind,teamIdx,x){
  const h=holder();if(h)h.stats.tov++;
  S.lastViolation={kind,team:teamIdx};
  emit({type:'violation',kind,team:teamIdx});
  const t=1-teamIdx;
  deadBall(()=>startInbound(t,kind==='shotclock'?{x:-side(t)*(court.hx+0.4),z:2}:sidelineSpot(x??0,t),'turnover'),C.timing.afterViolation);
 }

 // ---------- substitutions ----------
 function maybeSubstitute(force){
  for(const t of S.teams){
   // the child's bench is the child's call, except a fouled-out player always leaves
   const manual=t.index===S.userTeam&&!S.autoSubUser&&!force;
   const court5=t.roster.filter(p=>p.onCourt);
   for(const p of court5){
    const fouledOut=p.fouls>=R.personalFoulLimit;
    const tired=p.energy<C.fatigue.subBelow&&!manual;
    if(!fouledOut&&!tired)continue;
    const bench=t.roster.filter(q=>!q.onCourt&&q.fouls<R.personalFoulLimit&&q.energy>C.fatigue.readyAbove);
    if(!bench.length)continue;
    bench.sort((a,b)=>(b.pos===p.pos)-(a.pos===p.pos)||b.energy-a.energy);
    const q=bench[0];
    if(S.ball.owner===p.id&&S.phase!=='freethrow')continue;
    if(S.ft&&S.ft.shooter===p.id)continue;
    q.x=p.x;q.z=p.z;q.face=p.face;q.vx=q.vz=0;resetAct(q);p.onCourt=false;q.onCourt=true;resetAct(p);
    t.lineup=t.lineup.map(id=>id===p.id?q.id:id);
    if(S.controlled===p.id)S.controlled=q.team===S.userTeam?q.id:S.controlled;
    if(S.inbound){if(S.inbound.inbounder===p.id)S.inbound.inbounder=q.id;if(S.inbound.receiver===p.id)S.inbound.receiver=q.id;}
    emit({type:'sub',team:t.index,out:p.id,in:q.id,reason:fouledOut?'fouls':'fatigue'});
   }
  }
 }

 function substitute(teamIdx,outId,inId){
  if(!['dead','inbound','break','timeout','freethrow'].includes(S.phase))return {ok:false,reason:'live'};
  const t=team(teamIdx),p=byId(outId),q=byId(inId);
  if(!p||!q||!p.onCourt||q.onCourt||p.team!==teamIdx||q.team!==teamIdx||q.fouls>=R.personalFoulLimit)return {ok:false,reason:'invalid'};
  if(S.ball.owner===p.id&&S.phase!=='dead')return {ok:false,reason:'ball'};
  q.x=p.x;q.z=p.z;q.face=p.face;resetAct(q);p.onCourt=false;q.onCourt=true;
  t.lineup=t.lineup.map(id=>id===p.id?q.id:id);
  if(S.controlled===p.id)S.controlled=q.id;
  if(S.inbound){if(S.inbound.inbounder===p.id)S.inbound.inbounder=q.id;if(S.inbound.receiver===p.id)S.inbound.receiver=q.id;}
  emit({type:'sub',team:teamIdx,out:p.id,in:q.id,reason:'manual'});
  return {ok:true};
 }

 function timeout(teamIdx){
  const t=team(teamIdx);
  const ok=t.timeouts>0&&(['dead','inbound','break','freethrow'].includes(S.phase)||(S.phase==='live'&&S.possession===teamIdx&&S.ball.state==='held'));
  if(!ok)return {ok:false};
  t.timeouts--;
  const resume=S.phase==='live'?(()=>{const h=holder();const spot=sidelineSpot(h?h.x:0,teamIdx);startInbound(teamIdx,spot,'keep');}):S.pending?.next||(()=>{});
  S.phase='timeout';S.phaseT=0;S.pending={next:resume,delay:C.timing.timeout};
  for(const tt of S.teams)for(const p of tt.roster)p.energy=Math.min(1,p.energy+C.fatigue.timeoutRecover);
  emit({type:'timeout',team:teamIdx,left:t.timeouts});
  maybeSubstitute(true);
  return {ok:true};
 }

 // ---------- actions ----------
 function startShot(p,human){
  if(p.act||p.air>=0||S.ball.owner!==p.id||S.ball.state!=='held')return false;
  const s=side(p.team),rim=court.rim(s),d=court.distToRim(s,p.x,p.z),speed=hyp(p.vx,p.vz);
  const toRim={x:(rim.x-p.x)/Math.max(d,1e-3),z:(rim.z-p.z)/Math.max(d,1e-3)};
  const driving=(p.vx*toRim.x+p.vz*toRim.z)>2.2;
  let type='jumpshot';
  if(d<C.shot.dunkRange&&driving&&p.r.dunk>=C.shot.dunkMinRating&&p.energy>C.shot.dunkEnergy)type='dunk';
  else if(d<C.shot.layupRange&&(driving||d<1.6))type='layup';
  else if(speed>1.6)type='pullup';
  const meta=A[type==='dunk'?'layup':type];
  p.act='shoot';p.actT=0;p.shot={type,human:!!human,held:human,releaseAt:meta.release*(type==='dunk'?0.92:1),duration:meta.duration,quality:null,released:false,
   gatherX:p.x,gatherZ:p.z,toRim,drive:driving?Math.min(speed,C.shot.layupCarry):0,contact:null};
  p.face=Math.atan2(toRim.x,toRim.z);
  emit({type:'shotStart',playerId:p.id,shotType:type});
  return true;
 }

 function releaseQuality(p){
  const sh=p.shot;
  if(sh.quality!=null)return sh.quality;
  // AI: rating-based timing with difficulty noise; human without release = slightly late
  if(!sh.human){const sk=eff(p,'release')*diff.aiTiming;return clamp(1-Math.abs(rand()-0.5)*(1.2-sk),0,1);}
  return 0.55;
 }

 function contestOf(p){
  const s=side(p.team),rim=court.rim(s);let best=0,who=null;
  for(const d of onCourt(1-p.team)){
   const dd=dist(d,p);if(dd>3)continue;
   // between shooter and rim?
   const ax=rim.x-p.x,az=rim.z-p.z,al=hyp(ax,az)||1,dot=((d.x-p.x)*ax+(d.z-p.z)*az)/al;
   const front=dot>-0.3?1:0.45;
   const height=(d.r.height||200)/200,jump=d.air>=0?1.25:1;
   const c=clamp((1.8-dd)/1.5,0,1)*front*height*jump*(0.6+0.4*eff(d,'perimD'));
   if(c>best){best=c;who=d;}
  }
  return {value:clamp(best,0,1),defender:who};
 }

 function makeChance(p,type,points,quality,contest){
  const s=side(p.team),d=court.distToRim(s,p.x,p.z);
  let skill;
  if(type==='dunk')skill=0.55+0.4*eff(p,'dunk');
  else if(type==='layup')skill=eff(p,'inside');
  else if(type==='ft')skill=eff(p,'ft');
  else if(points===3)skill=eff(p,'three');
  else skill=d<4.5?(eff(p,'inside')*0.4+eff(p,'mid')*0.6):eff(p,'mid');
  const base=type==='dunk'?0.93:type==='layup'?0.68:type==='ft'?0.74:points===3?0.38:clamp(0.62-0.035*d,0.4,0.58);
  let pr=base*(0.55+0.65*skill);
  if(type!=='ft'){pr*=1-C.shot.contestWeight*contest*(type==='dunk'?0.4:1);if(type==='pullup')pr*=C.shot.pullupFactor;}
  // timing: perfect release adds, bad release removes (a human's skill matters most)
  pr*=C.shot.timingBase+C.shot.timingWeight*quality;
  pr+=S.assist*C.shot.assistBonus*(p.team===S.userTeam?1:0);
  return clamp(pr,0.02,type==='dunk'?0.98:0.95);
 }

 function release(p){
  const sh=p.shot,s=side(p.team),rim=court.rim(s);
  const points=sh.type==='ft'?1:court.points(s,sh.gatherX,sh.gatherZ);
  const quality=releaseQuality(p);sh.quality=quality;
  const contest=sh.type==='ft'?{value:0,defender:null}:contestOf(p);
  const pr=makeChance(p,sh.type,points,quality,contest.value);
  const make=rand()<pr;
  const height=(p.r.height||200)/100;
  const relY=sh.type==='dunk'?rim.y+0.45:sh.type==='layup'?Math.max(2.9,height+0.85+p.jumpH):height+0.55+p.jumpH;
  const from={x:p.x+Math.sin(p.face)*0.3,y:relY,z:p.z+Math.cos(p.face)*0.3};
  let target={x:rim.x,y:rim.y,z:rim.z},angle;
  const dd=hyp(from.x-rim.x,from.z-rim.z);
  if(make){
   const e=C.shot.makeError*(1-quality*0.5);
   target={x:rim.x+(rand()-0.5)*e,y:rim.y,z:rim.z+(rand()-0.5)*e};
  } else {
   // a believable miss: front rim, back rim, side, or off the glass
   const k=rand(),off=0.2+rand()*0.16,ang=rand()*Math.PI*2;
   const ux=(rim.x-from.x)/Math.max(dd,1e-3),uz=(rim.z-from.z)/Math.max(dd,1e-3);
   if(k<0.35){target={x:rim.x-ux*off,y:rim.y,z:rim.z-uz*off};}            // short
   else if(k<0.7){target={x:rim.x+ux*off,y:rim.y,z:rim.z+uz*off};}       // long
   else {target={x:rim.x+Math.cos(ang)*off*0.7,y:rim.y,z:rim.z+Math.sin(ang)*off*1.1};}
  }
  angle=sh.type==='dunk'?20:sh.type==='layup'?58:sh.type==='ft'?52:clamp(48+dd*0.6,48,56);
  const b=S.ball;
  if(sh.type==='dunk'&&make){
   b.x=rim.x+(p.x-rim.x)*0.15;b.z=rim.z+(p.z-rim.z)*0.15;b.y=rim.y+0.35;b.vx=0;b.vz=0;b.vy=-4.5;
  } else {
   const v=launch(from,{...target,y:target.y+0.02},angle,P.gravity);
   b.x=from.x;b.y=from.y;b.z=from.z;b.vx=v.vx;b.vy=v.vy;b.vz=v.vz;
  }
  b.state='shot';b.owner=null;b.touchedRim=false;b.lastTouch=p.team;
  const id=S.nextShotId++;
  b.shot={id,shooter:p.id,team:p.team,points,type:sh.type,intended:make,pr,quality,contest:contest.value,side:s,blocked:false,scored:false,clockAtRelease:S.clock,gameOver:false,foul:sh.contact};
  sh.released=true;
  if(sh.type!=='ft'){p.stats.fga++;if(points===3)p.stats.tpa++;}else p.stats.fta++;
  S.shotClockOn=false;
  emit({type:'release',playerId:p.id,shotId:id,shotType:sh.type,points,quality:+quality.toFixed(3),chance:+pr.toFixed(3),contest:+contest.value.toFixed(3),x:+p.x.toFixed(2),z:+p.z.toFixed(2)});
  S.replayMark={tick:S.tick,shotId:id};
 }

 function choosePassTarget(p,dir){
  const mates=onCourt(p.team).filter(q=>q!==p);
  let best=null,bs=-1e9;
  for(const q of mates){
   const dx=q.x-p.x,dz=q.z-p.z,dd=hyp(dx,dz)||1;
   let score=-dd*0.08;
   if(dir&&(dir.x||dir.z)){const dl=hyp(dir.x,dir.z)||1;score+=((dx*dir.x+dz*dir.z)/(dd*dl))*3;}
   const open=Math.min(...onCourt(1-p.team).map(o=>dist(o,q)));score+=Math.min(open,3)*0.5;
   if(score>bs){bs=score;best=q;}
  }
  return best;
 }

 function startPass(p,target,kind){
  if(p.act||S.ball.owner!==p.id||S.ball.state!=='held'||!target)return false;
  p.act='pass';p.actT=0;p.act2={target:target.id,kind:kind||(dist(p,target)>9?'lob':'chest')};
  p.face=Math.atan2(target.x-p.x,target.z-p.z);
  emit({type:'passStart',playerId:p.id,targetId:target.id});
  return true;
 }

 function throwPass(p){
  const q=byId(p.act2.target);if(!q||!q.onCourt){p.act=null;return;}
  const kind=p.act2.kind,speed=kind==='lob'?C.pass.lobSpeed:kind==='bounce'?C.pass.bounceSpeed:C.pass.speed;
  const lead=0.35;
  const to={x:q.x+q.vx*lead,y:1.25,z:q.z+q.vz*lead};
  const from={x:p.x+Math.sin(p.face)*0.35,y:1.3,z:p.z+Math.cos(p.face)*0.35};
  const d=hyp(to.x-from.x,to.z-from.z),time=Math.max(0.22,d/speed)+(kind==='lob'?0.35:0);
  const v=passVelocity(from,to,time,P.gravity);
  const b=S.ball;b.x=from.x;b.y=from.y;b.z=from.z;b.vx=v.vx;b.vy=v.vy;b.vz=v.vz;b.state='pass';b.owner=null;b.lastTouch=p.team;
  b.pass={from:p.id,to:q.id,t:0,time,kind,target:to,checked:new Set()};
  q.intent.catchAt={x:to.x,z:to.z};
  emit({type:'pass',playerId:p.id,targetId:q.id,kind});
 }

 function startJump(p,kind){
  if(p.air>=0||p.act==='shoot'||p.cd.jump>0)return false;
  const v=eff(p,'vertical');
  p.air=0;p.airDur=C.jump.duration*(0.85+0.3*v);p.jumpH=0;p.jumpMax=C.jump.height*(0.6+0.6*v);p.act=p.act||kind;p.actT=0;p.jumpKind=kind;
  p.cd.jump=C.jump.cooldown;
  emit({type:'jump',playerId:p.id,kind});
  return true;
 }

 function startSteal(p){
  if(p.act||p.cd.steal>0||p.air>=0)return false;
  p.act='steal';p.actT=0;p.cd.steal=C.steal.cooldown;
  emit({type:'stealTry',playerId:p.id});
  return true;
 }

 function resolveSteal(p){
  const h=holder();
  if(!h||h.team===p.team)return;
  const d=dist(p,h);
  if(d>C.steal.range)return;
  const toP={x:(p.x-h.x)/d,z:(p.z-h.z)/d},hf={x:Math.sin(h.face),z:Math.cos(h.face)};
  const frontal=toP.x*hf.x+toP.z*hf.z;            // defender in front of the handler
  let chance=C.steal.base*(0.5+eff(p,'steal'))*(1.25-eff(h,'handle'))*(h.act==='shoot'?1.4:1);
  chance*=frontal>-0.2?1:0.55;
  if(h.act==='cross'||h.act==='spin')chance*=0.4;
  if(rand()<chance){
   p.stats.stl++;h.stats.tov++;
   emit({type:'steal',playerId:p.id,fromId:h.id});
   const b=S.ball;b.x=h.x+toP.x*0.4;b.z=h.z+toP.z*0.4;b.y=0.9;
   ballLoose(toP.x*2.2+(rand()-0.5),1.2,toP.z*2.2+(rand()-0.5),p.team);
   h.stumble=0.25;return;
  }
  const foulChance=C.steal.foulBase*(frontal<-0.2?2.2:1)*(1.3-eff(p,'steal'))*(d<0.75?1.6:1);
  if(rand()<foulChance)foul(p,h,'reach',null);
 }

 function startMove(p){
  if(p.act||p.cd.move>0||S.ball.owner!==p.id)return false;
  const spin=hyp(p.vx,p.vz)>3&&p.r.handle>70&&(S.tick%3===0);
  p.act=spin?'spin':'cross';p.actT=0;p.cd.move=C.move.cooldown;
  emit({type:'move',playerId:p.id,kind:p.act});
  return true;
 }

 // ---------- per-tick ----------
 function humanInput(p,inp){
  const m=inp.move||{x:0,z:0},ml=hyp(m.x,m.z);
  p.intent.x=ml>0.05?m.x/Math.max(1,ml):0;p.intent.z=ml>0.05?m.z/Math.max(1,ml):0;p.intent.speed=Math.min(1,ml);
  p.intent.sprint=!!inp.sprint;p.intent.face=null;
  const offense=S.possession===p.team&&S.ball.state!=='loose';
  const hasBall=S.ball.owner===p.id&&S.ball.state==='held';
  if(hasBall){
   if(inp.shootDown)startShot(p,true);
   if(inp.passPress)startPass(p,choosePassTarget(p,inp.passDir||(ml>0.2?{x:m.x,z:m.z}:null)),null);
   if(inp.altPress)startMove(p);
  } else if(!offense||S.ball.state==='loose'||S.ball.state==='shot'){
   if(inp.shootDown)startJump(p,S.ball.state==='shot'||S.ball.state==='loose'?'rebound':'block');
   if(inp.passPress)startSteal(p);
  } else {
   // off-ball offense: pass button asks for the ball, shoot button jumps (alley/oop is not modelled)
   if(inp.passPress){const h=holder();if(h&&h.team===p.team&&h.id!==p.id)h.intent.wantPass=p.id;}
   if(inp.shootDown)startJump(p,'rebound');
  }
  if(p.act==='shoot'&&p.shot&&p.shot.human&&!p.shot.released&&inp.shootUp&&p.shot.quality==null){
   const t=p.actT,ideal=p.shot.releaseAt,w=C.shot.window;
   const e=Math.abs(t-ideal);p.shot.quality=clamp(1-e/w,0,1);p.shot.early=t<ideal;
   emit({type:'timing',playerId:p.id,quality:+p.shot.quality.toFixed(3),early:t<ideal});
  }
  if((inp.switchPress||inp.altPress)&&!hasBall){
   const list=onCourt(p.team).filter(q=>q!==p).sort((a,b)=>dist(a,S.ball)-dist(b,S.ball));
   if(list[0])setControlled(list[0]);
  }
  if(inp.timeoutPress)timeout(p.team);
  if(inp.call==='defense'){const t=team(p.team);t.tactics.defense=t.tactics.defense==='zone'?'man':'zone';emit({type:'tactics',team:p.team,defense:t.tactics.defense});}
  else if(inp.call){team(p.team).call=inp.call;team(p.team).callT=0;team(p.team).tactics.offense=inp.call;emit({type:'playCall',team:p.team,play:inp.call});}
 }

 function movePlayers(dt){
  for(const p of all()){
   const it=p.intent;let tx=it.x*it.speed,tz=it.z*it.speed;
   const maxS=C.player.speed*(0.72+0.38*eff(p,'speed'))*(it.sprint&&p.energy>0.08?C.player.sprintFactor:1)*(S.ball.owner===p.id?C.player.dribbleFactor:1);
   if(p.act==='shoot'){
    const sh=p.shot;
    if(sh.type==='layup'||sh.type==='dunk'){const near=court.distToRim(side(p.team),p.x,p.z);const k=(p.actT<sh.releaseAt?1:0.4)*clamp((near-0.9)/0.8,0,1);tx=sh.toRim.x*sh.drive*k/maxS;tz=sh.toRim.z*sh.drive*k/maxS;}
    else{tx=0;tz=0;}
   }
   if(p.act==='pass'||p.act==='steal'){tx*=0.5;tz*=0.5;}
   if(p.stumble>0){tx*=0.2;tz*=0.2;}
   if(p.air>=0&&p.act!=='shoot'){tx*=0.15;tz*=0.15;}
   let wantVx=tx*maxS,wantVz=tz*maxS;
   if(p.act==='cross'||p.act==='spin'){const burst=C.move.burst*(p.act==='spin'?1.1:1);const l=hyp(p.vx,p.vz)||1;wantVx=p.vx/l*maxS*burst*(p.actT<0.3?0.7:1.15);wantVz=p.vz/l*maxS*burst*(p.actT<0.3?0.7:1.15);if(p.actT<0.3&&p.act==='cross'){const sideX=-p.vz/l,sideZ=p.vx/l,sgn=(S.tick>>4)%2?1:-1;wantVx+=sideX*1.8*sgn;wantVz+=sideZ*1.8*sgn;}}
   const acc=(hyp(wantVx,wantVz)>hyp(p.vx,p.vz)?C.player.accel:C.player.decel)*(0.75+0.35*eff(p,'speed'));
   const dvx=wantVx-p.vx,dvz=wantVz-p.vz,dl=hyp(dvx,dvz),step=acc*dt;
   if(dl<=step){p.vx=wantVx;p.vz=wantVz;}else{p.vx+=dvx/dl*step;p.vz+=dvz/dl*step;}
   p.x+=p.vx*dt;p.z+=p.vz*dt;
   // facing: towards movement, or the intent's facing (defence faces the man / ball)
   const sp=hyp(p.vx,p.vz);
   let fx=null;
   if(it.face!=null&&p.act!=='shoot')fx=it.face;
   else if(sp>0.6&&p.act!=='shoot')fx=Math.atan2(p.vx,p.vz);
   if(fx!=null){let d=((fx-p.face+Math.PI*3)%(Math.PI*2))-Math.PI;p.face+=clamp(d,-C.player.turnRate*dt,C.player.turnRate*dt);}
   // fatigue
   const load=(sp/C.player.speed)**2*(it.sprint?C.fatigue.sprint:1);
   p.energy=clamp(p.energy-(C.fatigue.drain*load-C.fatigue.recover*(1-Math.min(1,sp/2)))*dt,0,1);
   p.stats.sec+=dt;
   if(p.stumble>0)p.stumble=Math.max(0,p.stumble-dt);
   for(const k in p.cd)p.cd[k]=Math.max(0,p.cd[k]-dt);
  }
  // body separation (no overlapping players); defenders that hold their spot stop drivers
  const list=all();
  for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++){
   const a=list[i],b=list[j],dx=b.x-a.x,dz=b.z-a.z,d=hyp(dx,dz),min=C.player.radius*2;
   if(d<min&&d>1e-6){
    const push=(min-d)/2,ux=dx/d,uz=dz/d;
    const wa=a.air>=0?0.3:1,wb=b.air>=0?0.3:1;
    a.x-=ux*push*wa;a.z-=uz*push*wa;b.x+=ux*push*wb;b.z+=uz*push*wb;
    contact(a,b,d);
   }
  }
  for(const p of list){p.x=clamp(p.x,-court.hx-1.2,court.hx+1.2);p.z=clamp(p.z,-court.hz-1.2,court.hz+1.2);}
 }

 function contact(a,b,d){
  if(S.phase!=='live')return;
  const h=holder();if(!h||(a!==h&&b!==h))return;
  const def=a===h?b:a;if(def.team===h.team)return;
  const rel=hyp(h.vx-def.vx,h.vz-def.vz);if(rel<C.contact.minSpeed)return;
  if((h.contactCd||0)>S.tick)return;h.contactCd=S.tick+40;
  // charge: the defender was set (slow) and in the handler's path; block: the defender was still moving in
  const hv=hyp(h.vx,h.vz)||1,toD={x:(def.x-h.x)/d,z:(def.z-h.z)/d},inPath=(h.vx*toD.x+h.vz*toD.z)/hv;
  const defMoving=hyp(def.vx,def.vz);
  if(inPath<0.5)return;
  const restricted=court.distToRim(side(h.team),def.x,def.z)<court.restrictedR;
  if(defMoving<C.contact.setSpeed&&!restricted){if(rand()<C.contact.chargeChance*(0.5+eff(def,'perimD')))foul(h,def,'offensive',null);}
  else if(rand()<C.contact.blockChance){
   const shooting=h.act==='shoot'&&!h.shot?.released?{count:court.points(side(h.team),h.x,h.z),andOne:false}:null;
   foul(def,h,'block',shooting);
  }
 }

 function updateActs(dt,inp){
  for(const p of all()){
   if(p.air>=0){
    p.air+=dt;const u=p.air/p.airDur;p.jumpH=u<1?4*p.jumpMax*u*(1-u):0;
    if(u>=1){p.air=-1;p.jumpH=0;if(p.act==='block'||p.act==='rebound'){p.act=null;}}
   }
   if(!p.act)continue;
   p.actT+=dt;
   if(p.act==='shoot'){
    const sh=p.shot;
    if(!sh.released){
     // shooters leave the floor shortly before release: the jump follows the clip
     const lift=sh.type==='ft'?0.08:sh.type==='layup'||sh.type==='dunk'?0.32:0.22;
     if(p.air<0&&p.actT>=sh.releaseAt-lift-0.12&&sh.type!=='ft'){p.air=0;p.airDur=C.jump.shotAir*(sh.type==='dunk'?1.35:sh.type==='layup'?1.2:1);p.jumpMax=sh.type==='dunk'?0.8:sh.type==='layup'?0.6:0.42;}
     if(p.actT>=sh.releaseAt){
      if(S.ball.owner===p.id&&S.ball.state==='held')release(p);else{p.act=null;p.shot=null;}
     }
     // contact during the shot from a defender who jumps into the shooter
     for(const d of onCourt(1-p.team)){if(!sh.contact&&d.air>=0&&dist(d,p)<C.contact.shotContact&&S.phase==='live'){if(rand()<C.contact.shootingFoul)sh.contact={by:d.id};}}
    }
    if(p.actT>=sh.duration){p.act=null;p.shot=null;}
   } else if(p.act==='pass'){
    if(p.actT>=C.pass.windup&&S.ball.owner===p.id&&S.ball.state==='held')throwPass(p);
    if(p.actT>=C.pass.windup+0.25)p.act=null;
   } else if(p.act==='steal'){
    if(p.actT>=C.steal.reachAt&&!p.act2)resolveSteal(p),p.act2=true;
    if(p.actT>=C.steal.duration){p.act=null;p.act2=null;}
   } else if(p.act==='cross'||p.act==='spin'){
    if(p.actT>=(p.act==='spin'?C.move.spin:C.move.cross)){p.act=null;}
   } else if(p.act==='freethrow'){
    // handled by the free-throw phase
   }
  }
 }

 function updateBall(dt){
  const b=S.ball;
  if(b.state==='held'){
   const h=holder();if(!h){b.state='loose';return;}
   b.dribbleT+=dt;
   b.x=h.x+Math.sin(h.face)*0.32;b.z=h.z+Math.cos(h.face)*0.32;b.y=h.act==='shoot'?1.6+h.jumpH:0.9;
   return;
  }
  if(b.state==='pass'){
   const ps=b.pass;ps.t+=dt;
   b.vy-=P.gravity*dt;b.x+=b.vx*dt;b.y+=b.vy*dt;b.z+=b.vz*dt;
   if(ps.kind==='bounce'&&b.y<court.ballR){b.y=court.ballR;b.vy=Math.abs(b.vy)*0.7;}
   // interception: defenders near the ball's path, ball at reachable height
   for(const d of onCourt(1-b.lastTouch)){
    if(ps.checked.has(d.id))continue;
    const dd=hyp(d.x-b.x,d.z-b.z);
    if(dd<C.pass.interceptRadius&&b.y<2.3+d.jumpH){
     ps.checked.add(d.id);
     const chance=C.pass.interceptBase*(0.4+eff(d,'steal'))*(ps.kind==='lob'?0.5:1);
     if(rand()<chance){const from=byId(ps.from);if(from)from.stats.tov++;d.stats.stl++;emit({type:'interception',playerId:d.id,fromId:ps.from});
      if(rand()<0.55){giveBall(d,'interception');}else{ballLoose(-b.vx*0.25+(rand()-0.5)*2,1.5,-b.vz*0.25+(rand()-0.5)*2,d.team);}return;}
    }
   }
   const q=byId(ps.to);
   if(q&&hyp(q.x-b.x,q.z-b.z)<C.pass.catchRadius&&b.y<2.4+q.jumpH&&ps.t>0.1){
    q.intent.catchAt=null;S.lastPasser={id:ps.from,tick:S.tick};giveBall(q,'pass');emit({type:'catch',playerId:q.id});return;
   }
   if(ps.t>ps.time+0.6){ballLoose(b.vx*0.3,0,b.vz*0.3,b.lastTouch);}
   return;
  }
  if(b.state==='toss'){
   b.vy-=P.gravity*dt;b.y+=b.vy*dt;
   if(b.vy<0&&b.y<3.0){
    // the jumpers tip it to a teammate
    const cs=all().filter(p=>hyp(p.x,p.z)<1.3);
    let win=cs[0];let bw=-1;for(const p of cs){const w=eff(p,'vertical')+(p.r.height||200)/240+rand()*0.5;if(w>bw){bw=w;win=p;}}
    const t=win?win.team:(rand()<0.5?0:1);
    const mate=onCourt(t).filter(p=>p!==win).sort((a,c)=>hyp(a.x,a.z)-hyp(c.x,c.z))[0];
    emit({type:'tip',team:t,playerId:win?.id});
    S.phase='live';S.phaseT=0;S.arrow=1-t;
    if(mate)giveBall(mate,'tip');
   }
   return;
  }
  if(b.state==='shot'||b.state==='loose'){
   const res=stepBall(b,dt,court,cols,P);
   for(const e of res.events){emit({type:'contact',what:e.type,speed:+e.speed.toFixed(2)});if(e.type==='rim'||e.type==='board')b.touchedRim=b.touchedRim||e.type==='rim';}
   if(res.touchedRim)b.touchedRim=true;
   const sh=b.shot;
   if(sh&&!sh.blocked){
    // blocks and goaltending
    for(const d of onCourt(1-sh.team)){
     if(d.air<0)continue;
     const reach=(d.r.height||200)/100*1.33+d.jumpH;
     const dd=hyp(d.x-b.x,d.z-b.z);
     if(dd<C.block.radius&&Math.abs(b.y-reach)<C.block.vertical){
      const rim=court.rim(sh.side),toRim=hyp(b.x-rim.x,b.z-rim.z);
      if(b.vy<0&&b.y>rim.y&&toRim<court.rimR+C.block.goaltendRadius){
       // goaltending: the basket counts
       sh.goaltend=d.id;emit({type:'goaltending',playerId:d.id});score(sh,true);return;
      }
      const chance=C.block.base*(0.4+eff(d,'block'))*(sh.type==='dunk'?0.35:1);
      if(rand()<chance){
       sh.blocked=true;d.stats.blk++;
       emit({type:'block',playerId:d.id,shooterId:sh.shooter});
       const ax=b.x-d.x,az=b.z-d.z,al=hyp(ax,az)||1;
       ballLoose(-b.vx*0.35+ax/al*2.5,Math.abs(b.vy)*0.2+0.5,-b.vz*0.35+az/al*2.5,d.team);
       const shooter=byId(sh.shooter);if(shooter&&sh.foul){const f=byId(sh.foul.by)||d;foul(f,shooter,'shooting',{count:sh.points,andOne:false});}
       return;
      }
     }
    }
   }
   for(const c of res.crossings){
    if(sh&&!sh.scored&&!sh.blocked&&c.side===sh.side){score(sh,false);return;}
    if(!sh&&b.state==='loose'){ // a tip-in from a loose ball
     const last=b.lastTouch,s=side(last);if(c.side===s){team(last).score+=2;emit({type:'score',team:last,points:2,kind:'tip'});afterScore(last);return;}
    }
   }
   if(b.state==='shot'&&sh){
    // the shot is over once the ball falls clearly below the ring or leaves the rim area
    const rim=court.rim(sh.side),near=hyp(b.x-rim.x,b.z-rim.z);
    sh.age=(sh.age||0)+dt;
    const below=b.vy<0&&b.y<rim.y-0.35,away=b.touchedRim&&near>0.9&&b.vy<0,timeout=sh.age>4.5;
    if(below||away||timeout){
     if(sh.foul&&!sh.foulDone){sh.foulDone=true;const shooter=byId(sh.shooter),f=byId(sh.foul.by);if(shooter&&f){foul(f,shooter,'shooting',{count:sh.points,andOne:false});return;}}
     if(sh.type==='ft'){b.state='loose';b.shot=null;afterFreeThrowMiss(sh);return;}
     b.state='loose';b.missShot=sh;b.shot=null;emit({type:'miss',shotId:sh.id,playerId:sh.shooter});
     if(S.clock<=0){endPeriodAfterShot();return;}
    }
   }
   // the ball goes out of bounds when it lands outside the lines
   if(b.state==='loose'&&b.y<court.ballR+0.05&&!court.inBounds(b.x,b.z)){
    const t=b.lastTouch;emit({type:'outOfBounds',team:t});violation('out',t,b.x);return;
   }
   // pick-ups and rebounds
   if(b.state==='loose'){
    let best=null,bs=-1;
    for(const p of all()){
     if(p.stumble>0||p.cd.pickup>0)continue;
     const reach=(p.r.height||200)/100*1.25+p.jumpH+(p.air>=0?0.25:0);
     const dd=hyp(p.x-b.x,p.z-b.z);
     if(dd<C.rebound.radius&&b.y<reach){
      const w=eff(p,'rebound')+(p.air>=0?0.35:0)+rand()*0.35-(dd/C.rebound.radius)*0.3;
      if(w>bs){bs=w;best=p;}
     }
    }
    if(best){
     const ms=b.missShot;
     if(ms){best.stats.reb++;if(best.team===ms.team)best.stats.oreb++;emit({type:'rebound',playerId:best.id,offensive:best.team===ms.team});}
     const offensive=ms&&best.team===ms.team;
     b.missShot=null;
     const prevPossession=S.possession;
     giveBall(best,'rebound');
     if(ms&&b.touchedRim){S.shotClock=offensive?Math.max(S.shotClock,R.shotClockReset):R.shotClock;S.shotClockOn=true;if(offensive)S.shotClock=R.shotClockReset;}
     else if(prevPossession===best.team){S.shotClockOn=true;}
     b.touchedRim=false;
    }
   }
  }
 }

 function score(sh,goaltend){
  const b=S.ball;sh.scored=true;
  const t=team(sh.team),shooter=byId(sh.shooter);
  t.score+=sh.points;
  if(shooter){shooter.stats.pts+=sh.points;if(sh.type==='ft')shooter.stats.ftm++;else{shooter.stats.fgm++;if(sh.points===3)shooter.stats.tpm++;}}
  if(sh.type!=='ft'&&S.lastPasser&&S.tick-S.lastPasser.tick<C.timing.assistTicks){const a=byId(S.lastPasser.id);if(a&&a.team===sh.team&&a.id!==sh.shooter)a.stats.ast++;}
  S.lastPasser=null;
  S.lastScore={team:sh.team,points:sh.points,shooter:sh.shooter,type:sh.type,tick:S.tick,shotId:sh.id};
  emit({type:'score',team:sh.team,points:sh.points,playerId:sh.shooter,shotType:sh.type,shotId:sh.id,goaltend:!!goaltend,score:[team(0).score,team(1).score]});
  b.state='dead';b.shot=null;
  if(sh.type==='ft'){afterFreeThrow(true);return;}
  if(sh.foul&&!sh.foulDone){
   sh.foulDone=true;const f=byId(sh.foul.by);
   if(f&&shooter){
    // and-one
    f.fouls++;f.stats.pf++;team(f.team).fouls++;emit({type:'foul',playerId:f.id,victimId:shooter.id,kind:'shooting',andOne:true,personal:f.fouls,teamFouls:team(f.team).fouls});
    deadBall(()=>startFreeThrows(shooter,1,true),C.timing.afterFoul);return;
   }
  }
  if(S.clock<=0){endPeriodAfterShot(true);return;}
  afterScore(sh.team);
 }

 function afterFreeThrow(made){
  const ft=S.ft;if(!ft)return;
  ft.left--;
  if(ft.left>0){ft.state='setup';ft.t=0;S.ball.state='dead';S.ball.owner=ft.shooter;return;}
  S.ft=null;
  if(made){afterScore(ft.team);return;}
 }

 function afterFreeThrowMiss(sh){
  const ft=S.ft;if(!ft)return;
  ft.left--;
  emit({type:'miss',shotId:sh.id,playerId:sh.shooter,ft:true});
  if(ft.left>0){ft.state='setup';ft.t=0;S.ball.state='dead';S.ball.owner=ft.shooter;return;}
  // last free throw missed: live rebound
  S.ft=null;S.phase='live';S.ball.state='loose';S.ball.missShot=sh;S.shotClockOn=false;
 }

 function endPeriodAfterShot(){
  if(S.phase==='final')return;
  endQuarter();
 }

 function updateClocks(dt){
  if(S.phase!=='live')return;
  const clockRuns=!(S.ball.state==='dead');
  if(clockRuns){
   S.clock-=dt;
   if(S.clock<=0){
    S.clock=0;
    if(S.ball.state==='shot'&&S.ball.shot&&!S.ball.shot.gameOver){S.ball.shot.gameOver=true;emit({type:'buzzer',inAir:true});return;}
    if(S.ball.state!=='shot'){emit({type:'buzzer',inAir:false});endQuarter();return;}
   }
  }
  if(S.shotClockOn&&S.ball.state!=='shot'){
   const useShotClock=S.clock>S.shotClock||S.shotClock<R.shotClock;
   S.shotClock-=dt;
   if(S.shotClock<=0&&S.clock>0.05){S.shotClock=0;violation('shotclock',S.possession);return;}
  }
  // backcourt rules
  const h=holder();
  if(h){
   const s=side(h.team);
   if(!S.frontcourtSet){S.backcourtT+=dt;if(court.frontcourt(s,h.x)&&court.frontcourt(s,S.ball.x)){S.frontcourtSet=true;}else if(S.backcourtT>R.backcourtSeconds){violation('eight',h.team,h.x);return;}}
   else if(!court.frontcourt(s,h.x)&&h.act!=='shoot'&&S.ball.state==='held'&&S.lastPossessionTick!==S.tick){violation('backcourt',h.team,h.x);return;}
   if(!court.inBounds(h.x,h.z)){emit({type:'outOfBounds',team:h.team,playerId:h.id});violation('out',h.team,h.x);return;}
  }
  // offensive three seconds
  for(const p of onCourt(S.possession)){
   if(court.inPaint(side(p.team),p.x,p.z)&&S.ball.state==='held'&&!(p.act==='shoot')&&S.ball.owner!==p.id){p.paintT+=dt;if(p.paintT>R.laneSeconds){p.paintT=0;violation('three',p.team,p.x);return;}}
   else p.paintT=0;
  }
 }

 function runPhase(dt,inp){
  S.phaseT+=dt;
  if(S.phase==='dead'||S.phase==='timeout'||S.phase==='break'){
   for(const p of all()){p.vx*=0.9;p.vz*=0.9;p.x+=p.vx*dt;p.z+=p.vz*dt;if(p.air>=0)updateActs(dt,inp);}
   if(S.pending&&S.phaseT>=S.pending.delay){const n=S.pending.next;S.pending=null;n();}
   if(S.phase!=='timeout')for(const p of all())p.energy=Math.min(1,p.energy+C.fatigue.deadRecover*dt);
   return true;
  }
  if(S.phase==='inbound'){
   const ib=S.inbound,inb=byId(ib.inbounder),rec=byId(ib.receiver);
   // receiver gets open toward the inbounder, others go to formation (AI)
   teamThink(api,dt,'inbound');
   const user=byId(S.controlled);
   if(user&&user!==inb&&user.team===S.userTeam&&inp)humanInput(user,{...inp,shootDown:false,passPress:false,altPress:false});
   inb.intent.x=0;inb.intent.z=0;inb.intent.speed=0;
   movePlayers(dt);
   inb.x=ib.spot.x;inb.z=ib.spot.z;
   S.ball.x=inb.x;S.ball.z=inb.z;S.ball.y=1.1;
   const target0=rec&&rec.onCourt?rec:onCourt(ib.team).find(p=>p!==inb);
   const ready=target0&&(!S.frontcourtSet||court.frontcourt(side(ib.team),target0.x))&&hyp(target0.vx,target0.vz)<2.5;
   if(S.phaseT>=ib.delay&&(ready||S.phaseT>=R.inboundSeconds)){
    const target=target0;
    S.phase='live';S.phaseT=0;S.ball.state='held';S.ball.owner=inb.id;S.possession=ib.team;S.lastPossessionTick=S.tick;
    inb.face=Math.atan2(target.x-inb.x,target.z-inb.z);
    startPass(inb,target,'chest');inb.actT=C.pass.windup;throwPass(inb);inb.act=null;
    S.inbound=null;
   }
   return true;
  }
  if(S.phase==='freethrow'){
   const ft=S.ft,sh=byId(ft.shooter);
   for(const p of all()){p.vx=p.vz=0;}
   ft.t+=dt;
   if(ft.state==='setup'&&ft.t>=C.timing.freeThrowSetup){
    ft.state='shoot';ft.t=0;S.ball.state='held';S.ball.owner=sh.id;
    sh.act='shoot';sh.actT=0;sh.shot={type:'ft',human:sh.team===S.userTeam,held:true,releaseAt:A.freethrow.release,duration:A.freethrow.duration,quality:null,released:false,gatherX:sh.x,gatherZ:sh.z,toRim:{x:side(sh.team),z:0},drive:0,contact:null};
    emit({type:'shotStart',playerId:sh.id,shotType:'ft'});
   }
   if(ft.state==='shoot'){
    if(sh.team===S.userTeam&&inp&&inp.shootUp&&sh.shot&&sh.shot.quality==null&&!sh.shot.released){const e=Math.abs(sh.actT-sh.shot.releaseAt);sh.shot.quality=clamp(1-e/C.shot.window,0,1);emit({type:'timing',playerId:sh.id,quality:+sh.shot.quality.toFixed(3),early:sh.actT<sh.shot.releaseAt});}
    updateActs(dt,inp);
    if(S.ball.state==='shot'){ft.state='flight';}
   }
   if(ft.state==='flight'){
    updateBall(dt);
    if(S.phase==='live'){ // missed last: live rebound
     return false;
    }
   }
   return true;
  }
  if(S.phase==='jumpball'){
   updateBall(dt);
   for(const p of all()){p.vx=p.vz=0;}
   return true;
  }
  return S.phase==='final';
 }

 function snapshotPlayers(){
  return all().map(p=>({id:p.id,team:p.team,pos:p.pos,number:p.number,x:+p.x.toFixed(3),z:+p.z.toFixed(3),y:+p.jumpH.toFixed(3),vx:+p.vx.toFixed(3),vz:+p.vz.toFixed(3),
   face:+p.face.toFixed(3),act:p.act,actT:+p.actT.toFixed(3),shotType:p.shot?.type||null,air:p.air>=0,energy:+p.energy.toFixed(3),fouls:p.fouls,
   hasBall:S.ball.owner===p.id&&S.ball.state==='held',controlled:p.id===S.controlled,stumble:p.stumble>0,look:p.look,role:p.role}));
 }

 const api={
  get S(){return S;},court,C,rand,eff,onCourt,all,side,holder,byId,dist,nearestTo,
  startShot,startPass,startJump,startSteal,startMove,choosePassTarget,diff,
 };

 const engine={
  step(inp=NO_INPUT){
   if(disposed||S.phase==='final')return;
   S.tick++;const dt=HOOPS_DT;
   if(S.phase!=='live'){
    if(runPhase(dt,inp)){recordHistory();return;}
    if(S.phase!=='live'){recordHistory();return;}
   }
   // live play
   teamThink(api,dt,'live');
   const me=byId(S.controlled);
   if(me&&me.onCourt&&!S.autopilot)humanInput(me,inp||NO_INPUT);
   updateActs(dt,inp);
   movePlayers(dt);
   if(S.phase==='live')updateBall(dt);
   if(S.phase==='live')updateClocks(dt);
   if(S.phase==='live')autoControl();
   recordHistory();
  },
  snapshot(){
   const b=S.ball;
   return {tick:S.tick,phase:S.phase,phaseT:+S.phaseT.toFixed(3),quarter:S.quarter,overtime:S.overtime,clock:+Math.max(0,S.clock).toFixed(2),shotClock:+Math.max(0,S.shotClock).toFixed(2),shotClockOn:S.shotClockOn,
    score:[team(0).score,team(1).score],teamFouls:[team(0).fouls,team(1).fouls],timeouts:[team(0).timeouts,team(1).timeouts],possession:S.possession,dir:[...S.dir],userTeam:S.userTeam,
    controlled:S.controlled,ball:{x:+b.x.toFixed(3),y:+b.y.toFixed(3),z:+b.z.toFixed(3),state:b.state,owner:b.owner,shotId:b.shot?.id||null,dribbleT:+b.dribbleT.toFixed(3)},
    players:snapshotPlayers(),ft:S.ft?{shooter:S.ft.shooter,left:S.ft.left,total:S.ft.total}:null,inbound:S.inbound?{team:S.inbound.team,inbounder:S.inbound.inbounder}:null,
    call:[team(0).call,team(1).call],lastScore:S.lastScore,result:S.result,profile:S.profile,mode:S.mode};
  },
  drainEvents(){const q=queue;queue=[];return q;},
  /** Last seconds of snapshots for an instant replay (read only). */
  replay(seconds=C.replay.seconds){const n=Math.round(seconds*C.replay.hz);return history.slice(-n);},
  substitute,timeout:t=>timeout(t),
  setAutoSub(on){S.autoSubUser=!!on;},
  setTactics(t,tac){Object.assign(team(t).tactics,tac);emit({type:'tactics',team:t,...tac});},
  callPlay(t,play){team(t).call=play;team(t).callT=0;emit({type:'playCall',team:t,play});},
  roster(t){return team(t).roster.map(p=>({id:p.id,name:p.name,number:p.number,pos:p.pos,onCourt:p.onCourt,energy:+p.energy.toFixed(3),fouls:p.fouls,stats:{...p.stats}}));},
  get result(){return S.result;},
  get court(){return court;},
  debug:{get state(){return S;},api,give:(id)=>giveBall(byId(id),'debug'),place:(id,x,z)=>{const p=byId(id);p.x=x;p.z=z;p.vx=p.vz=0;},
   setClock(c,sc){if(c!=null)S.clock=c;if(sc!=null)S.shotClock=sc;},setPhase(ph){S.phase=ph;},free:(t,count)=>startFreeThrows(onCourt(t)[0],count,false),
   setEnergy(id,e){byId(id).energy=e;},foul},
  dispose(){disposed=true;queue=[];history=[];},
 };
 function recordHistory(){if(S.tick%Math.round(60/C.replay.hz))return;history.push(engine.snapshot());const max=C.replay.seconds*C.replay.hz*2;if(history.length>max)history.splice(0,history.length-max);}
 reset(seed);
 return engine;
}
