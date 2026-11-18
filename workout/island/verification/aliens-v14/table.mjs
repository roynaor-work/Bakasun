import {stage} from './sim.mjs';
const profiles={base:{},upgraded:{equipment:{weapon:1,rate:1.15,damage:1.25,shield:1}},heavy:{equipment:{weapon:2,rate:1.5,damage:2,shield:2},permanentUpgrades:{damage:3,rapid:3,laser:3,wing:3,shield:2},hangar:{rapid:10}}};
const stages=(process.env.STAGES||'1,2,3,5,8').split(',').map(Number),seeds=+(process.env.SEEDS||5),rows=[];
for(const [n,p] of Object.entries(profiles))for(const l of stages){const rs=Array.from({length:seeds},(_,i)=>stage(l,i+1,{profile:p})),a=k=>+(rs.reduce((x,r)=>x+r[k],0)/rs.length).toFixed(1);
 rows.push({profile:n,stage:l,secs:a('seconds'),bullets:Math.round(a('fired')),perSec:+(a('fired')/a('seconds')).toFixed(1),lost:a('lost'),win:rs.filter(r=>r.outcome==='win').length+'/'+seeds});}
console.table(rows);
