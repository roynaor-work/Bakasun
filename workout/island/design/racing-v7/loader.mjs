import * as T from 'three';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {DRACOLoader} from './vendor/DRACOLoader.js';
import {clone} from './vendor/SkeletonUtils.js';

const draco=new DRACOLoader();
draco.setDecoderPath('./vendor/draco/');
draco.setDecoderConfig({type:'wasm'});
draco.setWorkerLimit(1);
const loader=new GLTFLoader();loader.setDRACOLoader(draco);
const localURL=url=>globalThis.__racingAssetURL?globalThis.__racingAssetURL(url):url;
if(globalThis.__racingAssetURL){
  // The direct-file distribution embeds the two decoder resources too.
  draco._loadLibrary=(file,type)=>fetch(localURL('./vendor/draco/'+file)).then(r=>type==='arraybuffer'?r.arrayBuffer():r.text());
}
const textureLoader=new T.TextureLoader();
const cache=new Map();
export const textureCache=new Map();
export const carSpecs=[
  {id:'apex',name:'APEX',label:'קופה',color:'#14c6b8'},
  {id:'velour',name:'VELOUR',label:'GT',color:'#ef6c32'},
  {id:'prism',name:'PRISM',label:'טריז',color:'#8b5cf6'},
  {id:'solis',name:'SOLIS',label:'רודסטר',color:'#e8dfc4'},
  {id:'vector',name:'VECTOR',label:'מסלול',color:'#c2e940'},
];
export async function loadGLB(url){
  if(!cache.has(url))cache.set(url,loader.loadAsync(localURL(url)));
  return cache.get(url);
}
export async function loadTexture(url,color=false){
  if(!textureCache.has(url))textureCache.set(url,textureLoader.loadAsync(localURL(url)).then(t=>{
    t.colorSpace=color?T.SRGBColorSpace:T.NoColorSpace;
    t.anisotropy=4;return t;
  }));
  return textureCache.get(url);
}
export async function createCar(id,{traffic=false}={}){
  const lod=new T.LOD();lod.name=id;
  lod.autoUpdate=false;
  const levels=traffic?[1,2]:[0,1,2];
  const spec=carSpecs.find(s=>s.id===id);
  const paint=[];const wheels=[],wheelBatches=[];
  for(const i of levels){
    const gltf=await loadGLB(`./assets/cars/${id}-lod${i}.glb`);
    const model=gltf.scene.clone(true);
    model.traverse(o=>{
      if(!o.isMesh)return;
      o.castShadow=!traffic;o.receiveShadow=false;
      const materials=Array.isArray(o.material)?o.material:[o.material];
      const cloned=materials.map(m=>{
        const c=m.clone();
        if(traffic&&'clearcoat' in c)c.clearcoat=0;
        if(c.name.startsWith('Paint')){paint.push(c);c.color.set(spec.color);c.envMapIntensity=.92;c.metalness=.38;c.roughness=.275;}
        if(c.name.startsWith('Glass')){c.envMapIntensity=1.25;c.roughness=.09;c.metalness=.42;c.color.set('#172d43');}
        return c;
      });
      o.material=Array.isArray(o.material)?cloned:cloned[0];
    });
    for(const name of ['WheelFrontL','WheelFrontR','WheelRearL','WheelRearR']){
      const wheel=model.getObjectByName(name);if(wheel)wheels.push({wheel,front:name.includes('Front'),lod:i});
    }
    // Four rigid pivots remain in the GLB. In this viewer the matching wheel
    // primitives share instance batches, including independent steering matrices.
    model.updateMatrixWorld(true);
    const pivots=['WheelFrontL','WheelFrontR','WheelRearL','WheelRearR'].map(name=>model.getObjectByName(name));
    const reference=pivots[0],parts=[];
    reference.traverse(part=>{if(part.isMesh)parts.push(part);});
    const inverseReference=reference.matrixWorld.clone().invert();
    for(const part of parts){
      const relative=new T.Matrix4().multiplyMatrices(inverseReference,part.matrixWorld);
      const batch=new T.InstancedMesh(part.geometry,part.material,4);batch.name='Instanced rotating wheels';
      batch.castShadow=!traffic;batch.frustumCulled=false;model.add(batch);
      wheelBatches.push({batch,model,pivots,relative});
    }
    for(const pivot of pivots)pivot.visible=false;
    lod.addLevel(model,i===0?0:i===1?(traffic?0:17):46,.12);
  }
  lod.userData={id,paint,wheels,spin:0,traffic,wheelBatches};
  const steeringQ=new T.Quaternion(),inverseModel=new T.Matrix4(),instanceMatrix=new T.Matrix4();
  lod.userData.setColor=hex=>paint.forEach(m=>m.color.set(hex));
  lod.userData.update=(travel,steer=0)=>{
    const spin=travel/.384;
    steeringQ.setFromAxisAngle(T.Object3D.DEFAULT_UP,steer);
    for(const {wheel,front} of wheels){
      wheel.rotation.set(spin,0,0);
      if(front)wheel.quaternion.premultiply(steeringQ);
    }
    for(const {batch,model,pivots,relative} of wheelBatches){
      model.updateMatrixWorld(true);inverseModel.copy(model.matrixWorld).invert();
      for(let j=0;j<4;j++){instanceMatrix.multiplyMatrices(inverseModel,pivots[j].matrixWorld).multiply(relative);batch.setMatrixAt(j,instanceMatrix);}
      batch.instanceMatrix.needsUpdate=true;
    }
  };
  lod.userData.updateLOD=(camera,low=false)=>{
    if(!low){lod.update(camera);return;}
    const index=traffic?lod.levels.length-1:Math.min(1,lod.levels.length-1);
    lod.levels.forEach((level,i)=>{level.object.visible=i===index;});lod._currentLevel=index;
  };
  return lod;
}
export async function loadSpectator(){return clone((await loadGLB('./assets/crowd/spectator.glb')).scene);}
export function disposeTree(root,{geometries=true}={}){
  const doneG=new Set(),doneM=new Set();
  root.traverse(o=>{
    if(geometries&&o.geometry&&!doneG.has(o.geometry)){o.geometry.dispose();doneG.add(o.geometry);}
    for(const m of Array.isArray(o.material)?o.material:[o.material])if(m&&!doneM.has(m)){m.dispose();doneM.add(m);}
  });
}
export function releaseDecoder(){draco.dispose();}
