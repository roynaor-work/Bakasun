import {baseConfig} from './sim.mjs';
import {createTennis} from '../../minigames/tennis.mjs';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function rally(diff,hold,seed,config){
 const g=createTennis({config,stage:6,seed:(Math.imul(seed,2654435761)>>>0),difficulty:diff,ranks:{speed:3,hit:3,serve:3}});
 let serial=-1,pressAt=null,fired=false,shots=0,res=null,lastEvent=-1;
 for(let i=0;i<60*120&&!res;i++){
  const s=g.getState(),p=s.players[0],inc=s.phase==='rally'&&s.contact?.side===0&&s.shot?.side===1;
  if(inc&&serial!==s.rallyHits){serial=s.rallyHits;pressAt=s.elapsed;fired=false;}
  let move=0,moveZ=0,prepare=false,swing=false;
  if(inc){move=clamp((s.contact.x-p.x)*4,-1,1);moveZ=clamp((s.contact.z-p.z)*4,-1,1);}
  const test=shots===1;   // the second return is the measured one, the first is a plain tap
  if(inc&&test&&!fired){const held=s.elapsed-pressAt;if(hold===null||held<hold)prepare=true;else{swing=true;fired=true;}}
  else if(inc&&!test&&!fired&&s.contact.eta<=0){swing=true;fired=true;}
  const serve=s.server===0&&(s.phase==='serve'||s.phase==='toss'&&s.serveMeter>=.46&&s.serveMeter<=.54);
  g.update(1/60,{move,moveZ,prepare:prepare,swing,serve,aim:{manual:false,x:0,z:0}});
  const ev=g.getState().event;
  if(ev.id!==lastEvent){lastEvent=ev.id;if(ev.type==='hit'&&ev.side===0&&!ev.serving){shots++;if(shots===2)res={grade:ev.grade,error:ev.error,rating:ev.rating,power:ev.power,fired:ev.timing};}}
 }
 return res;
}
