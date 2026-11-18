/** Local GLB playback. Every displayed pose is evaluated by AnimationMixer. */
import * as THREE from '../vendor/three.module.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { DRACOLoader } from '../vendor/DRACOLoader.js';
import { MeshoptDecoder } from '../vendor/meshopt_decoder.module.js';

const $ = id => document.getElementById(id);
const base = new URL('../', import.meta.url);
const params = new URLSearchParams(location.search);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#2b3930');
scene.fog = new THREE.Fog('#2b3930', 10, 30);
const camera = new THREE.PerspectiveCamera(34, 1, .02, 80);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$('stage').prepend(renderer.domElement);
scene.add(new THREE.HemisphereLight('#e7f1ee', '#a28a65', 1.45));
const key = new THREE.DirectionalLight('#fff0d7', 3.2);
key.position.set(3, 6, 4); key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
Object.assign(key.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: .2, far: 20 });
key.shadow.bias = -.00015; key.shadow.normalBias = .012; key.shadow.radius = 3;
scene.add(key, key.target);
const fill = new THREE.DirectionalLight('#c5e7eb', 1.0); fill.position.set(-4, 3, 4); scene.add(fill);
const rim = new THREE.DirectionalLight('#dae7c2', 1.7); rim.position.set(2, 4, -4); scene.add(rim);

function woodTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 512;
  const ctx = c.getContext('2d'); ctx.fillStyle = '#9f986f'; ctx.fillRect(0,0,512,512);
  // Deterministic surface details on the court; the athlete comes from GLB.
  let seed = 7141;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let row = 0; row < 8; row++) {
    const y = row * 64; ctx.fillStyle = `rgba(70,62,32,${.025+rand()*.06})`; ctx.fillRect(0,y,512,64);
    ctx.fillStyle = '#716e4b44'; ctx.fillRect(0,y,512,1);
    const seam = (row%2 ? 120 : 370); ctx.fillRect(seam,y,1,64);
    for(let i=0;i<75;i++){ctx.fillStyle=`rgba(73,62,35,${.02+rand()*.065})`;ctx.fillRect(rand()*512,y+rand()*64,rand()*180, .35+rand()*.6);}
  }
  const texture = new THREE.CanvasTexture(c); texture.colorSpace=THREE.SRGBColorSpace;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping; texture.repeat.set(8,8); texture.anisotropy=4; return texture;
}
const floor = new THREE.Mesh(new THREE.PlaneGeometry(36,36), new THREE.MeshStandardMaterial({map:woodTexture(),color:'#b5b79a',roughness:.77,metalness:0}));
floor.rotation.x=-Math.PI/2; floor.position.y=-.006; floor.receiveShadow=true; scene.add(floor);
function line(points, color='#e1e4ca', opacity=.6) {
  const geometry=new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p)));
  return new THREE.Line(geometry,new THREE.LineBasicMaterial({color,transparent:true,opacity}));
}
scene.add(line([[-3,.003,-3],[3,.003,-3],[3,.003,7],[-3,.003,7],[-3,.003,-3]],'#dde1c9',.55));
for(let z=-1;z<10;z+=4) {
  const arc=[];for(let i=0;i<=90;i++){const a=i/90*Math.PI*2;arc.push([Math.cos(a)*1.7,.004,Math.sin(a)*1.7+z]);}
  scene.add(line(arc,'#d1d9bd',.26));
}
scene.add(line([[-3,.004,0],[3,.004,0]],'#e3e8ce',.5));

function basketball() {
  const group=new THREE.Group();
  const ball=new THREE.Mesh(new THREE.SphereGeometry(.12,32,20),new THREE.MeshStandardMaterial({color:'#b85f28',roughness:.86}));ball.castShadow=true;group.add(ball);
  const material=new THREE.MeshStandardMaterial({color:'#27271d',roughness:.9});
  for(const euler of [[0,0,0],[Math.PI/2,0,0],[0,Math.PI/2,0]]) {
    const seam=new THREE.Mesh(new THREE.TorusGeometry(.1202,.0015,4,64),material);seam.rotation.set(...euler);group.add(seam);
  }
  group.name='PreviewBasketball';return group;
}
const markers=new THREE.Group(); scene.add(markers);
function marker(color,radius) {
  return new THREE.Mesh(new THREE.SphereGeometry(radius,14,10),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.95,depthTest:false}));
}
const handMarkers={left:marker('#f6c676',.018),right:marker('#f6c676',.018)};
const footMarkers={left:marker('#9eead6',.025),right:marker('#9eead6',.025)};
for(const m of [...Object.values(handMarkers),...Object.values(footMarkers)]){m.renderOrder=20;markers.add(m);m.visible=false;}
const draco=new DRACOLoader(); draco.setDecoderPath(new URL('vendor/draco/',base).href);draco.setWorkerLimit(2);
const loader=new GLTFLoader(); loader.setDRACOLoader(draco); loader.setMeshoptDecoder(MeshoptDecoder);
const models=new Map(), contacts=new Map();
let catalog, root, mixer, currentClip, action, ballAnchor, playing=false, seconds=0, speed=1, view='three-quarter', showContacts=true, lastTime=0;
let modelKey=null, contactData=null, selectionEpoch=0, clipHeight=2.65;
const ready = (async()=>{
  const response=await fetch(new URL('catalog.json',base));if(!response.ok)throw Error(`catalog.json: ${response.status}`);
  catalog=await response.json();
  if(!Array.isArray(catalog.clips)||!catalog.clips.length)throw Error('הקטלוג אינו מכיל קליפים.');
  $('clip-count').textContent=`${catalog.clips.length} קליפים`;
  const fragment=document.createDocumentFragment();
  catalog.clips.forEach((clip,i)=>{
    const button=document.createElement('button');button.type='button';button.className='clip-item';button.dataset.id=clip.id;button.setAttribute('aria-pressed','false');
    const number=document.createElement('span');number.className='clip-num';number.textContent=String(i+1).padStart(2,'0');
    const copy=document.createElement('span');copy.className='clip-copy';
    const label=document.createElement('span');label.className='clip-name';label.textContent=clip.label||clip.labelHe||clip.id;
    const duration=document.createElement('span');duration.className='clip-duration';duration.textContent=`${durationOf(clip).toFixed(2)}s · 30Hz`;
    copy.append(label,duration);button.append(number,copy);button.addEventListener('click',()=>select(clip.id));fragment.append(button);
  });
  $('clip-list').replaceChildren(fragment);
  const bridges=Array.isArray(catalog.bridges)?catalog.bridges:[];
  for(const bridge of bridges){const option=document.createElement('option');option.value=bridge.id;option.textContent=bridge.label||bridge.labelHe||bridgeLabel(bridge);$('bridge').append(option);}
  $('bridge-picker').hidden=!bridges.length;
  await select(params.get('clip')||catalog.clips[0].id);
  $('loading').classList.add('hidden'); resize();
  if(params.get('play')==='1' && !matchMedia('(prefers-reduced-motion: reduce)').matches)setPlaying(true);
  requestAnimationFrame(tick);return true;
})();
ready.catch(error=>{
  console.error(error);$('loading').classList.remove('hidden');$('loading').replaceChildren();
  const text=document.createElement('div');text.className='load-error';text.textContent=`לא ניתן לטעון את התצוגה: ${error.message}. יש לפתוח דרך שרת מקומי, יחד עם קובצי החבילה.`;$('loading').append(text);
});
function durationOf(clip){return Number(clip?.duration??clip?.durationSeconds??1);}
function bridgeLabel(bridge){const label=id=>id==='ref_idle'?'עמידה':id==='ref_run'?'ריצה':catalog.clips.find(c=>c.id===id)?.label||id;return bridge.from?.animation&&bridge.to?.animation?`${label(bridge.from.animation)} ← ${label(bridge.to.animation)}`:bridge.id;}
async function getModel(path){
  if(!models.has(path))models.set(path,loader.loadAsync(new URL(path,base).href));
  return models.get(path);
}
function allClips(){return [...(catalog.clips||[]),...(Array.isArray(catalog.references)?catalog.references:[]),...(Array.isArray(catalog.bridges)?catalog.bridges:[])];}
async function select(id){
  const clip=allClips().find(c=>c.id===id);if(!clip)throw Error(`Unknown clip: ${id}`);
  const epoch=++selectionEpoch;setPlaying(false);
  const path=clip.glb||catalog.glb||catalog.asset||'models/athlete.glb';
  const gltf=await getModel(path);if(epoch!==selectionEpoch)return;
  if(modelKey!==path){
    if(root)scene.remove(root);if(mixer)mixer.stopAllAction();
    root=gltf.scene;root.traverse(object=>{if(object.isMesh){object.castShadow=true;object.receiveShadow=true;const mats=Array.isArray(object.material)?object.material:[object.material];for(const mat of mats){if(/skin/i.test(mat.name)){mat.roughness=.75;mat.metalness=0;}if(/hair|brow|lash/i.test(mat.name)&&mat.transparent){mat.alphaTest=.18;mat.depthWrite=true;}}}});
    scene.add(root);mixer=new THREE.AnimationMixer(root);modelKey=path;
    ballAnchor=root.getObjectByName('MotionBallAnchor')||root.getObjectByName('Ball');
    if(ballAnchor&&!ballAnchor.getObjectByName('PreviewBasketball'))ballAnchor.add(basketball());
  }
  mixer.stopAllAction();
  const animation=gltf.animations.find(a=>a.name===(clip.animation||clip.id));
  if(!animation)throw Error(`Missing GLB animation: ${clip.animation||clip.id}`);
  action=mixer.clipAction(animation);action.reset();action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.enabled=true;action.play();
  currentClip=clip;seconds=0;contactData=null;
  // Keep the camera's vertical framing fixed through a whole action. A jump
  // should visibly leave the floor, rather than make the camera rise with it.
  let high=2.35;
  const extremities=['Head','LeftHand','RightHand'].map(name=>root.getObjectByName(name)).filter(Boolean);
  for(let sample=0;sample<=16;sample++){action.enabled=true;action.paused=false;mixer.setTime(durationOf(clip)*sample/16);root.updateMatrixWorld(true);for(const bone of extremities)high=Math.max(high,bone.getWorldPosition(new THREE.Vector3()).y+.23);}
  clipHeight=high+.15;
  $('bridge').value=(catalog.bridges||[]).some(b=>b.id===id)?id:'';
  if(clip.contacts){
    if(!contacts.has(clip.contacts))contacts.set(clip.contacts,fetch(new URL(clip.contacts,base)).then(r=>r.ok?r.json():null));
    contactData=await contacts.get(clip.contacts);if(epoch!==selectionEpoch)return;
  }
  document.querySelectorAll('.clip-item').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.id===id)));
  const selectedButton=[...document.querySelectorAll('.clip-item')].find(button=>button.dataset.id===id);
  selectedButton?.scrollIntoView({block:'nearest',inline:'nearest'});
  $('clip-title').textContent=clip.label||clip.labelHe||(clip.from&&clip.to?bridgeLabel(clip):clip.id);
  $('clip-category').textContent=String(clip.category||'TECHNIQUE').replaceAll('_',' ').toUpperCase();
  $('clip-note').textContent=clip.cue||clip.techniqueCue||clip.notesHe||defaultCue(clip);
  $('event-strip').replaceChildren();
  for(const event of clip.events||[]){const tick=document.createElement('i');tick.className='event-tick'+(/release/.test(event.type||'')?' release':'');tick.style.left=`${Math.max(0,Math.min(100,eventTime(event)/durationOf(clip)*100))}%`;$('event-strip').append(tick);}
  seek(0);return clip;
}
function defaultCue(clip){
  if(clip.from&&clip.to)return 'מעבר רציף בין הפעולות';
  const id=clip.id;
  if(/shot/.test(id))return 'כפיפת ברכיים · כניסה רציפה · שחרור · מעקב של כף היד';
  if(/pass/.test(id))return 'העברת משקל · הארכת זרועות · שחרור מדויק · מעקב';
  if(/dribble/.test(id))return 'מבט קדימה · מרכז כובד נמוך · שליטה בכדור באצבעות';
  if(/pivot/.test(id))return 'רגל ציר יציבה · סיבוב מהאגן · הגנה על הכדור';
  if(/stop/.test(id))return 'בלימת הגוף דרך האגן · ברכיים מעל כפות הרגליים';
  if(/dunk|layup/.test(id))return 'איסוף · דחיפה מהרגל · סיומת גבוהה · נחיתה רכה';
  return 'חלוקת משקל · תזמון · תנועה רציפה';
}
function eventTime(event){return Number(event.time??event.timeSeconds??event.seconds??((event.frame??0)/30));}
const eventLabels={release:'שחרור כדור',ball_release:'שחרור כדור',catch:'אחיזת כדור',ball_catch:'אחיזת כדור',hand_catch:'איסוף בכף היד',hand_push:'דחיפת הכדור',guide_hand_off:'הפרדת היד המכוונת',bounce:'מגע בקרקע',floor_contact:'מגע בקרקע',takeoff:'ניתור',landing:'נחיתה',land:'נחיתה',gather:'איסוף הכדור',load:'כפיפת ברכיים',follow_through:'מעקב',plant:'דריכה'};
function seek(value){
  if(!currentClip||!mixer)return;
  seconds=Math.max(0,Math.min(durationOf(currentClip),Number(value)||0));
  // Re-enable clamped actions before seeking backwards from the last frame.
  action.enabled=true;action.paused=false;mixer.setTime(seconds);root.updateMatrixWorld(true);
  for(const object of root.children)object.updateMatrixWorld(true);
  updateCamera();updateContacts();updateUI();render();
}
function updateUI(){
  const duration=durationOf(currentClip);$('timeline').value=String(seconds/duration);
  $('time').textContent=`${seconds.toFixed(2)} / ${duration.toFixed(2)}`;
  $('frame-label').textContent=`FRAME ${String(Math.round(seconds*30)).padStart(3,'0')} / 30 Hz`;
  const events=[...(currentClip.events||[])].sort((a,b)=>eventTime(a)-eventTime(b));
  const event=events.filter(e=>eventTime(e)<=seconds+.0001).at(-1);
  $('phase-label').textContent=event?(event.label||event.labelHe||eventLabels[event.type]||String(event.type).replaceAll('_',' ')):(currentClip.from&&currentClip.to?'מעבר':'עמדת מוצא');
  const next=events.find(e=>eventTime(e)>seconds+.0001);
  $('event-label').textContent=next?`${next.label||next.labelHe||eventLabels[next.type]||'נקודת מגע'} · ${eventTime(next).toFixed(2)}`:'סיום התנועה';
}
function updateCamera(){
  if(!root)return;
  const rootBone=root.getObjectByName('Root');
  const rootPosition=(rootBone||root).getWorldPosition(new THREE.Vector3());
  const bodyHeight=Math.max(2.6,clipHeight);
  const target=new THREE.Vector3(rootPosition.x,bodyHeight*.48,rootPosition.z+.08);
  const aspect=Math.max(.5,camera.aspect),verticalDistance=bodyHeight/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)));
  const distance=Math.max(verticalDistance,1.9/aspect/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))))*1.14;
  const yaw=view==='front'?0:view==='side'?Math.PI/2:.54;
  const pitch=.09;
  camera.position.set(target.x+Math.sin(yaw)*distance,target.y+Math.sin(pitch)*distance,target.z+Math.cos(yaw)*distance);
  camera.lookAt(target);camera.updateMatrixWorld();
  key.target.position.set(rootPosition.x,1,rootPosition.z);
  key.position.set(rootPosition.x+3,6,rootPosition.z+4);key.target.updateMatrixWorld();
}
function updateContacts(){
  markers.visible=showContacts;for(const m of [...Object.values(handMarkers),...Object.values(footMarkers)])m.visible=false;
  if(!showContacts||!root)return;
  const frames=contactData?.frames||contactData?.samples;
  const frame=frames?.[Math.min(frames.length-1,Math.round(seconds*30))];
  if(frame){
    for(const name of frame.hands||[]){
      const side=/Left/.test(name)?'left':'right',bone=root.getObjectByName(name),point=contactData.palmLocalMeters?.[name];
      if(bone&&point){handMarkers[side].position.copy(bone.localToWorld(new THREE.Vector3(...point)));handMarkers[side].visible=true;}
    }
    for(const contact of frame.contact||frame.contacts||[]){
      const key=/Left|left/.test(contact.effector||contact.hand)?'left':'right';const p=contact.palm||contact.position;
      if(p){handMarkers[key].position.copy(root.localToWorld(new THREE.Vector3(...p)));handMarkers[key].visible=true;}
    }
    const feet=frame.footErrors||frame.feet;
    for(const side of ['left','right'])if(feet?.[side]?.support){const p=feet[side].position||feet[side].point;if(p){footMarkers[side].position.copy(root.localToWorld(new THREE.Vector3(...p)));footMarkers[side].position.y=.014;footMarkers[side].visible=true;}}
    for(const side of ['left','right'])if(frame.support?.[side]){const bone=root.getObjectByName(side==='left'?'LeftFoot':'RightFoot');if(bone){const local=frame.supportMarkers?.[side]?.localPointMeters;footMarkers[side].position.copy(local?bone.localToWorld(new THREE.Vector3(...local)):bone.getWorldPosition(new THREE.Vector3()));if(!local)footMarkers[side].position.y=.014;footMarkers[side].visible=true;}}
  }
}
function render(){scene.updateMatrixWorld(true);root?.traverse(object=>{if(object.isSkinnedMesh)object.skeleton.update();});renderer.render(scene,camera);}
function resize(){const bounds=$('stage').getBoundingClientRect();renderer.setSize(Math.max(1,bounds.width),Math.max(1,bounds.height),false);camera.aspect=bounds.width/Math.max(1,bounds.height);camera.updateProjectionMatrix();updateCamera();render();}
function setPlaying(value){playing=!!value;$('play').textContent=playing?'Ⅱ':'▶';$('play').setAttribute('aria-pressed',String(playing));$('play').setAttribute('aria-label',playing?'השהיית הקליפ':'הפעלת הקליפ');lastTime=0;}
function setView(value){view=value;document.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.view===view)));updateCamera();render();}
function tick(time){const dt=lastTime?Math.min(.1,(time-lastTime)/1000):0;lastTime=time;if(playing&&currentClip){let next=seconds+dt*speed;if(next>durationOf(currentClip)){if(currentClip.loop)next%=durationOf(currentClip);else{next=durationOf(currentClip);setPlaying(false);}}seek(next);}requestAnimationFrame(tick);}
$('play').addEventListener('click',()=>{if(!playing&&seconds>=durationOf(currentClip))seek(0);setPlaying(!playing);});
$('timeline').addEventListener('input',()=>{setPlaying(false);seek(Number($('timeline').value)*durationOf(currentClip));});
$('speed').addEventListener('change',()=>speed=Number($('speed').value));
$('bridge').addEventListener('change',()=>{if($('bridge').value)select($('bridge').value);});
$('contacts').addEventListener('click',()=>{showContacts=!showContacts;$('contacts').setAttribute('aria-pressed',String(showContacts));$('contact-key').hidden=!showContacts;updateContacts();render();});
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>setView(button.dataset.view)));
new ResizeObserver(resize).observe($('stage'));
document.addEventListener('keydown',event=>{if(event.code==='Space'&&!/INPUT|SELECT|BUTTON/.test(event.target.tagName)){event.preventDefault();setPlaying(!playing);}if(event.code==='ArrowRight'&&currentClip){setPlaying(false);seek(seconds+1/30);}if(event.code==='ArrowLeft'&&currentClip){setPlaying(false);seek(seconds-1/30);}});
window.__preview={ready,select,seek,render,setView,setPlaying,resize,THREE,scene,camera,renderer,get root(){return root;},get mixer(){return mixer;},get catalog(){return catalog;},get currentClip(){return currentClip;},get seconds(){return seconds;}};
