// racing-v23 off-track rule, measured without a browser on the real model (racing-physics.mjs).
// Part A: N forced excursions over the 30 stages (after a random 2-12 s of driving, the player steers hard to one side with the throttle on until the flip):
//         trigger, how far beyond the edge the car got, flight time, landing (lateral, speed, heading error), the landing point against the nearest centre-line point,
//         no gate granted by the flip, no NaN, and the car drives on with the throttle afterwards.
// Part B: whole races with the measurement bots (casual = 11 frames late, as the league's slow driver; pro) on 6 circuits, 10 cars: off-track flips of the
//         player and of the computer drivers, posts, race time and rank, without walls (the new default) and with ?racingWalls=1.
// Part C (PART=C runs only this): the threshold choice, the sloppy kid bot (pull .45 = runs wide hard, .3 = a little) over 6 circuits x 2 seeds with walls and with
//         several soft/dwell/hard sets: flips per race, race time, rank (racing-v23 picked 7 m / 0.6 s / 9 m).
// Usage: node workout/island/tools/racing-offtrack-sim.mjs [N=1000] [out.json]
import {writeFile} from 'node:fs/promises';
const {createRacing}=await import('../minigames/racing-physics.mjs');
const {OFF_TRACK}=await import('../minigames/racing-offtrack.mjs');
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a)),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
let word=0x2366;const rand=()=>((word=(Math.imul(word,1664525)+1013904223)>>>0)/4294967296);
function bot(race,p,q,lag,kind){
 const tr=race.track,pr=tr.project(p.x,p.z,p.s),tg=tr.sample(pr.s+10+p.speed*.5),err=wrap(Math.atan2(tg.x-p.x,tg.z-p.z)-p.heading),curv=Math.abs(wrap(tr.sample(pr.s+26).heading-tr.sample(pr.s+6).heading));
 q.push(clamp(err*1.7,-1,1));const steer=q.length>lag?q.shift():0;
 return {steer,throttle:1,autoAccelerate:true,brake:curv>(kind==='casual'?.62:.9)&&p.speed>24,drift:kind==='pro'&&Math.abs(err)>.22&&p.speed>14,nitro:kind==='pro'&&p.nitro>70&&Math.abs(err)<.08};
}
const finite=o=>Object.values(o).every(v=>typeof v!=='number'||Number.isFinite(v));
export function excursion(stage,seed,{drive=4,side=1,lock=1}={}){
 const race=createRacing({stage,seed,config:{countdown:0,extraRivals:5,walls:false,offTrack:true}}),p=race.state.player,tr=race.track,half=tr.width/2,q=[];
 const log=[];let n=0,trigger=null,maxBeyond=0,landing=null,flightSteps=0,nan=false,gatesBefore=0;
 for(;n<drive*60;n++){race.step(1/60,bot(race,p,q,0,'pro'));if(p.crashT>0&&p.offFlight===null&&p.crashDur===0){}}
 // the excursion: full lock to one side, throttle on, until the off-track flip starts (at most 20 s)
 for(let k=0;k<20*60&&!trigger;k++,n++){const before=p.checkpoints;race.step(1/60,{steer:side*lock,throttle:1,autoAccelerate:true});maxBeyond=Math.max(maxBeyond,Math.abs(p.lateral)-half);if(!finite(p))nan=true;
  for(const e of race.state.events)if(e.car==='player'&&e.type==='crash'&&e.reason==='offtrack'){trigger={...e,checkpoints:p.checkpoints,routeS:p.routeS,nextGate:p.nextCheckpoint*tr.length/tr.checkpoints.length};gatesBefore=p.checkpoints;}}
 if(!trigger){race.dispose();return {stage,seed,trigger:null,maxBeyond:+maxBeyond.toFixed(2)};}
 const near=tr.project(p.offFlight.x0,p.offFlight.z0,p.s),target={r1:p.offFlight.r1,x1:p.offFlight.x1,z1:p.offFlight.z1};
 let peak=0;
 for(let k=0;k<3*60&&!landing;k++,n++){race.step(1/60,{steer:0,throttle:0,autoAccelerate:false});flightSteps++;peak=Math.max(peak,p.crashAir||0);if(!finite(p))nan=true;maxBeyond=Math.max(maxBeyond,Math.abs(p.lateral)-half);
  for(const e of race.state.events)if(e.car==='player'&&e.type==='crashRecover')landing={speed:p.speed,lateral:p.lateral,heading:wrap(p.heading-tr.sample(p.s).heading),checkpoints:p.checkpoints,routeS:p.routeS,s:p.s,x:p.x,z:p.z,crashT:p.crashT};}
 // drive on: three seconds of throttle after the landing
 const v0=p.speed;for(let k=0;k<3*60;k++)race.step(1/60,bot(race,p,q,0,'pro'));
 const out={stage,seed,track:tr.id,width:tr.width,why:trigger.why,strength:trigger.strength,speedAtTrigger:+trigger.speed.toFixed(1),beyondAtTrigger:+(Math.abs(trigger.lateral)-half).toFixed(2),maxBeyond:+maxBeyond.toFixed(2),
  flight:+(flightSteps/60).toFixed(2),peak:+peak.toFixed(2),nan,landing:landing&&{speed:+landing.speed.toFixed(2),lateral:+landing.lateral.toFixed(3),headingError:+landing.heading.toFixed(3),
   fromNearest:+(Math.abs(wrap((landing.s-near.s)/tr.length*Math.PI*2))/(Math.PI*2)*tr.length).toFixed(2),gateGranted:landing.checkpoints>gatesBefore,beforeNextGate:landing.routeS<trigger.nextGate},
  speedAfter3s:+p.speed.toFixed(1),startSpeed:+v0.toFixed(2)};
 race.dispose();return out;
}
// 'kid': a sloppy driver for the comparison: 16 frames late and every 6-12 s a 0.6-1.4 s slip (too little steering plus a pull to one side), as a seven-year-old
// thumb that runs wide; deterministic per (stage, seed)
function kidBot(race,p,q,state){const b=bot(race,p,q,16,'casual');state.t-=1/60;if(state.t<=0){if(state.m>0){state.m=0;state.t=6+state.r()*6;}else{state.m=.6+state.r()*.8;state.t=state.m;state.side=state.r()<.5?-1:1;}}
 if(state.m>0)b.steer=b.steer*.3+state.side*.45;return b;}
function race(stage,seed,kind,walls){
 const r=createRacing({stage,seed,config:{countdown:0,extraRivals:5,walls,offTrack:!walls}}),p=r.state.player,q=[],lag=kind==='casual'?11:0;let w=seed*7919>>>0;const kid={t:8,m:0,side:1,r:()=>((w=(Math.imul(w,1664525)+1013904223)>>>0)/4294967296)};
 const c={playerOff:0,rivalOff:0,playerCrash:0,rivalCrash:0,wallHits:0,recoveries:0};
 for(let n=0;n<400*60&&r.state.phase!=='finished';n++){r.step(1/60,kind==='kid'?kidBot(r,p,q,kid):bot(r,p,q,lag,kind));for(const e of r.state.events){
  if(e.type==='crash'){if(e.reason==='offtrack'){if(e.car==='player')c.playerOff++;else c.rivalOff++;}else{if(e.car==='player')c.playerCrash++;else c.rivalCrash++;}}
  if(e.type==='wall'&&e.car==='player')c.wallHits++;if(e.type==='recovery')c.recoveries++;}}
 const out={stage,seed,kind,walls,time:+r.state.time.toFixed(1),rank:p.rank,finished:p.finished,...c};r.dispose();return out;
}
function kidRace(stage,seed,cfg,pull){const r=createRacing({stage,seed,config:{countdown:0,extraRivals:5,...cfg}}),p=r.state.player,q=[];let w=seed*7919>>>0;const st={t:8,m:0,side:1,r:()=>((w=(Math.imul(w,1664525)+1013904223)>>>0)/4294967296)};
 const c={off:0,wall:0,why:{}};let maxB=0;for(let n=0;n<400*60&&r.state.phase!=='finished';n++){const b=bot(r,p,q,16,'casual');st.t-=1/60;if(st.t<=0){if(st.m>0){st.m=0;st.t=6+st.r()*6;}else{st.m=.6+st.r()*.8;st.t=st.m;st.side=st.r()<.5?-1:1;}}if(st.m>0)b.steer=b.steer*.3+st.side*pull;
  r.step(1/60,b);maxB=Math.max(maxB,Math.abs(p.lateral)-r.track.width/2);for(const e of r.state.events)if(e.car==='player'){if(e.type==='crash'&&e.reason==='offtrack'){c.off++;c.why[e.why]=(c.why[e.why]||0)+1;}if(e.type==='wall')c.wall++;}}
 const out={time:r.state.time,rank:p.rank,...c,maxB};r.dispose();return out;}
export function thresholds(){const variants=[['walls',{walls:true}],['5.5/.35/8.5',{walls:false,offTrack:{soft:5.5,dwell:.35,hard:8.5}}],['6.5/.5/9',{walls:false,offTrack:{soft:6.5,dwell:.5,hard:9}}],['7/.6/9 (default)',{walls:false,offTrack:{soft:7,dwell:.6,hard:9}}],['8/.6/9',{walls:false,offTrack:{soft:8,dwell:.6,hard:9}}],['no flip (?racingOffTrack=0)',{walls:false,offTrack:false}]],rows=[];
 for(const pull of [.45,.3])for(const [name,cfg] of variants){const rs=[];for(const stage of [1,2,3,4,5,6])for(const seed of [7,31])rs.push(kidRace(stage,seed,cfg,pull));const m=k=>+(rs.reduce((s,x)=>s+x[k],0)/rs.length).toFixed(2);
  rows.push({pull,variant:name,flipsPerRace:m('off'),wallHitsPerRace:m('wall'),time:m('time'),rank:m('rank'),maxBeyond:+Math.max(...rs.map(x=>x.maxB)).toFixed(1)});}
 return rows;}
if(import.meta.url===`file://${process.argv[1]}`&&process.env.PART==='C'){const rows=thresholds();for(const r of rows)console.log(JSON.stringify(r));if(process.argv[3])await writeFile(process.argv[3],JSON.stringify(rows,null,1)+'\n');}
else if(import.meta.url===`file://${process.argv[1]}`){
 const N=Number(process.argv[2]||1000),outFile=process.argv[3],A=[];
 for(let i=0;i<N;i++){const stage=1+(i%30),seed=1+Math.floor(rand()*9999);A.push(excursion(stage,seed,{drive:2+rand()*10,side:rand()<.5?-1:1,lock:.55+rand()*.45}));}
 const ok=A.filter(a=>a.trigger!==null&&a.landing),stat=f=>{const v=ok.map(f);return {min:+Math.min(...v).toFixed(3),max:+Math.max(...v).toFixed(3),mean:+(v.reduce((s,x)=>s+x,0)/v.length).toFixed(3)};};
 const partA={N,flipped:ok.length,noFlip:A.filter(a=>a.trigger===null).length,nan:A.filter(a=>a.nan).length,why:ok.reduce((m,a)=>(m[a.why]=(m[a.why]||0)+1,m),{}),
  maxBeyond:stat(a=>a.maxBeyond),flight:stat(a=>a.flight),peak:stat(a=>a.peak),landSpeed:stat(a=>a.landing.speed),landLateral:stat(a=>Math.abs(a.landing.lateral)),headingError:stat(a=>Math.abs(a.landing.headingError)),
  fromNearest:stat(a=>a.landing.fromNearest),gateGranted:ok.filter(a=>a.landing.gateGranted).length,pastNextGate:ok.filter(a=>!a.landing.beforeNextGate).length,speedAfter3s:stat(a=>a.speedAfter3s),limit:{soft:OFF_TRACK.soft,hard:OFF_TRACK.hard,dwell:OFF_TRACK.dwell,long:OFF_TRACK.long}};
 console.log('A',JSON.stringify(partA));
 const B=[];for(const walls of [false,true])for(const kind of ['kid','casual','pro'])for(const stage of [1,2,3,4,5,6])for(const seed of [7,31])B.push(race(stage,seed,kind,walls));
 const sum=(rows,k)=>+(rows.reduce((s,r)=>s+r[k],0)/rows.length).toFixed(2),partB={};
 for(const walls of [false,true])for(const kind of ['kid','casual','pro']){const rows=B.filter(r=>r.walls===walls&&r.kind===kind);partB[(walls?'walls':'open')+'-'+kind]={races:rows.length,playerOffPerRace:sum(rows,'playerOff'),rivalOffPerRace:sum(rows,'rivalOff'),playerCrashPerRace:sum(rows,'playerCrash'),rivalCrashPerRace:sum(rows,'rivalCrash'),wallHitsPerRace:sum(rows,'wallHits'),recoveriesPerRace:sum(rows,'recoveries'),meanTime:sum(rows,'time'),maxTime:Math.max(...rows.map(r=>r.time)),meanRank:sum(rows,'rank'),unfinished:rows.filter(r=>!r.finished).length};}
 console.log('B',JSON.stringify(partB));
 if(outFile)await writeFile(outFile,JSON.stringify({partA,partB,excursions:A.slice(0,60),races:B},null,1)+'\n');
}
