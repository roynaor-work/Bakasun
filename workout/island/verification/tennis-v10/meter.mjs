// v10 hit meter: in-rate by zone, grade distribution, and match win rates. node meter.mjs [N] [off]
import {playPoint,baseConfig} from './sim.mjs';
const N=+process.argv[2]||600,off=process.argv[3]==='off';
const config=off?{...baseConfig,v9:{...baseConfig.v9,meter:{...baseConfig.v9.meter,enabled:false}}}:baseConfig;
const classify=r=>{const land=r.landings.find(l=>l.by===0&&l.after===2),ret=r.cpuHits>r.cpuBefore;if(r.humanShots.length<2||r.cpuBefore===undefined)return null;
 if(!land&&!ret)return r.winner===1&&(r.end==='net'||r.end==='out')?r.end:null;if(land&&(Math.abs(land.z)>9.06||Math.abs(land.x)>4.16))return 'out';return 'in';};
// timing offsets (seconds) sweep from perfect to late/early
const out={};
for(const diff of ['easy','normal','hard'])for(const tOff of [0,.05,.1,.15,.2,.3]){
 const g={};
 for(let i=0;i<N;i++){const sgn=i%2?1:-1;
  const r=playPoint({config,stage:10,difficulty:diff,seed:i+1,testIndex:1,plan:(n,rng)=>n!==1?{charge:.3}:{charge:.3,aimX:((i*17)%11-5)/8,aimZ:0,timing:sgn*tOff+(rng()-.5)*.02}});
  const c=classify(r);if(!c||!r.grade)continue;const k=r.grade;g[k]??={n:0,in:0,net:0,out:0};g[k].n++;g[k][c]++;}
 out[diff+'@'+tOff]=g;
}
const fmt=g=>Object.entries(g).map(([k,v])=>`${k} n=${v.n} in ${(100*v.in/v.n).toFixed(0)}% net ${(100*v.net/v.n).toFixed(0)}% out ${(100*v.out/v.n).toFixed(0)}%`).join(' | ');
for(const [k,v] of Object.entries(out))console.log(k.padEnd(12),fmt(v));
// pooled by zone per difficulty
for(const diff of ['easy','normal','hard']){const t={};for(const [k,v] of Object.entries(out))if(k.startsWith(diff))for(const [z,x] of Object.entries(v)){t[z]??={n:0,in:0,net:0,out:0};for(const f of ['n','in','net','out'])t[z][f]+=x[f];}console.log('POOLED',diff.padEnd(7),fmt(t));}
