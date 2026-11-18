// Tunes levels[].v6.dist (how far the thief stands from the officer in the archery stage) so a good model player catches at
// the stage targets (80% at stage 1 falling to 30% at stage 10), chase included; radiusScale stays 1 (the body is the target).
//   node tune-dist6.mjs 1,2,3 60 [lo=8] [hi=40] → prints and writes balance/dist6-<stages>.json (does not touch config.json)
import {readFile,writeFile} from 'node:fs/promises';
import {measure,SKILLS} from '../../../tools/catch-sim.mjs';
const stages=process.argv[2].split(',').map(Number),games=+(process.argv[3]||60);
const config=JSON.parse(await readFile(new URL('../../../data/config.json',import.meta.url),'utf8'));
const b=config.minigames.catchCriminal,L=b.levels;
const target=[.80,.76,.72,.67,.62,.56,.50,.44,.38,.30];
const out={};
for(const st of stages){
  const l=L[st-1];l.v6=l.v6||{};l.v6.radiusScale=1;
  const rate=d=>{l.v6.dist=+d.toFixed(1);return measure(games,[st],{good:SKILLS.good},b,{v2:true,arch:true,v6:true,fixedPower:true}).good[0].catchRate;};
  let lo=+(process.argv[4]||8),hi=+(process.argv[5]||40);
  for(let i=0;i<6;i++){const mid=(lo+hi)/2;const r=rate(mid);if(r>target[st-1])lo=mid;else hi=mid;}
  const d=(lo+hi)/2;const r=rate(d);out[st]={dist:l.v6.dist,rate:r};console.log(st,JSON.stringify(out[st]));
}
await writeFile(new URL(`./dist6-${process.argv[2].replace(/,/g,'_')}.json`,import.meta.url),JSON.stringify(out));
