// "Seven-year-old" bots: they follow the ball late and loosely, tap or hold at random, and release with a noisy sense of timing.
// Measures what the child feels: how often the racket meets the ball, how long rallies last, how often the child wins, and why points end.
// node child.mjs [matchesPerCell] [off]  (off = ?tennisDeep=0)
import {baseConfig} from './sim.mjs';
import {createTennis} from '../../minigames/tennis.mjs';
const N=+process.argv[2]||12,off=process.argv[3]==='off';
const config=off?{...baseConfig,v9:{...baseConfig.v9,deep:{...(baseConfig.v9.deep||{}),enabled:false}}}:baseConfig;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),rngOf=seed=>{let v=seed>>>0;return()=>{v=(v+0x6D2B79F5)>>>0;let t=v;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};};
export const PROFILES={
 child:{react:.35,gain:.7,noise:.45,timing:.16,hold:[0,0,.8,1.1]},
 teen:{react:.2,gain:1,noise:.2,timing:.08,hold:[0,.9,1.1]}
};
export function play(stage,difficulty,profile,seed,cfg=config){
 const P=PROFILES[profile],rng=rngOf(seed*977+3),game=createTennis({config:cfg,stage,seed:(Math.imul(seed,2654435761)>>>0),difficulty,ranks:{speed:2,hit:2,serve:2}});
 const stats={balls:0,met:0,shots:0,points:0,rallyHits:0,reasons:{},won:null,games:[0,0],ratings:{}};
 let incomingAt=null,serial=-1,swung=false,hold=0,offset=0,noiseX=0,noiseZ=0,lastEvent=-1;
 for(let i=0;i<216000&&!game.result;i++){
  const s=game.getState(),p=s.players[0],incoming=s.phase==='rally'&&s.contact?.side===0&&s.shot?.side===1;
  if(incoming&&serial!==s.rallyHits){serial=s.rallyHits;incomingAt=s.elapsed;swung=false;hold=P.hold[Math.floor(rng()*P.hold.length)];offset=(rng()+rng()-1)*P.timing*2;noiseX=(rng()+rng()-1)*P.noise*2;noiseZ=(rng()+rng()-1)*P.noise*2;stats.balls++;}
  if(!incoming){incomingAt=null;serial=-1;}
  let move=0,moveZ=0,prepare=false,swing=false;
  if(incoming&&s.elapsed-incomingAt>=P.react){const dx=s.contact.x+noiseX-p.x,dz=s.contact.z+noiseZ-p.z;move=clamp(dx*3*P.gain,-1,1);moveZ=clamp(dz*3*P.gain,-1,1);}
  else if(!incoming){const dx=0-p.x,dz=5.8-p.z;move=clamp(dx*1.5,-1,1)*.6;moveZ=clamp(dz*1.5,-1,1)*.6;}
  if(incoming&&hold>0&&s.contact.eta<hold+.05&&!swung)prepare=true;
  if(incoming&&!swung&&s.contact.eta<=offset){swung=true;swing=true;stats.shots++;}
  const serve=s.server===0&&(s.phase==='serve'||s.phase==='toss'&&s.serveMeter>=.46&&s.serveMeter<=.54);
  game.update(1/60,{move,moveZ,prepare,swing,serve,aim:{manual:false,x:0,z:0}});
  const ev=game.getState().event;
  if(ev.id!==lastEvent){lastEvent=ev.id;if(ev.type==='hit'&&ev.side===0&&!ev.serving){stats.met++;if(ev.rating)stats.ratings[ev.rating]=(stats.ratings[ev.rating]||0)+1;}
   if(ev.type==='missSwing')stats.misses=(stats.misses||{}),stats.misses[ev.reason]=(stats.misses[ev.reason]||0)+1;
   if(['point','game','complete'].includes(ev.type)){stats.points++;const key=(ev.winner===0?'+':'-')+(ev.reason||'winner');stats.reasons[key]=(stats.reasons[key]||0)+1;stats.rallyHits+=game.getState().rallyHits;}}
 }
 stats.won=game.result?.won??false;stats.games=[game.result?.gamesFor??game.getState().score.games[0],game.result?.gamesAgainst??game.getState().score.games[1]];return stats;
}
if(import.meta.url===`file://${process.argv[1]}`){
 for(const profile of ['child','teen'])for(const [stage,diff] of [[1,'easy'],[3,'easy'],[6,'easy'],[10,'normal'],[15,'normal']]){
  const a={misses:{},ratings:{},balls:0,met:0,points:0,rallyHits:0,won:0,gf:0,ga:0,reasons:{}};
  for(let m=1;m<=N;m++){const r=play(stage,diff,profile,m);a.balls+=r.balls;a.met+=r.met;a.points+=r.points;a.rallyHits+=r.rallyHits;a.won+=r.won?1:0;a.gf+=r.games[0];a.ga+=r.games[1];for(const [k,v] of Object.entries(r.reasons))a.reasons[k]=(a.reasons[k]||0)+v;for(const [k,v] of Object.entries(r.misses||{}))a.misses[k]=(a.misses[k]||0)+v;for(const [k,v] of Object.entries(r.ratings||{}))a.ratings[k]=(a.ratings[k]||0)+v;}
  const top=Object.entries(a.reasons).sort((x,y)=>y[1]-x[1]).slice(0,5).map(([k,v])=>`${k} ${(100*v/a.points).toFixed(0)}%`).join(', ');
  console.log(`${profile.padEnd(5)} stage ${String(stage).padStart(2)} ${diff.padEnd(6)} meets ${(100*a.met/Math.max(1,a.balls)).toFixed(0)}% of balls | rally ${(a.rallyHits/a.points).toFixed(1)} hits | match wins ${a.won}/${N} | games ${(a.gf/N).toFixed(1)}-${(a.ga/N).toFixed(1)} | ends: ${top} | swing misses ${JSON.stringify(a.misses)} | ratings ${JSON.stringify(a.ratings)}`);
 }}
