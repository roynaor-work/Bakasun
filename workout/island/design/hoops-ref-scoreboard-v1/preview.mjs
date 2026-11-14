// Original review scene. Three.js r160 is bundled locally under MIT.
import * as THREE from './vendor/three.module.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {createScoreboard} from './runtime/scoreboard.mjs';

const $=id=>document.getElementById(id),canvas=$('scene');
const scene=new THREE.Scene();scene.background=new THREE.Color('#15262c');scene.fog=new THREE.Fog('#15262c',22,65);
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.28;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const camera=new THREE.PerspectiveCamera(40,1,.05,100);
scene.add(new THREE.HemisphereLight(0xc8e9ef,0x64513b,2.3));
const key=new THREE.DirectionalLight(0xffddb3,3.8);key.position.set(5,12,9);key.castShadow=true;
key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-12,right:12,top:15,bottom:-15,near:.1,far:40});key.shadow.normalBias=.018;scene.add(key);
const rim=new THREE.DirectionalLight(0x75c9e5,2.4);rim.position.set(-5,6,-6);scene.add(rim);
const fill=new THREE.DirectionalLight(0xfff3df,1.3);fill.position.set(1,3,10);scene.add(fill);
const materials={wood:new THREE.MeshStandardMaterial({color:0xbf8c54,roughness:.67}),dark:new THREE.MeshStandardMaterial({color:0x122d35,roughness:.65}),metal:new THREE.MeshStandardMaterial({color:0x3d5159,metalness:.65,roughness:.4}),white:new THREE.MeshStandardMaterial({color:0xf2eddb,roughness:.7}),orange:new THREE.MeshStandardMaterial({color:0xe89046,metalness:.3,roughness:.5})};
function box(w,h,d,x,y,z,material){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);mesh.position.set(x,y,z);mesh.receiveShadow=true;scene.add(mesh);return mesh;}
box(19,.18,32,0,-.12,0,materials.dark);
box(15,.08,28,0,-.035,0,materials.wood);
const lineMat=new THREE.LineBasicMaterial({color:0xf5ebce,transparent:true,opacity:.83});
function line(points,mat=lineMat){const g=new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p)));const l=new THREE.Line(g,mat);scene.add(l);return l;}
function groundLine(points){return line(points.map(([x,z])=>[x,.012,z]));}
function arc(cx,cz,r,start=0,end=2*Math.PI){const p=[];for(let i=0;i<=80;i++){const a=start+(end-start)*i/80;p.push([cx+r*Math.cos(a),cz+r*Math.sin(a)]);}groundLine(p);}
groundLine([[-7.4,-13.9],[7.4,-13.9],[7.4,13.9],[-7.4,13.9],[-7.4,-13.9]]);
groundLine([[-7.4,0],[7.4,0]]);arc(0,0,1.8);
for(const sign of [-1,1]){groundLine([[-2.45,13.9*sign],[-2.45,8.1*sign],[2.45,8.1*sign],[2.45,13.9*sign]]);arc(0,8.1*sign,1.8,sign>0?Math.PI:0,sign>0?2*Math.PI:Math.PI);arc(0,12.4*sign,6.4,sign>0?Math.PI:0,sign>0?2*Math.PI:Math.PI);
  box(.19,3.7,.22,0,1.85,14.4*sign,materials.metal);box(1.8,1.05,.09,0,3.4,12.9*sign,materials.white);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(.23,.025,7,30),materials.orange);ring.rotation.x=Math.PI/2;ring.position.set(0,3.05,12.55*sign);scene.add(ring);
}
// Subtle individual floorboards, using line geometry rather than image assets.
const boardLine=new THREE.LineBasicMaterial({color:0x644629,transparent:true,opacity:.15});
for(let z=-13.5;z<14;z+=.42)line([[-7.5,.007,z],[7.5,.007,z]],boardLine);
for(let z=-13.5,i=0;z<14;z+=.42,i++)for(let x=-7.5+(i%3)*1.6;x<7.5;x+=4.8)line([[x,.007,z],[x,.007,Math.min(14,z+.42)]],boardLine);
for(const sign of [-1,1]){for(let i=0;i<3;i++)box(1.6,.38,29,(9.4+i*.85)*sign,.22+i*.43,0,materials.dark);}

let referee,scoreboard,mixer,currentAction,currentClip='idle',motionPaused=matchMedia('(prefers-reduced-motion: reduce)').matches;
const clips=new Map(),refPosition=new THREE.Vector3(1.65,0,4.7),target=new THREE.Vector3(),orbit={yaw:0,pitch:0,distance:1};
const cameraViews={court:{target:[0,3.6,1.5],eye:[10,7.3,15]},referee:{target:[1.65,.95,4.7],eye:[3.4,1.5,7.9]},board:{target:[0,6.25,0],eye:[5.5,7.6,9]}};
function setView(name){const v=cameraViews[name];if(!v)throw new Error('Unknown view '+name);target.fromArray(v.target);const delta=new THREE.Vector3(...v.eye).sub(target);orbit.distance=delta.length();orbit.yaw=Math.atan2(delta.x,delta.z);orbit.pitch=Math.asin(delta.y/orbit.distance);updateCamera();document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===name)));}
function updateCamera(){const cp=Math.cos(orbit.pitch);camera.position.set(target.x+orbit.distance*cp*Math.sin(orbit.yaw),target.y+orbit.distance*Math.sin(orbit.pitch),target.z+orbit.distance*cp*Math.cos(orbit.yaw));camera.lookAt(target);}
setView('court');
let pointer=null;
canvas.addEventListener('pointerdown',e=>{pointer={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(!pointer||e.pointerId!==pointer.id)return;orbit.yaw-=(e.clientX-pointer.x)*.006;orbit.pitch=THREE.MathUtils.clamp(orbit.pitch+(e.clientY-pointer.y)*.004,-.1,1.3);pointer.x=e.clientX;pointer.y=e.clientY;updateCamera();});
canvas.addEventListener('pointerup',()=>pointer=null);canvas.addEventListener('pointercancel',()=>pointer=null);
canvas.addEventListener('wheel',e=>{e.preventDefault();orbit.distance=THREE.MathUtils.clamp(orbit.distance*Math.exp(e.deltaY*.001),1.5,38);updateCamera();},{passive:false});
canvas.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-'].includes(e.key))return;e.preventDefault();if(e.key==='ArrowLeft')orbit.yaw-=.1;if(e.key==='ArrowRight')orbit.yaw+=.1;if(e.key==='ArrowUp')orbit.pitch=Math.min(1.3,orbit.pitch+.07);if(e.key==='ArrowDown')orbit.pitch=Math.max(-.1,orbit.pitch-.07);if(e.key==='+')orbit.distance=Math.max(1.5,orbit.distance*.9);if(e.key==='-')orbit.distance=Math.min(38,orbit.distance/ .9);updateCamera();});
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
const labels=Object.fromEntries([...document.querySelectorAll('[data-clip]')].map(b=>[b.dataset.clip,b.querySelector('strong').textContent]));
function removeRunTravel(){if(referee){const root=referee.getObjectByName('Root');root.position.x=0;root.position.z=0;referee.updateMatrixWorld(true);}}
function playClip(id){const clip=clips.get(id);if(!clip)throw new Error('Missing clip '+id);const prior=currentAction;currentClip=id;currentAction=mixer.clipAction(clip).reset();currentAction.setLoop(['idle','run'].includes(id)?THREE.LoopRepeat:THREE.LoopOnce,Infinity);currentAction.clampWhenFinished=true;currentAction.enabled=true;currentAction.paused=motionPaused;currentAction.setEffectiveTimeScale(Number($('speed').value));if(prior&&prior!==currentAction)prior.fadeOut(.12);currentAction.setEffectiveWeight(1).fadeIn(.12).play();mixer.update(0);removeRunTravel();document.querySelectorAll('[data-clip]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.clip===id)));$('action-label').textContent=labels[id];updateMotionUI();}
function seek(phase){if(!currentAction)return;currentAction.stopFading();currentAction.setEffectiveWeight(1);for(const c of clips.values()){const a=mixer.existingAction(c);if(a&&a!==currentAction)a.stop();}currentAction.enabled=true;currentAction.paused=true;currentAction.time=THREE.MathUtils.clamp(phase,0,1)*currentAction.getClip().duration;mixer.update(0);removeRunTravel();motionPaused=true;updateMotionUI();}
function updateMotionUI(){if(!currentAction)return;const duration=currentAction.getClip().duration;$('scrub').value=duration?currentAction.time/duration:0;$('clip-time').value=currentAction.time.toFixed(2)+' / '+duration.toFixed(2);$('motion-toggle').textContent=motionPaused?'הפעלה':'השהיה';$('motion-toggle').setAttribute('aria-label',motionPaused?'הפעלת התנועה':'השהיית התנועה');}
document.querySelectorAll('[data-clip]').forEach(b=>b.addEventListener('click',()=>{motionPaused=false;playClip(b.dataset.clip);}));
$('scrub').addEventListener('input',e=>seek(Number(e.target.value)));
$('motion-toggle').addEventListener('click',()=>{if(!currentAction)return;motionPaused=!motionPaused;if(!motionPaused&&currentAction.time>=currentAction.getClip().duration)currentAction.reset().play();currentAction.paused=motionPaused;updateMotionUI();});
$('speed').addEventListener('change',()=>currentAction?.setEffectiveTimeScale(Number($('speed').value)));
function updateClockUI(){if(!scoreboard)return;const s=scoreboard.snapshot(),game=Math.max(0,Math.ceil(s.gameSeconds)),shot=Math.max(0,Math.ceil(s.shotSeconds));$('game-time').value=String(Math.floor(game/60)).padStart(2,'0')+':'+String(game%60).padStart(2,'0');$('shot-time').value=String(shot).padStart(2,'0');$('clock-toggle').textContent=s.running?'השהיית שעונים':'הפעלת שעונים';$('clock-status').textContent=s.redRemaining>0?'סיום זמן · נורה אדומה':s.running?'המשחק מתנהל':'השעונים מושהים';}
$('clock-toggle').addEventListener('click',()=>{if(!scoreboard)return;scoreboard.snapshot().running?scoreboard.pause():scoreboard.start();updateClockUI();});
$('reset-game').addEventListener('click',()=>{scoreboard?.resetGame(134);scoreboard?.resetShot(24);updateClockUI();});
for(const n of [14,24])$('shot-'+n).addEventListener('click',()=>{scoreboard?.resetShot(n);updateClockUI();});
for(const [id,key]of [['home-score','home'],['away-score','away'],['period','period']])$(id).addEventListener('change',()=>{const value=Number($(id).value);if(Number.isFinite(value)){scoreboard?.setState({[key]:value});$(id).value=scoreboard?.snapshot()[key]??value;}updateClockUI();});
$('red-test').addEventListener('click',()=>{scoreboard?.flashRed(2);updateClockUI();});
$('expiration-test').addEventListener('click',()=>{if(!scoreboard)return;scoreboard.resetShot(3);scoreboard.setState({gameSeconds:Math.max(10,scoreboard.snapshot().gameSeconds)});scoreboard.start();updateClockUI();});

let ready=false;
const loader=new GLTFLoader();
async function init(){const [ref,board]=await Promise.all([loader.loadAsync('models/referee.glb'),loader.loadAsync('models/scoreboard.glb')]);referee=ref.scene;referee.position.copy(refPosition);referee.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});scene.add(referee);mixer=new THREE.AnimationMixer(referee);for(const clip of ref.animations)clips.set(clip.name,clip);if(clips.size!==6)throw new Error('נדרשים שישה קליפים בשופט');const boardRoot=board.scene;boardRoot.position.y=4.75;boardRoot.traverse(o=>{if(o.isMesh){o.castShadow=!/^(digit_|label_|lamp_)/.test(o.name);o.receiveShadow=false;}});scene.add(boardRoot);scoreboard=createScoreboard({THREE,root:boardRoot});playClip('idle');updateClockUI();ready=true;$('status').textContent='מוכן לבדיקה · שישה קליפים';window.hoopsReview={get ready(){return ready;},get referee(){return referee;},get scoreboard(){return scoreboard;},get action(){return currentAction;},get currentClip(){return currentClip;},clips:[...clips.keys()],playClip,seek,setView,renderer,scene,camera,snapshot:()=>({ready,clip:currentClip,time:currentAction?.time,scoreboard:scoreboard.snapshot(),render:renderer.info.render})};}
init().catch(e=>{console.error(e);$('load-error').hidden=false;$('load-error').textContent='הטעינה נכשלה: '+e.message+'. יש לפתוח את התיקייה דרך שרת HTTP מקומי.';$('status').textContent='שגיאה בטעינה';});
new ResizeObserver(()=>{const r=canvas.parentElement.getBoundingClientRect();renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();}).observe(canvas.parentElement);
let priorTime=performance.now();
document.addEventListener('visibilitychange',()=>{priorTime=performance.now();});
function render(now){requestAnimationFrame(render);const dt=(now-priorTime)/1000;priorTime=now;if(document.hidden)return;if(ready){if(!motionPaused){mixer.update(Math.min(dt,.1));removeRunTravel();}scoreboard.tick(dt);updateClockUI();updateMotionUI();}renderer.render(scene,camera);}
requestAnimationFrame(render);
