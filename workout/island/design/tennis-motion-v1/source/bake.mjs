// SPDX-License-Identifier: CC0-1.0
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {bake} from './author.mjs';
import {buildGlb} from './glb.mjs';
const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const data=bake();
fs.mkdirSync(path.join(base,'runtime/clips'),{recursive:true});
fs.writeFileSync(path.join(base,'runtime/motions.json'),JSON.stringify(data));
const clips=[];
for(const clip of Object.values(data.states)){
 const file=`clips/${clip.id}.glb`,bytes=buildGlb(data.skeleton,clip);
 fs.writeFileSync(path.join(base,'runtime',file),bytes);
 const {keyframes,...entry}=clip;clips.push({...entry,file,bytes:bytes.length});
}
fs.writeFileSync(path.join(base,'runtime/catalog.json'),JSON.stringify({schemaVersion:1,fps:30,skeleton:data.skeleton,racket:{parent:'RightHand',node:'Racket',gripLocalMeters:[0,0,0],headNode:'RacketHead',headLocalMeters:[0,.5,0],lengthMeters:.685},clips},null,2));
console.log(`Built ${clips.length} uncompressed self-contained GLBs; ${(clips.reduce((n,c)=>n+c.bytes,0)/1048576).toFixed(2)} MiB.`);
