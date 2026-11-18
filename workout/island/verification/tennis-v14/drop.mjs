// A player who answers with a near-net drop shot: how often does the point end right there (the opponent never touches the ball), and how long are the rallies?
// node drop.mjs [N] [off]   off = ?tennisDrop=0
import {baseConfig} from './sim.mjs';
import {createTennis} from '../../minigames/tennis.mjs';
const N=+process.argv[2]||80,off=process.argv[3]==='off';
const config=off?{...baseConfig,v9:{...baseConfig.v9,dropFix:{...(baseConfig.v9.dropFix||{}),enabled:false}}}:baseConfig;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),rng=seed=>{let v=seed>>>0;return()=>{v=(v+0x6D2B79F5)>>>0;let t=v;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};};
export function play(stage,diff,seed,cfg=config,dropEvery=3){
 const r=rng(seed*31+5),g=createTennis({config:cfg,stage,seed:(Math.imul(seed,2654435761)>>>0),difficulty:diff,ranks:{speed:3,hit:3,serve:3}});
 let serial=-1,fired=false,shots=0,lastEvent=-1;const out={drops:0,instant:0,returned:0,rally:[],net:0,outBall:0};let pending=null;
 for(let i=0;i<60*400&&!g.result;i++){
  const s=g.getState(),p=s.players[0],inc=s.phase==='rally'&&s.contact?.side===0&&s.shot?.side===1;
  if(inc&&serial!==s.rallyHits){serial=s.rallyHits;fired=false;}
  const dropNow=inc&&!fired&&shots%dropEvery===dropEvery-1;
  let move=0,moveZ=0,swing=false,drop=false,aim={manual:true,x:(r()*2-1),z:0};
  if(inc){move=clamp((s.contact.x-p.x)*4,-1,1);moveZ=clamp((s.contact.z-p.z)*4,-1,1);if(!fired&&s.contact.eta<=0){swing=true;fired=true;drop=dropNow;}}
  const serve=s.server===0&&(s.phase==='serve'||s.phase==='toss'&&s.serveMeter>=.46&&s.serveMeter<=.54);
  g.update(1/60,{move,moveZ,swing,drop,serve,aim});
  const ev=g.getState().event;
  if(ev.id!==lastEvent){lastEvent=ev.id;
   if(ev.type==='hit'&&ev.side===0&&!ev.serving){
     if(pending){if(pending.cpuHit)out.returned++;else out.instant++;pending=null;}   // the previous drop is judged when the player hits again
     shots++;if(g.getState().shot?.drop){out.drops++;pending={cpuHit:false};}}
   else if(ev.type==='hit'&&ev.side===1&&!ev.serving&&pending){pending.cpuHit=true;}
   if(['point','game','complete'].includes(ev.type)&&pending){if(pending.cpuHit)out.returned++;else{out.instant++;if(ev.reason==='net')out.net++;if(ev.reason==='out')out.outBall++;}out.rally.push(g.getState().rallyHits);pending=null;}}
 }
 return out;
}
if(import.meta.url===`file://${process.argv[1]}`){
 for(const [stage,diff] of [[1,'easy'],[3,'easy'],[6,'easy'],[10,'normal'],[15,'normal'],[25,'hard']]){
  const a={drops:0,instant:0,returned:0,net:0,out:0,rally:[]};
  for(let m=1;m<=N;m++){const o=play(stage,diff,m);a.drops+=o.drops;a.instant+=o.instant;a.net+=o.net;a.out+=o.outBall;a.returned+=o.returned;a.rally.push(...o.rally);}
  const avg=a.rally.reduce((x,y)=>x+y,0)/Math.max(1,a.rally.length);
  console.log(`stage ${String(stage).padStart(2)} ${diff.padEnd(6)} drops ${a.drops}: opponent returns ${(100*a.returned/a.drops).toFixed(0)}% | point won outright (nobody touches it) ${(100*(a.instant-a.net-a.out)/a.drops).toFixed(0)}% (+ the drop itself in the net/out: ${(100*(a.net+a.out)/a.drops).toFixed(0)}%) | avg hits in those points ${avg.toFixed(1)}`);
 }}
