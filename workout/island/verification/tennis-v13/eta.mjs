// How much time does the player really have between the opponent's hit and the contact? (that bounds how long the button can be held)
import {baseConfig} from './sim.mjs';
import {createTennis} from '../../minigames/tennis.mjs';
const out={};
for(const [stage,diff] of [[1,'easy'],[6,'easy'],[10,'normal']]){
 const etas=[];
 for(let seed=1;seed<=6;seed++){const g=createTennis({config:baseConfig,stage,seed:(Math.imul(seed,2654435761)>>>0),difficulty:diff});let serial=-1;
  for(let i=0;i<60*240&&!g.result;i++){const s=g.getState(),p=s.players[0],inc=s.phase==='rally'&&s.contact?.side===0&&s.shot?.side===1;
   if(inc&&serial!==s.rallyHits){serial=s.rallyHits;etas.push(s.contact.eta);}
   const serve=s.server===0&&(s.phase==='serve'||s.phase==='toss'&&s.serveMeter>=.46&&s.serveMeter<=.54);
   const m=inc?{move:Math.max(-1,Math.min(1,(s.contact.x-p.x)*3)),moveZ:Math.max(-1,Math.min(1,(s.contact.z-p.z)*3))}:{};
   g.update(1/60,{...m,serve,swing:inc&&s.contact.eta<=0,prepare:false,aim:{manual:false,x:0,z:0}});}}
 etas.sort((a,b)=>a-b);const q=f=>etas[Math.floor(etas.length*f)].toFixed(2);
 console.log(`stage ${stage} ${diff}: n=${etas.length} time from the opponent's hit to contact: min ${q(0)} p25 ${q(.25)} median ${q(.5)} p75 ${q(.75)} max ${q(.99)} s`);}
