import {run} from './sim.mjs';
const lv=[1,2,3,5],out=[];
for(const [pn,profile] of Object.entries({base:{},upg:{equipment:{weapon:1,rate:1.15,damage:1.25,shield:1}}})){const row={p:pn};
for(const l of lv){const rs=[1,2,3,4,5,6,7,8].map(s=>run(l,s,{profile,press:+(process.env.PRESS||.45)}));row['L'+l]=`${(rs.reduce((n,r)=>n+r.seconds,0)/8).toFixed(0)}s lost${(rs.reduce((n,r)=>n+r.livesLost,0)/8).toFixed(1)} w${rs.filter(r=>r.outcome==='win').length}/8 b${(rs.reduce((n,r)=>n+r.bonuses,0)/8).toFixed(1)}`;}
out.push(row);}
console.log(process.env.V9);console.table(out);
