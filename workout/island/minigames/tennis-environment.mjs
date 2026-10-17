import * as T from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {seededRandom} from './tennis.mjs?v=g2j-20261019-1';

/** Vertex clustering creates a small runtime LOD, preserving each corner's UV.
 * The source GLB and its textures are never rewritten. */
function modelLOD(source,cells,budget){
 const p=source.attributes.position,uv=source.attributes.uv,index=source.index;source.computeBoundingBox();const height=source.boundingBox.max.y-source.boundingBox.min.y;
 let triangles=[];
 do{
  const clusters=new Map(),ids=[],centres=[];
  for(let i=0;i<p.count;i++){
   const key=[p.getX(i),p.getY(i),p.getZ(i)].map(v=>Math.round(v/height*cells)).join(',');
   if(!clusters.has(key)){clusters.set(key,centres.length);centres.push({x:0,y:0,z:0,n:0});}
   const id=clusters.get(key),c=centres[id];ids.push(id);c.x+=p.getX(i);c.y+=p.getY(i);c.z+=p.getZ(i);c.n++;
  }
  triangles=[];const seen=new Set(),count=index?index.count:p.count;
  for(let i=0;i<count;i+=3){const vertices=[0,1,2].map(k=>index?index.getX(i+k):i+k),group=vertices.map(v=>ids[v]);if(new Set(group).size!==3)continue;const key=[...group].sort((a,b)=>a-b).join(',');if(seen.has(key))continue;seen.add(key);triangles.push(vertices.map(v=>({p:centres[ids[v]],uv:uv?[uv.getX(v),uv.getY(v)]:[0,0]})));}
  cells--;
 }while(triangles.length>budget&&cells>1);
 const positions=[],tex=[];for(const face of triangles)for(const v of face){positions.push(v.p.x/v.p.n,v.p.y/v.p.n,v.p.z/v.p.n);tex.push(...v.uv);}
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(tex,2));geometry.computeVertexNormals();return geometry;
}
export async function createTennisEnvironment(scene,config,keep){
 const e=config.render.environment,rand=seededRandom(config.seed),crowds=[],trees=[],benches=[],loaded=[],failures=[],uniforms={tennisClap:{value:0},tennisClapTime:{value:0}};
 const names=['adult-man-512.glb','adult-woman-512.glb','palm-tree-512.glb','tree-a-512.glb','bench-512.glb'];
 const results=await Promise.allSettled(names.map(async (name,modelIndex)=>{
  const modelRand=seededRandom(config.seed+modelIndex),gltf=await new GLTFLoader().loadAsync(new URL('../assets/models/'+name,import.meta.url).href),mesh=gltf.scene.children.find(o=>o.isMesh);if(!mesh)throw Error('Missing mesh '+name);
  gltf.scene.updateMatrixWorld(true);const geometry=mesh.geometry;geometry.applyMatrix4(mesh.matrixWorld);geometry.computeBoundingBox();const box=geometry.boundingBox,scale=(name.startsWith('adult')?e.crowdHeight:name.startsWith('bench')?e.benchHeight:e.treeHeight)/(box.max.y-box.min.y),cx=(box.min.x+box.max.x)/2,cz=(box.min.z+box.max.z)/2;
  geometry.translate(-cx,-box.min.y,-cz);geometry.scale(scale,scale,scale);const mat=keep(mesh.material);mat.roughness=1;mat.metalness=0;loaded.push(name);
  if(name.startsWith('adult')){
   const lod=keep(modelLOD(geometry,e.lodCells,e.crowdTriangleBudget));geometry.dispose();
   mat.onBeforeCompile=shader=>{Object.assign(shader.uniforms,uniforms);shader.vertexShader='uniform float tennisClap; uniform float tennisClapTime;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
    float arm=smoothstep(${e.clapArmStart.toFixed(3)},${e.clapArmEnd.toFixed(3)},abs(position.x))*step(${e.clapLow.toFixed(3)},position.y)*(1.0-step(${e.clapHigh.toFixed(3)},position.y));
    float clap=tennisClap*arm;float pulse=${e.clapPulseBase.toFixed(3)}+${e.clapPulseRange.toFixed(3)}*sin(tennisClapTime+instanceMatrix[3].x+instanceMatrix[3].z);
    transformed.x*=1.0-clap*pulse;transformed.y+=clap*${e.clapLift.toFixed(3)};transformed.z+=clap*${e.clapForward.toFixed(3)};`);};
   const crowd=new T.InstancedMesh(lod,mat,Math.ceil(config.render.crowdCounts[0]/2));crowd.frustumCulled=false;scene.add(crowd);crowds[modelIndex]=crowd;
  }else if(name.startsWith('bench')){const lod=keep(modelLOD(geometry,e.lodCells,e.benchTriangleBudget));geometry.dispose();for(const [x,z]of e.benchPositions){const bench=new T.Mesh(lod,mat);bench.position.set(x,0,z);bench.rotation.y=x>0?-Math.PI/2:Math.PI/2;scene.add(bench);benches.push(bench);}}
  else {const offset=name.startsWith('palm')?0:1;for(let i=offset;i<e.treePositions.length;i+=2){const [x,z]=e.treePositions[i],tree=new T.Mesh(keep(geometry),mat);tree.position.set(x,0,z);tree.rotation.y=modelRand()*Math.PI*2;scene.add(tree);trees[i]=tree;}}
 }));
 results.forEach((r,i)=>{if(r.status==='rejected')failures.push(names[i]);});
 const available=crowds.filter(Boolean);crowds.length=0;crowds.push(...available);const dummy=new T.Object3D();
 for(let group=0;group<crowds.length;group++){const crowd=crowds[group];for(let i=0;i<crowd.instanceMatrix.count;i++){
  const n=i*crowds.length+group,edge=n%4,row=Math.floor(n/e.crowdRowSize),along=(Math.floor(n/4)%e.crowdColumns-(e.crowdColumns-1)/2)*e.crowdSpacing;
  const x=edge<2?(edge===0?-1:1)*(e.crowdSideX+row*e.crowdRowGap):along,z=edge<2?along:(edge===2?-1:1)*(e.crowdEndZ+row*e.crowdEndRowGap);
  dummy.position.set(x,e.crowdFloor+row*e.crowdRise,z);dummy.rotation.set(0,Math.atan2(-x,-z),0);dummy.scale.setScalar(e.crowdScale+rand()*e.crowdScaleSpread);dummy.updateMatrix();crowd.setMatrixAt(i,dummy.matrix);crowd.setColorAt(i,new T.Color(e.crowdPalette[Math.floor(rand()*e.crowdPalette.length)]));
 }}
 let clapLeft=0,lastEvent=-1;
 function setQuality(q){crowds.forEach((c,i)=>{c.count=Math.min(c.instanceMatrix.count,Math.max(0,Math.ceil((config.render.crowdCounts[q]-i)/Math.max(1,crowds.length))));});trees.forEach((t,i)=>t.visible=i<e.treeCounts[q]);benches.forEach(b=>b.visible=q===0);}
 function render(state,dt){if(state.event.id!==lastEvent){lastEvent=state.event.id;if(['point','game','complete'].includes(state.event.type))clapLeft=e.clapSeconds;}clapLeft=Math.max(0,clapLeft-dt);uniforms.tennisClap.value=clapLeft>0?1:0;uniforms.tennisClapTime.value+=dt*e.clapFrequency;}
 function metrics(){return {loadedModels:loaded.sort(),missingModels:failures,crowd:crowds.reduce((n,c)=>n+c.count,0),crowdTrianglesPerModel:crowds.map(c=>c.geometry.attributes.position.count/3),trees:trees.filter(t=>t.visible).length,applauding:clapLeft>0};}
 setQuality(0);return {setQuality,render,metrics};
}
