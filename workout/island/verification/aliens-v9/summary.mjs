import {run} from './sim.mjs';
const rows=[];
for(const [pn,profile] of Object.entries({base:{},upgraded:{equipment:{weapon:1,rate:1.15,damage:1.25,shield:1}}}))for(const l of [1,2,3,5,8]){
 const rs=[1,2,3,4,5,6,7,8].map(s=>run(l,s,{profile,press:1})),a=k=>+(rs.reduce((n,r)=>n+r[k],0)/rs.length).toFixed(1);
 rows.push({profile:pn,stage:l,seconds:a('seconds'),shotsPerKill:a('shotsPerKill'),bonuses:a('bonuses'),livesLost:a('livesLost'),win:rs.filter(r=>r.outcome==='win').length+'/8'});}
console.table(rows);
