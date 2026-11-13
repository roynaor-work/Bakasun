/** CC0. Generate distance recommendations and record budget/continuity evidence. */
import fs from 'node:fs';
import {makeSeats,planCrowd,levelWeights} from '../runtime/lod-policy.mjs';

const root=new URL('../',import.meta.url), config=JSON.parse(fs.readFileSync(new URL('lod-config.json',root)));
const {seats}=makeSeats();
const distributions=Object.fromEntries(Object.entries(config.cameras).map(([name,camera])=>{
  const {assignments,...plan}=planCrowd(seats,camera.position,config);return [name,plan];
}));
config.recommendedDistributions=distributions;
fs.writeFileSync(new URL('lod-config.json',root),JSON.stringify(config,null,2)+'\n');
fs.writeFileSync(new URL('distribution.json',root),JSON.stringify(distributions,null,2)+'\n');

const boundaries=[];
for(const threshold of config.distanceThresholds)for(const ratio of [.9,1,1.1]) {
  const distance=threshold*ratio, a=levelWeights(distance-1e-6,config), b=levelWeights(distance+1e-6,config);
  const jump=Math.max(...a.map((weight,i)=>Math.abs(weight-b[i])));
  if(jump>1e-5)throw new Error('Discontinuous distance boundary');
  boundaries.push({distance,maxWeightDifferenceAcross2Micrometers:jump});
}
const routes=[];
for(const [startName,endName] of [['landscape','rear'],['side','rear'],['close','side']]){
  const start=config.cameras[startName].position,end=config.cameras[endName].position;
  let maxTriangles=0,minScale=1,maxOverlapping=0,maxWeightChange=0,previous=null;
  for(let step=0;step<=300;step++){
    const camera=start.map((v,i)=>v+(end[i]-v)*step/300), plan=planCrowd(seats,camera,config);
    if(plan.triangles>80000 || plan.instances!==600)throw new Error('Budget / population mismatch');
    for(const assignment of plan.assignments){
      const weights=assignment.weights;
      if(Math.abs(weights.reduce((a,b)=>a+b)-1)>1e-9 || weights.filter(w=>w>0).length>2)throw new Error('Invalid transition');
      if(previous)maxWeightChange=Math.max(maxWeightChange,...weights.map((w,i)=>Math.abs(w-previous[assignment.index].weights[i])));
    }
    previous=plan.assignments;maxTriangles=Math.max(maxTriangles,plan.triangles);
    minScale=Math.min(minScale,plan.scale);maxOverlapping=Math.max(maxOverlapping,plan.overlapping);
  }
  routes.push({from:startName,to:endName,samples:301,maxTriangles,minDistanceScale:minScale,maxOverlapping,maxWeightChangePerStep:maxWeightChange});
}
let seed=409,maxTriangles=0,minScale=1,maxCameraPerturbationWeightChange=0;
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
for(let i=0;i<300;i++){
  const camera=[random()*60-30,1+random()*29,random()*70-35],plan=planCrowd(seats,camera,config);
  if(plan.triangles>80000 || plan.dominant.reduce((a,b)=>a+b)!==600)throw new Error('Stress budget mismatch');
  maxTriangles=Math.max(maxTriangles,plan.triangles);minScale=Math.min(minScale,plan.scale);
  const perturbed=planCrowd(seats,[camera[0]+1e-6,camera[1],camera[2]],config);
  for(let index=0;index<seats.length;index++)for(let level=0;level<3;level++)
    maxCameraPerturbationWeightChange=Math.max(maxCameraPerturbationWeightChange,
      Math.abs(plan.assignments[index].weights[level]-perturbed.assignments[index].weights[level]));
}
if(maxCameraPerturbationWeightChange>1e-4)throw new Error('Discontinuous budget guard');
const evidence={instances:seats.length,variantCounts:Array.from({length:12},(_,v)=>seats.filter(s=>s.variant===v).length),
  boundaries,routes,stress:{seed:409,samples:300,cameraBounds:{x:[-30,30],y:[1,30],z:[-35,35]},maxTriangles,minDistanceScale:minScale,
    cameraPerturbationMeters:1e-6,maxCameraPerturbationWeightChange},
  note:'Numerical continuity of the distance blend is verified. This does not prove perceptual invisibility of topology changes or camera teleports.'};
fs.writeFileSync(new URL('policy-verification.json',root),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence,null,2));
