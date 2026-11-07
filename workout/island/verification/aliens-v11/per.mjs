import {stage} from './sim.mjs';
for(let s=1;s<=10;s++){const r=stage(1,s,{});console.log(s,r.seconds,r.boltsPerMin,'hits',r.hits,'lost',r.lost,r.outcome);}
