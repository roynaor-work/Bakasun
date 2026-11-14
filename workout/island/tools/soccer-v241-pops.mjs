/** Soccer v24.1 clip timelines as the game plays them (evidence only): the largest local bone rotation step per 60 Hz frame ("pop") and the
 * time each action keeps the player busy, for the v24 clip against its v24.1 replacement on the same simulation clocks.
 *  slide: the slide clock (0.35 s) to the contact, the recovery clock to the end (full match: v24 1.1 s, v24.1 0.8 s; a lost slide x1.2);
 *  keeper dive: the feel v2 plan (soccerFeelDivePlan: lead 0.1 s, contact at 70% of the 0.65 s dive, settle at 1.05x) on v11 / v241 dives;
 *  fouled carrier, stumble, volley, scissor: the rates of soccer-r241.mjs.
 * Keys are slerped like the mixer (no crossfade). Usage: node workout/island/tools/soccer-v241-pops.mjs [--json out.json] */
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {soccerFeelDivePlan} from '../minigames/soccer-feel.mjs';
import {soccerV11States,soccerV12Overlay} from '../minigames/soccer-codex-motion.mjs';
import {SOCCER_V241_SLIDE,SOCCER_V241_AIR_CLIPS,soccerFouledSeconds,SOCCER_FOULS_V241,SOCCER_SLIDE_V241} from '../minigames/soccer-r241.mjs';
const load=f=>JSON.parse(readFileSync(new URL('../assets/'+f,import.meta.url),'utf8')).states;
const slerp=(a,b,t)=>{let d=a[0]*b[0]+a[1]*b[1]+a[2]*b[2]+a[3]*b[3];const s=d<0?-1:1;d*=s;if(d>.9995){const o=a.map((v,i)=>v+(s*b[i]-v)*t),n=Math.hypot(...o);return o.map(v=>v/n);}const th=Math.acos(d),k0=Math.sin((1-t)*th)/Math.sin(th),k1=Math.sin(t*th)/Math.sin(th);return a.map((v,i)=>k0*v+k1*s*b[i]);};
/** Local rotations of a state at clip time `time` (seconds). */
export function poseAt(state,time){
  const u=Math.max(0,Math.min(1,time/state.durationSeconds)),k=state.keyframes;let i=1;while(i<k.length-1&&k[i].time<u)i++;
  const a=k[i-1],b=k[i],t=b.time>a.time?(u-a.time)/(b.time-a.time):0;
  return Object.fromEntries(Object.keys(a.rotations).map(bone=>[bone,slerp(a.rotations[bone],b.rotations[bone],Math.max(0,Math.min(1,t)))]));
}
const angle=(p,q)=>2*Math.acos(Math.min(1,Math.abs(p[0]*q[0]+p[1]*q[1]+p[2]*q[2]+p[3]*q[3])))*180/Math.PI;
/** Max and p95 bone step per 60 Hz frame along `times` (clip seconds, one per frame). */
export function pops(state,times){
  const steps=[];let prev=null,worst={deg:0,bone:'',at:0};
  for(const [n,t] of times.entries()){const pose=poseAt(state,t);if(prev){let m=0,bone='';for(const b of Object.keys(pose)){const a=angle(prev[b],pose[b]);if(a>m){m=a;bone=b;}}steps.push(m);if(m>worst.deg)worst={deg:+m.toFixed(1),bone,at:+(n/60).toFixed(3)};}prev=pose;}
  const s=[...steps].sort((a,b)=>a-b);return {frames:times.length,seconds:+(times.length/60).toFixed(2),max:worst.deg,bone:worst.bone,at:worst.at,p95:+(s[Math.floor(.95*(s.length-1))]||0).toFixed(1),over25:steps.filter(v=>v>25).length};
}
const frames=(seconds,fn)=>Array.from({length:Math.max(2,Math.round(seconds*60)+1)},(_,i)=>fn(i/60));
/** Slide timeline: [slideSeconds to the contact] + [recover to the end], then the standing finish at real time. */
function slideTimes(state,{contact,end},slide,recover){return frames(slide+recover,t=>t<=slide?contact*t/slide:contact+(end-contact)*Math.min(1,(t-slide)/recover));}
export function report(){
  const v24=load('soccer-v24/clips/clips.json'),v241=load('soccer-v241/clips/tackle.json'),air=load('soccer-v241/clips/aerial.json');
  // the v11 dives as the game plays them: prefixed and repaired by the v12 overlay (loadMotionPacks)
  const raw=f=>JSON.parse(readFileSync(new URL('../assets/'+f,import.meta.url),'utf8')),v11=soccerV12Overlay(raw('soccer-v12/clips.json'),{v9:{},v10:{},v8:{},v11:soccerV11States(raw('soccer-v11/clips.json'))}).v11;
  const rows=[];
  for(const [label,recover] of [['won',1],['lost',1.2]]){
    const r24=1.1*recover,r241=(.6+SOCCER_SLIDE_V241.extra)*recover;
    rows.push({action:`slide (${label})`,v24:{...pops(v24.slide_tackle,slideTimes(v24.slide_tackle,{contact:.4,end:1},.35,r24)),busy:+(.35+r24).toFixed(2)},v241:{...pops(v241.slide,slideTimes(v241.slide,{contact:SOCCER_V241_SLIDE.contact,end:SOCCER_V241_SLIDE.end},.35,r241)),busy:+(.35+r241).toFixed(2)}});
  }
  // keeper dives: the v11 dives the game shipped (v12 repairs applied where the pack has them) against the v24.1 rows
  const dive=(st,name)=>{const plan=soccerFeelDivePlan(st,.65);if(!plan)return null;const contact=plan.contact,at=plan.at,toContact=(contact-at)/plan.rate,after=(plan.stand-contact)/plan.settleRate;return {...pops(st,frames(toContact+after,t=>t<=toContact?at+t*plan.rate:contact+(t-toContact)*plan.settleRate)),clip:name,busy:+(toContact+after).toFixed(2)};};
  const old=n=>v11['v11_'+n];
  for(const [row,v11name,v241name] of [['low','keeper_dive_left','keeper_dive_low_left'],['middle','keeper_dive_left','keeper_dive_mid_left'],['high','keeper_dive_left','keeper_dive_high_left']])
    rows.push({action:`keeper dive ${row} (left)`,v24:old(v11name)?dive(old(v11name),'v11_'+v11name):null,v241:dive(v241[v241name],'v241_'+v241name)});
  const fall=soccerFouledSeconds();rows.push({action:'fouled carrier: fall + get up',v24:null,v241:{...pops(v241.fall_foul,frames(fall,t=>t*SOCCER_FOULS_V241.fallRate)),busy:fall}});
  rows.push({action:'clean tackle: stumble',v24:null,v241:{...pops(v241.stumble,frames(.5,t=>t)),busy:0}});
  const A=SOCCER_V241_AIR_CLIPS,vc=air.volley_right.ballContacts[0].atSeconds,sc=air.scissor.ballContacts[0].atSeconds;
  rows.push({action:'volley (contact to follow-through)',v24:null,v241:pops(air.volley_right,frames((A.volley.lead+A.volley.follow)/A.volley.rate,t=>vc-A.volley.lead+t*A.volley.rate))});
  rows.push({action:'scissor (contact, back landing, get up)',v24:null,v241:{...pops(air.scissor,frames((air.scissor.durationSeconds-(sc-A.scissor.lead))/A.scissor.rate,t=>sc-A.scissor.lead+t*A.scissor.rate)),busy:+((air.scissor.durationSeconds-(sc-A.scissor.lead))/A.scissor.rate).toFixed(2)}});
  return rows;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const rows=report(),f=x=>x?`max ${String(x.max).padStart(5)}° p95 ${String(x.p95).padStart(4)}° >25°:${String(x.over25).padStart(2)} busy ${x.busy??'-'}s`:'-';
  for(const r of rows)console.log(r.action.padEnd(40),'| v24',f(r.v24).padEnd(46),'| v24.1',f(r.v241));
  const out=process.argv.indexOf('--json');if(out>0)writeFileSync(process.argv[out+1],JSON.stringify(rows,null,1));
}
