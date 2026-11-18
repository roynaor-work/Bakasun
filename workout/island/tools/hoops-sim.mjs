// Simulates whole games on autopilot and prints shooting and event rates.
// Usage: node workout/island/tools/hoops-sim.mjs [quick|standard|pro] [games] [play=0] [seed=500] [json=1] [set=doubledCut:false,aiOopChance:0.2]
//   set= overrides keys of config.play for the run (ablations and tuning).
//   play=0 switches the M3 gameplay layer (alley-oops, pass kinds, spacing, doubled-handler cuts) off,
//   the same as `?hoopsPlay=0` in the app; the spacing share is measured either way.
import {readFileSync} from 'node:fs';
import {createHoopsEngine,NO_INPUT} from '../minigames/hoops-engine.mjs';
import {initialHoops,matchTeams} from '../minigames/hoops-franchise.mjs';
const cfg=JSON.parse(readFileSync(new URL('../data/config.json',import.meta.url),'utf8')).minigames.streetSlam;
const kv=Object.fromEntries(process.argv.slice(2).filter(a=>a.includes('=')).map(a=>a.split('='))),pos=process.argv.slice(2).filter(a=>!a.includes('='));
const profile=pos[0]||'standard',games=+pos[1]||6,seed0=+(kv.seed||500);
let play=kv.play==='0'?false:undefined;
if(kv.set&&play!==false){play={...cfg.play};for(const kvp of kv.set.split(',')){const [k,v]=kvp.split(':');play[k]=v==='true'?true:v==='false'?false:+v;}}
const agg={},shots={},scores=[],passKinds={};let t0=Date.now(),steps=0,liveHeld=0,crowded=0,doubled=0,doubledCut=0,ast=0,tov=0,oop={n:0,made:0,dunk:0,layup:0,thrown:0,caught:0};
const R=cfg.play?.spacingRadius??2.5,MAX=cfg.play?.spacingMax??2;
for(let g=0;g<games;g++){
 const setup=matchTeams(cfg,initialHoops(cfg),{stage:1});
 const e=createHoopsEngine({config:cfg,seed:seed0+g,teams:setup.teams,userTeam:0,profile,difficulty:setup.difficulty,assist:setup.assist,autopilot:true,play});
 const rel={},S=e.debug.state,api=e.debug.api;
 while(e.snapshot().phase!=='final'){e.step(NO_INPUT);steps++;
  // spacing: live possession, ball in hand, frontcourt: how many off-ball mates stand within R of the handler
  if(S.phase==='live'&&S.ball.state==='held'){const h=api.holder();if(h&&api.court.frontcourt(api.side(h.team),h.x)){liveHeld++;let n=0,cut=false;for(const q of api.onCourt(h.team))if(q!==h){if(api.dist(q,h)<R)n++;if(q.role==='cut')cut=true;}if(n>MAX)crowded++;
   // doubled: one defender inside 0.8 m and two inside 1.6 m (the AI's own trap definition); is somebody cutting for him?
   let close=0,near=0;for(const o of api.onCourt(1-h.team)){const d=api.dist(o,h);if(d<0.8)close++;if(d<1.6)near++;}if(close>=1&&near>=2){doubled++;if(cut)doubledCut++;}}}
  for(const ev of e.drainEvents()){const k=ev.type+(ev.kind?':'+ev.kind:'');agg[k]=(agg[k]||0)+1;
  if(ev.type==='pass'){passKinds[ev.kind]=(passKinds[ev.kind]||0)+1;if(ev.oop)oop.thrown++;}if(ev.type==='catch'&&ev.oop)oop.caught++;
  if(ev.type==='release'){rel[ev.shotId]=ev;const s=shots[ev.shotType+(ev.points===3?'3':'')]||(shots[ev.shotType+(ev.points===3?'3':'')]={n:0,made:0});s.n++;if(ev.oop){oop.n++;oop[ev.shotType]=(oop[ev.shotType]||0)+1;}}
  if(ev.type==='score'&&ev.shotId&&rel[ev.shotId]){const r=rel[ev.shotId];shots[r.shotType+(r.points===3?'3':'')].made++;if(r.oop)oop.made++;}}}
 scores.push(e.result.score.join('-')+(e.result.overtime?' OT':''));
 for(const t of e.result.box)for(const p of t){ast+=p.ast;tov+=p.tov;}
}
const per=k=>(Object.entries(agg).filter(([x])=>x===k||x.startsWith(k+':')).reduce((a,[,v])=>a+v,0)/games).toFixed(1);
const pts=scores.reduce((a,s)=>a+s.split(' ')[0].split('-').reduce((x,y)=>x+ +y,0),0)/games;
const summary={profile,games,play:play!==false,points:+pts.toFixed(1),oopsPerGame:+(oop.n/games).toFixed(2),oopMade:oop.made,oopAttempts:oop.n,oopSuccess:oop.n?+(oop.made/oop.n).toFixed(2):null,oopDunks:oop.dunk||0,oopLayups:oop.layup||0,
 oopLobsThrown:oop.thrown,oopLobsCaught:oop.caught,assistsPerGame:+(ast/games).toFixed(1),turnoversPerGame:+(tov/games).toFixed(1),spacingViolationShare:+(crowded/Math.max(1,liveHeld)).toFixed(3),doubledShare:+(doubled/Math.max(1,liveHeld)).toFixed(3),doubledWithCutShare:+(doubledCut/Math.max(1,doubled)).toFixed(2),passesPerGame:+per('pass'),passKinds,interceptionsPerGame:+per('interception'),
 violations:Object.fromEntries(Object.entries(agg).filter(([k])=>k.startsWith('violation'))),fouls:Object.fromEntries(Object.entries(agg).filter(([k])=>k.startsWith('foul:'))),
 stealsPerGame:+per('steal'),blocksPerGame:+per('block'),foulsPerGame:+per('foul'),violationsPerGame:+per('violation'),reboundsPerGame:+per('rebound')};
if(kv.json==='1'){console.log(JSON.stringify({summary,shots,scores}));process.exit(0);}
console.log('profile',profile,'games',games,'play',play!==false?'on':'off','scores',scores.join(', '));
for(const [k,s] of Object.entries(shots))console.log(k,s.n,'made',s.made,(100*s.made/s.n).toFixed(0)+'%');
console.log('per game: passes',per('pass'),'steals',per('steal'),'blocks',per('block'),'fouls',per('foul'),'FT trips',per('freeThrows'),'rebounds',per('rebound'),'subs',per('sub'),'timeouts',per('timeout'));
console.log('M3: points/game',pts.toFixed(1),'alley-oops/game',(oop.n/games).toFixed(2),'made',oop.made,'/',oop.n,'(dunk',oop.dunk||0,'layup',oop.layup||0,'; lobs thrown',oop.thrown,'caught',oop.caught,') assists/game',(ast/games).toFixed(1),'turnovers/game',(tov/games).toFixed(1),'spacing violation share',(100*crowded/Math.max(1,liveHeld)).toFixed(1)+'%','doubled share',(100*doubled/Math.max(1,liveHeld)).toFixed(1)+'%','with a cutter',(100*doubledCut/Math.max(1,doubled)).toFixed(0)+'%','pass kinds',JSON.stringify(passKinds),'interceptions/game',per('interception'));
console.log('fouls by kind',JSON.stringify(Object.fromEntries(Object.entries(agg).filter(([k])=>k.startsWith('foul')))));
console.log('violations',JSON.stringify(Object.fromEntries(Object.entries(agg).filter(([k])=>k.startsWith('violation')))));
console.log('sim speed',Math.round(steps/60/((Date.now()-t0)/1000)),'x realtime');
