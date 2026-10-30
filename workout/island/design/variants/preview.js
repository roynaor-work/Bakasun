import * as THREE from '../../vendor/three.module.js';
import {GLTFLoader} from '../../vendor/GLTFLoader.js';
import {DRACOLoader} from '../viewer/draco/DRACOLoader.js';
import {prepareVariant} from './apply-variant.js';
const $=id=>document.getElementById(id);
const json=async path=>{const r=await fetch(new URL(path,import.meta.url));if(!r.ok)throw Error(`${path}: ${r.status}`);return r.json();};
const manifest=await json('./manifest.json'),regions=await json('./regions.json'),palettes=await json('./palettes.json');
const outfits=await Promise.all(manifest.outfits.map(async item=>({...await json(item.path),definitionURL:new URL(item.path,import.meta.url)})));
const scene=new THREE.Scene();scene.background=new THREE.Color('#172c37');
scene.add(new THREE.HemisphereLight(0xffffff,0x778e92,2.2));
const sun=new THREE.DirectionalLight(0xffffff,2.1);sun.position.set(2,4,4);scene.add(sun);
const camera=new THREE.PerspectiveCamera(29,1,.01,20);camera.position.set(.3,1.05,4.2);camera.lookAt(0,.80,0);
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.domElement.setAttribute('aria-label','תצוגת הדמות בתלבושת שנבחרה');$('stage').prepend(renderer.domElement);
const ground=new THREE.Mesh(new THREE.CircleGeometry(2,64),new THREE.MeshStandardMaterial({color:'#253f4a',roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-.002;scene.add(ground);
const draco=new DRACOLoader().setDecoderPath(new URL('../viewer/draco/',import.meta.url).href).setDecoderConfig({type:'wasm'}).setWorkerLimit(1);
const loader=new GLTFLoader().setDRACOLoader(draco),textures=new Map();
let model,actor,currentId,currentOutfit,request=0;
function render(){renderer.render(scene,camera);}
function resize(){const stage=$('stage');renderer.setSize(stage.clientWidth,stage.clientHeight);camera.aspect=stage.clientWidth/stage.clientHeight;camera.updateProjectionMatrix();render();}
new ResizeObserver(resize).observe($('stage'));
for(const [list,id,label] of [[palettes.skins,'skin','גוון'],[palettes.hair,'hair','צבע']]){
 $(id).replaceChildren(...list.map((p,i)=>new Option(`${label} ${i+1}`,p.id)));$(id).value=palettes[id==='skin'?'defaultSkin':'defaultHair'];
}
const fail=e=>{$('status').textContent=`הטעינה נכשלה: ${e.message}. יש לפתוח דרך שרת מקומי של המאגר.`;console.error(e);};
async function selectOutfit(id){
 const token=++request,outfit=outfits.find(o=>o.id===id);
 if(!outfit)throw Error('Unknown outfit');
 if(!textures.has(id))textures.set(id,new THREE.TextureLoader().loadAsync(new URL(outfit.map,outfit.definitionURL).href));
 const texture=await textures.get(id);if(token!==request)return;
 if(currentId!==outfit.modelId){
  const fresh=(await loader.loadAsync(new URL(regions.models[outfit.modelId].path,import.meta.url).href)).scene;
  if(token!==request){fresh.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});return;}
  if(model){actor.dispose();scene.remove(model);model.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});}
  model=fresh;currentId=outfit.modelId;let mesh;model.traverse(o=>{if(o.isMesh)mesh=o;});
  actor=prepareVariant(mesh,currentId,regions);
  // Identical relaxed arm pose for inspecting every outfit, using the shared rig.
  model.updateMatrixWorld(true);
  for(const [name,angle] of [['LeftArm',-1.15],['RightArm',1.15]]){
   const bone=model.getObjectByName(name),parent=bone.parent.getWorldQuaternion(new THREE.Quaternion());
   const world=bone.getWorldQuaternion(new THREE.Quaternion());
   bone.quaternion.copy(parent.invert().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),angle)).multiply(world));
   model.updateMatrixWorld(true);
  }
  scene.add(model);model.updateMatrixWorld(true);
 }
 actor.apply(outfit,texture,{skin:palettes.skins.find(p=>p.id===$('skin').value).color,hair:palettes.hair.find(p=>p.id===$('hair').value).color});
 currentOutfit=id;$('character').value=currentId;
 const items=outfits.filter(o=>o.modelId===currentId);
 $('outfit').replaceChildren(...items.map(o=>new Option(o.label,o.id)));$('outfit').value=id;
 $('hair').disabled=regions.models[currentId].absentRegions.includes('hair');
 $('outfit-id').textContent=id;$('status').textContent='מוכן. אפשר לבחור תלבושת, עור ושיער ולבדוק גם את הגב.';render();
}
$('character').onchange=()=>selectOutfit(outfits.find(o=>o.modelId===$('character').value).id).catch(fail);
$('outfit').onchange=()=>selectOutfit($('outfit').value).catch(fail);
$('skin').onchange=$('hair').onchange=()=>selectOutfit(currentOutfit).catch(fail);
$('front').onclick=()=>{model.rotation.y=0;render();};$('back').onclick=()=>{model.rotation.y=Math.PI;render();};
$('turn').onclick=()=>{model.rotation.y+=Math.PI/2;render();};
const ready=selectOutfit(outfits[0].id);ready.catch(fail);
window.variantPreview={ready,selectOutfit,render,renderer,scene,regions,palettes,outfits,get model(){return model;},get actor(){return actor;},get texture(){return actor&&model.children.find(o=>o.isMesh)?.material.map;}};
resize();
