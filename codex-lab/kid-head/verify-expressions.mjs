import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {targetModel} from './model.mjs';
import {expressionModel} from './expression-model.mjs';
import {EXPRESSION_LIST, DEFAULT_PARAMETERS, PARAMETER_RANGES} from './expressions.mjs';

// Tests rendered geometry and reusable buffers, independently of the formulas
// used by the rig. Browser appearance/FPS are tested by capture-expressions.mjs.
const rounds=JSON.parse(await readFile(new URL('./rounds.json',import.meta.url),'utf8'));
const archivedRounds=JSON.parse(await readFile(new URL('./shots/faces/baseline-r9/source/rounds.json',import.meta.url),'utf8'));
// Preserve the frozen source verbatim on disk; resolve its vendor import only
// in memory, so the baseline does not duplicate Three.js (800 KB).
const archivedSource=await readFile(new URL('./shots/faces/baseline-r9/source/model.mjs',import.meta.url),'utf8');
const archivedImport=archivedSource.replace("'./three.module.js'",JSON.stringify(new URL('./three.module.js',import.meta.url).href));
assert.notEqual(archivedImport,archivedSource,'Archived Three.js import was not resolved');
const {targetModel:archivedTargetModel}=await import('data:text/javascript;base64,'+Buffer.from(archivedImport).toString('base64'));
assert.deepEqual(rounds,archivedRounds,'Archived round parameters changed');
assert.equal(await readFile(new URL('./scene.mjs',import.meta.url),'utf8'),await readFile(new URL('./shots/faces/baseline-r9/source/scene.mjs',import.meta.url),'utf8'),'The legacy r1–r6 scene changed');

function modelDigest(root){
 const hash=createHash('sha256');
 root.traverse(o=>{
  hash.update(JSON.stringify({type:o.type,position:o.position.toArray(),quaternion:o.quaternion.toArray(),scale:o.scale.toArray(),visible:o.visible}));
  if(!o.isMesh)return;
  for(const [name,attribute] of Object.entries(o.geometry.attributes)){
   hash.update(name);hash.update(String(attribute.itemSize));hash.update(Buffer.from(attribute.array.buffer,attribute.array.byteOffset,attribute.array.byteLength));
  }
  if(o.geometry.index)hash.update(Buffer.from(o.geometry.index.array.buffer));
  for(const material of Array.isArray(o.material)?o.material:[o.material]){
   hash.update(JSON.stringify({type:material.type,color:material.color?.toArray(),side:material.side,opacity:material.opacity,transparent:material.transparent}));
   if(material.gradientMap?.image?.data)hash.update(Buffer.from(material.gradientMap.image.data));
  }
 });
 return hash.digest('hex');
}

for(const parameters of rounds.filter(r=>r.version==='target-v1')){
 const current=targetModel(parameters),archived=archivedTargetModel(parameters);
 assert.equal(modelDigest(current.root),modelDigest(archived.root),`Round ${parameters.round} geometry/material/transform regression`);
 dispose(current.root);dispose(archived.root);
}

function dispose(root){
 const geometries=new Set(),materials=new Set(),textures=new Set();
 root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[]){materials.add(m);if(m.gradientMap)textures.add(m.gradientMap);}});
 for(const geometry of geometries)geometry.dispose();for(const material of materials)material.dispose();for(const texture of textures)texture.dispose();
}

const rig=expressionModel({expression:'happy'});
assert.equal(EXPRESSION_LIST.length,6,'The lab must expose exactly six expression presets');
const initialObjects=[],initialObjectGeometry=new Map(),initialGeometry=new Map();
rig.root.traverse(o=>{
 initialObjects.push(o);
 initialObjectGeometry.set(o,o.geometry);
 if(o.geometry&&!initialGeometry.has(o.geometry))initialGeometry.set(o.geometry,{
  uuid:o.geometry.uuid,index:o.geometry.index,indexArray:o.geometry.index?.array,
  attributes:Object.fromEntries(Object.entries(o.geometry.attributes).map(([k,a])=>[k,{attribute:a,array:a.array,count:a.count,itemSize:a.itemSize}])),
  morphAttributes:Object.fromEntries(Object.entries(o.geometry.morphAttributes).map(([k,list])=>[k,list.map(a=>({attribute:a,array:a.array,count:a.count,itemSize:a.itemSize}))]))
 });
});
const triangles=[...initialGeometry.keys()].reduce((n,g)=>n+(g.index?.count??g.attributes.position.count)/3,0);

function checkGeometry(label){
 const objects=[];rig.root.traverse(o=>objects.push(o));
 assert.deepEqual(objects,initialObjects,`${label}: meshes/hierarchy were allocated during a blend`);
 for(const o of objects){
  assert.equal(o.geometry,initialObjectGeometry.get(o),`${label}: mesh geometry was replaced`);
  for(const n of [...o.position.toArray(),...o.quaternion.toArray(),...o.scale.toArray(),...(o.morphTargetInfluences??[])])assert(Number.isFinite(n),`${label}: non-finite transform/morph`);
  for(const material of Array.isArray(o.material)?o.material:o.material?[o.material]:[])assert(Number.isFinite(material.opacity)&&material.opacity>=0&&material.opacity<=1,`${label}: invalid material opacity`);
  assert(o.scale.x>=0&&o.scale.y>=0&&o.scale.z>=0,`${label}: flipped/collapsed negative scale`);
 }
 for(const [g,before] of initialGeometry){
  assert.equal(g.uuid,before.uuid,`${label}: geometry UUID changed`);assert.equal(g.index,before.index,`${label}: index replaced`);assert.equal(g.index?.array,before.indexArray,`${label}: index buffer replaced`);
  assert.deepEqual(Object.keys(g.attributes),Object.keys(before.attributes),`${label}: attribute layout changed`);
  assert.deepEqual(Object.keys(g.morphAttributes),Object.keys(before.morphAttributes),`${label}: morph attribute layout changed`);
  const all=[];
  for(const [key,saved] of Object.entries(before.attributes)){
   const a=g.attributes[key];assert.equal(a,saved.attribute,`${label}: ${key} attribute allocated`);assert.equal(a.array,saved.array,`${label}: ${key} buffer allocated`);assert.equal(a.count,saved.count);assert.equal(a.itemSize,saved.itemSize);all.push(a);
  }
  for(const [key,saved] of Object.entries(before.morphAttributes)){
   assert.equal(g.morphAttributes[key].length,saved.length);
   saved.forEach((old,i)=>{const a=g.morphAttributes[key][i];assert.equal(a,old.attribute);assert.equal(a.array,old.array);assert.equal(a.count,old.count);all.push(a);});
  }
  for(const a of all)for(const value of a.array)assert(Number.isFinite(value),`${label}: non-finite geometry attribute`);
  if(g.index)for(const i of g.index.array)assert(i>=0&&i<g.attributes.position.count,`${label}: out-of-range triangle index`);
 }
 for(const value of effectiveFace())assert(Number.isFinite(value),`${label}: non-finite rendered face`);
}

function effectiveFace(){
 const geometry=rig.faceGeometry??rig.face.geometry,base=geometry.attributes.position.array,result=new Float64Array(base),morphs=geometry.morphAttributes.position??[];
 for(let k=0;k<morphs.length;k++){
  const influence=rig.face.morphTargetInfluences?.[k]??0,delta=morphs[k].array;
  for(let i=0;i<result.length;i++)result[i]+=influence*(geometry.morphTargetsRelative?delta[i]:delta[i]-base[i]);
 }
 return result;
}

function state(){
 const result=[],seen=new Set();
 rig.root.traverse(o=>{
  // A hidden mesh becoming visible at zero alpha has no rendered jump. Track
  // effective opacity so fade continuity is checked without a boolean artifact.
  const materials=Array.isArray(o.material)?o.material:o.material?[o.material]:[];
  const visibility=o.visible?(materials.length?Math.max(...materials.map(m=>m.opacity)):1):0;
  result.push(...o.position.toArray(),...o.quaternion.toArray(),...o.scale.toArray(),visibility,...(o.morphTargetInfluences??[]));
  if(o.geometry&&!seen.has(o.geometry)){seen.add(o.geometry);for(const value of o.geometry.attributes.position.array)result.push(value);}
 });
 return result;
}
function maxDelta(a,b){assert.equal(a.length,b.length);let maximum=0;for(let i=0;i<a.length;i++)maximum=Math.max(maximum,Math.abs(a[i]-b[i]));return maximum;}

const presets=new Map();
for(const {id} of EXPRESSION_LIST){rig.setExpression(id);checkGeometry(id);presets.set(id,state());}
for(let i=0;i<EXPRESSION_LIST.length;i++)for(let j=i+1;j<EXPRESSION_LIST.length;j++)assert(maxDelta(presets.get(EXPRESSION_LIST[i].id),presets.get(EXPRESSION_LIST[j].id))>.01,`Expressions ${EXPRESSION_LIST[i].id}/${EXPRESSION_LIST[j].id} render identically`);

let pairCount=0,sampleCount=0;
for(const {id:from} of EXPRESSION_LIST)for(const {id:to} of EXPRESSION_LIST){
 if(from===to)continue;pairCount++;
 for(const t of [0,.1,.5,.9,1]){
  rig.setBlend(from,to,t);checkGeometry(`${from} → ${to} @ ${t}`);sampleCount++;
  if(t===0||t===1)assert(maxDelta(state(),presets.get(t===0?from:to))<1e-8,`${from} → ${to}: endpoint differs from its preset`);
 }
 const full=maxDelta(presets.get(from),presets.get(to));
 // Check actual mesh/buffer values adjacent to both endpoints for discontinuity.
 rig.setBlend(from,to,.0001);assert(maxDelta(state(),presets.get(from))<full*.001,`${from} → ${to}: jump at the start`);
 rig.setBlend(from,to,.9999);assert(maxDelta(state(),presets.get(to))<full*.001,`${from} → ${to}: jump at the end`);
 for(const t of [.1,.5,.9]){
  rig.setBlend(from,to,t);const forward=state();rig.setBlend(to,from,1-t);
  assert(maxDelta(state(),forward)<1e-7,`${from} ↔ ${to}: blend depends on traversal direction`);
 }
}

assert.equal(rig.features.eyes.length,2);
for(const [i,eye] of rig.features.eyes.entries()){
 for(const key of ['white','iris','pupil','upperLid','lowerLid'])assert(eye[key]?.isMesh,`Eye ${i}: missing ${key} mesh`);
 assert.notEqual(eye.upperLid,eye.white,'Upper eyelid must be an independent surface');assert.notEqual(eye.lowerLid,eye.upperLid,'Lower eyelid must be independent');
 assert(eye.glints.length>=2,'Every eye needs two highlight surfaces');
}
assert.equal(rig.features.brows.length,2,'Two independent brows are required');
const mouth=rig.features.mouth;
for(const key of ['cavity','upperLip','lowerLip','teeth','tongue'])assert(mouth[key]?.isMesh,`Mouth: missing ${key} mesh`);
assert.equal(new Set(Object.values(mouth).filter(o=>o?.isMesh)).size,Object.values(mouth).filter(o=>o?.isMesh).length,'Mouth features must be independent meshes');

// Isolated inputs must deform the skin surface, not just float cheek spheres
// or move a detached mouth. Evaluate the positions WebGL receives after morphs.
rig.setExpression({...DEFAULT_PARAMETERS,cheekPuff:0,cheekLift:0,jawOpen:0,chinTight:0});const rest=effectiveFace();
rig.setExpression({...DEFAULT_PARAMETERS,cheekPuff:1,cheekLift:0,jawOpen:0,chinTight:0});const puff=effectiveFace();
let cheekExpansion=0,cheekVertices=0;
for(let i=0;i<rest.length;i+=3)if(Math.abs(rest[i])>.25&&rest[i+1]>-.55&&rest[i+1]<.05&&rest[i+2]>.2){cheekExpansion+=Math.abs(puff[i])-Math.abs(rest[i]);cheekVertices++;}
assert(cheekVertices>30&&cheekExpansion/cheekVertices>.008,'Cheek puff does not expand the skin surface');
rig.setExpression({...DEFAULT_PARAMETERS,cheekPuff:0,cheekLift:0,jawOpen:1,chinTight:0});const openJaw=effectiveFace();
let jawDrop=0,jawVertices=0;
for(let i=0;i<rest.length;i+=3)if(rest[i+1]<-.55&&rest[i+2]>.1){jawDrop+=rest[i+1]-openJaw[i+1];jawVertices++;}
assert(jawVertices>30&&jawDrop/jawVertices>.008,'Jaw opening does not deform the lower face');

rig.setExpression('surprised');const openLids=rig.features.eyes.map(e=>[...e.upperLid.position.toArray(),...e.lowerLid.position.toArray(),...e.upperLid.scale.toArray(),...e.lowerLid.scale.toArray(),...e.upperLid.geometry.attributes.position.array,...e.lowerLid.geometry.attributes.position.array]);
rig.setExpression('tired');assert(rig.features.eyes.every((e,i)=>maxDelta(openLids[i],[...e.upperLid.position.toArray(),...e.lowerLid.position.toArray(),...e.upperLid.scale.toArray(),...e.lowerLid.scale.toArray(),...e.upperLid.geometry.attributes.position.array,...e.lowerLid.geometry.attributes.position.array])>.02),'Heavy eyelids do not differ from surprised eyelids');
function mouthState(){return Object.values(mouth).filter(o=>o?.isMesh).flatMap(o=>[...o.position.toArray(),...o.quaternion.toArray(),...o.scale.toArray(),Number(o.visible),...o.geometry.attributes.position.array]);}
rig.setExpression('surprised');const surprisedMouth=mouthState();rig.setExpression('tired');assert(maxDelta(mouthState(),surprisedMouth)>.02,'Surprised and tired mouths render identically');

// Guard bad UI/script input: values must stay finite and bounded.
assert.throws(()=>rig.setExpression('missing-preset'));
assert.throws(()=>rig.setExpression({mouthOpen:NaN}));
rig.setExpression({mouthOpen:1e6,eyeOpen:-1e6});checkGeometry('clamped input');
for(const [key,[min,max]] of Object.entries(PARAMETER_RANGES))assert(rig.parameters[key]>=min&&rig.parameters[key]<=max,`Out-of-range parameter ${key}`);
console.log(JSON.stringify({status:'passed',legacyRounds:13,expressions:6,directedPairs:pairCount,sampledBlendStates:sampleCount,reusedGeometries:initialGeometry.size,uniqueTriangles:triangles,meanCheekExpansion:Number((cheekExpansion/cheekVertices).toFixed(5)),meanJawDrop:Number((jawDrop/jawVertices).toFixed(5))},null,2));
dispose(rig.root);
