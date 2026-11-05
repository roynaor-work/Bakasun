import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from '/workspace/Bakasun/workout/island/design/soccer-v7/characters/vendor/three.module.js';
import {airborneFootGoalClearance} from '/tmp/soccer-v7-cold-clearance/locomotion-space.js';
const hull=JSON.parse(await fs.readFile('/workspace/Bakasun/workout/island/design/soccer-v7/characters/verification/boot-bounds.json','utf8'));
let cases=0,maximumBoundError=0,maximumPostBoundError=0,maximumXZError=0;
for(const name of ['LeftFoot','RightFoot']){
  const vertices=hull.feet[name].supportHull.vertices;
  for(let k=0;k<101;k++){
    const quaternion=new THREE.Quaternion().setFromEuler(new THREE.Euler(.7*Math.sin(k*.37),k*.31,.5*Math.cos(k*.29)));
    const position=[.1,.001+.12*(.5+.5*Math.sin(k*.31)),k*.08];
    const params={mode:k%2?'inherited':'flight',position,orientation:quaternion.toArray(),vertices,paddingMeters:hull.paddingMeters,minimumY:.001};
    const before=structuredClone(params),ankle=new THREE.Vector3().fromArray(position).add(new THREE.Vector3(0,.08,0).applyQuaternion(quaternion));
    let exact=Infinity;
    for(const p of vertices)exact=Math.min(exact,new THREE.Vector3().fromArray(p).applyQuaternion(quaternion).add(ankle).y-hull.paddingMeters);
    const result=airborneFootGoalClearance(params);
    maximumBoundError=Math.max(maximumBoundError,Math.abs(result.minimumBefore-exact));
    maximumPostBoundError=Math.max(maximumPostBoundError,Math.abs(result.minimumAfter-Math.max(exact,.001)));
    maximumXZError=Math.max(maximumXZError,Math.abs(result.position[0]-position[0]),Math.abs(result.position[2]-position[2]));
    assert.deepEqual(params,before);
    assert.ok(result.minimumAfter>=.001-1e-15);
    const second=airborneFootGoalClearance({...params,position:result.position});assert.ok(second.liftMeters<1e-15);
    const planted=airborneFootGoalClearance({...params,mode:'plant'});assert.equal(planted.liftMeters,0);assert.deepEqual(planted.position,position);
    cases++;
  }
}
assert.ok(maximumBoundError<1e-15);assert.ok(maximumPostBoundError<1e-15);assert.equal(maximumXZError,0);
const report={kind:'read-only-cold-clearance-algebra-check',pass:true,cases,maximumBoundError,maximumPostBoundError,maximumXZError,checks:['Exact Three rotated bound of full Foot-local support hull','Sole→ankle offset rotates with actual foot orientation','Input immutability','Plant exclusion','Vertical-only correction','Idempotence'],limits:['Algebra proof only; actual post-IK mesh floor and angular/drift continuity require browser proof.','The hard max/min hull support correction is continuous but has derivative changes at active vertices and at zero lift.']};
await fs.writeFile('/tmp/soccer-v7-cold-clearance-independent.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
