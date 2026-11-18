import {readFile,writeFile} from 'node:fs/promises';
import {measure,SKILLS} from '/home/user/Bakasun/workout/island/tools/catch-sim.mjs';
const stages=process.argv[2].split(',').map(Number),games=+(process.argv[3]||60);
const config=JSON.parse(await readFile('/home/user/Bakasun/workout/island/data/config.json','utf8'));
const b=config.minigames.catchCriminal,L=b.levels;
const target=[.80,.76,.72,.67,.62,.56,.50,.44,.38,.30];
const out={};
for(const st of stages){
  const l=L[st-1];
  const rate=r=>{l.radiusScale=+r.toFixed(3);return measure(games,[st],{good:SKILLS.good},b,{v2:true,arch:true}).good[0].catchRate;};
  let lo=+(process.argv[4]||.8),hi=+(process.argv[5]||7);
  for(let i=0;i<7;i++){const mid=Math.sqrt(lo*hi);const r=rate(mid);if(r>target[st-1])hi=mid;else lo=mid;}
  const rad=Math.sqrt(lo*hi);const r=rate(rad);out[st]={radiusScale:l.radiusScale,rate:r};console.log(st,JSON.stringify(out[st]));
}
await writeFile(`/tmp/claude-0/-home-user-Bakasun/7a121f54-d235-5be4-8e3e-ca3268c28bf2/scratchpad/p10-${process.argv[2].replace(/,/g,'_')}.json`,JSON.stringify(out));
