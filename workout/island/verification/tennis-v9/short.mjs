// Short-ball reach: how often the computer gets a racket on a fair short ball. Usage: node short.mjs [N] [off] [json patch of v9]
import {playPoint,baseConfig} from './sim.mjs';
const N=+process.argv[2]||300,off=process.argv[3]==='off';
const patch=process.argv[4]?JSON.parse(process.argv[4]):{};
export const STAGES=[1,5,10,15,20,25,30],DIFFS=['easy','normal','hard'];
export function shortStats(config){
 const out={};
 for(const diff of DIFFS){out[diff]={};for(const stage of STAGES){
  const k={dropCenter:[0,0],dropCorner:[0,0],short:[0,0]};
  for(let i=0;i<N;i++){
   const kind=['dropCenter','dropCorner','short'][i%3],side=i%2?1:-1,j=Math.floor(i/3);
   const aimX=kind==='dropCenter'?side*(.05+(j%4)*.07):kind==='dropCorner'?side*(.8+(j%3)*.1):side*(.3+(j%5)*.15);
   const plan=n=>n!==1?{charge:.35}:kind==='short'?{charge:0,aimX,aimZ:.9}:{charge:0,drop:true,aimX};
   const r=playPoint({config,stage,difficulty:diff,seed:i+1,plan,testIndex:1});
   const land=r.landings.find(l=>l.by===0&&l.after===2),returned=r.cpuHits>r.cpuBefore;
   const inCourt=land&&Math.abs(land.z)<=9.06&&Math.abs(land.x)<=4.16&&land.z<=0;
   if(r.humanShots.length<2||r.cpuBefore===undefined||!(inCourt||returned))continue;
   k[kind][0]++;if(returned)k[kind][1]++;
  }
  out[diff][stage]=Object.fromEntries(Object.entries(k).map(([n,[a,b]])=>[n,{n:a,ret:a?b/a:null}]));
 }}
 return out;
}
const avg=(o,diff,kind)=>{const v=STAGES.map(s=>o[diff][s][kind].ret).filter(x=>x!==null);return v.reduce((a,b)=>a+b,0)/v.length;};
if(import.meta.url===`file://${process.argv[1]}`){
 const config=off?{...baseConfig,v9:{...baseConfig.v9,enabled:false}}:{...baseConfig,v9:{...baseConfig.v9,...patch}};
 const o=shortStats(config);
 console.log('stage     '+STAGES.map(s=>String(s).padStart(4)).join(''));
 for(const d of DIFFS)for(const kind of ['dropCenter','dropCorner','short'])console.log(d.padEnd(7),kind.padEnd(11),STAGES.map(s=>String(Math.round(100*(o[d][s][kind].ret??NaN))).padStart(4)).join(''),' avg',Math.round(100*avg(o,d,kind)));
 for(const d of DIFFS)console.log(d,'drops(all) avg',Math.round(100*(avg(o,d,'dropCenter')+avg(o,d,'dropCorner'))/2));
}
