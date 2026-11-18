// Tunes levels[].v6.radiusScale for the v6 archery (fixed draw, sight on the thief) so a good model player catches
// at the stage targets (80% at stage 1 falling to 30% at stage 10), chase included. Binary search in log space.
//   node tune-radius6.mjs 1,2,3 60 [lo] [hi] → prints and writes balance/radius6-<stages>.json (does not touch config.json)
import {readFile,writeFile} from 'node:fs/promises';
import {measure,SKILLS} from '../../../tools/catch-sim.mjs';
const stages=process.argv[2].split(',').map(Number),games=+(process.argv[3]||60);
const config=JSON.parse(await readFile(new URL('../../../data/config.json',import.meta.url),'utf8'));
const b=config.minigames.catchCriminal,L=b.levels;
const target=[.80,.76,.72,.67,.62,.56,.50,.44,.38,.30];
const out={};
for(const st of stages){
  const l=L[st-1];l.v6=l.v6||{};
  const rate=r=>{l.v6.radiusScale=+r.toFixed(3);return measure(games,[st],{good:SKILLS.good},b,{v2:true,arch:true,v6:true,fixedPower:true}).good[0].catchRate;};
  let lo=+(process.argv[4]||.3),hi=+(process.argv[5]||3);
  for(let i=0;i<7;i++){const mid=Math.sqrt(lo*hi);const r=rate(mid);if(r>target[st-1])hi=mid;else lo=mid;}
  const rad=Math.sqrt(lo*hi);const r=rate(rad);out[st]={radiusScale:l.v6.radiusScale,rate:r};console.log(st,JSON.stringify(out[st]));
}
await writeFile(new URL(`./radius6-${process.argv[2].replace(/,/g,'_')}.json`,import.meta.url),JSON.stringify(out));
