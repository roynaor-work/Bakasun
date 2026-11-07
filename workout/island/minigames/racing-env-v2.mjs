// racing-env-v2: the Codex trackside kit (design/racing-environment-v2: 7 plain glTF models, 15 seamless 256 px textures, CC0) placed on the three F1 circuits.
// Models are baked once: every plain-colour material of a model is merged into one vertex-coloured mesh, textured and emissive parts stay separate, and every
// model becomes a few InstancedMeshes (about 20 draw calls for the whole kit). Off with ?racingEnv=v1; any load problem leaves the procedural trackside of racing-f1.mjs.
import {mergeGeometries} from '../vendor/BufferGeometryUtils.js';

export const envV2Enabled=(search=globalThis.location?.search||'')=>new URLSearchParams(search).get('racingEnv')!=='v1';
const DIR='../design/racing-environment-v2/';
const MODELS=['grandstand','pit-building','start-gantry','control-tower','tire-barrier','chainlink-fence','sponsor-board'];
const TEXTURES={gravel:['gravel-runoff',4],runoff:['asphalt-skid',4],pit:['asphalt-pits',4]};

export async function loadEnvV2({T,GLTFLoader,anisotropy=4,version=''}){
 const loader=new GLTFLoader(),texLoader=new T.TextureLoader(),url=f=>new URL(DIR+f+(version?'?v='+version:''),import.meta.url).href;
 const [models,textures]=await Promise.all([
  Promise.all(MODELS.map(async name=>[name,(await loader.loadAsync(url('runtime/'+name+'.glb'))).scene])),
  Promise.all(Object.entries(TEXTURES).map(async([key,[file,tile]])=>{const t=await texLoader.loadAsync(url('textures/'+file+'.webp'));t.wrapS=t.wrapT=T.RepeatWrapping;t.colorSpace=T.SRGBColorSpace;t.anisotropy=anisotropy;return [key,t,tile];}))
 ]);
 return {models:Object.fromEntries(models),textures:Object.fromEntries(textures.map(([k,t])=>[k,t]))};
}

/** Bake one model: plain materials -> one vertex-coloured geometry; textured/emissive/transparent materials stay as their own parts (original materials). */
function bake(T,scene,keep){
 scene.updateMatrixWorld(true);const plain=[],parts=[];
 scene.traverse(o=>{if(!o.isMesh)return;const g=o.geometry.clone();g.applyMatrix4(o.matrixWorld);const m=o.material,special=m.map||m.emissiveIntensity>0&&(m.emissive?.getHex?.()||0)>0||m.transparent;
  if(special){parts.push({geometry:keep(g),material:keep(m)});return;}
  const n=g.attributes.position.count,col=new Float32Array(n*3),c=m.color;for(let i=0;i<n;i++){col[i*3]=c.r;col[i*3+1]=c.g;col[i*3+2]=c.b;}
  g.setAttribute('color',new T.BufferAttribute(col,3));g.deleteAttribute('uv');if(g.attributes.uv1)g.deleteAttribute('uv1');plain.push(g);});
 if(plain.length){const merged=mergeGeometries(plain.map(g=>{const x=g.index?g.toNonIndexed():g;for(const k of Object.keys(x.attributes))if(!['position','normal','color'].includes(k))x.deleteAttribute(k);return x;}));
  parts.push({geometry:keep(merged),material:keep(new T.MeshStandardMaterial({vertexColors:true,roughness:.78,metalness:.12}))});}
 return parts;
}

export function buildEnvV2({T,scene,track,keep,f1,kit,night=false}){
 const root=new T.Group();root.name='racing-env-v2';scene.add(root);
 const dummy=new T.Object3D(),baked={};for(const [name,model] of Object.entries(kit.models))baked[name]=bake(T,model,keep);
 const jobs={};  // model name -> [{x,y,z,rot,sx,sy,sz}]
 const put=(name,s,lane,{y=0,scaleX=1,scaleY=1,scaleZ=1}={})=>{const q=f1.at(s,lane,y),side=Math.sign(lane)||1;(jobs[name]||(jobs[name]=[])).push({x:q.x,y:q.y,z:q.z,rot:q.heading+(lane===0?Math.PI:side<0?Math.PI/2:-Math.PI/2),sx:scaleX,sy:scaleY,sz:scaleZ});};
 const L=track.length,half=f1.half,[S0,len]=f1.pitSpan;
 // start gantry across the line, scaled in X to the road; pit building (4 modules) on the pit side; grandstand (4 modules) and control tower opposite
 put('start-gantry',L-10,0,{scaleX:(track.width+3)/15.75});
 for(let k=0;k<3;k++)put('pit-building',(S0+25+k*(len-50)/2)%L,-(half+30),{scaleX:1.02});
 for(let k=0;k<3;k++)put('grandstand',(52+k*20.5)%L,half+18);
 put('control-tower',175,half+16);
 // sponsor boards on the straights (generic graphic), a tyre module and fence behind the outside of the eight sharpest corners
 for(const s of [L-100,300]) put('sponsor-board',s%L,((Math.floor(s/10)%2)?1:-1)*(half+7.5));
 const corners=[];for(let i=0;i<f1.n;i++){let sum=0;for(let j=0;j<6;j++)sum+=f1.turn[(i+j)%f1.n];corners.push({i,sum});}
 corners.sort((a,b)=>Math.abs(b.sum)-Math.abs(a.sum));const used=[];
 for(const c of corners){if(used.length>=5)break;const s=c.i*f1.step+18;if(used.some(u=>Math.abs(((u-s+L*1.5)%L)-L/2)<70))continue;
  const out=c.sum>0?-1:1;used.push(s);put('tire-barrier',s,out*(half+3.1));put('chainlink-fence',s,out*(half+5.4));}
 let triangles=0,draws=0;
 for(const [name,list] of Object.entries(jobs)){for(const part of baked[name]){const mesh=new T.InstancedMesh(part.geometry,part.material,list.length);
   list.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,p.rot,0);dummy.scale.set(p.sx,p.sy,p.sz);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});
   mesh.castShadow=false;mesh.receiveShadow=true;mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();root.add(mesh);keep(mesh);draws++;
   triangles+=(part.geometry.index?part.geometry.index.count:part.geometry.attributes.position.count)/3*list.length;}}
 // textures on the run-off / gravel / pit-lane ribbons (seamless 256 px tiles, 4 m repeat)
 for(const [key,ribbon] of [['runoff',f1.ribbons.runoff],['gravel',f1.ribbons.gravel],['pit',f1.ribbons.pit]]){const t=kit.textures[key];if(!t||!ribbon)continue;ribbon.material.map=t;ribbon.material.color.set('#ffffff');ribbon.material.needsUpdate=true;keep(t);}
 f1.useModels();
 return {root,metrics:()=>({triangles:Math.round(triangles),draws}),dispose(){root.removeFromParent();}};
}
