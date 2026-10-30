// Naval accuracy diagnosis (29/10/2026): where do the shots of a player who
// aims at the shown point miss? Uses the game's own ballistics, patrol and
// reach-control code, forks the fleet for every variant, and with --validate
// checks the forked stepping against the live model shot for shot.
// The mark it measures is the still-hull mark of e926b3b (navalPredict); the
// honest mark that replaced it is verified in tests/island-naval-forecast.test.mjs.
// node workout/island/tools/naval-aim-sim.mjs [seeds] [--validate] > report.json
import {readFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url).href;
const SEEDS=Number(process.argv.find(a=>/^\d+$/.test(a))||12),VALIDATE=process.argv.includes('--validate');
const {createNavalModel,navalWind}=await import(root+'minigames/naval.mjs');
const {seededRandom}=await import(root+'minigames/context.mjs');
const B=await import(root+'minigames/naval-ballistics.mjs');
const P=await import(root+'minigames/naval-patrol.mjs');
const C=await import(root+'minigames/naval-controls.mjs');
const {navalStagePressure}=await import(root+'minigames/naval-campaign.mjs');
const config=JSON.parse(await readFile(new URL('data/config.json',root),'utf8')).minigames,bal=config.navalDuel;
const DEG=Math.PI/180,R=C.navalReachRange(bal),G=bal.aimControls.gain;
const gauss=r=>{let a=0;for(let i=0;i<6;i++)a+=r();return (a-3)/Math.sqrt(.5);};

const cloneFleet=list=>list.map(e=>({...e,patrol:e.patrol&&structuredClone(e.patrol),attack:null}));
/** Mirrors updateFleet's patrol stepping (naval.mjs) for a forked copy of the fleet. */
function stepFleet(fleet,dt,ctx){
 ctx.time+=dt;
 for(const e of fleet){
  if(e.hp<=0||!e.active||!e.patrol)continue;
  const age=ctx.time-e.spawnTime,flank=e.behavior==='flank',spacing=bal.patrol?.depthStagger??64,n=Math.min(ctx.settings.concurrent,ctx.fleetLength);
  const station=bal.enemyX+spacing*(e.slot-(n-1)/2);
  let centreX=station-(flank?(1-Math.cos(age*.3))*Math.min(55,ctx.settings.drift*2):0);
  if(flank)for(const o of fleet)if(o!==e&&o.active&&o.hp>0&&o.patrol&&o.patrol.cx<station-1)centreX=Math.max(centreX,o.patrol.cx+spacing);
  const obstacles=[{x:ctx.player.x,z:ctx.player.z},...fleet.filter(o=>o!==e&&o.active&&o.hp>0).map(o=>({x:o.x,z:o.z}))];
  P.stepNavalPatrol(e.patrol,dt,{obstacles,shellAirborne:ctx.airborne,centreX},bal);
  e.x=e.patrol.x;e.z=e.patrol.z;e.heading=e.patrol.heading;
 }
}
/** Fly one launch against the moving fleet; optional delay before release. */
function fly(launch,fleet0,ctx0,{dt=1/60,delay=0}={}){
 const fleet=cloneFleet(fleet0),ctx={...ctx0,airborne:false};
 for(let t=0;t<delay-1e-9;t+=dt)stepFleet(fleet,dt,ctx);
 ctx.airborne=true;let age=0;const start=new Map(fleet.map(e=>[e.index,{x:e.x,z:e.z}]));
 while(age<launch.duration-1e-9){
  stepFleet(fleet,dt,ctx);const from=age;age=Math.min(launch.duration,age+dt);
  const hit=B.navalAdvanceShot(launch,from,age,fleet.filter(e=>e.active&&e.hp>0),bal);
  if(hit){const s=start.get(hit.index),e=fleet.find(f=>f.index===hit.index);return {hit:true,index:hit.index,critical:hit.critical,t:hit.t,moved:Math.hypot(e.x-s.x,e.z-s.z)};}
 }
 return {hit:false,t:launch.duration};
}
const launchOf=(ship,yaw,v,wind,pressure)=>{const a=C.navalReachAim(v,bal,0);return B.navalLaunch({ship,yaw,elevation:a.elevation,power:a.power,wind,ammo:0,pressure},bal);};
/** Turret settings a player can actually reach with the drag (yaw + reach) that land on a water point. */
function solveReach(ship,target,wind,pressure){
 let yaw=Math.atan2(target.z-ship.z,target.x-ship.x),v=14,launch;
 for(let pass=0;pass<8;pass++){
  const m=B.navalMuzzle(ship,yaw,bal),cy=Math.cos(yaw),sy=Math.sin(yaw),want=(target.x-m.x)*cy+(target.z-m.z)*sy;
  let lo=R.min,hi=R.max;
  for(let i=0;i<36;i++){const mid=(lo+hi)/2,l=launchOf(ship,yaw,mid,wind,pressure),p=B.navalLanding(l),along=(p.x-l.origin.x)*cy+(p.z-l.origin.z)*sy;if(along<want)lo=mid;else hi=mid;}
  v=(lo+hi)/2;launch=launchOf(ship,yaw,v,wind,pressure);const p=B.navalLanding(launch);
  const side=(target.z-p.z)*cy-(target.x-p.x)*sy,d=Math.max(1,Math.hypot(p.x-m.x,p.z-m.z));yaw+=Math.atan2(side,d);
 }
 launch=launchOf(ship,yaw,v,wind,pressure);const p=B.navalLanding(launch);
 return {yaw,v,launch,reachable:Math.hypot(p.x-target.x,p.z-target.z)<.75,...C.navalReachAim(v,bal,0)};
}
const markOf=(launch,fleet)=>B.navalPredict(launch,fleet.filter(e=>e.active&&e.hp>0),bal,4).contact;

const tally=()=>({n:0,hit:0,crit:0,other:0});
const add=(t,res,index)=>{t.n++;if(res.hit&&res.index===index){t.hit++;if(res.critical)t.crit++;}else if(res.hit)t.other++;};
const pct=(t,k='hit')=>t.n?Math.round(100*t[k]/t.n):'—';

const STAGES=[1,3,10],MOMENTS=[3,6,9,12,15,18,21,24],POSITIONS=[{id:'start',x:60,z:0},{id:'ahead',x:170,z:0}];
const out={};
for(const stage of STAGES){
 const pressure=navalStagePressure(stage),T={};
 const get=k=>T[k]??=tally();
 const flight=[],moved=[],lowPower={n:0,low:0};
 for(let seed=0;seed<SEEDS;seed++){
  const m=createNavalModel({config,balance:bal,level:stage,seed,random:seededRandom(seed)}),r=seededRandom(1000+seed*7+stage);
  for(let k=0;k<MOMENTS.length;k++){
   while(m.time<MOMENTS[k]-1e-9)m.update(1/30,{});
   const fleet=cloneFleet(m.enemies.filter(e=>e.active&&e.hp>0)),wind=navalWind(seed,k,bal);
   for(const pos of POSITIONS){
    const player={x:pos.x,z:pos.z,heading:0},ctx={time:m.time,settings:m.settings,fleetLength:m.enemies.length,player};
    for(const e of fleet){
     const key=s=>`${pos.id}:${s}`,L=bal.aim.hullLength*(e.hullScale||1),Bm=bal.aim.hullBeam*(e.hullScale||1),c=Math.cos(e.heading),s=Math.sin(e.heading);
     // 1. Perfect centre aim, released at once: only target motion can spoil it.
     const sol=solveReach(player,{x:e.x,z:e.z},wind,pressure);if(!sol.reachable)continue;
     const mark=markOf(sol.launch,fleet),base=fly(sol.launch,fleet,ctx);
     add(get(key('centre-frozen')),{hit:mark?.index===e.index,index:mark?.index,critical:mark?.critical},e.index);
     add(get(key('centre')),base,e.index);flight.push(sol.launch.duration);if(base.hit)moved.push(base.moved);
     // Size of the "hit" mark window around the centre, in turret units (then drag pixels).
     {const onAt=(yaw,v)=>markOf(launchOf(player,yaw,v,wind,pressure),fleet)?.index===e.index,critAt=(yaw,v)=>{const q=markOf(launchOf(player,yaw,v,wind,pressure),fleet);return q?.index===e.index&&q.critical;};
      const edge=(fn,lo,hi)=>{for(let i=0;i<28;i++){const mid=(lo+hi)/2;if(fn(mid))lo=mid;else hi=mid;}return (lo+hi)/2;};
      if(onAt(sol.yaw,sol.v)){const w={yaw:(edge(d=>onAt(sol.yaw-d,sol.v),0,25*DEG)+edge(d=>onAt(sol.yaw+d,sol.v),0,25*DEG))/DEG,reach:edge(d=>onAt(sol.yaw,sol.v-d),0,25)+edge(d=>onAt(sol.yaw,sol.v+d),0,25),dist:Math.hypot(e.x-player.x,e.z-player.z)};
       if(critAt(sol.yaw,sol.v)){w.critYaw=(edge(d=>critAt(sol.yaw-d,sol.v),0,25*DEG)+edge(d=>critAt(sol.yaw+d,sol.v),0,25*DEG))/DEG;w.critReach=edge(d=>critAt(sol.yaw,sol.v-d),0,25)+edge(d=>critAt(sol.yaw,sol.v+d),0,25);}
       (out.windows??={})[`${stage}:${pos.id}`]=[...(out.windows?.[`${stage}:${pos.id}`]||[]),w];}}
     lowPower.n++;if(sol.power<.999)lowPower.low++;
     // 2. Same aim, released 0.25 s after the mark turned to "hit".
     add(get(key('centre+delay.25')),fly(sol.launch,fleet,ctx,{delay:.25}),e.index);
     // 3. Lead from the current velocity (what a lead marker would show).
     let lead={x:e.x,z:e.z},ls=sol;for(let i=0;i<3;i++){const tf=ls.launch.duration;lead={x:e.x+(e.vx||0)*tf,z:e.z+(e.vz||0)*tf};ls=solveReach(player,lead,wind,pressure);}
     add(get(key('lead')),fly(ls.launch,fleet,ctx),e.index);
     // 4. Hand error on the final placement, in drag pixels at the slow gain.
     for(const sigma of [4,8,16])for(let i=0;i<4;i++){const yaw=sol.yaw+gauss(r)*sigma*G.yawSlow*DEG,v=sol.v+gauss(r)*sigma*G.elevationSlow;add(get(key(`noise${sigma}`)),fly(launchOf(player,yaw,v,wind,pressure),fleet,ctx),e.index);}
     // 5. Wind: the preview includes it. A player who ignored the shown arc would aim as if calm.
     const calm=solveReach(player,{x:e.x,z:e.z},{x:0,z:0},pressure);add(get(key('wind-ignored')),fly(launchOf(player,calm.yaw,calm.v,wind,pressure),fleet,ctx),e.index);
     // 6. Sway: configured but not applied anywhere in the code. Hypothetical if it were applied.
     for(let i=0;i<4;i++){const ph=r()*Math.PI*2,q=r()*Math.PI*2,yaw=sol.yaw+Math.sin(ph)*bal.aim.sway.yaw,v=sol.v+Math.cos(q)*bal.aim.sway.elevation;add(get(key('sway-if-applied')),fly(launchOf(player,yaw,v,wind,pressure),fleet,ctx),e.index);}
     // 7. 20261028-1 short-drag bug: a nudge under 10 px / 0.22 s fired at full power.
     if(sol.power<.999){const l=B.navalLaunch({ship:player,yaw:sol.yaw,elevation:sol.elevation,power:1,wind,ammo:0,pressure},bal);add(get(key('short-drag-bug(low power only)')),fly(l,fleet,ctx),e.index);add(get(key('same shots without the bug')),base,e.index);}
     // 8. Release anywhere the mark says "hit" (landing grid around the hull), and at the mark's edge.
     const grid=[];for(let u=-1.5;u<=1.501;u+=.3)for(let w=-2.4;w<=2.401;w+=.3){const tx=e.x+c*u*L-s*w*Bm,tz=e.z+s*u*L+c*w*Bm,g=solveReach(player,{x:tx,z:tz},wind,pressure);grid.push({u,w,g,on:g.reachable&&markOf(g.launch,fleet)?.index===e.index});}
     const on=new Set(grid.filter(p=>p.on).map(p=>`${p.u.toFixed(1)},${p.w.toFixed(1)}`));
     for(const p of grid){if(!p.on)continue;const nb=[[.3,0],[-.3,0],[0,.3],[0,-.3]].some(([a,b])=>!on.has(`${(p.u+a).toFixed(1)},${(p.w+b).toFixed(1)}`));
      add(get(key('anywhere-on-hit-mark')),fly(p.g.launch,fleet,ctx),e.index);add(get(key('anywhere-on-hit-mark+delay.25')),fly(p.g.launch,fleet,ctx,{delay:.25}),e.index);
      if(nb)add(get(key('edge-of-hit-mark')),fly(p.g.launch,fleet,ctx),e.index);}
    }
   }
  }
 }
 const avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0,max=a=>a.length?Math.max(...a):0;
 out[stage]={pressure,flight:{mean:+avg(flight).toFixed(2),max:+max(flight).toFixed(2)},movedDuringFlight:{mean:+avg(moved).toFixed(1),max:+max(moved).toFixed(1)},lowPowerShare:Math.round(100*lowPower.low/Math.max(1,lowPower.n)),rows:Object.fromEntries(Object.entries(T).map(([k,t])=>[k,{n:t.n,hit:pct(t),crit:pct(t,'crit'),other:pct(t,'other')}]))};
 console.error('stage',stage,'done');
}
const mean=(a,k)=>{const v=a.map(x=>x[k]).filter(Number.isFinite);return v.length?v.reduce((x,y)=>x+y,0)/v.length:NaN;};
out.windowSummary=Object.fromEntries(Object.entries(out.windows||{}).map(([k,a])=>{const yaw=mean(a,'yaw'),reach=mean(a,'reach'),cy=mean(a,'critYaw'),cr=mean(a,'critReach');
 return [k,{n:a.length,distance:Math.round(mean(a,'dist')),hitYawDeg:+yaw.toFixed(1),hitYawPxSlow:Math.round(yaw/G.yawSlow),hitYawPxFast:Math.round(yaw/G.yawFast),hitReach:+reach.toFixed(1),hitReachPxSlow:Math.round(reach/G.elevationSlow),hitReachPxFast:Math.round(reach/G.elevationFast),
  critYawPxSlow:Math.round(cy/G.yawSlow),critReachPxSlow:Math.round(cr/G.elevationSlow),critShare:Math.round(100*a.filter(w=>Number.isFinite(w.critYaw)).length/a.length)}];}));
delete out.windows;
console.log(JSON.stringify(out,null,1));

if(VALIDATE){
 // Fork check: the copied fleet stepping must agree with the live model, shot for shot.
 let n=0,agree=0;
 for(const stage of [3,10])for(let seed=0;seed<4;seed++)for(const moment of [4,9,14]){
  const probe=createNavalModel({config,balance:bal,level:stage,seed,random:seededRandom(seed)});while(probe.time<moment-1e-9)probe.update(1/30,{});
  const fleet=cloneFleet(probe.enemies.filter(e=>e.active&&e.hp>0)),wind=probe.wind,pressure=navalStagePressure(stage),player={x:probe.playerShip.x,z:probe.playerShip.z,heading:probe.playerShip.heading};
  for(const e of fleet)for(const du of [-.8,-.3,0,.4,.9]){
   const live=createNavalModel({config,balance:bal,level:stage,seed,random:seededRandom(seed)});while(live.time<moment-1e-9)live.update(1/30,{});
   const tgt={x:e.x+Math.cos(e.heading)*du*bal.aim.hullLength,z:e.z+Math.sin(e.heading)*du*bal.aim.hullLength},sol=solveReach(player,tgt,wind,pressure);if(!sol.reachable)continue;
   const ctx={time:live.time,settings:live.settings,fleetLength:live.enemies.length,player};const mine=fly(sol.launch,fleet,ctx,{delay:1/60});
   live.update(1/60,{aimYaw:sol.yaw,aimElevation:sol.elevation,aimPower:sol.power,fireRelease:true});
   for(let i=0;i<400&&!live.lastShot;i++)live.update(1/60,{});
   const real=live.lastShot?.actual;n++;if(Boolean(real?.victim!==null&&real?.victim!==undefined)===mine.hit&&(!mine.hit||(real.victim===mine.index&&real.critical===mine.critical)))agree++;
  }
 }
 console.log(JSON.stringify({validation:{shots:n,agree}}));
}
