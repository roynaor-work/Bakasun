import * as THREE from './vendor/three.module.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {ArenaDracoLoader} from './draco.mjs';
import {createPopulation} from './population.mjs';
import {createScoreSurfaces} from './surfaces.mjs';
import {ASSETS,LOD_DISTANCES,COURT} from './layout.mjs';

const base=new URL('./',import.meta.url);
function loadTexture(name,srgb=false) {
  return new THREE.TextureLoader().loadAsync(new URL(name,base).href).then(t=>{if(srgb)t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;});
}

export function createScoreScreens() {
  const c=document.createElement('canvas');c.width=512;c.height=256;const x=c.getContext('2d');
  const sc=document.createElement('canvas');sc.width=256;sc.height=128;const sx=sc.getContext('2d');
  const texture=new THREE.CanvasTexture(c),shotTexture=new THREE.CanvasTexture(sc);texture.colorSpace=shotTexture.colorSpace=THREE.SRGBColorSpace;
  const mat=new THREE.MeshBasicMaterial({map:texture,toneMapped:false}),shotMat=new THREE.MeshBasicMaterial({map:shotTexture,toneMapped:false});
  const group=createScoreSurfaces(mat,shotMat);
  let last='';
  function update(state={}) {
    const s={home:68,away:64,period:4,clock:'02:18',shot:24,...state};const key=[s.home,s.away,s.period,s.clock,s.shot].join('|');if(last===key)return;last=key;
    x.fillStyle='#09121d';x.fillRect(0,0,512,256);
    x.fillStyle='#183d44';x.fillRect(0,0,256,256);x.fillStyle='#453323';x.fillRect(256,0,256,256);
    x.textAlign='center';x.fillStyle='#d7d4c7';x.font='24px sans-serif';x.fillText('טורקיז',128,43);x.fillText('ענבר',384,43);
    x.fillStyle='#fff8e7';x.font='bold 88px sans-serif';x.fillText(String(s.home),128,134);x.fillText(String(s.away),384,134);
    x.fillStyle='#09121d';x.fillRect(0,155,512,101);x.fillStyle='#dcd8ca';x.font='25px sans-serif';x.fillText(`רבע ${s.period}  ·  ${s.clock}`,256,190);
    x.fillStyle='#f2b764';x.font='bold 36px monospace';x.fillText(String(s.shot).padStart(2,'0'),256,238);
    sx.fillStyle='#0b1017';sx.fillRect(0,0,256,128);sx.fillStyle='#ffb054';sx.textAlign='center';sx.font='bold 112px monospace';sx.fillText(String(s.shot).padStart(2,'0'),128,105);
    texture.needsUpdate=shotTexture.needsUpdate=true;
  }
  update();
  return {group,update,dispose(){for(const m of group.children)m.geometry.dispose();mat.dispose();shotMat.dispose();texture.dispose();shotTexture.dispose();}};
}
/** Load all three small Draco assets once. No remote fetches, no build, no scene replacement. */
export async function createArena({lod='auto'}={}) {
  const group=new THREE.Group();group.name='hoops-arena-v8';
  const draco=new ArenaDracoLoader();draco.setDecoderPath(new URL('vendor/draco/',base).href);draco.setDecoderConfig({type:'wasm'});draco.setWorkerLimit(1);
  const loader=new GLTFLoader();loader.setDRACOLoader(draco);
  let loaded,resources;
  try {
    const results=await Promise.allSettled([
      ...ASSETS.map(name=>loader.loadAsync(new URL(name,base).href)),
      loadTexture('parquet.webp',true),loadTexture('parquet-orm.webp'),loadTexture('parquet-normal.webp'),loadTexture('crowd.webp',true),loadTexture('ceiling.webp')
    ]);
    const failed=results.find(r=>r.status==='rejected');
    if(failed) {
      for(const r of results)if(r.status==='fulfilled'){
        if(r.value.isTexture)r.value.dispose();
        else r.value.scene.traverse(o=>{o.geometry?.dispose();if(o.material){for(const m of [].concat(o.material))m.dispose();}});
      }
      throw failed.reason;
    }
    loaded=results.slice(0,3).map(r=>r.value.scene);resources=results.slice(3).map(r=>r.value);
  } finally {draco.dispose();}
  const [color,orm,normal,crowdAtlas,env]=resources;
  env.mapping=THREE.CubeUVReflectionMapping;env.colorSpace=THREE.LinearSRGBColorSpace;env.flipY=false;env.generateMipmaps=false;env.minFilter=env.magFilter=THREE.LinearFilter;env.needsUpdate=true;
  const floorMat=new THREE.MeshPhysicalMaterial({map:color,roughnessMap:orm,normalMap:normal,normalScale:new THREE.Vector2(.18,.18),roughness:.63,metalness:0,clearcoat:.38,clearcoatRoughness:.20,envMap:env,envMapIntensity:.85});
  const oldMaterials=new Set();
  for(const shell of loaded) {
    shell.traverse(o=>{
      if(!o.isMesh)return;
      o.castShadow=false;o.receiveShadow=false;
      if(o.material.name==='parquet'){oldMaterials.add(o.material);o.material=floorMat;}
      else if(o.material.name==='glass'){o.material.depthWrite=false;o.material.forceSinglePass=true;}
    });
  }
  oldMaterials.forEach(m=>m.dispose());
  const populations=loaded.map((s,i)=>createPopulation(i,crowdAtlas));
  const levels=loaded.map((s,i)=>{const g=new THREE.Group();g.name='level-'+i;g.add(s,populations[i].group);group.add(g);return g;});
  const screens=createScoreScreens();group.add(screens.group);
  const hemi=new THREE.HemisphereLight(0xb0c6df,0x4a3925,1.75);hemi.name='bowl-ambient';
  const key=new THREE.SpotLight(0xffe6c1,1250,65,Math.PI/3,.75,2);key.position.set(-4,13,2);key.target.position.set(0,0,0);
  const fill=new THREE.SpotLight(0xd8e9ff,950,65,Math.PI/3,.8,2);fill.position.set(9,12,-5);fill.target.position.set(4,0,0);
  const rimLight=new THREE.DirectionalLight(0xa8c6de,1.05);rimLight.position.set(-10,9,-12);
  group.add(hemi,key,key.target,fill,fill.target,rimLight);
  let disposed=false,current=0,forced=lod,slow=0,fast=0,penalty=0;
  function show(n){current=n;levels.forEach((g,i)=>g.visible=i===n);}
  function setLOD(value) {
    if(value!=='auto'&&![0,1,2].includes(value))throw new RangeError('LOD must be auto, 0, 1 or 2');
    forced=value;if(value!=='auto')show(value);
  }
  setLOD(lod);show(lod==='auto'?0:lod);
  const viewPosition=new THREE.Vector3(),groupPosition=new THREE.Vector3();
  function prepareView(camera){
    // Broadcast cameras above the roof use the architectural cutaway.
    // Indoor basket views retain the trusses and practical fixtures.
    const cameraWorld=camera.getWorldPosition(viewPosition);const cutaway=cameraWorld.y>12;
    levels[current].traverse(o=>{
      if(!o.isMesh)return;
      if(o.name.startsWith('roof__')||o.name.startsWith('lighting__'))o.visible=!cutaway;
      if(o.name.startsWith('wall-'))o.visible=!(cutaway&&(
        (o.name.startsWith('wall-east')&&cameraWorld.x>25)||(o.name.startsWith('wall-west')&&cameraWorld.x< -25)||
        (o.name.startsWith('wall-south')&&cameraWorld.z>19)||(o.name.startsWith('wall-north')&&cameraWorld.z< -19)));
    });
  }
  function update(camera,time=0,delta=1/30,{cheer=0}={}) {
    if(disposed)return;
    if(forced==='auto') {
      const distance=camera.getWorldPosition(viewPosition).distanceTo(group.getWorldPosition(groupPosition));
      let desired=distance>=LOD_DISTANCES[2]?2:distance>=LOD_DISTANCES[1]?1:0;
      if(delta>1/28&&delta<.25){slow+=delta;fast=0;}else{slow=Math.max(0,slow-delta);fast+=delta;}
      if(slow>2){penalty=Math.min(2,penalty+1);slow=0;}
      if(fast>12){penalty=Math.max(0,penalty-1);fast=0;}
      desired=Math.min(2,desired+penalty);
      // A 3-metre dead band prevents oscillating around distance thresholds.
      if(desired!==current&&(penalty||Math.abs(distance-LOD_DISTANCES[Math.max(desired,current)])>3))show(desired);
    }
    prepareView(camera);
    populations[current].update(time,cheer);
  }
  function dispose() {
    if(disposed)return;disposed=true;
    const geos=new Set(),mats=new Set();loaded.forEach(s=>s.traverse(o=>{if(o.geometry)geos.add(o.geometry);if(o.material)[].concat(o.material).forEach(m=>mats.add(m));}));
    geos.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());populations.forEach(p=>p.dispose());resources.forEach(t=>t.dispose());screens.dispose();group.removeFromParent();
  }
  return {group,levels,environment:env,background:new THREE.Color(0x0b1320),fog:new THREE.Fog(0x0b1320,45,100),
    anchors:Object.freeze({home:new THREE.Vector3(-COURT.rimX,COURT.rimHeight,0),away:new THREE.Vector3(COURT.rimX,COURT.rimHeight,0)}),
    update,setLOD,prepareView,updateScore:screens.update,dispose,get lod(){return current;},get crowdCount(){return populations[current].count;}};
}
