// Headless check of the stop mode and the fast shuffle of hoops-stop-clips-v1 (no browser, no rendering): runs autoplay engine games and counts, per player and tick,
// how often a running player (>= 2.4 m/s, no ball) releases the stick, whether the stop mode engaged, and why not. Also the lateral speed share.
// Usage: node workout/island/tools/hoops-stop-sim.mjs [games=3] [ticks=3600] [stop=1]
import {readFileSync} from 'node:fs';
import {createHoopsEngine} from '../minigames/hoops-engine.mjs';
import {initialHoops,matchTeams} from '../minigames/hoops-franchise.mjs';
import {engineV250,hoopsV250Flags} from '../minigames/hoops-v250.mjs';
import {STOP,engineStopClips} from '../minigames/hoops-stop-clips.mjs';
const cfg=JSON.parse(readFileSync(new URL('../data/config.json',import.meta.url),'utf8')).minigames.streetSlam;
const [games=3,ticks=3600,stop=1]=process.argv.slice(2).map(Number);
const hyp=Math.hypot,out={games,ticks,fast:0,stops:0,released:0,reasons:{},v0:[],lateral:{n:0,band:{}},dropFrames:[]};
for(let g=0;g<games;g++){
 const config=structuredClone(cfg),clubs=matchTeams(config,initialHoops(config),{stage:1});
 const flags=hoopsV250Flags(new URLSearchParams('hoopsV250=1&feet=1'));
 const e=createHoopsEngine({config,seed:4242+g*37,teams:clubs.teams,userTeam:0,profile:'quick',difficulty:clubs.difficulty,assist:clubs.assist,autopilot:true,aiVersion:'v2',v250:engineV250(flags),stopClips:stop?STOP:null});
 const prev=new Map();
 for(let i=0;i<ticks;i++){
  e.step({});
  const s=e.snapshot();
  for(const p of s.players){
   const q=prev.get(p.id),sp=hyp(p.vx,p.vz);
   if(q&&!p.hasBall&&!q.hasBall&&q.sp>=2.4&&sp<q.sp-0.15){ // slowing from a run, no ball
    const face=p.look??0;
    out.released++;
    if(p.stop){out.stops++;if(out.v0.length<40)out.v0.push(+p.stop.v0.toFixed(2));}
    else{const r=q.stop?'stop ended':'not engaged';out.reasons[r]=(out.reasons[r]||0)+1;}
   }
   if(p.stop&&!(q&&q.stop))out.fast++;
   prev.set(p.id,{sp,hasBall:p.hasBall,stop:p.stop});
  }
 }
}
console.log(JSON.stringify(out));
