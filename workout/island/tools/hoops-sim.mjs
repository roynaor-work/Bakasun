// Simulates whole games on autopilot and prints shooting and event rates.
// Usage: node workout/island/tools/hoops-sim.mjs [quick|standard|pro] [games]
import {readFileSync} from 'node:fs';
import {createHoopsEngine,NO_INPUT} from '../minigames/hoops-engine.mjs';
import {initialHoops,matchTeams} from '../minigames/hoops-franchise.mjs';
const cfg=JSON.parse(readFileSync(new URL('../data/config.json',import.meta.url),'utf8')).minigames.streetSlam;
const profile=process.argv[2]||'standard',games=+process.argv[3]||6;
const agg={},shots={},scores=[];let t0=Date.now(),steps=0;
for(let g=0;g<games;g++){
 const setup=matchTeams(cfg,initialHoops(cfg),{stage:1});
 const e=createHoopsEngine({config:cfg,seed:500+g,teams:setup.teams,userTeam:0,profile,difficulty:setup.difficulty,assist:setup.assist,autopilot:true});
 const rel={};
 while(e.snapshot().phase!=='final'){e.step(NO_INPUT);steps++;for(const ev of e.drainEvents()){const k=ev.type+(ev.kind?':'+ev.kind:'');agg[k]=(agg[k]||0)+1;
  if(ev.type==='release'){rel[ev.shotId]=ev;const s=shots[ev.shotType+(ev.points===3?'3':'')]||(shots[ev.shotType+(ev.points===3?'3':'')]={n:0,made:0});s.n++;}
  if(ev.type==='score'&&ev.shotId&&rel[ev.shotId]){const r=rel[ev.shotId];shots[r.shotType+(r.points===3?'3':'')].made++;}}}
 scores.push(e.result.score.join('-')+(e.result.overtime?' OT':''));
}
console.log('profile',profile,'games',games,'scores',scores.join(', '));
for(const [k,s] of Object.entries(shots))console.log(k,s.n,'made',s.made,(100*s.made/s.n).toFixed(0)+'%');
const per=k=>(Object.entries(agg).filter(([x])=>x===k||x.startsWith(k+':')).reduce((a,[,v])=>a+v,0)/games).toFixed(1);
console.log('per game: passes',per('pass'),'steals',per('steal'),'blocks',per('block'),'fouls',per('foul'),'FT trips',per('freeThrows'),'rebounds',per('rebound'),'subs',per('sub'),'timeouts',per('timeout'));
console.log('violations',JSON.stringify(Object.fromEntries(Object.entries(agg).filter(([k])=>k.startsWith('violation')))));
console.log('sim speed',(steps/((Date.now()-t0)/1000)/60).toFixed(0),'x realtime');
