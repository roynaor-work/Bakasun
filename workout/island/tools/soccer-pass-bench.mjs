// Headless measurement of human passing in the real soccer engine.
// A simulated child picks a team-mate, tilts the stick towards them with a bounded
// human error and taps/holds the pass button. Everything is seeded: no wall clock,
// no Math.random. Usage: node workout/island/tools/soccer-pass-bench.mjs [runs] [--json]
import {readFile} from 'node:fs/promises';
import {createSoccer,seededRandom} from '../minigames/soccer.mjs';

const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export async function loadConfig(){
  return JSON.parse(await readFile(new URL('../data/config.json',import.meta.url),'utf8')).minigames.soccer;
}
export const PASS_KINDS={tap:{hold:0},short:{hold:0.18},long:{hold:0.55}};

/** Lane clearance of every opponent to the segment from -> to (start state). */
function laneBlocked(opps,from,to,radius){
  const dx=to.x-from.x,dz=to.z-from.z,l2=dx*dx+dz*dz||1;
  for(const o of opps){const u=((o.x-from.x)*dx+(o.z-from.z)*dz)/l2;if(u<0||u>1)continue;if(Math.hypot(o.x-(from.x+u*dx),o.z-(from.z+u*dz))<radius)return true;}
  return false;
}

/** One simulated pass. scenario: 'clean' (opponents parked far, frozen) or 'live' (opponents random, AI active). */
export function simulatePass(config,{seed,scenario='clean',kind='tap',errorDegrees=10,mode='intent'}){
  const rng=seededRandom(seed*2654435761>>>0||1),game=createSoccer({config,seed,stage:3,difficulty:'normal'});
  const s=game.getState(),step=config.match.fixedStep,hx=config.pitch.length/2,hz=config.pitch.width/2;
  const home=s.players.filter(p=>p.team===0),opps=s.players.filter(p=>p.team===1);
  const carrier=s.players[0],mates=home.filter(p=>p.id!==0&&p.role!=='keeper');
  const place=(p,x,z)=>{p.x=x;p.z=z;p.vx=p.vz=0;p.recover=0;p.cooldown=0;p.hold=0;};
  place(carrier,-14+rng()*26,(rng()-.5)*2*(hz-4));
  carrier.fx=1;carrier.fz=0;
  // Team-mates are scattered 4-19 m from the carrier, anywhere on the pitch.
  for(const m of mates){
    for(let tries=0;tries<40;tries++){
      const a=(rng()-.5)*Math.PI*1.6+(rng()<.2?Math.PI:0),r=4+rng()*15;
      const x=carrier.x+Math.cos(a)*r,z=carrier.z+Math.sin(a)*r;
      if(Math.abs(x)<hx-2&&Math.abs(z)<hz-2&&home.every(o=>o===m||o.x===undefined||dist(o,{x,z})>2.5||o===carrier&&dist(o,{x,z})>4)){place(m,x,z);break;}
    }
  }
  place(s.players.find(p=>p.team===0&&p.role==='keeper'),-hx+1.2,0);
  for(const o of opps){
    if(o.role==='keeper'){place(o,hx-1.2,0);if(scenario==='clean')o.recover=99;continue;}
    if(scenario==='clean'){place(o,hx-3,(rng()-.5)*2*(hz-3));o.recover=99;}
    else place(o,-hx+6+rng()*(2*hx-12),(rng()-.5)*2*(hz-3));
  }
  s.ball.owner=0;s.ball.x=carrier.x+.49;s.ball.z=carrier.z;s.ball.y=config.physics.ballRadius;s.ball.vx=s.ball.vz=0;s.ball.grace=0;s.controlled=0;
  // The child's intent: one visible team-mate between 4 and 18 m away.
  const pool=mates.filter(m=>dist(m,carrier)>=4&&dist(m,carrier)<=18);
  if(!pool.length)return null;
  const intended=pool[Math.floor(rng()*pool.length)];
  const startI={x:intended.x,z:intended.z},bearing=Math.atan2(intended.z-carrier.z,intended.x-carrier.x);
  const err=(rng()*2-1)*errorDegrees*Math.PI/180,angle=bearing+err;
  const input={moveX:Math.cos(angle),moveZ:Math.sin(angle),passHeld:false,kickHeld:false,sprintHeld:false,switchPlayer:false};
  const wrapped=a=>Math.abs(((a+Math.PI*3)%(Math.PI*2))-Math.PI);
  // Clear intent, judged on the pitch as it is when the ball is struck: the intended team-mate is within
  // the cone, no other team-mate is as close to the stick (8 degree margin), none stands on the line.
  const judgeClear=()=>{
    const here={x:carrier.x,z:carrier.z},b0=Math.atan2(intended.z-here.z,intended.x-here.x);
    if(wrapped(angle-b0)>25*Math.PI/180||dist(intended,here)<1.5)return false;
    return mates.every(m=>{
      if(m===intended)return true;
      const b2=Math.atan2(m.z-here.z,m.x-here.x);
      if(wrapped(angle-b2)<wrapped(angle-b0)+8*Math.PI/180)return false;
      return !(dist(m,here)<dist(intended,here)&&laneBlocked([m],here,intended,1.1));
    });
  };
  let clear=false;
  const blocked=scenario==='live'&&laneBlocked(opps.filter(o=>o.role!=='keeper'),carrier,startI,1.6);
  const holdTicks=Math.max(2,Math.round((PASS_KINDS[kind].hold||0)/step)+3);
  let t=0,released=null,pass=null,outcome='loose',receiver=null,flyby=false,closest=Infinity,arrival=0,carry0={x:carrier.x,z:carrier.z};
  let mate0Last=null,approach=null,mate0=null,heldTicks=0,controlOffset=0,receivedAt=null,runToward=0,startDistI=null,destination=null,aimBearing=null;
  const maxTicks=Math.round(5/step);
  for(let i=0;i<maxTicks;i++){
    // press for holdTicks then release; keep the stick pointing the same way.
    if(i<holdTicks){input.passHeld=true;}else input.passHeld=false;
    game.update(step,{...input});t=i;
    for(const e of game.drainEvents()){
      if((e.type==='pass'||e.type==='loft')&&e.team===0&&e.player===0&&!pass){if(false)console.log('EV',JSON.stringify(e),'carrier',carrier.x,carrier.z,'mate',intended.x,intended.z,'ball',s.ball.x,s.ball.z);clear=judgeClear();pass=e;mate0={x:intended.x,z:intended.z};released=(i+1)*step-0;destination={x:e.x,z:e.z};aimBearing=Math.atan2(e.z-carrier.z,e.x-carrier.x);startDistI=dist(intended,destination);}
    }
    if(false)console.log(i,'ball',s.ball.x.toFixed(2),s.ball.z.toFixed(2),'v',s.ball.vx.toFixed(1),s.ball.vz.toFixed(1),'owner',s.ball.owner,'mate',intended.x.toFixed(2),intended.z.toFixed(2),'ph',s.phase);
    if(pass)mate0Last={x:intended.x,z:intended.z};
    if(pass&&s.ball.owner===null){
      const d=dist(s.ball,intended);if(d<closest){closest=d;arrival=Math.hypot(s.ball.vx,s.ball.vz);}
    }
    if(pass&&receivedAt===null&&s.phase!=='playing'&&s.phase!=='goal'){outcome='out';break;}
    if(pass&&s.ball.owner!==null&&s.ball.owner!==0&&receivedAt===null){
      receiver=s.players[s.ball.owner];receivedAt=i;
      outcome=receiver.team===1?'intercepted':receiver.id===intended.id?'intended':receiver.role==='keeper'?'keeper':'wrong-mate';
    }
    if(receivedAt!==null&&i-receivedAt<=36){controlOffset=Math.max(controlOffset,dist(s.ball,receiver));}
    if(receivedAt!==null&&i-receivedAt>36)break;
    if(pass&&s.phase!=='playing'&&receivedAt===null){outcome='out';break;}
    if(pass&&i*step>released+3.2&&receivedAt===null)break;
    if(!pass&&i>holdTicks+50)break;
  }
  if(!pass)return {seed,scenario,kind,noPass:true};
  if(outcome==='loose'&&closest<config.physics.pickupRadius+.3)flyby=true;
  const moved=pass.target===intended.id&&mate0?dist(mate0,destination)-dist(mate0Last,destination):0;
  return {seed,scenario,kind,blocked,clear,outcome,intendedId:intended.id,target:pass.target??null,targetCorrect:(pass.target??null)===intended.id,
    releaseSeconds:released,distance:pass.distance,range:dist(startI,carrier),errorDegrees:err*180/Math.PI,
    aimOffDegrees:Math.abs(((aimBearing-bearing)*180/Math.PI+540)%360-180),flyby,arrivalSpeed:closest<Infinity?arrival:null,
    receiverMovedToPoint:moved,controlOffset:receivedAt!==null?controlOffset:null,passKind:pass.type,
    wrongPlayer:outcome==='wrong-mate'||outcome==='keeper',sideline:outcome==='out',
    missedByMetres:closest<Infinity?closest:null};
}

export function runBench(config,{runs=300,scenarios=['clean','live'],kinds=['tap','short'],errorDegrees=10,baseSeed=1000}={}){
  const rows=[];
  for(const scenario of scenarios)for(const kind of kinds)for(let i=0;i<runs;i++){
    const r=simulatePass(config,{seed:baseSeed+i,scenario,kind,errorDegrees});if(r&&!r.noPass)rows.push(r);
  }
  return rows;
}
const pct=(n,d)=>d?Math.round(n/d*1000)/10:0;
export function summarize(rows){
  const out={};
  for(const key of new Set(rows.map(r=>`${r.scenario}/${r.kind}`))){
    const g=rows.filter(r=>`${r.scenario}/${r.kind}`===key),n=g.length,free=g.filter(r=>!r.blocked);
    const mean=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;
    out[key]={n,
      intended:pct(g.filter(r=>r.outcome==='intended').length,n),
      intendedUnblocked:pct(free.filter(r=>r.outcome==='intended').length,free.length),
      clearIntent:pct(free.filter(r=>r.clear&&r.outcome==='intended').length,free.filter(r=>r.clear).length),
      clearWrong:pct(free.filter(r=>r.clear&&r.wrongPlayer).length,free.filter(r=>r.clear).length),
      clearShare:pct(free.filter(r=>r.clear).length,free.length),
      targetCorrect:pct(g.filter(r=>r.targetCorrect).length,n),
      intercepted:pct(g.filter(r=>r.outcome==='intercepted').length,n),
      wrongMate:pct(g.filter(r=>r.wrongPlayer).length,n),
      out:pct(g.filter(r=>r.sideline).length,n),
      loose:pct(g.filter(r=>r.outcome==='loose').length,n),
      flyby:pct(g.filter(r=>r.flyby).length,n),
      releaseSeconds:Math.round(mean(g.map(r=>r.releaseSeconds))*1000)/1000,
      receiverRuns:Math.round(mean(g.map(r=>r.receiverMovedToPoint))*100)/100,
      arrivalSpeed:Math.round(mean(g.filter(r=>r.arrivalSpeed!=null).map(r=>r.arrivalSpeed))*100)/100,
      badFirstTouch:pct(g.filter(r=>r.controlOffset!=null&&r.controlOffset>1.3).length,g.filter(r=>r.controlOffset!=null).length)};
  }
  return out;
}
if(import.meta.url===`file://${process.argv[1]}`){
  const runs=Number(process.argv[2])||300,config=await loadConfig(),rows=runBench(config,{runs});
  const summary=summarize(rows);
  if(process.argv.includes('--json'))console.log(JSON.stringify(summary,null,1));else console.table(summary);
}
