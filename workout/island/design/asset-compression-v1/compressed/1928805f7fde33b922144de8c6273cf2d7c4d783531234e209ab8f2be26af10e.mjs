/** Adult basketball presentation: offline quality LOD skins combined into one atlas.
 * Source GLBs, animation clips and game state remain untouched. Every original
 * skin shares the same bind space; the merged skin keeps that skeleton and rig. */
import * as THREE from '../vendor/three.module.js';

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const canvas=(w,h)=>typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(w,h):Object.assign(document.createElement('canvas'),{width:w,height:h});
const closeMatrix=(a,b)=>a.elements.every((v,i)=>Math.abs(v-b.elements[i])<1e-5);
const wrap=(x,mode)=>mode===THREE.RepeatWrapping?x-Math.floor(x):mode===THREE.MirroredRepeatWrapping?(Math.floor(x)%2?1-(x-Math.floor(x)):x-Math.floor(x)):clamp(x,0,1);
const geometryCache=new WeakMap();
const alphaCache=new WeakMap();
const component=(attribute,index,axis)=>axis===0?attribute.getX(index):axis===1?attribute.getY(index):axis===2?attribute.getZ(index):attribute.getW(index);

function sourceParts(root){
 root.updateMatrixWorld(true);
 const inverse=new THREE.Matrix4().copy(root.matrixWorld).invert(),parts=[];
 root.traverse(mesh=>{
  if(!mesh.isSkinnedMesh||!mesh.visible)return;
  if(Array.isArray(mesh.material))throw Error('Adult basketball atlas expects one source material per mesh');
  const transform=new THREE.Matrix4().multiplyMatrices(inverse,mesh.matrixWorld);
  const bind=new THREE.Matrix4().multiplyMatrices(mesh.bindMatrix,transform.clone().invert());
  parts.push({mesh,name:mesh.name,geometry:mesh.geometry,material:mesh.material,transform,bind});
 });
 if(!parts.length)throw Error('Adult basketball avatar has no skins');
 const skeleton=parts[0].mesh.skeleton,bind=parts[0].bind;
 for(const part of parts){
  if(!closeMatrix(part.bind,bind)||part.mesh.skeleton.bones.length!==skeleton.bones.length||part.mesh.skeleton.bones.some((b,i)=>b!==skeleton.bones[i]))throw Error('Adult basketball skins do not share a bind space');
 }
 return {parts,skeleton,bind};
}

function preparePart(part,skeleton){
 const g=part.geometry,a=g.attributes,p=a.position,n=a.normal,uv=a.uv,si=a.skinIndex,sw=a.skinWeight,trim=a.trim||a.color_1||a.color;
 if(!p||!n||!si||!sw)throw Error('Adult basketball skin attributes missing');
 const pos=new Float32Array(p.count*3),normal=new Float32Array(p.count*3),tex=new Float32Array(p.count*2),weights=new Float32Array(p.count*4),joints=new Uint16Array(p.count*4),masks=new Float32Array(p.count*2),dominant=new Uint16Array(p.count);
 const v=new THREE.Vector3(),nm=new THREE.Matrix3().getNormalMatrix(part.transform);
 let top=-Infinity;
 const garment=/Jersey/.test(part.name)?1:/Shorts/.test(part.name)?2:0;
 for(let i=0;i<p.count;i++){
  v.fromBufferAttribute(p,i).applyMatrix4(part.transform);v.toArray(pos,i*3);top=Math.max(top,v.y);
  v.fromBufferAttribute(n,i).applyMatrix3(nm).normalize().toArray(normal,i*3);
  tex[i*2]=uv?.getX(i)||0;tex[i*2+1]=uv?.getY(i)||0;
  let best=-1;
  for(let k=0;k<4;k++){const index=component(si,i,k),weight=component(sw,i,k);joints[i*4+k]=index;weights[i*4+k]=weight;if(weight>best){best=weight;dominant[i]=index;}}
  if(garment&&trim){masks[i*2]=trim.getX(i);masks[i*2+1]=trim.getY(i);}
 }
 const index=g.index?Array.from(g.index.array):Array.from({length:p.count},(_,i)=>i);
 return {...part,pos,normal,tex,weights,joints,masks,dominant,index,count:p.count,garment,top,boneNames:skeleton.bones.map(b=>b.name)};
}

function directPart(part){
 const vertices=[];
 for(let i=0;i<part.count;i++){
  const weights=new Map();for(let k=0;k<4;k++){const weight=part.weights[i*4+k];if(weight)weights.set(part.joints[i*4+k],weight);}
  vertices.push({n:1,x:part.pos[i*3],y:part.pos[i*3+1],z:part.pos[i*3+2],nx:part.normal[i*3],ny:part.normal[i*3+1],nz:part.normal[i*3+2],u:part.tex[i*2],v:part.tex[i*2+1],tr:part.masks[i*2],wa:part.masks[i*2+1],weights});
 }
 return {clusters:vertices,indices:part.index,part};
}

function atlasLayout(count,size,columns=Math.min(4,count)){const tile=Math.floor(size/columns),rows=Math.ceil(count/columns);return {columns,rows,tile,width:columns*tile,height:rows*tile,pad:4};}
function tintColor(color){return '#'+color.clone().convertLinearToSRGB().getHexString(THREE.LinearSRGBColorSpace);}

function paintAtlas(surface,parts,layout){
 const ctx=surface.getContext('2d'),{columns,tile,pad}=layout,inside=tile-pad*2;
 ctx.clearRect(0,0,surface.width,surface.height);
 for(let i=0;i<parts.length;i++){
  const material=parts[i].material,map=material.map,image=map?.image,x=(i%columns)*tile+pad,y=Math.floor(i/columns)*tile+pad;
  ctx.save();ctx.beginPath();ctx.rect(x,y,inside,inside);ctx.clip();
  if(image){
   if(map.flipY===false){ctx.translate(x,y+inside);ctx.scale(1,-1);ctx.drawImage(image,0,0,inside,inside);ctx.setTransform(1,0,0,1,0,0);}
   else ctx.drawImage(image,x,y,inside,inside);
   const color=material.color||new THREE.Color(1,1,1);
   if(color.r!==1||color.g!==1||color.b!==1){
    ctx.globalCompositeOperation='multiply';ctx.fillStyle=tintColor(color);ctx.fillRect(x,y,inside,inside);
    // Keep original hair/eyelash cutouts after the tint fill.
    ctx.globalCompositeOperation='destination-in';
    if(map.flipY===false){ctx.translate(x,y+inside);ctx.scale(1,-1);ctx.drawImage(image,0,0,inside,inside);ctx.setTransform(1,0,0,1,0,0);}else ctx.drawImage(image,x,y,inside,inside);
   }
  }else{ctx.fillStyle=tintColor(material.color||new THREE.Color(1,1,1));ctx.fillRect(x,y,inside,inside);}
  ctx.restore();
  // Duplicate each tile edge into a small gutter to keep the atlas stable at
  // oblique angles and lower mip levels, including transparent hair edges.
  ctx.drawImage(surface,x,y,1,inside,x-pad,y,pad,inside);ctx.drawImage(surface,x+inside-1,y,1,inside,x+inside,y,pad,inside);
  ctx.drawImage(surface,x-pad,y,inside+pad*2,1,x-pad,y-pad,inside+pad*2,pad);ctx.drawImage(surface,x-pad,y+inside-1,inside+pad*2,1,x-pad,y+inside,inside+pad*2,pad);
 }
}

function mergeParts(results,layout){
 const positions=[],normals=[],uvs=[],skinIndices=[],skinWeights=[],trim=[],garment=[],indices=[],normal=new THREE.Vector3();
 for(let partIndex=0;partIndex<results.length;partIndex++){
  const result=results[partIndex],part=result.part,offset=positions.length/3,{tile,pad,width,height,columns}=layout;
  const map=part.material.map;if(map?.matrixAutoUpdate)map.updateMatrix();
  const tex=new THREE.Vector2();
  for(const c of result.clusters){
   positions.push(c.x/c.n,c.y/c.n,c.z/c.n);normal.set(c.nx,c.ny,c.nz).normalize().toArray(normals,normals.length);
   tex.set(c.u/c.n,c.v/c.n);if(map){tex.applyMatrix3(map.matrix);tex.x=wrap(tex.x,map.wrapS);tex.y=wrap(tex.y,map.wrapT);}
   uvs.push(((partIndex%columns)*tile+pad+tex.x*(tile-pad*2))/width,1-(Math.floor(partIndex/columns)*tile+pad+(1-tex.y)*(tile-pad*2))/height);
   const weights=[...c.weights].sort((a,b)=>b[1]-a[1]).slice(0,4),sum=weights.reduce((s,w)=>s+w[1],0)||1;
   for(let k=0;k<4;k++){skinIndices.push(weights[k]?.[0]||0);skinWeights.push((weights[k]?.[1]||0)/sum);}
   trim.push(c.tr/c.n,c.wa/c.n);garment.push(part.garment);
  }
  for(const index of result.indices)indices.push(offset+index);
 }
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
 geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(skinIndices,4));geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(skinWeights,4));
 geometry.setAttribute('lodTrim',new THREE.Float32BufferAttribute(trim,2));geometry.setAttribute('lodGarment',new THREE.Float32BufferAttribute(garment,1));
 geometry.setIndex(indices);geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}

function alphaGroup(sourceParts,skeleton,bind){
 if(!sourceParts.length)return null;
 const parts=sourceParts.map(p=>preparePart(p,skeleton)),columns=Math.min(2,parts.length),layout=atlasLayout(parts.length,columns*512,columns);
 const key=parts.map(p=>p.geometry.uuid+':'+(p.material.map?.uuid||'white')).join('|');
 let cache=alphaCache.get(parts[0].geometry);if(!cache){cache=new Map();alphaCache.set(parts[0].geometry,cache);}
 let shared=cache.get(key);
 if(!shared){
  const geometry=mergeParts(parts.map(directPart),layout),surface=canvas(layout.width,layout.height);
  // Keep one untinted texture per source body. Hair colour is a vertex colour,
  // so different roster appearances share the same full-resolution alpha atlas.
  paintAtlas(surface,parts.map(p=>({material:{map:p.material.map,color:new THREE.Color(1,1,1)}})),layout);
  const texture=new THREE.CanvasTexture(surface);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
  shared={geometry,texture,refs:0};cache.set(key,shared);
 }
 shared.refs++;
 const geometry=shared.geometry.clone(),colors=[];
 for(const part of parts){const color=part.material.color||new THREE.Color(1,1,1);for(let i=0;i<part.count;i++)colors.push(color.r,color.g,color.b);}
 geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
 const material=new THREE.MeshStandardMaterial({map:shared.texture,vertexColors:true,roughness:.72,metalness:0,alphaTest:.35,side:THREE.DoubleSide});
 const mesh=new THREE.SkinnedMesh(geometry,material);mesh.name='hoops-adult-alpha';mesh.frustumCulled=false;mesh.receiveShadow=true;mesh.castShadow=false;mesh.bind(skeleton,bind);
 let disposed=false;
 return {mesh,texture:shared.texture,triangles:geometry.index.count/3,dispose(){if(disposed)return;disposed=true;mesh.removeFromParent();geometry.dispose();material.dispose();if(--shared.refs===0){shared.geometry.dispose();shared.texture.dispose();cache.delete(key);}}};
}

/** Compact an already dressed legacy avatar in its untouched bind pose.
 * Returns an opaque body atlas and a shared hair/brow/lash alpha atlas. Alpha
 * cutouts stay out of the opaque body's shader, retaining early depth culling.
 * Also returns stats and refreshMaps({Jersey,Shorts},look).
 * Original materials remain caller-owned; only the new atlas/geometry/material
 * are released by dispose. Animation and the existing bone objects are retained.
 */
export function compactAvatar(root,options={}){
 const maxTriangles=options.maxTriangles??options.targetTriangles??4000,atlasSize=options.atlasSize??1024,teamLook=options.teamLook;
 const source=sourceParts(root),alphaParts=source.parts.filter(p=>/short0|afro|long0|bob0|braid|pony|eyebrow|eyelash/i.test(p.name)),parts=source.parts.filter(p=>!alphaParts.includes(p)).map(p=>preparePart(p,source.skeleton));
 const hairTriangles=alphaParts.reduce((n,p)=>n+(p.geometry.index?.count||p.geometry.attributes.position.count)/3,0);
 const sourceTriangles=hairTriangles+parts.reduce((n,p)=>n+p.index.length/3,0),layout=atlasLayout(parts.length,atlasSize);
 const key=parts.map(p=>p.geometry.uuid+':'+p.name).join('|')+':'+maxTriangles+':'+atlasSize;
 let cache=geometryCache.get(parts[0].geometry);if(!cache){cache=new Map();geometryCache.set(parts[0].geometry,cache);}
 let prepared=cache.get(key);
 if(!prepared){
  // QEM reduction is performed offline in hoops-build-lod.mjs. Runtime packing
  // changes no vertex positions, UV topology or skeletal animation data.
  const results=parts.map(directPart),triangles=results.reduce((n,p)=>n+p.indices.length/3,0);
  prepared={geometry:mergeParts(results,layout),triangles,multiplier:1,maxDisplacement:0,headDisplacement:0};cache.set(key,prepared);
 }
 // Only lightweight source records survive preparation. The large temporary
 // position/normal/UV/influence/index arrays are not captured by refreshMaps.
 const liveParts=parts.map(p=>({name:p.name,material:p.material,mesh:p.mesh,geometry:p.geometry,garment:p.garment}));
 const {triangles,multiplier}=prepared,geometry=prepared.geometry.clone(),surface=canvas(layout.width,layout.height);paintAtlas(surface,liveParts,layout);
 const atlas=new THREE.CanvasTexture(surface);atlas.colorSpace=THREE.SRGBColorSpace;atlas.anisotropy=4;atlas.minFilter=THREE.LinearMipmapLinearFilter;atlas.magFilter=THREE.LinearFilter;
 const uniforms={uAdultTrim:{value:new THREE.Color()},uAdultJerseyWaist:{value:new THREE.Color()},uAdultShortsWaist:{value:new THREE.Color()}};
 const setLook=look=>{
  if(look){uniforms.uAdultTrim.value.set(look.trim||look.secondary||'#fff');uniforms.uAdultJerseyWaist.value.set(look.secondary||'#fff');uniforms.uAdultShortsWaist.value.set(look.primary||'#fff').multiplyScalar(.55);return;}
  for(const p of liveParts)if(p.garment){
   const shader={uniforms:{},vertexShader:'',fragmentShader:''};p.material.onBeforeCompile(shader);
   if(shader.uniforms.uTrim)uniforms.uAdultTrim.value.copy(shader.uniforms.uTrim.value);
   const target=p.garment===1?uniforms.uAdultJerseyWaist:uniforms.uAdultShortsWaist;
   if(shader.uniforms.uWaist)target.value.copy(shader.uniforms.uWaist.value);
  }
 };setLook(teamLook);
 // Skin, shoes and the outer uniform are closed/outward surfaces. Keep normal
 // back-face culling in both passes; only the separate original hair is two-sided.
 const material=new THREE.MeshStandardMaterial({map:atlas,roughness:.7,metalness:0,alphaTest:0,side:THREE.FrontSide});material.shadowSide=THREE.FrontSide;
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,uniforms);
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute vec2 lodTrim;attribute float lodGarment;varying vec2 vAdultTrim;varying float vAdultGarment;').replace('#include <begin_vertex>','#include <begin_vertex>\nvAdultTrim=lodTrim;vAdultGarment=lodGarment;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 vAdultTrim;varying float vAdultGarment;uniform vec3 uAdultTrim;uniform vec3 uAdultJerseyWaist;uniform vec3 uAdultShortsWaist;').replace('#include <color_fragment>','#include <color_fragment>\nif(vAdultGarment>0.5){diffuseColor.rgb=mix(diffuseColor.rgb,uAdultTrim,smoothstep(0.42,0.52,vAdultTrim.x));vec3 waist=vAdultGarment<1.5?uAdultJerseyWaist:uAdultShortsWaist;diffuseColor.rgb=mix(diffuseColor.rgb,waist,smoothstep(0.4,0.6,vAdultTrim.y));}');
 };
 material.customProgramCacheKey=()=>'hoops-adult-atlas-v1';
 const mesh=new THREE.SkinnedMesh(geometry,material);mesh.name='hoops-adult-lod';mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;mesh.bind(source.skeleton,source.bind);root.add(mesh);
 const alpha=alphaGroup(alphaParts,source.skeleton,source.bind);if(alpha)root.add(alpha.mesh);
 for(const part of source.parts)part.mesh.removeFromParent();
 let disposed=false;
 return {mesh,alphaMesh:alpha?.mesh,parts:liveParts,atlas,stats:{sourceTriangles,triangles:triangles+hairTriangles,bodyTriangles:triangles,hairTriangles,vertices:geometry.attributes.position.count,drawCalls:1+(alpha?1:0),multiplier:+multiplier.toFixed(3),targetMet:triangles+hairTriangles<=maxTriangles,maxDisplacement:prepared.maxDisplacement,headDisplacement:prepared.headDisplacement,atlasWidth:layout.width,atlasHeight:layout.height},
  refreshMaps(maps={},look){if(disposed)return;for(const p of liveParts)if(maps[p.name])p.material.map=maps[p.name];if(look)setLook(look);paintAtlas(surface,liveParts,layout);atlas.needsUpdate=true;},
  dispose(){if(disposed)return;disposed=true;mesh.removeFromParent();geometry.dispose();material.dispose();atlas.dispose();alpha?.dispose();source.skeleton.dispose();},
 };
}
export {compactAvatar as buildAdultMesh};

/** Geometry-only atlas packing path. No simplification or vertex displacement. */
export function atlasSkinnedGeometry(geometry,{boneNames=[],name='Human_x'}={}){
 const part=preparePart({geometry,name,material:{map:null},transform:new THREE.Matrix4()}, {bones:boneNames.map(name=>({name}))});
 return mergeParts([directPart(part)],atlasLayout(1,256));
}
