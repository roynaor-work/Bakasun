import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from '../workout/island/vendor/three.module.js';
import {compactAvatar,atlasSkinnedGeometry} from '../workout/island/minigames/hoops-lod.mjs';

async function glb(name){
 const bytes=await readFile(new URL('../workout/island/'+name,import.meta.url)),length=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+length)),bin=bytes.subarray(28+length);
 const sizes={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16},components={5120:[1,'readInt8',127],5121:[1,'readUInt8',255],5122:[2,'readInt16LE',32767],5123:[2,'readUInt16LE',65535],5125:[4,'readUInt32LE',4294967295],5126:[4,'readFloatLE',1]};
 const element=(index,vertex)=>{const a=json.accessors[index],view=json.bufferViews[a.bufferView],[size,method,scale]=components[a.componentType],count=sizes[a.type],offset=(view.byteOffset||0)+(a.byteOffset||0)+vertex*(view.byteStride||size*count);return Array.from({length:count},(_,k)=>{const n=bin[method](offset+k*size);return a.normalized?Math.max(-1,n/scale):n;});};
 const images=()=>json.images.map(i=>{const v=json.bufferViews[i.bufferView];return createHash('sha256').update(bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength)).digest('hex');});
 return {bytes,json,element,images,hash:createHash('sha256').update(bytes).digest('hex')};
}

test('offline QEM basketball GLBs keep bind transforms, image bytes and original vertex attributes within a 3800-triangle budget',async()=>{
 const provenance=JSON.parse(await readFile(new URL('../workout/island/design/hoops/lod/hoops-lod-provenance.json',import.meta.url),'utf8'));
 const cfg=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames.streetSlam;
 for(const kind of ['guard','wing','forward','big']){
  const sourcePath=`assets/models/hoops-${kind}.glb`,lodPath=`design/hoops/lod/hoops-${kind}-lod.glb`;
  assert.equal(cfg.assets.models[kind],sourcePath,'the original basketball source remains registered');assert.equal(cfg.assets.lodModels[kind],lodPath,'the live basketball configuration selects the verified LOD');
  const source=await glb(sourcePath),lod=await glb(lodPath),proof=provenance.assets.find(a=>a.kind===kind),a=source.json,b=lod.json;
  assert.equal(proof.source,sourcePath);assert.equal(proof.output,lodPath);
  assert.equal(proof.sourceSha256,source.hash);assert.equal(proof.outputSha256,lod.hash);assert.deepEqual(lod.images(),source.images(),'embedded skin and hair textures are not recompressed');
  assert.equal(b.skins[0].joints.length,52);assert.deepEqual(b.skins[0].joints.map(i=>b.nodes[i].name),a.skins[0].joints.map(i=>a.nodes[i].name));
  for(let i=0;i<52;i++)assert.deepEqual(lod.element(b.skins[0].inverseBindMatrices,i),source.element(a.skins[0].inverseBindMatrices,i),'inverse bind matrices unchanged');
  const worlds=json=>{const parent=new Map();json.nodes.forEach((n,i)=>n.children?.forEach(c=>parent.set(c,i)));const cache=new Map();const get=i=>{if(cache.has(i))return cache.get(i);const n=json.nodes[i],matrix=n.matrix?new THREE.Matrix4().fromArray(n.matrix):new THREE.Matrix4().compose(new THREE.Vector3().fromArray(n.translation||[0,0,0]),new THREE.Quaternion().fromArray(n.rotation||[0,0,0,1]),new THREE.Vector3().fromArray(n.scale||[1,1,1]));if(parent.has(i))matrix.premultiply(get(parent.get(i)));cache.set(i,matrix);return matrix;};return get;};
  const aw=worlds(a),bw=worlds(b);for(let i=0;i<52;i++)assert.deepEqual(bw(b.skins[0].joints[i]).elements,aw(a.skins[0].joints[i]).elements,'original bind hierarchy matrices are preserved exactly');
  let triangles=0;
  for(const node of b.nodes.filter(n=>n.mesh!==undefined)){
   const originalNode=a.nodes.find(n=>n.name===node.name&&n.mesh!==undefined),original=a.meshes[originalNode.mesh].primitives[0],reduced=b.meshes[node.mesh].primitives[0],semantics=Object.keys(original.attributes).sort();
   const signature=(asset,prim,i)=>semantics.flatMap(n=>asset.element(prim.attributes[n],i)).join(',');
   const vertices=new Set(Array.from({length:a.accessors[original.attributes.POSITION].count},(_,i)=>signature(source,original,i)));
   const count=b.accessors[reduced.attributes.POSITION].count;for(let i=0;i<count;i++)assert.ok(vertices.has(signature(lod,reduced,i)),'QEM selects complete original vertex tuples, preserving UV/normals/joints/weights/trim');
   const index=b.accessors[reduced.indices];assert.equal(index.count%3,0);for(let i=0;i<index.count;i++)assert.ok(lod.element(reduced.indices,i)[0]<count);triangles+=index.count/3;
  }
  assert.equal(triangles,proof.triangles);assert.ok(triangles>=2500&&triangles<=3800,`${kind}: ${triangles} triangles`);assert.ok(lod.bytes.length<source.bytes.length*.45);
 }
});

function grid({count=30,chart=0}={}){
 const p=[],n=[],uv=[],j=[],w=[],index=[];
 for(let y=0;y<=count;y++)for(let x=0;x<=count;x++){
  p.push(x/count*.2,y/count*.2,0);n.push(0,0,1);uv.push(chart+x/count*.2,y/count);
  j.push(0,1,0,0);w.push(128,127,0,0);
 }
 for(let y=0;y<count;y++)for(let x=0;x<count;x++){const a=y*(count+1)+x,b=a+1,c=a+count+1,d=c+1;index.push(a,b,d,a,d,c);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(n,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(j,4));g.setAttribute('skinWeight',new THREE.Uint8BufferAttribute(w,4,true));g.setIndex(index);return g;
}

test('adult LOD preserves valid indexed skins, UV range and normalized four-bone influences',()=>{
 const source=grid(),before=source.attributes.position.array.slice(),g=atlasSkinnedGeometry(source,{boneNames:['Spine','Chest']});
 assert.equal(g.index.count,source.index.count,'runtime preserves the offline-authored topology');
 assert.equal(g.index.count%3,0);assert.deepEqual(source.attributes.position.array,before,'source asset stays unchanged');
 for(const index of g.index.array)assert.ok(index>=0&&index<g.attributes.position.count);
 for(let i=0;i<g.attributes.position.count;i++){
  for(const name of ['position','normal','uv','skinWeight'])for(let k=0;k<g.attributes[name].itemSize;k++)assert.ok(Number.isFinite(g.attributes[name].getComponent(i,k)));
  let sum=0;for(let k=0;k<4;k++){sum+=g.attributes.skinWeight.getComponent(i,k);assert.ok(g.attributes.skinIndex.getComponent(i,k)<2);}
  assert.ok(Math.abs(sum-1)<1e-6,'normalized Uint8 source weights remain normalized');
  assert.ok(Math.abs(new THREE.Vector3().fromBufferAttribute(g.attributes.normal,i).length()-1)<1e-6);
  assert.ok(g.attributes.uv.getX(i)>0&&g.attributes.uv.getX(i)<1);assert.ok(g.attributes.uv.getY(i)>0&&g.attributes.uv.getY(i)<1);
 }
 source.dispose();g.dispose();
});

test('runtime atlas packing displaces no head detail at the gameplay lens',()=>{
 const source=grid({count:40}),g=atlasSkinnedGeometry(source,{boneNames:['Head','Neck']});
 const camera=new THREE.PerspectiveCamera(27,844/390,.1,100);camera.position.set(.1,.1,15);camera.lookAt(.1,.1,0);camera.updateMatrixWorld(true);
 const point=new THREE.Vector3(),candidate=new THREE.Vector3(),nearest=new THREE.Vector3();let maximum=0,projected=0;
 for(let i=0;i<source.attributes.position.count;i++){
  point.fromBufferAttribute(source.attributes.position,i);let distance=Infinity;
  for(let j=0;j<g.attributes.position.count;j++){candidate.fromBufferAttribute(g.attributes.position,j);const d=point.distanceToSquared(candidate);if(d<distance){distance=d;nearest.copy(candidate);}}
  maximum=Math.max(maximum,Math.sqrt(distance));const a=point.clone().project(camera),b=nearest.clone().project(camera);projected=Math.max(projected,Math.hypot((a.x-b.x)*422,(a.y-b.y)*195));
 }
 assert.equal(maximum,0,'no additional positional simplification at runtime');assert.equal(projected,0,'no additional screen displacement');
 source.dispose();g.dispose();
});

test('separate UV charts at the same physical surface do not collapse together',()=>{
 const a=grid({count:10,chart:0}),b=grid({count:10,chart:.8}),g=new THREE.BufferGeometry();
 for(const name of ['position','normal','uv','skinIndex','skinWeight']){
  const left=a.attributes[name],right=b.attributes[name],array=new left.array.constructor(left.array.length+right.array.length);array.set(left.array);array.set(right.array,left.array.length);g.setAttribute(name,new THREE.BufferAttribute(array,left.itemSize,left.normalized));
 }
 g.setIndex([...a.index.array,...Array.from(b.index.array,i=>i+a.attributes.position.count)]);
 const reduced=atlasSkinnedGeometry(g,{boneNames:['Spine','Chest']}),u=Array.from({length:reduced.attributes.uv.count},(_,i)=>reduced.attributes.uv.getX(i));
 assert.ok(u.some(x=>x<.3)&&u.some(x=>x>.7));assert.ok(!u.some(x=>x>.3&&x<.7),'no seam is averaged across the empty atlas gap');
 for(const x of [a,b,g,reduced])x.dispose();
});

test('atlas uses distinct UV tiles, retains original hair and refreshes cosmetic maps',()=>{
 const previous=globalThis.OffscreenCanvas;let draws=0;
 globalThis.OffscreenCanvas=class {constructor(width,height){this.width=width;this.height=height;}getContext(){return {save(){},restore(){},beginPath(){},rect(){},clip(){},translate(){},scale(){},setTransform(){},clearRect(){},fillRect(){},drawImage(){draws++;}};}};
 const root=new THREE.Group(),bone=new THREE.Bone(),other=new THREE.Bone();bone.name='Spine';other.name='Chest';root.add(bone,other);const skeleton=new THREE.Skeleton([bone,other]);
 const original=[];for(const name of ['Human_x','Jersey','Human.short04_x']){const mesh=new THREE.SkinnedMesh(grid(),new THREE.MeshStandardMaterial({color:name==='Jersey'?'#2464c8':'#b67c54'}));mesh.name=name;mesh.bind(skeleton,new THREE.Matrix4());root.add(mesh);original.push(mesh);}
 let packed;
 try{
  packed=compactAvatar(root,{targetTriangles:10000,teamLook:{primary:'#2464c8',secondary:'#fff',trim:'#eac64a'}});
  assert.equal(packed.stats.drawCalls,2);assert.equal(packed.mesh.skeleton,skeleton);assert.equal(original[2].parent,null);assert.equal(packed.alphaMesh.skeleton,skeleton);assert.equal(packed.alphaMesh.castShadow,false);assert.equal(packed.mesh.material.alphaTest,0);assert.ok(packed.alphaMesh.material.alphaTest>0);
  for(const part of packed.parts)for(const temporary of ['pos','normal','tex','weights','joints','masks','dominant','index'])assert.equal(part[temporary],undefined,'temporary preparation buffers are released');
  assert.equal(original[0].parent,null);assert.equal(original[1].parent,null);assert.equal(packed.atlas.image.width,1024);assert.equal(packed.atlas.image.height,512);
  const uv=packed.mesh.geometry.attributes.uv,garment=packed.mesh.geometry.attributes.lodGarment;
  for(let i=0;i<uv.count;i++)assert.ok(garment.getX(i)===0?uv.getX(i)<.5:uv.getX(i)>.5,'body and shirt occupy separate tiles');
  const texture=new THREE.CanvasTexture(new OffscreenCanvas(32,32)),version=packed.atlas.version;
  packed.refreshMaps({Jersey:texture},{primary:'#abc',secondary:'#135',trim:'#fff'});assert.equal(original[1].material.map,texture);assert.ok(packed.atlas.version>version);assert.ok(draws>0);
  const shader={uniforms:{},vertexShader:'',fragmentShader:''};packed.mesh.material.onBeforeCompile(shader);
  assert.equal(shader.uniforms.uAdultTrim.value.getHexString(),'ffffff');assert.equal(shader.uniforms.uAdultJerseyWaist.value.getHexString(),'113355');assert.deepEqual(shader.uniforms.uAdultShortsWaist.value.toArray(),new THREE.Color('#abc').multiplyScalar(.55).toArray());texture.dispose();
  const secondRoot=new THREE.Group(),secondBones=[new THREE.Bone(),new THREE.Bone()];secondBones[0].name='Spine';secondBones[1].name='Chest';secondRoot.add(...secondBones);const secondSkeleton=new THREE.Skeleton(secondBones),secondMaterials=[];
  for(const source of original){const material=new THREE.MeshStandardMaterial({color:'#eeeeee'}),mesh=new THREE.SkinnedMesh(source.geometry,material);mesh.name=source.name;mesh.bind(secondSkeleton,new THREE.Matrix4());secondRoot.add(mesh);secondMaterials.push(material);}
  let second;
  try{
   second=compactAvatar(secondRoot,{targetTriangles:10000,teamLook:{primary:'#2464c8',secondary:'#fff',trim:'#eac64a'}});assert.equal(second.alphaMesh.material.map,packed.alphaMesh.material.map,'roster appearances share the source alpha atlas');
   let releases=0;packed.alphaMesh.material.map.addEventListener('dispose',()=>releases++);packed.dispose();assert.equal(releases,0,'one avatar leaving cannot release a shared atlas');second.dispose();assert.equal(releases,1,'the final alpha-atlas owner releases it');
  }finally{second?.dispose();for(const m of secondMaterials)m.dispose();secondSkeleton.dispose();}
 }finally{packed?.dispose();for(const mesh of original){mesh.geometry.dispose();mesh.material.dispose();}skeleton.dispose();if(previous===undefined)delete globalThis.OffscreenCanvas;else globalThis.OffscreenCanvas=previous;}
});
