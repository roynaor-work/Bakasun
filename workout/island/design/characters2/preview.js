// Asset review surface only. Existing game and viewer modules remain untouched.
import * as THREE from '../../vendor/three.module.js';
import {GLTFLoader} from '../../vendor/GLTFLoader.js';
import {DRACOLoader} from '../viewer/draco/DRACOLoader.js';
import {Retargeter} from '../viewer/retarget.js';
import {MotionPlayer} from '../viewer/animation.js';
import {prepareVariant} from '../variants/apply-variant.js';
const $=id=>document.getElementById(id);
const json=async url=>{const r=await fetch(url);if(!r.ok)throw Error(`${url}: ${r.status}`);return r.json();};
const scene=new THREE.Scene();scene.background=new THREE.Color('#182935');
scene.add(new THREE.HemisphereLight(0xe7f3ff,0x73838e,2.1));
for(const [color,power,pos] of [[0xffefde,3.2,[2,4,4]],[0xa4d8ec,2,[-3,2,1]],[0xffdbc0,2,[-1,3,-3]]]){const light=new THREE.DirectionalLight(color,power);light.position.set(...pos);scene.add(light);}
const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:0x182935,roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.006;scene.add(floor);
const camera=new THREE.PerspectiveCamera(32,1,.01,50);
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.setSize(768,768);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
$('stage').append(renderer.domElement);
const decoder=new DRACOLoader().setDecoderPath(new URL('../viewer/draco/',import.meta.url).href).setDecoderConfig({type:'wasm'}).setWorkerLimit(1);
const loader=new GLTFLoader().setDRACOLoader(decoder);
const textureLoader=new THREE.TextureLoader();const textures=new Map(),motions=new Map();
let regions,manifest,palettes,contract,map,model,mesh,actor,rig,player,yaw=.72,close=false,playing=false,selected='soccer-player';
const errors=[];
function render(){const root=rig?.bones.Root.getWorldPosition(new THREE.Vector3())||new THREE.Vector3();const target=root.clone().add(new THREE.Vector3(0,close?1.14:.67,0));const distance=close?.95:2.8;camera.position.copy(target).add(new THREE.Vector3(Math.sin(yaw)*distance,close?.05:.13,Math.cos(yaw)*distance));camera.lookAt(target);renderer.render(scene,camera);}
async function outfit(id){
  if(!actor)return;
  if(id==='original'){
    actor.dispose();actor=prepareVariant(mesh,selected,regions);
    const colors=mesh.geometry.getAttribute('color'),palette={skin:new THREE.Color($('skin').value),hair:new THREE.Color($('hair').value)};
    for(let i=0;i<colors.count;i++){
      const rgb=[colors.getX(i),colors.getY(i),colors.getZ(i)];
      const source=regions.models[selected].sources.find(s=>s.linearRGB.every((v,k)=>Math.abs(v-rgb[k])<=regions.maxColorError));
      const tint=palette[source.rules[0].region];if(tint)colors.setXYZ(i,tint.r,tint.g,tint.b);
    }
    colors.needsUpdate=true;render();return;
  }
  const definition=manifest.outfits.find(o=>o.id===id);const url=new URL(definition.path,import.meta.url);
  const data=await json(url);const textureURL=new URL(data.map,url).href;
  if(!textures.has(textureURL))textures.set(textureURL,await textureLoader.loadAsync(textureURL));
  actor.apply(data,textures.get(textureURL),{skin:$('skin').value,hair:$('hair').value});render();
}
async function selectCharacter(id){
  playing=false;$('play').textContent='ניגון';
  if(actor)actor.dispose();
  if(model){scene.remove(model);model.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});}
  selected=id;$('character').value=id;
  model=(await loader.loadAsync(new URL(`./${id}.glb`,import.meta.url).href)).scene;scene.add(model);model.traverse(o=>{if(o.isSkinnedMesh)mesh=o;});
  actor=prepareVariant(mesh,id,regions);
  for(const kind of ['skin','hair']){
    const list=palettes[kind==='skin'?'skins':'hair'];
    const color=regions.models[id].sources.find(s=>s.rules[0].region===kind).hex;
    $(kind).replaceChildren(new Option('צבע מקורי',color),...list.map(o=>new Option(o.id,o.color)));$(kind).value=color;
  }
  const game=id==='basketball-player'?'hoops':id==='skier'?'alpine':'soccer';
  if(!motions.has(game))motions.set(game,await json(new URL(`../motion/${game}.json`,import.meta.url)));
  const motion=motions.get(game);rig=new Retargeter(model,contract,motion.skeleton,map);player=new MotionPlayer(motion,rig);
  $('clip').replaceChildren(new Option('עמידת תצוגה','review'),...Object.keys(motion.states).map(n=>new Option(n,n)));
  $('outfit').replaceChildren(new Option('עיצוב מקורי','original'),...manifest.outfits.filter(o=>o.modelId===id).map(o=>new Option(o.id,o.id)));
  review();$('status').textContent='מוכן';return id;
}
function review(){
  // The existing motion adapter supplies an anatomically consistent relaxed pose.
  player.reset('idle',0);render();
}
function pose(clip,time=0){playing=false;$('clip').value=clip;if(clip==='review')review();else{player.reset(clip,time);render();}}
function fail(error){errors.push(String(error));$('status').textContent=`שגיאה: ${error.message}`;console.error(error);}
const ready=(async()=>{
  [regions,manifest,palettes,contract,map]=await Promise.all(['./regions.json','./manifest.json','../variants/palettes.json','../characters/rig.json','../viewer/retarget-map.json'].map(p=>json(new URL(p,import.meta.url))));
  for(const kind of ['skin','hair']){const list=palettes[kind==='skin'?'skins':'hair'];$(kind).replaceChildren(...list.map(o=>new Option(o.id,o.color||o.hex)));const choice=list.find(o=>o.id===palettes[kind==='skin'?'defaultSkin':'defaultHair']);$(kind).value=choice.color;}
  await selectCharacter(selected);
})();ready.catch(fail);
$('character').onchange=()=>selectCharacter($('character').value).catch(fail);
for(const id of ['outfit','skin','hair'])$(id).onchange=()=>outfit($('outfit').value).catch(fail);
$('clip').onchange=()=>pose($('clip').value);
$('play').onclick=()=>{if($('clip').value==='review')pose('idle');playing=!playing;$('play').textContent=playing?'השהיה':'ניגון';};
for(const button of document.querySelectorAll('[data-angle]'))button.onclick=()=>{yaw=+button.dataset.angle;close=false;render();};
$('face').onclick=()=>{close=!close;yaw=.15;render();};
let previous=performance.now();function tick(now){const dt=Math.min((now-previous)/1000,.04);previous=now;if(playing&&player){player.step(dt);render();}requestAnimationFrame(tick);}requestAnimationFrame(tick);
window.characters2={ready,selectCharacter,pose,outfit,render,errors,setView:(angle=0,detail=false)=>{yaw=angle;close=detail;render();},get rig(){return rig;},get mesh(){return mesh;},get actor(){return actor;},get player(){return player;},get renderer(){return renderer;}};
