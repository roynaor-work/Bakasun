/**
 * Conservative shared Foot-local boot bounds for swing-clearance planning.
 * node source/boot-bounds.mjs [--aabb-only] [--out /tmp/boot-bounds.json]
 * Default exact hull derivation requires development-only Python NumPy/SciPy.
 * --aabb-only is a diagnostic comparison, unsuitable for runtime hull input.
 * Uses decoded Draco geometry, not accessor min/max or authoring estimates.
 * These bounds never replace the final all-vertex displayed floor check.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import * as THREE from '../vendor/three.module.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2),output=args.includes('--out')?path.resolve(args[args.indexOf('--out')+1]):path.join(root,'verification/boot-bounds.json');
const require=createRequire(process.env.SOCCER_V7_TOOLS||'/tmp/soccer-v7-tools/package.json');
const {NodeIO}=require('@gltf-transform/core'),{ALL_EXTENSIONS}=require('@gltf-transform/extensions'),draco=require('draco3dgltf');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':await draco.createDecoderModule()});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const sourceSha256=hash(await fs.readFile(fileURLToPath(import.meta.url)));
const manifestBytes=await fs.readFile(path.join(root,'asset-manifest.json')),manifest=JSON.parse(manifestBytes),manifestSha256=hash(manifestBytes);
const rigBytes=await fs.readFile(path.join(root,'rig.json')),rig=JSON.parse(rigBytes),rigSha256=hash(rigBytes);
const files=[...new Set(manifest.characters.flatMap(character=>(character.kits||[character]).flatMap(kit=>[kit.lod0,kit.lod1])))].sort();
const socks=manifest.authoring.atlasRegions.socks;
const paddingMeters=.0005,weightTolerance=1e-6,failures=[],models=[],points={LeftFoot:[],RightFoot:[]};
const startedAt=new Date().toISOString();
const rigWorld={};
for(const bone of rig.bones){const local=new THREE.Matrix4().makeTranslation(...bone.restTranslationMeters);rigWorld[bone.name]=bone.parent?rigWorld[bone.parent].clone().multiply(local):local;}
const inRect=(uv,rect)=>uv[0]>=rect[0]-2e-5&&uv[0]<=rect[2]+2e-5&&(1-uv[1])>=rect[1]-2e-5&&(1-uv[1])<=rect[3]+2e-5;
const emptyBounds=()=>({min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]});
function include(bounds,p){for(let k=0;k<3;k++){bounds.min[k]=Math.min(bounds.min[k],p[k]);bounds.max[k]=Math.max(bounds.max[k],p[k]);}}
function corners(bounds){const values=[];for(const x of [bounds.min[0],bounds.max[0]])for(const y of [bounds.min[1],bounds.max[1]])for(const z of [bounds.min[2],bounds.max[2]])values.push([x,y,z]);return values;}

for(const file of files){
  const bytes=await fs.readFile(path.join(root,file)),document=await io.readBinary(new Uint8Array(bytes));
  const row={file,bytes:bytes.length,sha256:hash(bytes),feet:Object.fromEntries(Object.keys(points).map(name=>[name,{vertices:0,excludedSockVertices:0,bounds:emptyBounds(),points:[]}]))};
  for(const node of document.getRoot().listNodes()){
    const mesh=node.getMesh(),skin=node.getSkin();if(!mesh||!skin)continue;
    const meshWorld=new THREE.Matrix4().fromArray(node.getWorldMatrix());
    const joints=skin.listJoints(),jointNames=joints.map(joint=>joint.getName());
    const footIndices=Object.fromEntries(Object.keys(points).map(name=>[name,jointNames.indexOf(name)]));
    for(const name of Object.keys(points))if(footIndices[name]<0)failures.push({file,reason:'Foot joint missing',bone:name});
    for(const primitive of mesh.listPrimitives()){
      if(primitive.getMaterial()?.getName()!=='Cloth')continue;
      const positions=primitive.getAttribute('POSITION'),indices=primitive.getAttribute('JOINTS_0'),weights=primitive.getAttribute('WEIGHTS_0'),uvs=primitive.getAttribute('TEXCOORD_0');
      if(!positions||!indices||!weights||!uvs){failures.push({file,reason:'Cloth attributes missing'});continue;}
      for(let i=0;i<positions.getCount();i++){
        const j=indices.getElement(i,[]),w=weights.getElement(i,[]),uv=uvs.getElement(i,[]);
        for(const name of Object.keys(points)){
          const assigned=w.reduce((sum,value,k)=>sum+(j[k]===footIndices[name]?value:0),0),other=w.reduce((sum,value,k)=>sum+(j[k]!==footIndices[name]?value:0),0);
          if(Math.abs(assigned-1)>weightTolerance||other>weightTolerance)continue;
          if(inRect(uv,socks)){row.feet[name].excludedSockVertices++;continue;}
          const restWorld=new THREE.Vector3().fromArray(positions.getElement(i,[])).applyMatrix4(meshWorld);
          // The socks tile excludes calf/ankle cloth; this independent physical
          // guard prevents a future mislabeled trouser or garment from becoming
          // a giant clearance proxy.
          if(restWorld.y>.125||restWorld.y<-.005){failures.push({file,bone:name,vertex:i,reason:'Rigid Foot Cloth outside physical boot region',restWorld:restWorld.toArray(),uv});continue;}
          const actualFootRest=new THREE.Matrix4().fromArray(joints[footIndices[name]].getWorldMatrix());
          if(actualFootRest.elements.some((value,k)=>Math.abs(value-rigWorld[name].elements[k])>1e-7))failures.push({file,bone:name,reason:'Foot rest transform differs from rig'});
          const local=restWorld.applyMatrix4(actualFootRest.clone().invert()).toArray();
          include(row.feet[name].bounds,local);row.feet[name].vertices++;row.feet[name].points.push(local);points[name].push(local);
        }
      }
    }
  }
  for(const name of Object.keys(points))if(row.feet[name].vertices<20)failures.push({file,bone:name,reason:'Too few rigid boot vertices',vertices:row.feet[name].vertices});
  models.push(row);
}

let hulls=null;
if(!args.includes('--aabb-only')){
  const program="import json, sys, numpy as np, scipy\nfrom scipy.spatial import ConvexHull\ndata=json.load(open(sys.argv[1]))\nresult={}\nfor name, values in data.items():\n points=np.asarray(values,dtype=np.float64)\n hull=ConvexHull(points)\n outside=float(np.max(points@hull.equations[:,:3].T+hull.equations[:,3]))\n result[name]={'vertices':points[hull.vertices].tolist(),'inputVertices':len(points),'maximumOutsideDistanceMeters':outside,'scipyVersion':scipy.__version__,'numpyVersion':np.__version__}\njson.dump(result,open(sys.argv[2],'w'))\n";
  const staging=await fs.mkdtemp(path.join(tmpdir(),'soccer-v7-boot-hull-'));
  try{
    const inputFile=path.join(staging,'input.json'),outputFile=path.join(staging,'hull.json');
    await fs.writeFile(inputFile,JSON.stringify(points));
    const hullProcess=spawnSync(process.env.SOCCER_V7_PYTHON||'python',['-c',program,inputFile,outputFile],{encoding:'utf8',maxBuffer:1024*1024,timeout:30000,env:{...process.env,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1',MKL_NUM_THREADS:'1'}});
    if(hullProcess.status!==0)throw Error('Optional convex hull failed: '+(hullProcess.stderr||hullProcess.error||hullProcess.status));
    hulls=JSON.parse(await fs.readFile(outputFile));
  }finally{await fs.rm(staging,{recursive:true,force:true});}
}
const feet={};
const rotations=[];
for(const pitchDegrees of [-60,-45,-30,-15,0,15,30,45,60])for(const rollDegrees of [-30,-15,0,15,30])for(const yawDegrees of [0,45,90,180])rotations.push({pitchDegrees,rollDegrees,yawDegrees});
for(const name of Object.keys(points)){
  const raw=emptyBounds();for(const point of points[name])include(raw,point);
  const bounds={min:raw.min.map(v=>v-paddingMeters),max:raw.max.map(v=>v+paddingMeters)};
  const boxCorners=corners(bounds),excess=[],perModel=[],hullExcess=[],hullPerModel=[];let containmentFailures=0,hullContainmentFailures=0;
  for(const model of models){let worst=0,worstRotation=null,minimumGap=Infinity,worstHull=0,worstHullRotation=null,minimumHullGap=Infinity;
    for(const rotation of rotations){
      const quaternion=new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(rotation.pitchDegrees),THREE.MathUtils.degToRad(rotation.yawDegrees),THREE.MathUtils.degToRad(rotation.rollDegrees),'YXZ'));
      const minimum=list=>Math.min(...list.map(point=>new THREE.Vector3().fromArray(point).applyQuaternion(quaternion).y));
      const actualMinimum=minimum(model.feet[name].points),proxyMinimum=minimum(boxCorners),gap=actualMinimum-proxyMinimum;
      if(gap<-.0000001)containmentFailures++;
      minimumGap=Math.min(minimumGap,gap);excess.push(gap);
      if(gap>worst){worst=gap;worstRotation={...rotation,actualMinimumFootLocalY:actualMinimum,proxyMinimumFootLocalY:proxyMinimum};}
      if(hulls){const hullMinimum=minimum(hulls[name].vertices)-paddingMeters,hullGap=actualMinimum-hullMinimum;hullExcess.push(hullGap);minimumHullGap=Math.min(minimumHullGap,hullGap);if(hullGap<-.0000001)hullContainmentFailures++;if(hullGap>worstHull){worstHull=hullGap;worstHullRotation={...rotation,actualMinimumFootLocalY:actualMinimum,proxyMinimumFootLocalY:hullMinimum};}}
    }
    perModel.push({file:model.file,minimumConservativeGapMeters:minimumGap,maximumAdditionalFlightClearanceMeters:worst,worstRotation});
    if(hulls)hullPerModel.push({file:model.file,minimumConservativeGapMeters:minimumHullGap,maximumAdditionalFlightClearanceMeters:worstHull,worstRotation:worstHullRotation});
  }
  excess.sort((a,b)=>a-b);
  feet[name]={unPaddedBounds:raw,paddingMeters,bounds,corners:boxCorners,dimensionsMeters:bounds.max.map((v,k)=>v-bounds.min[k]),selectedVertices:points[name].length,rotationValidation:{rotationCount:rotations.length,modelRotationSamples:excess.length,containmentFailures,minimumConservativeGapMeters:excess[0],medianAdditionalFlightClearanceMeters:excess[Math.floor(excess.length*.5)],p95AdditionalFlightClearanceMeters:excess[Math.floor(excess.length*.95)],maximumAdditionalFlightClearanceMeters:excess.at(-1),perModel}};
  if(containmentFailures)failures.push({bone:name,reason:'AABB is not conservative under rotation',containmentFailures});
  if(hulls){
    let maximumSupportDifferenceFromDecodedUnionMeters=0;
    for(const rotation of rotations){
      const quaternion=new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(rotation.pitchDegrees),THREE.MathUtils.degToRad(rotation.yawDegrees),THREE.MathUtils.degToRad(rotation.rollDegrees),'YXZ'));
      const minimum=list=>Math.min(...list.map(point=>new THREE.Vector3().fromArray(point).applyQuaternion(quaternion).y));
      maximumSupportDifferenceFromDecodedUnionMeters=Math.max(maximumSupportDifferenceFromDecodedUnionMeters,Math.abs(minimum(points[name])-minimum(hulls[name].vertices)));
    }
    hullExcess.sort((a,b)=>a-b);feet[name].supportHull={...hulls[name],paddingMeters,paddingMethod:'Transform each hull vertex by actual Foot world matrix; minimum worldY minus0.5mm is a conservative support bound in every orientation.',rotationValidation:{rotationCount:rotations.length,modelRotationSamples:hullExcess.length,containmentFailures:hullContainmentFailures,maximumSupportDifferenceFromDecodedUnionMeters,minimumConservativeGapMeters:hullExcess[0],medianAdditionalFlightClearanceMeters:hullExcess[Math.floor(hullExcess.length*.5)],p95AdditionalFlightClearanceMeters:hullExcess[Math.floor(hullExcess.length*.95)],maximumAdditionalFlightClearanceMeters:hullExcess.at(-1),perModel:hullPerModel}};
    if(hulls[name].maximumOutsideDistanceMeters>1e-8||hullContainmentFailures||maximumSupportDifferenceFromDecodedUnionMeters>1e-10)failures.push({bone:name,reason:'Convex hull does not reproduce all selected boot vertices',maximumOutsideDistanceMeters:hulls[name].maximumOutsideDistanceMeters,hullContainmentFailures,maximumSupportDifferenceFromDecodedUnionMeters});
  }
}
for(const model of models){if(hash(await fs.readFile(path.join(root,model.file)))!==model.sha256)failures.push({file:model.file,reason:'Model changed during audit'});for(const foot of Object.values(model.feet))delete foot.points;}
if(hash(await fs.readFile(path.join(root,'asset-manifest.json')))!==manifestSha256)failures.push({reason:'Manifest changed during audit'});
if(hash(await fs.readFile(path.join(root,'rig.json')))!==rigSha256)failures.push({reason:'Rig changed during audit'});
if(hash(await fs.readFile(fileURLToPath(import.meta.url)))!==sourceSha256)failures.push({reason:'Generator changed during audit'});
const result={schemaVersion:1,kind:'shared-rigid-boot-foot-local-clearance-bounds',startedAt,generatedAt:new Date().toISOString(),source:{file:'source/boot-bounds.mjs',sha256:sourceSha256},inputs:{manifest:{file:'asset-manifest.json',sha256:manifestSha256},rig:{file:'rig.json',sha256:rigSha256}},method:'Decode Draco; select Cloth vertices with100% weight on one Foot; exclude the socks UV tile and independently reject vertices above125mm rest-worldY. Transform rest-world vertices by inverse canonical Foot rest matrix. Union every identity and both LODs, then pad0.5mm on every axis. Retain rigid laces from their separate atlas tile. Validate against actual selected vertices across180 pitch/roll/yaw rotations per model and Foot.',runtimeUse:'Free-foot swing-clearance planning only. A rotated AABB is conservative and may over-lift compared with actual boots; report quantified excess. Never replace the exact complete displayed-mesh post-IK floor scan or alter planted sole anchors.',limitations:'Rigid boot proxy only: excludes sock/calf, blended weights, Skin and all other materials. Rotation validation quantifies padding and empty AABB corners; it is not an animation or mobile GPU performance benchmark. Regenerate if any model geometry or bind transform changes.',complete:models.length===16,pass:failures.length===0&&models.length===16,paddingMeters,weightTolerance,rotationConvention:'EulerYXZ; pitch aboutX, yaw aboutY, roll aboutZ; Foot-local metres',feet,models,failures};
await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({pass:result.pass,complete:result.complete,models:models.length,selectedVertices:Object.fromEntries(Object.entries(feet).map(([name,foot])=>[name,foot.selectedVertices])),maximumAdditionalFlightClearanceMeters:Object.fromEntries(Object.entries(feet).map(([name,foot])=>[name,foot.rotationValidation.maximumAdditionalFlightClearanceMeters])),output}));
if(!result.pass)process.exitCode=1;
