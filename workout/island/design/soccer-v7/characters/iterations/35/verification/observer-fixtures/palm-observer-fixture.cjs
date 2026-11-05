const fixturePath=require('node:path'),fixturePackageRoot=fixturePath.resolve(__dirname,'../../../..');
const fs=require('fs'),assert=require('node:assert/strict');
(async()=>{
 const root=fixturePackageRoot;
 const THREE=await import('data:text/javascript;base64,'+fs.readFileSync(root+'/vendor/three.module.js').toString('base64'));
 const {createPhysicalPalmObserver}=require(root+'/source/audit-action-observer.cjs');
 const points=[[-.0225,-.05,-.03],[-.0025,-.01,-.03],[.0175,-.05,-.03]],weights=[.8,.9,.85];
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(points.flat(),3));geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(points.flatMap(()=>[0,1,0,0]),4));geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights.flatMap(w=>[w,1-w,0,0]),4));geometry.setIndex([0,1,2]);
 const hand=new THREE.Bone(),forearm=new THREE.Bone();hand.name='LeftHand';forearm.name='LeftForeArm';const skeleton=new THREE.Skeleton([hand,forearm],[new THREE.Matrix4(),new THREE.Matrix4()]);
 const mesh=new THREE.SkinnedMesh(geometry,new THREE.MeshStandardMaterial());mesh.name='syntheticHeelPalm';mesh.material.name='Skin';mesh.add(hand,forearm);mesh.bind(skeleton,new THREE.Matrix4());mesh.updateMatrixWorld(true);
 const actor={path:'models/synthetic-lod0.glb',meshes:[mesh],world:new THREE.Vector3()},hash='a'.repeat(64),api={inspect:()=>({data:{hashes:{models:{[actor.path]:hash,'models/synthetic-lod1.glb':'b'.repeat(64)},motion:'c'.repeat(64)}}})};
 const calibration={kind:'anatomicalHeelPalmRayV1',selector:{kind:'fixedHandLocalPalmarRay',region:'proximalPalmarHeel',coordinateFrame:'inverseBindHandLocalMeters',referenceXY:[-.0025,-.030],rayOriginZ:-.20,rayDirection:[0,0,1],palmarNormalZMaximum:-.5,minCornerHandInfluence:.5,minPointHandInfluence:.8,noFallback:true},handName:'LeftHand',modelSha256:hash,meshIndex:0,meshName:mesh.name,material:'Skin',triangleVertexIndices:[0,1,2],barycentricWeights:[.25,.5,.25],bindPositions:points,handLocalReferencePoint:[-.0025,-.03,-.03],handLocalNormal:[0,0,-1],namedInfluences:weights.map(w=>({LeftHand:w,LeftForeArm:1-w}))};
 const copy=()=>structuredClone(calibration),run=c=>{const observer=createPhysicalPalmObserver({api,actor});return{observer,result:observer.validateCalibration('LeftHand',c)};},checks={};
 const valid=run(copy());checks.actualTriangleRayAccepted=valid.result.valid;
 let c=copy();c.modelSha256='b'.repeat(64);checks.changedModelHashRejects=!run(c).result.valid;
 c=copy();c.selector.referenceXY[1]=-.1;checks.fingerSelectorSubstitutionRejects=!run(c).result.valid;
 c=copy();c.namedInfluences[0].LeftHand=.6;checks.changedNamedWeightsRejects=!run(c).result.valid;
 c=copy();c.bindPositions[0][0]+=.01;checks.changedBindPositionRejects=!run(c).result.valid;
 c=copy();c.barycentricWeights=[.2,.6,.2];checks.changedBarycentricPointRejects=!run(c).result.valid;
 for(const bone of[hand,forearm]){bone.position.y=.0315;bone.rotation.x=-Math.PI/2;}mesh.updateMatrixWorld(true);skeleton.update();
 const before=valid.observer.sampleWorld(valid.result);checks.actualSkinnedPatchAtGround=Math.abs(before.point[1]-.0015)<1e-8;
 forearm.position.x=.02;mesh.updateMatrixWorld(true);skeleton.update();const after=valid.observer.sampleWorld(valid.result),expectedForearmMass=.25*.2+.5*.1+.25*.15;
 checks.fullSkinningRetainsForearmContribution=Math.abs((after.point[0]-before.point[0])-.02*expectedForearmMass)<1e-8;
 const front=mesh.clone();front.name='frontPalm';front.geometry=geometry.clone();const p=front.geometry.getAttribute('position');for(let i=0;i<p.count;i++)p.setZ(i,p.getZ(i)-.02);front.updateMatrixWorld(true);actor.meshes.push(front);checks.nonFrontmostTriangleRejects=!run(copy()).result.valid;actor.meshes.pop();
 
const shared=new WeakMap(),firstShared=createPhysicalPalmObserver({api,actor,calibrationCache:shared}),firstValid=firstShared.validateCalibration('LeftHand',copy()),firstPoint=firstShared.sampleWorld(firstValid).point;
const secondSame=createPhysicalPalmObserver({api,actor,calibrationCache:shared}),samePoint=secondSame.sampleWorld(secondSame.validateCalibration('LeftHand',copy())).point;checks.sameActorSharedCacheSamplesLiveMesh=Math.hypot(...samePoint.map((x,i)=>x-firstPoint[i]))<1e-9;
const hand2=new THREE.Bone(),forearm2=new THREE.Bone();hand2.name='LeftHand';forearm2.name='LeftForeArm';const skeleton2=new THREE.Skeleton([hand2,forearm2],[new THREE.Matrix4(),new THREE.Matrix4()]),mesh2=new THREE.SkinnedMesh(geometry,mesh.material);mesh2.name=mesh.name;mesh2.add(hand2,forearm2);mesh2.bind(skeleton2,new THREE.Matrix4());for(const bone of[hand2,forearm2]){bone.position.set(.05,.0315,0);bone.rotation.x=-Math.PI/2;}forearm2.position.x+=.02;mesh2.updateMatrixWorld(true);skeleton2.update();const actor2={...actor,meshes:[mesh2],world:new THREE.Vector3(.05,0,0)},secondActor=createPhysicalPalmObserver({api,actor:actor2,calibrationCache:shared}),point2=secondActor.sampleWorld(secondActor.validateCalibration('LeftHand',copy())).point;checks.rebuiltActorSameModelUsesNewMeshes=Math.abs(point2[0]-firstPoint[0]-.05)<1e-8;


const v3=copy();v3.kind='anatomicalPairedGetUpHeelPressurePointV3';v3.selector={kind:'fixedPairedBoundedHeelPressureXY',region:'proximalPalmarHeelPad',coordinateFrame:'inverseBindHandLocalMeters',referenceXY:[-.0025,-.03],domainX:[-.015,.015],domainY:[-.045,-.020],pressureDirection:[0,Math.sin(Math.PI/18),-Math.cos(Math.PI/18)],palmarNormalZMaximum:-.5,minCornerHandInfluence:.5,minPointHandInfluence:.8,pairedModelSha256:{near:hash,far:'b'.repeat(64)},selectionObjective:'maximizeMinimumNearFarAuthoredGetUp05ActualSkinHeelSupportAtOneCommonXY',calibrationPose:{clipID:'get_up',sampleSeconds:.5,pressureWorldDirection:[0,-1,0],motionSha256:'c'.repeat(64)},noFallback:true};checks.pairedV3RealHeelPadAccepted=run(structuredClone(v3)).result.valid;
let badV3=structuredClone(v3);badV3.selector.referenceXY[1]=-.09;checks.pairedV3FingerOutsideDomainRejects=!run(badV3).result.valid;
badV3=structuredClone(v3);badV3.selector.pairedModelSha256.far='d'.repeat(64);checks.pairedV3WrongPartnerModelRejects=!run(badV3).result.valid;
badV3=structuredClone(v3);badV3.selector.calibrationPose.motionSha256='d'.repeat(64);checks.pairedV3WrongCalibrationMotionRejects=!run(badV3).result.valid;
badV3=structuredClone(v3);badV3.selector.optimizerVerified=true;badV3.bindPositions[0][2]-=.01;checks.pairedV3OptimizerFlagCannotOverrideGeometry=!run(badV3).result.valid;

for(const[name,value]of Object.entries(checks))assert.equal(value,true,name+' '+JSON.stringify(valid.observer.report()));
 const result={pass:true,checks,method:'Independent 3D plane-ray/Gram barycentric reconstruction tested against a real local Three r160 SkinnedMesh with known mixed Hand/ForeArm weights. No production calibration helper was called.'};fs.writeFileSync(fixturePath.join(__dirname,'palm-observer-fixture.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
})();
