import * as THREE from '../../../vendor/three.module.js';
import { GLTFLoader } from '../../../vendor/GLTFLoader.js';
import { DRACOLoader } from '../../../vendor/DRACOLoader.js';
import { clone } from '../../../vendor/SkeletonUtils.js';
import { createArena } from './arena-scene.js';
import { createBroadcastHUD } from '../hud/broadcast-hud.js';
import { createPhotographers } from './actors/photographers.js';

const canvas=document.querySelector('#arena'), errors=[];
const state={time:0,paused:matchMedia('(prefers-reduced-motion: reduce)').matches,heat:true,camera:0,quality:'mobile',ready:false};
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.05;
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const scene=new THREE.Scene();scene.background=new THREE.Color('#080d14');
scene.fog=new THREE.FogExp2('#101822',.013);
const camera=new THREE.PerspectiveCamera(47,1,.15,140);
const arena=createArena(THREE);scene.add(arena.group);
// Broadcast lenses sit inside the arena bowl; omit roof cutaway geometry from
// this presentation to keep foreground rafters out of the court sightline.
if(arena.roofGroup)for(const object of arena.roofGroup.children){if(object.name.startsWith('arena_roof'))object.visible=false;}
if(arena.environment)scene.environment=arena.environment;
// Arena owns its lighting rig: one shadow map, analytic court light pools.
const draco=new DRACOLoader().setDecoderPath(new URL('../../../vendor/draco/',import.meta.url).href).setWorkerLimit(1);
const loader=new GLTFLoader().setDRACOLoader(draco);
const actors=[];let actorSources,teamMaps,photographers;
const cameraNames=['BROADCAST','BASELINE','COURTSIDE'];
const hud=createBroadcastHUD(document.querySelector('#broadcast'),{
  onCamera(){state.camera=(state.camera+1)%3;resize();hud.update({cameraLabel:cameraNames[state.camera]});},
  onHeat(value){state.heat=value;ball.material.emissiveIntensity=value?.55:0;},
  onPause(value){state.paused=value;},
  onQuality(value){applyQuality(value);}
});
hud.setPaused(state.paused);hud.setHeat(state.heat);
const ball=new THREE.Mesh(new THREE.SphereGeometry(.12,20,12),new THREE.MeshStandardMaterial({color:'#c76b2d',roughness:.73,emissive:'#f07821',emissiveIntensity:.55}));ball.castShadow=true;scene.add(ball);
const seams=new THREE.Group();ball.add(seams);for(const rotation of [[0,0,0],[Math.PI/2,0,0],[0,Math.PI/2,0]]){const m=new THREE.Mesh(new THREE.TorusGeometry(.1208,.0035,3,32),new THREE.MeshStandardMaterial({color:'#251710',roughness:.9}));m.rotation.set(...rotation);seams.add(m);}
const glowCanvas=document.createElement('canvas');glowCanvas.width=128;glowCanvas.height=128;const gc=glowCanvas.getContext('2d'),grad=gc.createRadialGradient(64,64,0,64,64,64);grad.addColorStop(0,'rgba(255,149,40,.5)');grad.addColorStop(.35,'rgba(255,88,10,.2)');grad.addColorStop(1,'rgba(255,88,10,0)');gc.fillStyle=grad;gc.fillRect(0,0,128,128);
const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(glowCanvas),transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));glow.scale.set(.85,.85,.85);scene.add(glow);

function applyQuality(value){state.quality=/high|detail|quality/i.test(String(value))?'high':'mobile';renderer.setPixelRatio(Math.min(devicePixelRatio,state.quality==='high'?1.5:1));for(const actor of actors){const lod=state.quality==='high'?0:1;actor.models[0].visible=lod===0;actor.models[1].visible=lod===1;actor.mixers[lod].setTime(state.time+actor.index*.19);}resize();}
function resize(){const w=canvas.clientWidth,h=canvas.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;
 const portrait=h>w;
 const poses=portrait?[[[30,23,10],[0,1,0],53],[[21,10,3],[2,1.8,0],55],[[13,7,18],[0,2,0],57]]:[[[17,14,24],[0,1.5,0],44],[[24,9,10],[3,2,0],49],[[10,6,19],[0,2,0],51]];
 const pose=poses[state.camera];camera.position.set(...pose[0]);camera.lookAt(...pose[1]);camera.fov=pose[2];camera.updateProjectionMatrix();}
window.addEventListener('resize',resize);applyQuality('mobile');
function triangleCount(root){let count=0;root.traverseVisible(n=>{if(n.isMesh)count+=(n.geometry.index?n.geometry.index.count:n.geometry.attributes.position.count)/3*(n.isInstancedMesh?n.count:1);});return Math.round(count);}
async function buildActors(){
 const textureLoader=new THREE.TextureLoader();
 [actorSources,teamMaps]=await Promise.all([
  Promise.all(['actor-lod0.glb','actor-lod1.glb'].map(file=>loader.loadAsync(new URL(`./actors/${file}`,import.meta.url).href))),
  Promise.all(['atlas-ember.png','atlas-tide.png'].map(file=>textureLoader.loadAsync(new URL(`./actors/${file}`,import.meta.url).href)))
 ]);
 teamMaps.forEach(t=>{t.flipY=false;t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=2;});
 const materials=actorSources.map(g=>{let original;g.scene.traverse(n=>{if(n.isMesh)original=n.material;});return teamMaps.map(map=>{const m=original.clone();m.map=map;return m;});});
 for(let i=0;i<12;i++){
  const wrapper=new THREE.Group();wrapper.name=`${i<6?'EMBER':'TIDE'}_${i%6+1}`;
  const models=actorSources.map(g=>clone(g.scene)),mixers=models.map(m=>new THREE.AnimationMixer(m)),actions=[];
  for(let lod=0;lod<2;lod++){
   models[lod].traverse(n=>{if(n.isMesh){n.material=materials[lod][i<6?0:1];n.castShadow=true;n.receiveShadow=true;n.frustumCulled=false;}});wrapper.add(models[lod]);
   const clips=actorSources[lod].animations;
   const named=Object.fromEntries(clips.map(c=>[c.name.toLowerCase(),mixers[lod].clipAction(c)]));actions.push(named);
   const action=named[i===0?'dribble':'idle']||Object.values(named)[0];
   if(action){action.play();action.time=i*.19;}
  }
  // Fixed bind-pose height from the authored manifest; skinned pre-render bounds
  // are unreliable until the skeleton has evaluated its first animation frame.
  wrapper.scale.setScalar((1.88+(i%6)*.025)/1.7795);
  scene.add(wrapper);actors.push({wrapper,models,mixers,actions,index:i,clip:i===0?'dribble':'idle'});
 }
 photographers=createPhotographers(THREE,actorSources[1],clone);scene.add(photographers.group);
 applyQuality(state.quality);
}
function updateActors(time,delta){
 const positions=[[-3,2],[-9,-4.8],[-10,3.7],[0,-3.5],[5,4.2],[8,-2.4],[-1.1,2.4],[-7.3,-3.7],[-8.6,4.6],[1.7,-2.5],[6.6,3.4],[10,-1.2]];
 actors.forEach((actor,i)=>{const [x,z]=positions[i],moving=i===0;actor.wrapper.position.set(x+(moving?Math.sin(time*.6+i)*.65:Math.sin(time*.3+i)*.12),0,z+Math.sin(time*.4+i)*.18);actor.wrapper.rotation.y=i<6?Math.PI*.65:-Math.PI*.35;
  const next=i===0?'dribble':i>=6&&((time+i)%8)<1.2?'steal':'idle';
  if(next!==actor.clip){for(const actions of actor.actions){const from=actions[actor.clip],to=actions[next];if(to){to.reset().play();if(from)from.crossFadeTo(to,.32,false);}}actor.clip=next;}
  actor.mixers[state.quality==='high'?0:1].update(delta);
 });
 const lead=actors[0]?.wrapper.position||new THREE.Vector3(-3,0,2);ball.position.set(lead.x+.6,.2+Math.abs(Math.sin(time*5))*1.05,lead.z+.1);ball.rotation.set(time*1.3,0,time*2);glow.position.copy(ball.position);glow.visible=state.heat;glow.material.opacity=.7+Math.sin(time*7)*.15;
}
let last=performance.now(),lastDraw=0,elapsed=0,frames=0,fps=0;const frameTimes=[];
function frame(now){requestAnimationFrame(frame);if(document.hidden){last=now;return;}if(now-lastDraw<1000/30-1)return;lastDraw=now;const frameMs=Math.max(0,now-last),realDelta=Math.min(frameMs/1000,.1);last=now;
 const delta=state.paused?0:realDelta;state.time+=delta;arena.update(state.time);updateActors(state.time,delta);renderer.render(scene,camera);
 if(state.ready){frameTimes.push(frameMs);if(frameTimes.length>600)frameTimes.shift();}
 elapsed+=frameMs/1000;frames++;if(elapsed>=1){fps=Math.round(frames/elapsed);frames=0;elapsed=0;hud.update({time:state.time,fps,cameraLabel:cameraNames[state.camera],quality:state.quality});}
}
requestAnimationFrame(frame);
function fail(error){errors.push(String(error?.message||error));document.querySelector('#loading').hidden=true;const el=document.querySelector('#error');el.hidden=false;el.textContent='לא ניתן לטעון את התצוגה. יש לפתוח דרך שרת HTTP מקומי. '+errors.at(-1);console.error(error);}
window.addEventListener('error',e=>errors.push(e.message));
window.addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
window.__hoopsV6={renderer,scene,camera,arena,actors,state,errors,hud,
 setCamera(index){state.camera=Math.max(0,Math.min(2,index));resize();hud.update({cameraLabel:cameraNames[state.camera]});},
 setTime(time){state.time=time;arena.update(time);updateActors(time,0);renderer.render(scene,camera);},
 setQuality:applyQuality,
 snapshot(){const sorted=[...frameTimes].sort((a,b)=>a-b);return {ready:state.ready,viewport:[canvas.clientWidth,canvas.clientHeight],three:THREE.REVISION,quality:state.quality,players:actors.length,playerTriangles:actors.map(a=>triangleCount(a.models[state.quality==='high'?0:1])),sceneTriangles:triangleCount(scene),arena:arena.stats,photographers:photographers?.stats,render:{...renderer.info.render},textures:renderer.info.memory.textures,drawFrames:frameTimes.length,medianFrameMs:sorted[Math.floor(sorted.length*.5)]||0,p95FrameMs:sorted[Math.floor(sorted.length*.95)]||0,errors:[...errors]};}
};
Promise.all([arena.ready,buildActors()]).then(()=>{state.ready=true;document.querySelector('#loading').hidden=true;resize();}).catch(fail);
document.addEventListener('visibilitychange',()=>{last=performance.now();});
canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();state.paused=true;fail(new Error('WebGL context lost — reload to recover.'));});
window.addEventListener('pagehide',()=>{hud.destroy();photographers?.dispose();draco.dispose();arena.dispose?.();renderer.dispose();},{once:true});
