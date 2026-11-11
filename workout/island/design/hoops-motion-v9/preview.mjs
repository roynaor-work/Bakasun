/** Local GLTFLoader + Draco preview. Every displayed athlete frame is a delivered GLB. */
import * as THREE from './runtime/vendor/three.module.js';
import {CATALOG, CLIPS, loadClip, createClipController, disposeClip, disposeRuntime, sampleClip} from './runtime/library.mjs';

const $=id=>document.getElementById(id);
const stage=$('stage');
const errors=[];
window.addEventListener('error',event=>errors.push(event.message||String(event.error)));
window.addEventListener('unhandledrejection',event=>errors.push(String(event.reason?.message||event.reason)));
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(2,window.devicePixelRatio||1));
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.25;
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
stage.prepend(renderer.domElement);
renderer.domElement.setAttribute('aria-label','הדמיית תלת־ממד של קליפ התנועה');
renderer.domElement.setAttribute('role','img');
const scene=new THREE.Scene();
scene.background=new THREE.Color('#eaece3');
scene.fog=new THREE.Fog('#eaece3',10,27);
const camera=new THREE.PerspectiveCamera(36,1,.02,60);
const cameraTarget=new THREE.Vector3(0,1.0,0);
camera.position.set(3.4,2.0,4.6);
camera.lookAt(cameraTarget);
scene.add(new THREE.HemisphereLight('#ffffff','#b4bda0',2.2));
const sun=new THREE.DirectionalLight('#fff7e7',3.2);
sun.position.set(-3.5,7,4.5);sun.castShadow=true;
sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-5;sun.shadow.camera.right=5;sun.shadow.camera.top=7;sun.shadow.camera.bottom=-5;sun.shadow.camera.far=20;sun.shadow.normalBias=.025;sun.shadow.bias=-.0002;sun.shadow.radius=3;
scene.add(sun);scene.add(sun.target);
const fill=new THREE.DirectionalLight('#e3f0ff',.9);fill.position.set(4,3,-4);scene.add(fill);
const ground=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:'#dce2d5',roughness:.95}));
ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;ground.position.y=-.015;scene.add(ground);
const court=new THREE.Group();scene.add(court);
const courtFloor=new THREE.Mesh(new THREE.PlaneGeometry(7.5,9),new THREE.MeshStandardMaterial({color:'#d8c8a4',roughness:.8}));courtFloor.rotation.x=-Math.PI/2;courtFloor.position.set(0,-.008,.4);courtFloor.receiveShadow=true;court.add(courtFloor);
const paint=new THREE.Mesh(new THREE.PlaneGeometry(2.85,3.4),new THREE.MeshStandardMaterial({color:'#a7b8a1',roughness:.8}));paint.rotation.x=-Math.PI/2;paint.position.set(0,-.004,2.0);paint.receiveShadow=true;court.add(paint);
function line(points,color='#faf7e7',opacity=.8){const geometry=new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(p[0],.003,p[1])));const object=new THREE.Line(geometry,new THREE.LineBasicMaterial({color,transparent:true,opacity}));court.add(object);return object;}
function arc(x,z,r,a,b){const points=[];for(let i=0;i<=80;i++){const t=a+(b-a)*i/80;points.push([x+Math.cos(t)*r,z+Math.sin(t)*r]);}return points;}
line([[-3.65,-4.0],[-3.65,4.75],[3.65,4.75],[3.65,-4],[-3.65,-4]]);
line([[-1.425,3.75],[-1.425,.3],[1.425,.3],[1.425,3.75]]);
line(arc(0,.3,1.425,Math.PI,Math.PI*2));
line(arc(0,3.15,3.1,Math.PI+.12,Math.PI*2-.12));
line([[-.2,0],[.2,0]],'#e5ebdb',.25);
line([[0,-.2],[0,.2]],'#e5ebdb',.25);
const hoop=new THREE.Group();hoop.position.set(0,0,2.2);scene.add(hoop);
const steel=new THREE.MeshStandardMaterial({color:'#71867a',roughness:.5,metalness:.65});
function box(x,y,z,w,h,d,material){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;hoop.add(m);return m;}
box(0,1.7,.7,.07,3.4,.07,steel);box(0,3.45,.38,.07,.07,.7,steel);
const board=new THREE.Mesh(new THREE.BoxGeometry(1.8,1.05,.06),new THREE.MeshPhysicalMaterial({color:'#e2eee0',roughness:.28,metalness:.08,transparent:true,opacity:.26,depthWrite:false}));board.position.set(0,3.60,.14);hoop.add(board);
box(-.915,3.60,.14,.035,1.085,.065,steel);box(.915,3.60,.14,.035,1.085,.065,steel);box(0,4.1425,.14,1.865,.035,.065,steel);box(0,3.0575,.14,1.865,.035,.065,steel);
// .2286m clear opening radius + .009m tube gives a .2376m centreline.
const rim=new THREE.Mesh(new THREE.TorusGeometry(.2376,.009,8,48),new THREE.MeshStandardMaterial({color:'#bd6240',roughness:.5,metalness:.25}));rim.rotation.x=Math.PI/2;rim.position.set(0,3.05,-.24);hoop.add(rim);
const netMaterial=new THREE.LineBasicMaterial({color:'#e9eee1',transparent:true,opacity:.65});
for(let i=0;i<12;i++){const a=i*Math.PI/6;const vertices=[];for(let j=0;j<=4;j++){const y=3.04-j*.08,r=.215-j*.025,theta=a+j*.11;vertices.push(new THREE.Vector3(Math.cos(theta)*r,y,-.24+Math.sin(theta)*r));}const net=new THREE.Line(new THREE.BufferGeometry().setFromPoints(vertices),netMaterial);hoop.add(net);}
const referenceTrail=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineDashedMaterial({color:'#608e72',dashSize:.08,gapSize:.04,transparent:true,opacity:.45}));referenceTrail.position.y=.014;referenceTrail.visible=false;scene.add(referenceTrail);
const athlete=new THREE.Group();scene.add(athlete);
let loaded=null,controller=null,playing=true,playbackRate=1,rootMode='in-place',request=0,clockTime=0,replayHold=0,lastFrame=performance.now(),disposed=false;
const cache=new Map();
let hoopTarget=[0,3.05,2.3];
const groupNames={locomotion:'תנועה חופשית',attack:'התקפה',actions:'הגנה · כדור חופשי · חגיגות'};
const phaseNames={held:'אחיזה',gather:'איסוף',carry:'נשיאה',release:'שחרור',flight:'מעוף הכדור','dribble-contact':'מגע בכדרור','dribble-flight':'הקפצה',empty:'ללא כדור',shooting:'עלייה ושחרור',dunk:'הטבעה',anticipation:'הכנה',landing:'נחיתה',follow_through:'השלמת התנועה'};
let group='all';
function renderList(){const query=$('search').value.trim().toLowerCase();const entries=CATALOG.filter(c=>(group==='all'||c.group===group)&&(!query||`${c.id} ${c.label} ${c.labelHe}`.toLowerCase().includes(query)));$('count').textContent=`${entries.length} / ${CATALOG.length}`;$('clips').replaceChildren(...entries.map(c=>{const button=document.createElement('button');button.className='clip-item';button.dataset.clip=c.id;button.setAttribute('aria-pressed',String(loaded?.id===c.id));const name=document.createElement('strong');name.textContent=c.labelHe;const id=document.createElement('small');id.textContent=c.id;const duration=document.createElement('span');duration.className='clip-duration';duration.textContent=`${c.durationSeconds.toFixed(2)}s`;button.append(name,id,duration);button.addEventListener('click',()=>selectClip(c.id).catch(showError));return button;}));}
function status(message,error=false){$('status').textContent=message;$('status').classList.toggle('error',error);$('status').hidden=!message;}
function showError(error){const message=String(error?.message||error);errors.push(message);status(`טעינת הקליפ נכשלה: ${message}`,true);console.error(error);}
function referenceAt(time){if(!loaded)return [0,0,0];return sampleClip(loaded,time).referenceRootTranslationMeters||[0,0,0];}
function currentPhase(){if(!loaded)return '';const t=controller.time/loaded.meta.durationSeconds;const phases=loaded.data.phases||[];const phase=phases.find(p=>t>=p.startTime&&t<=p.endTime)?.name;if(phase)return phase;const trajectory=loaded.data.ball?.trajectory||[];let i=Math.min(trajectory.length-1,Math.max(0,Math.round(t*(trajectory.length-1))));return trajectory[i]?.phase||'';}
const playIcon=value=>value?'<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path fill="currentColor" d="M2 1h3v10H2zM7 1h3v10H7z"/></svg>':'<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path fill="currentColor" d="M3 1l8 5-8 5z"/></svg>';
function updateHud(){if(!loaded||!controller)return;$('scrub').value=String(controller.time/controller.duration);$('time').textContent=`${controller.time.toFixed(2)}s`;$('duration').textContent=`${controller.duration.toFixed(2)}s · ${loaded.meta.loop?'LOOP':'REPLAY'}`;const phase=currentPhase();$('phase').querySelector('span').textContent=phaseNames[phase]||phase||groupNames[CLIPS[loaded.id].group];$('play').innerHTML=playIcon(playing);$('play').setAttribute('aria-label',playing?'השהיה':'ניגון');}
function frameCamera(){if(!loaded)return;const meta=CLIPS[loaded.id];const isDunk=meta.kind?.startsWith('dunk');const isJump=['euro','layup','block','rebound','floater','jump_shot','three_point'].includes(meta.kind)||(meta.kind==='celebrate'&&meta.variant==='jump');let height=isDunk?1.75:isJump?1.3:.95;let distance=isDunk?7.7:isJump?6.5:5.45;const ref=rootMode==='reference'?referenceAt(controller.time):[0,0,0];cameraTarget.set(ref[0],height,ref[2]);camera.position.set(ref[0]+distance*.57,height+distance*.17,ref[2]+distance*.82);if(meta.group==='attack'&&['floater','jump_shot','free_throw','three_point'].includes(meta.kind)){
 const shownHoop=rootMode==='reference'?hoopTarget:hoopTarget.map((v,k)=>v-referenceAt(controller.time)[k]);
 const gap=Math.hypot(shownHoop[0]-ref[0],shownHoop[2]-ref[2]);
 distance=Math.max(6.5,4+gap*.9);cameraTarget.set((ref[0]+shownHoop[0])*.5,1.6,(ref[2]+shownHoop[2])*.5);
 camera.position.set(cameraTarget.x+distance*.76,cameraTarget.y+distance*.15,cameraTarget.z-distance*.65);
 }camera.lookAt(cameraTarget);sun.target.position.copy(cameraTarget);sun.position.set(ref[0]-3.5,7,ref[2]+4.5);hoop.visible=meta.group==='attack'&&['euro','layup','floater','jump_shot','free_throw','three_point','dunk_one_hand','dunk_two_hands'].includes(meta.kind);const hoopRef=rootMode==='in-place'?referenceAt(controller.time):[0,0,0];hoop.position.set(hoopTarget[0]-hoopRef[0],hoopTarget[1]-3.05,hoopTarget[2]-hoopRef[2]+.24);}
function applyRoot(){if(!loaded)return;const ref=rootMode==='reference'?referenceAt(controller.time):[0,0,0];athlete.position.fromArray(ref);referenceTrail.visible=rootMode==='reference';$('root-note').textContent=rootMode==='reference'?'REFERENCE TRAJECTORY / PRESENTATION ONLY':'IN-PLACE / HOST-OWNED ROOT';frameCamera();}
function setCourtTarget(){
 // The basket is authored independently of the ball path. A miss remains visible.
 const target=loaded?.data.courtTarget?.rimCenterMeters;
 hoopTarget=Array.isArray(target)&&target.length===3?target.slice():[0,3.05,2.3];
}
function render(){if(disposed)return;applyRoot();renderer.render(scene,camera);updateHud();}
async function selectClip(id,{autoplay=true}={}){if(!CLIPS[id])throw new RangeError(`Unknown clip ${id}`);const own=++request;status('טוען את הקליפ…');if(!cache.has(id))cache.set(id,loadClip(id,{format:'glb'}).catch(error=>{cache.delete(id);throw error;}));const next=await cache.get(id);if(own!==request)return next;controller?.dispose();athlete.clear();loaded=next;athlete.add(next.scene);next.scene.traverse(object=>{if(object.isMesh){object.castShadow=true;object.receiveShadow=true;object.frustumCulled=false;}});controller=createClipController({THREE,clip:next,onEvent:event=>{window.dispatchEvent(new CustomEvent('motion-presentation-event',{detail:event}));}});clockTime=0;replayHold=0;playing=autoplay;controller.seek(0);if(!autoplay)controller.pause();$('clip-title').textContent=CLIPS[id].labelHe;$('clip-id').textContent=`${id.toUpperCase()} / ${groupNames[CLIPS[id].group]}`;$('play').disabled=false;const points=next.data.keyframes.map(f=>new THREE.Vector3(f.referenceRootTranslationMeters?.[0]||0,0,f.referenceRootTranslationMeters?.[2]||0));referenceTrail.geometry.dispose();referenceTrail.geometry=new THREE.BufferGeometry().setFromPoints(points);referenceTrail.computeLineDistances();setCourtTarget();status('');renderList();render();while(cache.size>10){const old=[...cache.keys()].find(key=>key!==id);if(!old)break;const promise=cache.get(old);cache.delete(old);promise.then(item=>{if(item!==loaded)disposeClip(item);}).catch(()=>{});}return next;}
function resize(){const rect=stage.getBoundingClientRect();const width=Math.max(1,rect.width),height=Math.max(1,rect.height);renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();render();}
new ResizeObserver(resize).observe(stage);
for(const filter of document.querySelectorAll('[data-group]'))filter.addEventListener('click',()=>{group=filter.dataset.group;for(const b of document.querySelectorAll('[data-group]'))b.setAttribute('aria-pressed',String(b===filter));renderList();});
$('search').addEventListener('input',renderList);
$('play').addEventListener('click',()=>{playing=!playing;if(playing)controller?.resume();else controller?.pause();updateHud();});
$('restart').addEventListener('click',()=>{clockTime=0;replayHold=0;controller?.seek(0);if(playing)controller?.resume();render();});
$('scrub').addEventListener('input',()=>{if(!controller)return;clockTime=Number($('scrub').value)*controller.duration;replayHold=0;controller.seek(clockTime);render();});
$('speed').addEventListener('change',()=>{playbackRate=Number($('speed').value);});
$('root-mode').addEventListener('change',()=>{rootMode=$('root-mode').value;render();});
function tick(now){if(disposed)return;const delta=Math.min(.08,(now-lastFrame)/1000);lastFrame=now;if(loaded&&controller&&playing){const d=controller.duration;if(loaded.meta.loop){controller.resume().update(delta*playbackRate);clockTime=controller.time;}else if(clockTime<d){controller.resume().update(delta*playbackRate);clockTime=controller.time;}else{replayHold+=delta;if(replayHold>=.55){clockTime=0;replayHold=0;controller.seek(0).resume();window.dispatchEvent(new CustomEvent('motion-replay-boundary',{detail:{clipId:loaded.id}}));}}render();}requestAnimationFrame(tick);}
const initialId=new URLSearchParams(location.search).get('clip')||'euro_left';
renderList();resize();requestAnimationFrame(tick);
const ready=selectClip(CLIPS[initialId]?initialId:CATALOG[0].id).catch(error=>{showError(error);throw error;});
window.motionPreview={ready,errors,catalog:CATALOG,THREE,renderer,scene,camera,
 async load(id,options={}){return selectClip(id,{autoplay:false,...options});},
 seek(seconds){if(!controller)throw new Error('Preview not ready');playing=false;clockTime=Math.min(controller.duration,Math.max(0,seconds));controller.seek(clockTime).pause();render();return this.current;},
 setPlaying(value){playing=!!value;updateHud();},
 setRootMode(value){if(!['in-place','reference'].includes(value))throw new RangeError('Unknown root mode');rootMode=value;$('root-mode').value=value;render();},
 setCaptureMode(value){document.body.classList.toggle('capture',!!value);resize();},
 snapshot(){render();return renderer.domElement.toDataURL('image/png');},
 render,resize,
 get current(){return loaded?{id:loaded.id,time:controller.time,duration:controller.duration,meta:loaded.meta,data:loaded.data,scene:loaded.scene,animation:loaded.animation}:null;},
 async dispose(){disposed=true;controller?.dispose();for(const item of await Promise.allSettled(cache.values()))if(item.status==='fulfilled')disposeClip(item.value);cache.clear();await disposeRuntime();renderer.dispose();}
};
window.addEventListener('pagehide',()=>{void window.motionPreview.dispose();},{once:true});
