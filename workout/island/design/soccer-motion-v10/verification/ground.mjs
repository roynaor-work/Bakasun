/** CC0-1.0. Supplemental sole clearance evidence, including inherited native
 * v9 boundary interpolation. Separate from the mandatory horizontal slide gate.
 */
import fs from 'node:fs/promises';
import * as T from '../../soccer-motion-v8/runtime/vendor/three.module.js';
import {decode,poseAt,forward} from './check.mjs';
const base=new URL('../',import.meta.url),catalog=JSON.parse(await fs.readFile(new URL('runtime/catalog.json',base)));
const locals=[[0,-.08,0],[0,-.08,.12],[0,-.08,-.06]],labels=['center','toe','heel'];
function minimum(data,time){const world=forward(poseAt(data,time));let min={heightMeters:Infinity};for(const bone of ['LeftFoot','RightFoot'])for(let i=0;i<locals.length;i++){const b=world[bone],p=new T.Vector3(...locals[i]).applyQuaternion(new T.Quaternion(...b.rotation)).add(new T.Vector3(...b.position));if(p.y<min.heightMeters)min={heightMeters:p.y,time,bone,point:labels[i]};}return min;}
const clips=[];
for(const c of catalog.clips){
 const data=decode(await fs.readFile(new URL(`runtime/${c.asset}`,base)));let native={heightMeters:Infinity},subframes={heightMeters:Infinity},boundary={heightMeters:Infinity},interior={heightMeters:Infinity};
 for(let i=0;i<=Math.round(c.duration*120);i++){const t=i/120,p=minimum(data,t);if(p.heightMeters<subframes.heightMeters)subframes=p;if(i%4===0&&p.heightMeters<native.heightMeters)native=p;const bucket=t<=2/30||t>=c.duration-2/30?boundary:interior;if(p.heightMeters<bucket.heightMeters)Object.assign(bucket,p);}
 clips.push({id:c.id,native30HzMinimum:native,interpolated120HzMinimum:subframes,boundaryIntervalsMinimum:boundary,interiorMinimum:interior});
}
const reference=decode(await fs.readFile(new URL('runtime/reference/run.glb',base)));let runMinimum={heightMeters:Infinity};for(let i=0;i<=72;i++){const p=minimum(reference,i/120);if(p.heightMeters<runMinimum.heightMeters)runMinimum=p;}
const report={license:'CC0-1.0',method:'Independent decoded GLB FK. Center/toe/heel at30Hz and120Hz; no renderer floor correction or IK. Vertical floor clearances are diagnostic, not claimed zero. Horizontal support excursion is gated separately by check.mjs.',sampleHz:120,sourceRunMinimum:runMinimum,clips};
await fs.writeFile(new URL('verification/ground-clearance.json',base),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({clips:clips.length,sourceRunMinimum:runMinimum,worstInterpolated:clips.reduce((a,b)=>a.interpolated120HzMinimum.heightMeters<b.interpolated120HzMinimum.heightMeters?a:b).id}));
