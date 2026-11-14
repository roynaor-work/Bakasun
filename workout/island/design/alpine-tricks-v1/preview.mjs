import * as THREE from '../../vendor/three.module.js';
import {GLTFLoader} from '../../vendor/GLTFLoader.js';
import {DRACOLoader} from '../../vendor/DRACOLoader.js';

const $=id=>document.getElementById(id),params=new URLSearchParams(location.search);
const capture=params.get('capture')==='1';
if(capture)document.documentElement.classList.add('capture');
const stage=$('stage'),renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.18;
stage.prepend(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#e2edf2');scene.fog=new THREE.Fog('#e2edf2',9,22);
scene.add(new THREE.HemisphereLight(0xe5f3ff,0x849b9b,2.5));
const sun=new THREE.DirectionalLight(0xfff1d6,3.1);sun.position.set(-3,6,4);sun.castShadow=true;
sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-3;sun.shadow.camera.right=3;sun.shadow.camera.top=3;sun.shadow.camera.bottom=-3;sun.shadow.bias=-.0003;sun.shadow.normalBias=.015;scene.add(sun);
const rim=new THREE.DirectionalLight(0xc9ebff,1.8);rim.position.set(3,3,-4);scene.add(rim);
const snow=new THREE.Mesh(new THREE.PlaneGeometry(80,80),new THREE.MeshStandardMaterial({color:0xf1f7f7,roughness:.96,metalness:0}));
snow.rotation.x=-Math.PI/2;snow.position.y=-.008;snow.receiveShadow=true;scene.add(snow);
// Subtle survey marks give the snow a scale without obscuring the equipment.
const grid=new THREE.GridHelper(14,28,0xd4e1e4,0xe1ebed);grid.position.y=-.006;grid.material.transparent=true;grid.material.opacity=.35;scene.add(grid);
const camera=new THREE.PerspectiveCamera(35,1,.01,80);
let catalog,actor,mixer,action,current,playing=!capture,time=0,speed=1,view='three-quarter',last=0;
let currentBounds={center:new THREE.Vector3(0,.85,0),radius:1.25};
const rest=new Map(),clips=new Map(),boundCache=new Map();

function update(){scene.updateMatrixWorld(true);actor?.traverse(o=>{if(o.isSkinnedMesh)o.skeleton.update();});}
function resetPose(){for(const [o,v]of rest){o.position.copy(v.p);o.quaternion.copy(v.q);o.scale.copy(v.s);}update();}
function applyTime(seconds){
  time=Math.max(0,Math.min(current?.durationSeconds??0,seconds));
  if(action){action.paused=false;action.enabled=true;mixer.setTime(time);update();}
}
function boxAt(seconds){
  applyTime(seconds);const box=new THREE.Box3();
  actor.traverse(o=>{if(!o.isMesh)return;if(o.isSkinnedMesh)o.computeBoundingBox();else o.geometry.computeBoundingBox();const b=(o.isSkinnedMesh?o.boundingBox:o.geometry.boundingBox);if(b)box.union(b.clone().applyMatrix4(o.matrixWorld));});
  return box;
}
function frameCamera(){
  const width=stage.clientWidth,height=stage.clientHeight;
  renderer.setSize(width,height,false);camera.aspect=width/Math.max(1,height);
  const {center,radius}=currentBounds;
  const vertical=2*Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov)/2)*Math.min(1,camera.aspect));
  const distance=radius/Math.sin(vertical/2)*1.12;
  const direction=view==='side'?new THREE.Vector3(1,.20,.015):new THREE.Vector3(1.05,.37,1.55);
  camera.position.copy(center).add(direction.normalize().multiplyScalar(distance));camera.lookAt(center);camera.updateProjectionMatrix();render();
}
function eventName(e){return e.label||e.name||e.type||'אירוע';}
const phaseLabels={compression:'כיווץ לפני המראה',takeoff:'עלייה',apex:'שיא',landing:'נחיתה','land':'נחיתה','absorbed':'ספיגת נחיתה','settled':'התייצבות','recovery':'קימה','recover':'קימה','get-up':'קימה','recovered':'חזרה לגלישה','balance-lost':'איבוד איזון','soft-side-contact':'נפילה רכה','slide':'החלקה','snow-contact':'מגע שלג','perfect-landing':'נחיתה מושלמת'};
function intervals(clip){
  const duration=clip.durationSeconds,events=clip.events??[],airStart=events.find(e=>/take.?off|air.?start/i.test(e.name??e.type??''))?.time,airEnd=events.find(e=>/land(?:ing)?|air.?end/i.test(e.name??e.type??''))?.time;
  if(clip.contactIntervals?.length){
    const segments=[],gapType=/fall|recover/i.test(clip.id)?'recovery':'air';let cursor=0;
    for(const interval of [...clip.contactIntervals].sort((a,b)=>a.start-b.start)){
      const start=Math.max(cursor,Math.min(duration,interval.start)),end=Math.max(start,Math.min(duration,interval.end));
      if(start>cursor)segments.push({start:cursor,end:start,type:gapType});
      if(end>start)segments.push({...interval,start,end,type:interval.type??(interval.left===false&&interval.right===false?'air':'ground')});
      cursor=end;
    }
    if(cursor<duration)segments.push({start:cursor,end:duration,type:gapType});
    return segments;
  }
  if(Number.isFinite(airStart)&&Number.isFinite(airEnd))return [{start:0,end:airStart,type:'ground'},{start:airStart,end:airEnd,type:'air'},{start:airEnd,end:duration,type:'ground'}].filter(i=>i.end>i.start);
  return [{start:0,end:duration,type:/fall|recover/i.test(clip.id)?'recovery':'ground'}];
}
function updateTimeline(){
  if(!current)return;const duration=current.durationSeconds,u=duration?time/duration:0;
  $('time').textContent=`${time.toFixed(2)} / ${duration.toFixed(2)} s`;$('scrub').value=String(time);
  $('contact-progress').style.left=`${u*100}%`;
  const support=intervals(current).find(i=>time>=i.start&&time<=i.end)??{type:'ground'};
  $('contact-state').textContent=support.type==='air'?'באוויר':support.type==='recovery'?'נפילה והחלקה':'מגע סקי';
  const events=(current.events??[]).filter(e=>Number(e.time)<=time+1e-6),event=events.at(-1);
  $('phase').textContent=event?(phaseLabels[event.name??event.type]??eventName(event)):(current.kind==='bridge'?'מעבר רציף':'הכנה');
  $('capture-label').textContent=`${current.id} · ${time.toFixed(3)}s · 30 Hz`;
}
function render(){renderer.render(scene,camera);}
function seek(seconds){if(!current)return;applyTime(Number(seconds));updateTimeline();render();return time;}
function setPlaying(value){playing=!!value;$('play').textContent=playing?'השהיה':'ניגון';$('play').setAttribute('aria-label',playing?'השהיה':'ניגון');last=0;}
function setClip(id){
  const entry=catalog.clips.find(c=>c.id===id),clip=clips.get(id);if(!entry||!clip)throw Error(`Unknown clip: ${id}`);
  mixer.stopAllAction();resetPose();current=entry;
  action=mixer.clipAction(clip).reset();action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();
  if(!boundCache.has(id)){
    const box=new THREE.Box3();for(let i=0;i<=16;i++)box.union(boxAt(entry.durationSeconds*i/16));
    const sphere=box.getBoundingSphere(new THREE.Sphere());
    boundCache.set(id,{center:sphere.center,radius:Math.max(.70,sphere.radius)});
  }
  currentBounds=boundCache.get(id);$('clip-select').value=id;$('scrub').max=String(entry.durationSeconds);
  $('stage-title').textContent=entry.label;$('stage-note').textContent=entry.kind==='bridge'?'מעבר בין תנוחות, עם רציפות במהירות.':'תנועת גולש על השלד הקנוני.';
  $('clip-number').textContent=`${String(catalog.clips.indexOf(entry)+1).padStart(2,'0')} / ${String(catalog.clips.length).padStart(2,'0')}`;
  $('mode-chip').textContent=entry.kind==='bridge'?'גשר C1':entry.loop?'לולאה':'תנועה';
  $('clip-note').textContent=entry.kind==='bridge'?`${catalog.clips.find(c=>c.id===entry.from)?.label??entry.from??''} ← ${catalog.clips.find(c=>c.id===entry.to)?.label??entry.to??''}`:(entry.note??'בחרו זווית, האטו את התנועה ובדקו את נקודות המגע.');
  $('sheet-link').href=entry.contactSheet??`sheets/${id}.webp`;
  const timeline=$('contact-timeline');timeline.querySelectorAll('.interval').forEach(e=>e.remove());
  for(const segment of intervals(entry)){const e=document.createElement('span');e.className=`interval ${segment.type}`;e.style.position='absolute';e.style.left=`${100*segment.start/entry.durationSeconds}%`;e.style.width=`${100*(segment.end-segment.start)/entry.durationSeconds}%`;timeline.append(e);}
  seek(0);frameCamera();return {id,durationSeconds:entry.durationSeconds};
}
function setView(next){
  view=next==='side'?'side':'three-quarter';document.querySelectorAll('[data-view]').forEach(b=>{const active=b.dataset.view===view;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});frameCamera();return view;
}
async function boot(){
  const response=await fetch('./catalog.json');if(!response.ok)throw Error(`catalog.json: HTTP ${response.status}`);catalog=await response.json();
  const draco=new DRACOLoader();draco.setDecoderPath('../../vendor/draco/');
  const loader=new GLTFLoader();loader.setDRACOLoader(draco);
  const gltf=await loader.loadAsync('./alpine-tricks.glb');actor=gltf.scene;scene.add(actor);
  actor.traverse(o=>{rest.set(o,{p:o.position.clone(),q:o.quaternion.clone(),s:o.scale.clone()});if(o.isMesh){o.castShadow=true;o.receiveShadow=false;o.frustumCulled=false;}});
  mixer=new THREE.AnimationMixer(actor);for(const clip of gltf.animations)clips.set(clip.name,clip);
  const missing=catalog.clips.filter(c=>!clips.has(c.id));if(missing.length)throw Error(`GLB misses ${missing.map(c=>c.id).join(', ')}`);
  for(const [kind,label]of [['motion','תנועות'],['bridge','גשרי C1']]){const group=document.createElement('optgroup');group.label=label;for(const clip of catalog.clips.filter(c=>c.kind===kind)){const option=document.createElement('option');option.value=clip.id;option.textContent=clip.label;group.append(option);}if(group.children.length)$('clip-select').append(group);}
  for(const id of ['clip-select','play','restart','scrub'])$(id).disabled=false;
  setClip(params.get('clip')||catalog.clips[0].id);if(params.has('time'))seek(Number(params.get('time')));
  if(params.get('view')==='side')setView('side');
  $('status').textContent=`${catalog.clips.filter(c=>c.kind==='motion').length} תנועות · ${catalog.clips.filter(c=>c.kind==='bridge').length} גשרים · מקומי`;
  setPlaying(!capture&&!params.has('time'));
  window.__alpinePreview={ready:true,catalog,setClip,seek,setView,setPlaying,render,getState:()=>({clip:current.id,time,playing,speed,view,width:innerWidth,height:innerHeight}),getClipNames:()=>[...clips.keys()]};
  window.dispatchEvent(new Event('alpine-ready'));
  draco.dispose();
}
$('clip-select').addEventListener('change',e=>setClip(e.target.value));$('play').addEventListener('click',()=>setPlaying(!playing));
$('restart').addEventListener('click',()=>{seek(0);setPlaying(true);});$('scrub').addEventListener('input',e=>{setPlaying(false);seek(e.target.value);});
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
document.querySelectorAll('[data-speed]').forEach(b=>b.addEventListener('click',()=>{speed=Number(b.dataset.speed);document.querySelectorAll('[data-speed]').forEach(other=>{const active=other===b;other.classList.toggle('active',active);other.setAttribute('aria-pressed',String(active));});}));
new ResizeObserver(()=>frameCamera()).observe(stage);
function tick(stamp){requestAnimationFrame(tick);if(!current)return;if(playing){const delta=last?Math.min(.08,(stamp-last)/1000)*speed:0;let next=time+delta;if(next>current.durationSeconds){if(current.loop)next%=current.durationSeconds;else{next=current.durationSeconds;setPlaying(false);}}seek(next);}last=stamp;}
requestAnimationFrame(tick);
boot().catch(error=>{$('status').textContent='טעינת הנכס נכשלה';$('error').hidden=false;$('error').textContent=`לא ניתן לטעון את ספריית התנועה. הפעילו את הדף דרך שרת מקומי.\n${error.message}`;console.error(error);window.__alpinePreview={ready:false,error:error.message};});
