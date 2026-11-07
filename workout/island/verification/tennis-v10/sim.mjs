// Headless tennis measurement: a scripted human against the computer, no browser.
import {readFile} from 'node:fs/promises';
import {loadData} from '../../engine/load-data.mjs';
import {createTennis} from '../../minigames/tennis.mjs';
const root=new URL('../../',import.meta.url);
const data=await loadData(root,async u=>({ok:true,json:async()=>JSON.parse(await readFile(u,'utf8'))}));
export const baseConfig=data.config.minigames.tennis;
export const rngOf=seed=>{let v=seed>>>0;return()=>{v=(v+0x6D2B79F5)>>>0;let t=v;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};};
const DT=1/60;
/** Plays one point (human serves, in). `plan(n,rng)` returns the human's shot n (n=0 is the return of the serve):
 *  {charge:0..1, aimX:-1..1, aimZ:-1..1, drop, timing:seconds offset from perfect (default 0)}. Returns what happened. */
export function playPoint({pointNumber=null,trace=null,testIndex=0,config=baseConfig,stage=10,difficulty='normal',seed=1,plan,maxHits=6,ranks={speed:3,hit:3,serve:3}}){
  const pn=pointNumber??seed;seed=(Math.imul(seed,2654435761)^0x9e3779b9)>>>0;const m=createTennis({config,stage,seed,difficulty,ranks}),rng=rngOf(seed*7919+13);
  m.getState().pointNumber=pn;const out={cpuHits:0,humanShots:[],landings:[],end:null,winner:null};
  let t=0,lastEvent=m.getState().event.id,cur=null,swung=false,humanShotNo=0;
  const feed=(dt,i)=>m.update(dt,i);
  while(t<40){
    const s=m.getState();let inp={move:0,moveZ:0};
    if(['serve','toss'].includes(s.phase)&&s.server===0){
      if(s.phase==='serve'){feed(0,{serve:true});feed(0,{serve:false});}
      else if(s.serveZone==='green'&&Math.abs(s.serveMeter-.5)<.04){feed(0,{serve:true});feed(0,{serve:false});}
    }
    if(s.phase==='rally'&&s.contact?.side===0&&s.shot?.side===1){
      if(!cur){cur={...plan(humanShotNo,rng)};cur.timing=cur.timing??0;}
      const c=s.contact,h=s.players[0],dx=c.x-h.x,dz=c.z-h.z;
      inp={move:Math.max(-1,Math.min(1,dx*5)),moveZ:Math.max(-1,Math.min(1,dz*5))};
      const chargeLead=cur.charge*1.1;
      if((c.eta<chargeLead+.05||cur.charge>=.85)&&!swung)inp.prepare=true;
      inp.aim={x:cur.aimX||0,z:cur.aimZ||0,manual:true};inp.drop=!!cur.drop;
      if(c.eta<=cur.timing&&!swung){
        swung=true;feed(0,{...inp,swing:true});feed(0,{...inp,swing:false});
        if(out.humanShots.length===testIndex)out.cpuBefore=out.cpuHits;out.humanShots.push({...cur,charge:cur.charge,landZ:null});humanShotNo++;
      }
    }else if(s.phase==='rally'&&s.shot?.side===0){cur=null;swung=false;}
    feed(DT,inp);t+=DT;if(trace&&out.humanShots.length>testIndex)trace(m.getState(),t);
    const ev=m.getState().event;
    if(ev.id!==lastEvent){lastEvent=ev.id;
      if(ev.type==='hit'&&ev.side===1&&!ev.serving)out.cpuHits++;
      if(ev.type==='hit'&&ev.side===0&&!ev.serving&&out.humanShots.length===testIndex+1){out.grade=ev.grade;out.errTag=ev.error;}
      if(ev.type==='bounce'){const b=m.getState().ball;out.landings.push({x:b.x,z:b.z,by:b.lastHitter,after:out.humanShots.length});}
      if(['point','game','complete'].includes(ev.type)){out.end=ev.reason;out.winner=ev.winner;return out;}}
    if(out.humanShots.length>=maxHits&&m.getState().shot?.side===0&&m.getState().ball.bounces>=1&&false)break;
  }
  out.end='timeout';return out;
}
