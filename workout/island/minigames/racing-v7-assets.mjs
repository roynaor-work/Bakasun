/** Island Racing v7 loader and builders (design/racing-v7, 05/11). Everything is fetched and checked first (loadRacingV7Pack,
 * all or nothing), then built detached from the scene (buildRacingV7), so a failure at any point leaves the previous assets whole.
 * Loaded lazily by racing-view.mjs; nothing here runs when v7 is off. Pure rules (LOD distances, file list, crowd sites) are in racing-v7.mjs. */
import * as T from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {clone as cloneSkinned} from '../vendor/SkeletonUtils.js';
import {HoopsDRACOLoader as DRACOLoader} from './hoops-draco.mjs';
import {loadHoopsGLTF} from './hoops-gltf.mjs';
import {V7_SLOT_CARS,V7_SLOT_COLORS,V7_FILES,V7_REQUIRED,carLodsFor,carFile,lodDistances,pickLod,CROWD_CAP,CROWD_RADIUS,CROWD_REFRESH,crowdSites} from './racing-v7.mjs';

const WHEELS=['WheelFrontL','WheelFrontR','WheelRearL','WheelRearR'];
const WHEEL_RADIUS=0.384,TAU=Math.PI*2;

/** Fetch every file this session needs. Rejects (and frees what it made) if any one is missing or lacks a name the code relies on. */
export async function loadRacingV7Pack({base,anisotropy=4}={}){
 const draco=new DRACOLoader();draco.setDecoderPath(new URL('../vendor/draco/',import.meta.url).href);draco.setWorkerLimit(1);
 const loader=new GLTFLoader();loader.setDRACOLoader(draco);
 const textures=new T.TextureLoader(),at=file=>new URL(file,base).href;
 const glbNames=[];
 V7_SLOT_CARS.forEach((id,slot)=>{for(const lod of carLodsFor(slot))glbNames.push(carFile(id,lod));});
 glbNames.push(V7_FILES.spectator,V7_FILES.props);
 const texNames=['asphaltColor','asphaltNormal','asphaltOrm','smoke'];
 const pack={glb:new Map(),textures:{}};
 try{
  const all=await Promise.allSettled([...glbNames.map(f=>loadHoopsGLTF(loader,at(f))),...texNames.map(k=>textures.loadAsync(at(V7_FILES[k])))]);
  const failed=all.find(r=>r.status==='rejected');
  all.forEach((r,i)=>{if(r.status!=='fulfilled')return;if(i<glbNames.length)pack.glb.set(glbNames[i],r.value);else pack.textures[texNames[i-glbNames.length]]=r.value;});
  if(failed)throw failed.reason;
  for(const [file,gltf] of pack.glb){
   const need=file.startsWith('cars/')?V7_REQUIRED.car:file===V7_FILES.props?V7_REQUIRED.props:V7_REQUIRED.spectator;
   for(const name of need)if(!gltf.scene.getObjectByName(name))throw Error(`racing v7 ${file} lacks ${name}`);
   if(file.startsWith('cars/')){
    let paint=false;gltf.scene.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(m.name.startsWith('Paint'))paint=true;});
    if(!paint)throw Error(`racing v7 ${file} has no Paint material`);
    for(const name of WHEELS){const w=gltf.scene.getObjectByName(name);if(w.quaternion.angleTo(new T.Quaternion())>1e-4||Math.abs(w.scale.x-1)>1e-4)throw Error(`racing v7 ${file} ${name} is not a plain pivot`);}
   }
  }
  const t=pack.textures;
  t.asphaltColor.colorSpace=T.SRGBColorSpace;t.smoke.colorSpace=T.SRGBColorSpace;t.asphaltNormal.colorSpace=T.NoColorSpace;t.asphaltOrm.colorSpace=T.NoColorSpace;
  for(const k of ['asphaltColor','asphaltNormal','asphaltOrm']){t[k].wrapS=t[k].wrapT=T.RepeatWrapping;t[k].anisotropy=anisotropy;}
  return pack;
 }catch(error){disposePack(pack);throw error;}
 finally{draco.dispose();}
}

/** Everything a pack allocated on the GPU or could (geometries, materials, textures), for the view's resource set. */
export function packResources(pack){
 const out=new Set();
 for(const gltf of pack.glb.values())gltf.scene.traverse(o=>{
  if(o.geometry)out.add(o.geometry);
  for(const m of Array.isArray(o.material)?o.material:[o.material])if(m){out.add(m);for(const v of Object.values(m))if(v?.isTexture)out.add(v);}
 });
 for(const t of Object.values(pack.textures))out.add(t);
 return out;
}
export function disposePack(pack){for(const r of packResources(pack))r.dispose?.();}

/** The v7 asphalt on the game's own road ribbon (UV: u across the road, v along it; v7 tiles every 4 m). */
export function applyAsphalt(material,pack,track,{night=false,normal=true}={}){
 const t=pack.textures,tile=4;
 for(const k of ['asphaltColor','asphaltNormal','asphaltOrm'])t[k].repeat.set(Math.max(1,Math.round(track.width/tile)),track.length/tile);
 material.map=t.asphaltColor;material.bumpMap=null;
 if(normal){material.normalMap=t.asphaltNormal;material.normalScale.set(.38,.38);}
 material.roughnessMap=t.asphaltOrm;material.metalnessMap=t.asphaltOrm;
 material.color.set('#acacaa');material.roughness=night?.6:.92;material.metalness=.04;
 material.needsUpdate=true;
}

function tuneMaterial(m,{color,traffic}){
 const c=m.clone();
 if(traffic&&'clearcoat' in c)c.clearcoat=0;
 if(c.name.startsWith('Paint')){c.color.set(color);c.envMapIntensity=.92;c.metalness=.38;c.roughness=.275;c.userData.v7Paint=true;}
 else if(c.name.startsWith('Glass')){c.envMapIntensity=1.25;c.roughness=.09;c.metalness=.42;c.color.set('#172d43');}
 return c;
}

/** One car: up to three LOD models (only the ones loaded), a paint colour, four wheels drawn as three instanced batches per LOD. */
function makeCar(pack,id,lods,{color,traffic}){
 const root=new T.Group();root.name='v7-car-'+id;
 const levels=[],paint=[],owned=new Set();
 for(const lod of lods){
  const model=pack.glb.get(carFile(id,lod)).scene.clone(true);model.name=`${id}-lod${lod}`;
  model.traverse(o=>{
   if(!o.isMesh)return;
   o.castShadow=!traffic&&lod<2;o.receiveShadow=false;
   const list=Array.isArray(o.material)?o.material:[o.material],tuned=list.map(m=>{const c=tuneMaterial(m,{color,traffic});owned.add(c);if(c.userData.v7Paint)paint.push(c);return c;});
   o.material=Array.isArray(o.material)?tuned:tuned[0];
  });
  const pivots=WHEELS.map(n=>model.getObjectByName(n)),parts=[];
  const source=pivots[0].isMesh?[pivots[0]]:pivots[0].children.filter(o=>o.isMesh);
  for(const part of source){
   const inst=new T.InstancedMesh(part.geometry,part.material,4);inst.name='v7 wheels';inst.castShadow=!traffic&&lod<2;inst.frustumCulled=false;
   model.add(inst);parts.push({inst,local:pivots[0].isMesh?new T.Matrix4():part.matrix.clone()});
  }
  const pos=pivots.map(p=>p.position.clone());
  for(const p of pivots)p.visible=false;
  levels[lod]={model,parts,pos};model.visible=false;root.add(model);
 }
 const e=new T.Euler(),qFront=new T.Quaternion(),qRear=new T.Quaternion(),ONE=new T.Vector3(1,1,1),tmp=new T.Matrix4(),pm=[0,1,2,3].map(()=>new T.Matrix4());
 const rig={
  id,root,traffic,lod:-1,levels,
  /** Show the LOD for this camera distance (metres), with hysteresis. Returns the level now shown. */
  frame(distance,quality){
   const level=pickLod(distance,lodDistances(traffic?'opponent':'player',quality),rig.lod);
   const use=levels[level]?level:levels.findIndex(Boolean);
   if(use!==rig.lod){if(levels[rig.lod])levels[rig.lod].model.visible=false;levels[use].model.visible=true;rig.lod=use;}
   return use;
  },
  /** Roll (radians, unbounded) and front steering (radians) for the visible LOD's wheels. No allocation. */
  wheels(spin,steer){
   const l=levels[rig.lod];if(!l)return;
   e.set(spin,steer,0,'YXZ');qFront.setFromEuler(e);e.set(spin,0,0,'YXZ');qRear.setFromEuler(e);
   for(let j=0;j<4;j++)pm[j].compose(l.pos[j],j<2?qFront:qRear,ONE);
   for(const part of l.parts){
    for(let j=0;j<4;j++){tmp.multiplyMatrices(pm[j],part.local);part.inst.setMatrixAt(j,tmp);}
    part.inst.instanceMatrix.needsUpdate=true;
   }
  },
  setColor(hex){for(const m of paint)m.color.set(hex);},
  /** GPU objects this car made itself (cloned materials); shared geometry belongs to the pack. */
  owned,
  wheelRadius:WHEEL_RADIUS,TAU,
 };
 return rig;
}

/** Fixed pools of standing spectators in three variants. Matrices are precomputed per site; only the nearest, in-front sites are
 * copied into the instance buffers, and only when the player has moved CROWD_REFRESH metres. No allocation per frame. */
function makeCrowd(pack,sites,stand){
 const source=pack.glb.get(V7_FILES.spectator).scene,variants=[];
 const time={value:0};
 for(let v=0;v<3;v++){
  const model=cloneSkinned(source),pose=v%2,shirt=[0,6,7][v];
  for(const side of ['Left','Right']){
   const arm=model.getObjectByName(side+'Arm'),fore=model.getObjectByName(side+'ForeArm');
   if(pose){arm.rotation.z=side==='Left'?-2.35:2.35;fore.rotation.z=side==='Left'?-.48:.48;}else arm.rotation.z=side==='Left'?-.25:.25;
  }
  model.updateMatrixWorld(true);
  let geometry,map;
  model.traverse(o=>{
   if(!o.isSkinnedMesh)return;
   o.skeleton.update();const g=o.geometry.clone(),pos=g.attributes.position,uv=g.attributes.uv,p=new T.Vector3();
   for(let i=0;i<pos.count;i++){p.fromBufferAttribute(pos,i);o.applyBoneTransform(i,p);p.applyMatrix4(o.matrixWorld);pos.setXYZ(i,p.x,p.y,p.z);if(uv.getX(i)<.125)uv.setX(i,shirt/8+.065);}
   for(const name of ['skinIndex','skinWeight'])g.deleteAttribute(name);
   g.computeVertexNormals();geometry=g;map=o.material.map;
  });
  // Lambert: no PBR work for a figure that is small on screen
  const material=new T.MeshLambertMaterial({map,color:'#ffffff'});
  material.onBeforeCompile=shader=>{
   shader.uniforms.crowdTime=time;
   shader.vertexShader='uniform float crowdTime;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed.x+=sin(crowdTime*2.4+instanceMatrix[3].x)*.028*max(0.,position.y-.3);');
  };
  material.customProgramCacheKey=()=>'racing-v7-crowd-1';
  variants.push({geometry,material,rows:[],x:[],z:[],mats:null,inst:null});
 }
 const all=[...sites];
 if(stand)all.push(...stand.spectators);
 for(const s of all)variants[s.variant%3].rows.push(s);
 const dummy=new T.Object3D(),group=new T.Group();group.name='v7-crowd';
 for(const v of variants){
  const n=v.rows.length;v.mats=new Float32Array(Math.max(1,n)*16);v.x=new Float32Array(n);v.z=new Float32Array(n);
  v.rows.forEach((s,i)=>{dummy.position.set(s.x,s.y,s.z);dummy.rotation.set(0,s.yaw,0);dummy.scale.setScalar(s.scale);dummy.updateMatrix();dummy.matrix.toArray(v.mats,i*16);v.x[i]=s.x;v.z[i]=s.z;});
  v.inst=new T.InstancedMesh(v.geometry,v.material,Math.max(1,n));v.inst.name='v7 spectators';v.inst.count=0;v.inst.frustumCulled=false;v.inst.castShadow=false;v.inst.receiveShadow=false;
  group.add(v.inst);
 }
 let lastX=1e9,lastZ=1e9,lastQuality=-1,visible=0;
 const capacity=all.length;
 return {
  group,capacity,
  /** Rebuild the visible list when the player moved enough (or the tier changed); always advance the sway clock. */
  update(player,quality,clock){
   time.value=clock;
   const moved=Math.hypot(player.x-lastX,player.z-lastZ);
   if(moved<CROWD_REFRESH&&quality===lastQuality)return;
   lastX=player.x;lastZ=player.z;lastQuality=quality;
   const cap=Math.ceil(CROWD_CAP[quality]/3),r2=CROWD_RADIUS[quality]**2,fx=Math.sin(player.heading),fz=Math.cos(player.heading);
   visible=0;
   for(const v of variants){
    const arr=v.inst.instanceMatrix.array;let c=0;
    for(let i=0;i<v.rows.length&&c<cap;i++){
     const dx=v.x[i]-player.x,dz=v.z[i]-player.z;
     if(dx*dx+dz*dz>r2||dx*fx+dz*fz<-25)continue;
     const o=i*16,d=c*16;for(let k=0;k<16;k++)arr[d+k]=v.mats[o+k];c++;
    }
    v.inst.count=c;v.inst.visible=c>0;v.inst.instanceMatrix.needsUpdate=true;visible+=c;
   }
  },
  get visible(){return visible;},
  triangles(){return variants.reduce((n,v)=>n+v.inst.count*(v.geometry.index?.count??v.geometry.attributes.position.count)/3,0);},
  resources(){return variants.flatMap(v=>[v.geometry,v.material]);},
  dispose(){for(const v of variants)v.inst.dispose();group.clear();},
 };
}

/** Build the v7 scene parts from a loaded pack, detached from the scene. groundAt(x,z) is the grass height. */
export function buildRacingV7(pack,{track,groundAt,seed=1}){
 const cars=V7_SLOT_CARS.map((id,slot)=>makeCar(pack,id,carLodsFor(slot),{color:V7_SLOT_COLORS[slot],traffic:slot>0}));
 const props=pack.glb.get(V7_FILES.props).scene;
 // the grandstand: just after the start line, on the right of the road, its front towards the track
 const side=1,s=26,p=track.sample(s),lateral=side*(track.width/2+9.6),x=p.x+p.normal.x*lateral,z=p.z+p.normal.z*lateral,yaw=Math.atan2(-side*p.normal.x,-side*p.normal.z),y=groundAt(x,z);
 const stand=props.getObjectByName('Grandstand').clone(true);stand.position.set(x,y,z);stand.rotation.y=yaw;
 stand.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=true;}});
 const spectators=[],cos=Math.cos(yaw),sin=Math.sin(yaw);
 for(let row=0;row<3;row++)for(let col=0;col<10;col++){
  const lx=(col-4.5)*2.2,ly=.9+row*.6,lz=-row*1.3-.2;
  spectators.push({x:x+lx*cos+lz*sin,y:y+ly,z:z-lx*sin+lz*cos,yaw,scale:.92+((row*10+col)*37%13)/100,variant:(row*10+col)%3});
 }
 const crowd=makeCrowd(pack,crowdSites(track,groundAt,seed),{spectators});
 const standGroup=new T.Group();standGroup.name='v7-grandstand';standGroup.add(stand);
 return {cars,crowd,standGroup,smokeMap:pack.textures.smoke,tree:theme=>{const t=props.getObjectByName(theme==='jungle'||theme==='summit'?'Pine':'Palm');t.updateWorldMatrix(true,true);return t;},
  resources(){const out=packResources(pack);for(const c of cars)for(const r of c.owned)out.add(r);for(const r of crowd.resources())out.add(r);return out;}};
}
