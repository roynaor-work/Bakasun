/** Read-only numeric circle checks. No viewer, asset or motion mutation. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createLocomotionCurve} from './locomotion-curve.js';

const sub=(a,b)=>a.map((x,i)=>x-b[i]),norm=a=>Math.hypot(...a),error=(a,b)=>norm(sub(a,b));
const add=(a,b)=>a.map((x,i)=>x+b[i]);
const right=h=>[Math.cos(h),0,-Math.sin(h)],forward=h=>[Math.sin(h),0,Math.cos(h)];
const scale=(v,s)=>v.map(x=>x*s);
let inverseMaximum=0,polarMaximum=0,tangentMaximum=0,oppositeMaximum=0,worldReachMaximum=0,orientationMaximum=0;
let points=0,reachCases=0;
const cases=[];
for(const yaw of [0,Math.PI,.77,-2.4])for(const origin of [[0,0,0],[2,.07,-3]]){
  const curve=createLocomotionCurve({origin,yaw,radius:8}),centre=add(origin,scale(right(yaw),8));
  for(const z of [-100,-31,-8,0,1.7,12,51,100])for(const x of [-.35,0,.35]){
    const p=[x,.14,z],mapped=curve.mapPoint(p),inverse=curve.inversePoint(mapped,z);
    const polar=add(add(centre,scale(right(yaw+z/8),-(8-x))),[0,p[1],0]);
    inverseMaximum=Math.max(inverseMaximum,error(p,inverse));polarMaximum=Math.max(polarMaximum,error(mapped,polar));points++;
    const q=[Math.sin(.13),0,0,Math.cos(.13)],roundtrip=curve.inverseOrientation(curve.mapOrientation(q,z),z);
    orientationMaximum=Math.max(orientationMaximum,error(q,roundtrip));
  }
  for(const distance of [0,1.7,12,100]){
    const h=1e-5,derivative=scale(sub(curve.rootPoint(distance+h),curve.rootPoint(distance-h)),1/(2*h));
    tangentMaximum=Math.max(tangentMaximum,error(derivative,forward(curve.headingAt(distance))));
  }
  const opposite=createLocomotionCurve({origin,yaw:yaw+Math.PI,radius:8});
  for(const distance of [0,1.7,12,100])oppositeMaximum=Math.max(oppositeMaximum,norm(add(sub(curve.rootPoint(distance),origin),sub(opposite.rootPoint(distance),origin))));
  for(const distance of [.1,12,51]){
    const heading=curve.headingAt(distance),root=curve.rootPoint(distance),offset=[.10,.76,.025];
    const hip=add(add(add(root,scale(right(heading),offset[0])),scale(forward(heading),offset[2])),[0,offset[1],0]);
    const geometry=curve.geometryFromWorldHips({distance,measuredAt:2.3,hips:{LeftFoot:hip}}),anchor=[.1,0,distance-.18];
    const input={name:'LeftFoot',anchor,rootDistance:distance+.015,futureRootDistance:distance+.135,anticipatedLift:.025,ankleOffset:.08};
    const prediction=geometry.predictWorldReach(input),w=prediction.worldPrediction;
    const independentlyMappedAnchor=add(centre,scale(right(yaw+anchor[2]/8),-(8-anchor[0])));
    const expectedHip=d=>add(add(add(add(centre,scale(right(yaw+d/8),-8)),scale(right(yaw+d/8),offset[0])),scale(forward(yaw+d/8),offset[2])),[0,offset[1],0]);
    const current=norm(sub(expectedHip(input.rootDistance),add(independentlyMappedAnchor,[0,.08,0]))),future=norm(sub(expectedHip(input.futureRootDistance),add(independentlyMappedAnchor,[0,.105,0])));
    worldReachMaximum=Math.max(worldReachMaximum,Math.abs(current-prediction.currentReach),Math.abs(future-prediction.predictedReach));
    assert.equal(w.geometryMeasuredAt,2.3);assert.ok(error(w.measuredHip,hip)<1e-12);assert.ok(error(w.hipOffset,offset)<1e-12);
    assert.equal(prediction.isRearward,sub(w.hipWorld,w.anchorWorld).reduce((sum,x,i)=>sum+x*w.forward[i],0)>0);
    const anchorAfter=geometry.predictWorldReach({...input,rootDistance:distance+1,futureRootDistance:distance+1.1}).worldPrediction.anchorWorld;
    assert.deepEqual(anchorAfter,w.anchorWorld,'World plants remain fixed while the root turns');
    reachCases++;
  }
  cases.push({yaw,origin,pass:true});
}
assert.ok(inverseMaximum<1e-11);assert.ok(polarMaximum<1e-11);assert.ok(tangentMaximum<1e-8);assert.ok(oppositeMaximum<1e-11);assert.ok(worldReachMaximum<1e-11);assert.ok(orientationMaximum<1e-12);
assert.throws(()=>createLocomotionCurve().mapPoint([8,0,0]),/x < radius/);
const moduleBytes=await fs.readFile(new URL('./locomotion-curve.js',import.meta.url)),motorBytes=await fs.readFile(new URL('./locomotion-space.js',import.meta.url)),hash=b=>createHash('sha256').update(b).digest('hex');
const report={kind:'exact-circle-locomotion-coordinate-proof',generatedAt:new Date().toISOString(),pass:true,radius:8,points,reachCases,cases,maximumErrorsMeters:{inverse:inverseMaximum,polarConstruction:polarMaximum,rootUnitTangent:tangentMaximum,oppositeSquad:oppositeMaximum,worldReach:worldReachMaximum},orientationMaximumComponentError:orientationMaximum,source:{curveSHA256:hash(moduleBytes),motorSHA256:hash(motorBytes)},method:'Compare implementation against an independent circle-centre/radius construction, finite-difference unit tangent, opposite-heading displacement symmetry, quaternion inverse, world-fixed anchors, and current/future Euclidean hip-to-ankle predictions.',limits:['Coordinate and geometry contract proof only. Final mapped Actor poses, mesh floor, planted feet, joint speed, request fulfillment and all16 LODs still require actual bundled browser audit.','Circle inverse assumes x < radius and unwraps to the nearest supplied arc distance; callers must pass the current motor distance.']};
await fs.writeFile(new URL('./locomotion-curve-proof.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({pass:true,points,reachCases,inverseMaximum,polarMaximum,tangentMaximum,oppositeMaximum,worldReachMaximum,orientationMaximum}));
