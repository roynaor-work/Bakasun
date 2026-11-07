// Power <-> length and quality distribution for the human's rally shots. node power.mjs [N] [off]
import {playPoint,baseConfig} from './sim.mjs';
const off=process.argv[3]==='off',N=+process.argv[2]||200;
const config=off?{...baseConfig,v9:{...baseConfig.v9,enabled:false}}:baseConfig;
const pw=baseConfig.v9.power;
const need=z=>{const d=z<0?5.4-z*(pw.maxDepth-5.4):5.4-z*(5.4-pw.minDepth);return d<=5.4?0:(d-5.4)/(pw.maxDepth-5.4)*pw.needAtMax;};
function classify(r){
  const land=r.landings.find(l=>l.by===0&&l.after===2),returned=r.cpuHits>r.cpuBefore;
  if(r.humanShots.length<2||r.cpuBefore===undefined)return null;
  if(!land&&!returned){return r.winner===1&&(r.end==='net'||r.end==='out')?r.end:null;}
  if(land&&(Math.abs(land.z)>9.06||Math.abs(land.x)>4.16))return 'out';
  return land?{in:true,z:Math.abs(land.z)}:{in:true,z:0};
}
// 1) charge sweep per intended length (aimZ), perfect timing, difficulty normal
export function sweep(difficulty='normal',stage=10){
  const rows=[];
  for(const aimZ of [.9,.4,0,-.4,-1])for(let ch=0;ch<=1.0001;ch+=.1){
    const o={in:0,out:0,net:0,n:0,z:0,short:0};
    for(let i=0;i<N;i++){
      const r=playPoint({config,stage,difficulty,seed:i+1,testIndex:1,plan:n=>n!==1?{charge:.3}:{charge:ch,aimX:((i*17)%11-5)/8,aimZ}});
      const c=classify(r);if(!c)continue;o.n++;
      if(c==='out')o.out++;else if(c==='net')o.net++;else{o.in++;o.z+=c.z;if(c.z&&c.z<4.2&&aimZ<0.5)o.short++;}
    }
    rows.push({aimZ,need:+need(aimZ).toFixed(2),charge:+ch.toFixed(1),n:o.n,in:o.in/o.n,out:o.out/o.n,net:o.net/o.n,z:o.in?o.z/o.in:null});
  }
  return rows;
}
// 2) strong player: ideal charge for the chosen length, tight timing, N(0,.05) charge noise
export function strong(difficulty='normal',stage=10,K=N*3,profile='strong'){
  const P=profile==='strong'?{t:.05,c:.1,aim:[.4,0,-.4,-.8]}:{t:.14,c:.3,aim:[.9,.4,0,-.4,-.8,-1]};
  const o={n:0,err:0,net:0,out:0,grade:{good:0,medium:0,weak:0}};
  for(let i=0;i<K;i++){
    const aimZ=P.aim[i%P.aim.length];
    const r=playPoint({config,stage,difficulty,seed:i+1,testIndex:1,plan:(n,rng)=>({charge:Math.max(0,Math.min(1,need(aimZ)+(rng()+rng()-1)*P.c)),aimX:((i*17)%11-5)/8,aimZ,timing:(rng()+rng()-1)*P.t})});
    const c=classify(r);if(!c)continue;o.n++;if(r.grade)o.grade[r.grade]++;if(c==='net'){o.err++;o.net++;}else if(c==='out'){o.err++;o.out++;}
  }
  return o;
}
if(import.meta.url===`file://${process.argv[1]}`){
 if(off)console.log('(v9 off = old model)');
 for(const row of sweep()){console.log(`aimZ ${String(row.aimZ).padStart(4)} need ${row.need.toFixed(2)} charge ${row.charge.toFixed(1)} n=${String(row.n).padStart(3)} in ${(100*row.in).toFixed(0).padStart(3)}% out ${(100*row.out).toFixed(0).padStart(3)}% net ${(100*row.net).toFixed(0).padStart(3)}% avgZ ${row.z?.toFixed(1)}`);}
 for(const prof of ['strong','average'])for(const d of ['easy','normal','hard']){const o=strong(d,10,N*4,prof);console.log(prof.padEnd(8),d.padEnd(6),`n=${o.n} error ${(100*o.err/o.n).toFixed(1)}% (net ${o.net}, out ${o.out}) grades good/medium/weak ${['good','medium','weak'].map(g=>(100*o.grade[g]/o.n).toFixed(0)+'%').join('/')}`);}
}
