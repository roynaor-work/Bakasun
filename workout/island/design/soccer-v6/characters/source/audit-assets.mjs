/**
 * Asset-delivery audit and offline skinned-geometry floor envelope.
 * Tool dependencies live outside the repository: /tmp/soccer-v6-tools.
 * Run: node workout/island/design/soccer-v6/characters/source/audit-assets.mjs
 * Add --bake-floor after motion/soccer-v6.json has been generated.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';

const require = createRequire(process.env.SOCCER_V6_TOOLS || '/tmp/soccer-v6-tools/package.json');
const {NodeIO} = require('@gltf-transform/core');
const {ALL_EXTENSIONS} = require('@gltf-transform/extensions');
const codec = require('draco3dgltf');
const validator = require('gltf-validator');
const THREE = require('three');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await codec.createDecoderModule(),
  'draco3d.encoder': await codec.createEncoderModule()
});
const root = path.resolve(import.meta.dirname, '..');
const readJSON = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const round = value => Math.round(value * 1e6) / 1e6;
const canonical = (await readJSON(path.join(root, '../../motion/soccer.json'))).skeleton.bones;
const boneNames = canonical.map(b => b.name);
const errors = [];
const check = (condition, message) => { if (!condition) errors.push(message); };
const files = (await fs.readdir(path.join(root, 'assets'))).filter(f => f.endsWith('.glb')).sort();
assert.ok(files.length, 'No character GLBs found in assets/');
await fs.mkdir(path.join(root, 'verification'), {recursive:true});
let manifest=null;
try {manifest=await readJSON(path.join(root,'asset-manifest.json'));} catch(error) {check(false, `asset-manifest.json unavailable: ${error.message}`);}
if(manifest) {
  const characters=manifest.characters||[],field=characters.filter(c=>c.role==='player'||c.role==='field'||c.id?.startsWith('player-'));
  check(field.length===6, `Expected six fictional field-player definitions, got ${field.length}`);
  check(characters.some(c=>c.role==='goalkeeper'||c.id==='goalkeeper'), 'Missing goalkeeper definition');
  check(characters.some(c=>c.role==='referee'||c.id==='referee'), 'Missing referee definition');
  const referenced=new Set();
  for(const character of characters) {
    const kits=character.kits||[character];
    if(field.includes(character))check(kits.length===2, `${character.id}: expected two colour kits`);
    for(const kit of kits)for(const lod of [0,1]) {
      const file=kit[`lod${lod}`]; referenced.add(file);
      check(typeof file==='string'&&files.includes(path.basename(file)), `${character.id}/${kit.id}: missing LOD${lod} GLB ${file}`);
    }
  }
  for(const file of files)check(referenced.has(`assets/${file}`), `Unreferenced delivered GLB assets/${file}`);
}

function skinPieces(doc) {
  const pieces = [];
  for (const node of doc.getRoot().listNodes()) {
    if (!node.getMesh() || !node.getSkin()) continue;
    const skin = node.getSkin();
    const joints = skin.listJoints();
    const inverseAccessor = skin.getInverseBindMatrices();
    const inverse = joints.map((_, i) => new THREE.Matrix4().fromArray(inverseAccessor.getElement(i, [])));
    for (const primitive of node.getMesh().listPrimitives()) {
      const attributes = ['POSITION','JOINTS_0','WEIGHTS_0'].map(name => primitive.getAttribute(name));
      assert.ok(attributes.every(Boolean), `Missing skin attribute on ${node.getName()}`);
      // Accessor elements convert normalized integer skin weights to floats.
      const count = attributes[0].getCount();
      const positions = new Float32Array(count*3), indices = new Uint16Array(count*4), weights = new Float32Array(count*4);
      const v = [];
      for (let i=0;i<count;i++) {
        attributes[0].getElement(i,v); positions.set(v.slice(0,3),i*3);
        attributes[1].getElement(i,v); indices.set(v.slice(0,4),i*4);
        attributes[2].getElement(i,v); weights.set(v.slice(0,4),i*4);
      }
      pieces.push({joints,inverse,positions,indices,weights,count});
    }
  }
  return pieces;
}

function rigidPieces(doc) {
  const pieces=[];
  for(const node of doc.getRoot().listNodes()) {
    if(!node.getMesh() || node.getSkin())continue;
    for(const primitive of node.getMesh().listPrimitives()) {
      const attribute=primitive.getAttribute('POSITION'),positions=new Float32Array(attribute.getCount()*3);
      for(let i=0;i<attribute.getCount();i++)positions.set(attribute.getElement(i,[]),i*3);
      pieces.push({node,positions,count:attribute.getCount()});
    }
  }
  return pieces;
}

const reports = [], documents = new Map();
for (const filename of files) {
  const relative = `assets/${filename}`;
  const bytes = await fs.readFile(path.join(root, relative));
  const validation = await validator.validateBytes(new Uint8Array(bytes), {uri:filename,maxIssues:100});
  const doc = await io.readBinary(new Uint8Array(bytes));
  documents.set(relative, doc);
  const primitives = doc.getRoot().listMeshes().flatMap(mesh => mesh.listPrimitives());
  let triangles=0, vertices=0;
  for (const primitive of primitives) {
    const index = primitive.getIndices(), position=primitive.getAttribute('POSITION');
    check(primitive.getMode()===4, `${relative}: primitive must contain triangles`);
    triangles+=(index ? index.getCount() : position.getCount())/3;
    vertices+=position.getCount();
    for (const semantic of primitive.listSemantics()) {
      check(primitive.getAttribute(semantic).getArray().every(Number.isFinite), `${relative}: nonfinite ${semantic}`);
    }
    const weights=primitive.getAttribute('WEIGHTS_0');
    if (weights) for(let i=0;i<weights.getCount();i++) {
      const sum=weights.getElement(i,[]).reduce((s,v)=>s+v,0);
      check(Math.abs(sum-1)<.002, `${relative}: skin weights do not sum to one at ${i}`);
    }
  }
  const lod=Number(filename.match(/lod([01])/i)?.[1]);
  check(Number.isInteger(lod), `${relative}: missing LOD suffix`);
  const budget=lod===0?8000:3000;
  check(triangles<=budget, `${relative}: ${triangles} triangles exceeds ${budget}`);
  check(bytes.length<=1500000, `${relative}: ${bytes.length} bytes exceeds decimal 1.5MB`);
  const textures=doc.getRoot().listTextures().map(texture => ({name:texture.getName(),size:texture.getSize(),mimeType:texture.getMimeType(),bytes:texture.getImage()?.byteLength||0}));
  for(const texture of textures) check(texture.size?.length===2 && texture.size.every(v=>v<=1024), `${relative}: invalid texture size ${texture.size}`);
  const skinReports=doc.getRoot().listSkins().map(skin=>({joints:skin.listJoints().map(j=>j.getName()),inverseBindMatrixCount:skin.getInverseBindMatrices()?.getCount()}));
  check(skinReports.length>0, `${relative}: missing skin`);
  for(const skin of skinReports) {
    check(skin.joints.length===18, `${relative}: expected 18 joints, got ${skin.joints.length}`);
    check(new Set(skin.joints).size===18 && boneNames.every(n=>skin.joints.includes(n)), `${relative}: canonical names mismatch`);
    check(skin.inverseBindMatrixCount===18, `${relative}: inverse bind count mismatch`);
  }
  const skeletonEvidence=[];
  for(const skin of doc.getRoot().listSkins()) for(const joint of skin.listJoints()) {
    const expected=canonical.find(b=>b.name===joint.getName());
    if(!expected)continue;
    const parent=joint.getParentNode(),actualParent=parent?.getName()||null;
    const translationError=Math.hypot(...joint.getTranslation().map((v,i)=>v-expected.restTranslationMeters[i]));
    const q=joint.getRotation(),rotationError=2*Math.acos(Math.min(1,Math.abs(q[3])));
    check(actualParent===expected.parent, `${relative}: ${joint.getName()} parent ${actualParent} differs from canonical ${expected.parent}`);
    check(translationError<1e-5, `${relative}: ${joint.getName()} canonical rest translation error ${translationError}`);
    check(rotationError<1e-5, `${relative}: ${joint.getName()} nonidentity canonical rest quaternion`);
    skeletonEvidence.push({name:joint.getName(),parent:actualParent,restTranslationErrorMeters:translationError,restRotationErrorRadians:rotationError});
  }
  const draco=doc.getRoot().listExtensionsUsed().some(e=>e.extensionName==='KHR_draco_mesh_compression');
  check(draco, `${relative}: missing Draco compression`);
  check(validation.issues.numErrors===0, `${relative}: Khronos compressed validation has errors`);
  // Khronos cannot validate geometry hidden inside Draco. Validate decoded bytes too.
  for(const extension of [...doc.getRoot().listExtensionsUsed()]) if(extension.extensionName==='KHR_draco_mesh_compression') extension.dispose();
  const decoded=await validator.validateBytes(await io.writeBinary(doc),{uri:`decoded-${filename}`,maxIssues:100});
  check(decoded.issues.numErrors===0, `${relative}: Khronos decoded validation has errors`);
  reports.push({path:relative,bytes:bytes.length,MB:round(bytes.length/1e6),sha256:hash(bytes),lod,triangleBudget:budget,triangles,vertices,drawPrimitives:primitives.length,textureCount:textures.length,textures,skins:skinReports,skeletonEvidence,draco,
    validation:{compressed:{errors:validation.issues.numErrors,warnings:validation.issues.numWarnings,messages:validation.issues.messages},decoded:{errors:decoded.issues.numErrors,warnings:decoded.issues.numWarnings,messages:decoded.issues.messages}}});
  console.log(`${relative}: ${triangles} triangles; ${bytes.length} bytes; ${textures.length} textures; validation ${validation.issues.numErrors}/${decoded.issues.numErrors}`);
}

function samplePose(clip, seconds) {
  const keys=clip.keyframes, normalized=Math.max(0,Math.min(1,seconds/clip.durationSeconds));
  let lo=0,hi=keys.length-1;
  while(hi-lo>1) {const mid=(lo+hi)>>1;if(keys[mid].time<=normalized)lo=mid;else hi=mid;}
  const a=keys[lo],b=keys[hi],w=(normalized-a.time)/(b.time-a.time);
  const qa=new THREE.Quaternion(),qb=new THREE.Quaternion();
  return {rotations:Object.fromEntries(boneNames.map(name=>[name,qa.fromArray(a.rotations[name]).slerp(qb.fromArray(b.rotations[name]),w).normalize().toArray()])),
    hipsOffsetMeters:a.hipsOffsetMeters.map((v,i)=>v+(b.hipsOffsetMeters[i]-v)*w)};
}

function geometrySampler(doc) {
  const nodes=doc.getRoot().listNodes(), byName=new Map(nodes.map(n=>[n.getName(),n]));
  const parents=new Map();
  for(const node of nodes) for(const child of node.listChildren()) parents.set(child,node);
  const data=new Map(nodes.map(node=>[node,{translation:new THREE.Vector3().fromArray(node.getTranslation()),rotation:new THREE.Quaternion().fromArray(node.getRotation()),scale:new THREE.Vector3().fromArray(node.getScale()),local:new THREE.Matrix4(),world:new THREE.Matrix4()}]));
  const pieces=skinPieces(doc),rigid=rigidPieces(doc);
  const rows=pieces.map(piece=>piece.joints.map(()=>new Float64Array(4)));
  const scratch=new THREE.Matrix4();
  return pose=>{
    for(const node of nodes) {
      const d=data.get(node); d.translation.fromArray(node.getTranslation());d.rotation.fromArray(node.getRotation());
      if(pose.rotations[node.getName()]) d.rotation.fromArray(pose.rotations[node.getName()]);
      if(node.getName()==='Hips') d.translation.add(new THREE.Vector3().fromArray(pose.hipsOffsetMeters));
      d.local.compose(d.translation,d.rotation,d.scale);
    }
    const visited=new Set();
    function update(node) {if(visited.has(node))return;const d=data.get(node),parent=parents.get(node);if(parent){update(parent);d.world.multiplyMatrices(data.get(parent).world,d.local);}else d.world.copy(d.local);visited.add(node);}
    nodes.forEach(update);
    let minY=Infinity;
    for(let pi=0;pi<pieces.length;pi++) {
      const piece=pieces[pi],r=rows[pi];
      for(let j=0;j<piece.joints.length;j++) {const e=scratch.multiplyMatrices(data.get(piece.joints[j]).world,piece.inverse[j]).elements;r[j][0]=e[1];r[j][1]=e[5];r[j][2]=e[9];r[j][3]=e[13];}
      for(let i=0;i<piece.count;i++) {
        const x=piece.positions[i*3],y=piece.positions[i*3+1],z=piece.positions[i*3+2],base=i*4;
        let sy=0;
        for(let k=0;k<4;k++) {const w=piece.weights[base+k];if(!w)continue;const row=r[piece.indices[base+k]];sy+=w*(row[0]*x+row[1]*y+row[2]*z+row[3]);}
        minY=Math.min(minY,sy);
      }
    }
    for(const piece of rigid) {
      const e=data.get(piece.node).world.elements;
      for(let i=0;i<piece.count;i++)minY=Math.min(minY,e[1]*piece.positions[i*3]+e[5]*piece.positions[i*3+1]+e[9]*piece.positions[i*3+2]+e[13]);
    }
    return minY;
  };
}

let floorSummary;
if(process.argv.includes('--bake-floor')) {
  const motionPath=path.join(root,'motion/soccer-v6.json'),motionBytes=await fs.readFile(motionPath),motion=JSON.parse(motionBytes);
  const rate=60,pad=.002,models={};
  let minimum=Infinity,maximumLift=0,totalVertexFrames=0;
  for(const asset of reports) {
    const doc=documents.get(asset.path),evaluate=geometrySampler(doc),clips={};
    for(const [name,clip] of Object.entries(motion.states)) {
      const intervals=Math.round(clip.durationSeconds*rate);
      const minima=[],lifts=[],dense=[];
      for(let frame=0;frame<=intervals*2;frame++) {
        const raw=evaluate(samplePose(clip,Math.min(clip.durationSeconds,frame/(rate*2))));
        dense.push(raw);
        if(frame%2===0) {minima.push(round(raw));lifts.push(Math.max(0,pad-raw));}
        minimum=Math.min(minimum,raw);maximumLift=Math.max(maximumLift,pad-raw);
      }
      // Independently probe quarter-key frames (120Hz) against the interpolated
      // 60Hz envelope; retain a two-millimetre clearance even at those probes.
      let deficit=0;
      for(let frame=0;frame<dense.length;frame++) {
        const i=Math.floor(frame/2),lift=frame%2?(lifts[i]+lifts[i+1])/2:lifts[i];
        deficit=Math.max(deficit,pad-dense[frame]-lift);
      }
      for(let i=0;i<lifts.length;i++)lifts[i]=round(lifts[i]+deficit);
      let minimumAfterLift=Infinity;
      for(let frame=0;frame<dense.length;frame++) {const i=Math.floor(frame/2),lift=frame%2?(lifts[i]+lifts[i+1])/2:lifts[i];minimumAfterLift=Math.min(minimumAfterLift,dense[frame]+lift);}
      totalVertexFrames+=(intervals*2+1)*asset.vertices;
      maximumLift=Math.max(maximumLift,...lifts);
      clips[name]={durationSeconds:clip.durationSeconds,sampleCount:minima.length,minimumRawY:round(Math.min(...dense)),maximumLiftMeters:Math.max(...lifts),quarterFrameAdditionalPadMeters:round(deficit),minimumAfterLiftAt120HzMeters:round(minimumAfterLift),rawMinimumYMeters:minima,requiredLiftMeters:lifts};
    }
    models[asset.path]={sha256:asset.sha256,clips};
    console.log(`Floor envelope ${asset.path}: ${Object.keys(clips).length} clips at 60Hz`);
  }
  const envelope={schemaVersion:1,kind:'offline-skinned-floor-envelope',units:'meters',sampleRateHz:rate,clearancePadMeters:pad,
    verificationRateHz:120,sampling:'Every delivered skinned and rigid vertex at 120Hz (30Hz keys, half and quarter frames); 60Hz envelope independently checked at intervening 120Hz frames. LINEAR translation and shortest-arc quaternion slerp. Root reference locomotion excluded (in-place).',
    application:'Sample requiredLiftMeters by clamped seconds*sampleRateHz; interpolate neighbouring values. During transitions, evaluate the blended skinned pose or use a conservative envelope; endpoint envelopes alone do not bound a rotation blend. This is display clearance, not collision physics or foot locking.',
    motion:{path:'motion/soccer-v6.json',sha256:hash(motionBytes)},models};
  await fs.writeFile(path.join(root,'motion/floor-clearance.json'),JSON.stringify(envelope)+'\n');
  floorSummary={sampleRateHz:rate,verificationRateHz:120,clearancePadMeters:pad,models:reports.length,clips:Object.keys(motion.states).length,totalVertexFrames,minimumRawYMeters:round(minimum),maximumRequiredLiftMeters:round(maximumLift),path:'motion/floor-clearance.json'};
}
const sourceHashes={};
async function hashTree(relative) {
  for(const entry of await fs.readdir(path.join(root,relative),{withFileTypes:true})) {
    if(entry.name==='__pycache__'||entry.name==='floor-clearance.json')continue;
    const file=`${relative}/${entry.name}`;
    if(entry.isDirectory())await hashTree(file);
    else if(entry.isFile())sourceHashes[file]=hash(await fs.readFile(path.join(root,file)));
  }
}
for(const directory of ['source','motion']) {
  await hashTree(directory);
}
const report={schemaVersion:1,pass:errors.length===0,budgets:{lod0Triangles:8000,lod1Triangles:3000,GLBBytes:1500000,textureEdgePixels:1024,canonicalBones:18},assetCount:reports.length,totalGLBBytes:reports.reduce((s,a)=>s+a.bytes,0),largestGLB:reports.reduce((a,b)=>a.bytes>b.bytes?a:b),sourceHashes,assets:reports,...floorSummary?{floorEnvelope:floorSummary}:{},errors};
await fs.writeFile(path.join(root,'verification/assets.json'),JSON.stringify(report,null,2)+'\n');
if(errors.length) {console.error(errors.join('\n'));process.exitCode=1;} else console.log(`PASS: ${reports.length} assets, compressed and decoded validation; all structural budgets satisfied.`);
