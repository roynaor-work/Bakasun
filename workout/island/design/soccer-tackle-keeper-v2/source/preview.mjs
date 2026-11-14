/** Original canonical GLB review surface. SPDX-License-Identifier: CC0-1.0.
 * AnimationMixer evaluates the serialized tracks without IK, floor correction,
 * deformation repair, or Root motion. The review therefore exposes raw poses.
 */
import * as THREE from '../../soccer-motion-v8/runtime/vendor/three.module.js';
import {GLTFLoader} from '../../soccer-motion-v8/runtime/vendor/GLTFLoader.js';

const base=new URL('../',import.meta.url),$=id=>document.getElementById(id);
const names={contact:'מגע',catch:'איסוף',land:'נחיתה',takeoff:'המראה',recover:'חזרה לעמידה',recovered:'חזרה לעמידה',ground_contact:'מגע בקרקע',support:'תמיכה',plant:'דריכה',release:'שחרור',push:'דחיפה',support_release:'ניתוק תמיכה',ground_release:'תחילת קימה',side_land:'נחיתת צד',ready_for_getup:'מוכן לקימה',hand_push:'דחיפת יד',feet_under_body:'רגליים מתחת לגוף',balance_lost:'איבוד איזון',balance_recovered:'איזון מחדש',continue:'המשך משחק',foul_reaction:'תגובה לפאול',settled:'ספיגת נחיתה'};
const descriptions={slide_tackle:'רגל אחת מובילה אל הכדור, השנייה מתקפלת והיד מאזנת את ההחלקה.',getup_fast:'מעבר קצר מהגלישה לכריעה וחזרה לעמידה.',stumble_light:'מעידה קטנה עם ידיים לצדדים, איזון מחדש והמשך המשחק.',fall_soft:'נפילה קלה על הצד, עם ברכיים כפופות וראש מוגן.',getup_soft:'קימה קצרה ומידית מהנפילה הקלה.',fall_foul:'איבוד שיווי משקל ונפילה נשלטת על הצד.',getup_foul:'איסוף הרגליים וחזרה לעמידה אחרי נפילה בפאול.',catch_chest:'איסוף הכדור לפני החזה וירידה נשלטת על הצד.',catch_high:'קליטה מעל הראש, איסוף לכיוון החזה ונחיתת צד.',punch:'יד ימין עולה להרחקת הכדור, ואז חוזרת לפני נחיתת הצד.',save_with_foot:'רגל אחת נשלחת לחסימת הכדור והגוף מתכנס לנחיתת צד.'};
const canvas=$('stage'),renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(2,devicePixelRatio||1));renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
const scene=new THREE.Scene();scene.background=new THREE.Color('#21392d');
scene.add(new THREE.HemisphereLight('#fff5de','#476c55',2.6));
const key=new THREE.DirectionalLight('#fff1db',3.1);key.position.set(3,5,4);scene.add(key);
const fill=new THREE.DirectionalLight('#bed5ed',1.8);fill.position.set(-3,3,-2);scene.add(fill);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(20,20),new THREE.MeshStandardMaterial({color:'#294534',roughness:1}));
floor.rotation.x=-Math.PI/2;floor.position.y=-.006;scene.add(floor);
const grid=new THREE.GridHelper(10,40,'#7e9b78','#406148');grid.position.y=-.004;grid.material.opacity=.22;grid.material.transparent=true;scene.add(grid);
const ball=new THREE.Mesh(new THREE.SphereGeometry(1,24,16),new THREE.MeshStandardMaterial({color:'#f2ecd8',roughness:.65}));ball.visible=false;scene.add(ball);
const seam=new THREE.Mesh(new THREE.TorusGeometry(1.003,.014,5,48),new THREE.MeshBasicMaterial({color:'#344437'}));ball.add(seam);const secondSeam=seam.clone();secondSeam.rotation.y=Math.PI/2;ball.add(secondSeam);
const camera=new THREE.OrthographicCamera(-2,2,1.5,-1.5,.01,40),views={three:[3.8,2.7,4.7],front:[0,1.6,6],side:[6,1.8,.05]};
let currentView='three';
function view(name){if(!views[name])throw new Error(`Unknown view ${name}`);currentView=name;camera.position.fromArray(views[name]);camera.lookAt(0,.77,.08);for(const b of document.querySelectorAll('[data-view]'))b.setAttribute('aria-pressed',String(b.dataset.view===name));render();}
function resize(){const {width,height}=canvas.getBoundingClientRect();renderer.setSize(width,height,false);const aspect=width/height,vertical=1.24;camera.top=vertical;camera.bottom=-vertical;camera.left=-vertical*aspect;camera.right=vertical*aspect;camera.updateProjectionMatrix();render();}
new ResizeObserver(resize).observe(canvas);
const loader=new GLTFLoader(),assets=new Map(),models=new Map();
let catalog,clips=[],model,mixer,action,skeleton,current,time=0,playing=true,pending=false,selection=0,originId,modelSource,keeperTint=false;
const bones=[],temp=new THREE.Vector3();
const duration=c=>c.duration??c.durationSeconds??c.metadata?.duration;
const events=c=>c.events??c.metadata?.events??[];
const eventTime=e=>e.time??e.atSeconds??e.timeSeconds??0;
function render(){renderer.render(scene,camera);}
function play(value){playing=Boolean(value);$('play').textContent=playing?'השהיה':'ניגון';}
const runtimeURL=file=>new URL(file.startsWith('runtime/')?file:`runtime/${file}`,base).href;
function keeperKit(model){
  // Recolor only the teal cloth pixels of the existing CC0 atlas. Skin, hair,
  // shorts, shoe detail, normals and material structure are retained.
  const recolored=new Map();
  model.traverse(object=>{if(!object.isMesh)return;const transform=original=>{
    if(original.name!=='Cloth'||!original.map?.image)return original;
    if(recolored.has(original))return recolored.get(original);
    const material=original.clone(),source=original.map.image,canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height;
    const context=canvas.getContext('2d');context.drawImage(source,0,0);const data=context.getImageData(0,0,canvas.width,canvas.height);
    for(let i=0;i<data.data.length;i+=4){const r=data.data[i],g=data.data[i+1],b=data.data[i+2],value=Math.max(r,g,b);if(value>45&&g>r*1.12&&b>r*1.12){data.data[i]=Math.min(255,value*1.14);data.data[i+1]=Math.min(255,value*.88);data.data[i+2]=value*.16;}}
    context.putImageData(data,0,0);const map=new THREE.CanvasTexture(canvas);map.flipY=original.map.flipY;map.colorSpace=THREE.SRGBColorSpace;map.wrapS=original.map.wrapS;map.wrapT=original.map.wrapT;material.map=map;material.needsUpdate=true;recolored.set(original,material);return material;
  };object.material=Array.isArray(object.material)?object.material.map(transform):transform(object.material);});
}
async function loadModel(file,isKeeper=false){
  const key=`${file}:${isKeeper}`;
  if(!models.has(key))models.set(key,(async()=>{
    const asset=await loader.loadAsync(runtimeURL(file)),model=asset.scene,modelBones=[];
    if(isKeeper)keeperKit(model);
    model.traverse(object=>{if(object.isBone)modelBones.push(object);if(object.isMesh){object.frustumCulled=false;object.castShadow=false;object.receiveShadow=false;}});
    return {model,bones:modelBones,mixer:new THREE.AnimationMixer(model),skeleton:new THREE.SkeletonHelper(model),source:file,isKeeper};
  })());
  return models.get(key);
}
function activate(record){
  if(model===record.model)return;
  if(model){mixer.stopAllAction();scene.remove(model);scene.remove(skeleton);}
  model=record.model;mixer=record.mixer;skeleton=record.skeleton;modelSource=record.source;keeperTint=record.isKeeper;bones.splice(0,bones.length,...record.bones);scene.add(model);scene.add(skeleton);skeleton.visible=false;
}
function pose(){
  if(!current||!action)return;
  action.enabled=true;action.paused=true;action.time=Math.min(duration(current),Math.max(0,time));mixer.update(0);model.updateMatrixWorld(true);
  skeleton.visible=$('skeleton').checked;
  const trajectory=current.ball?.samples??current.ball?.keys??[];ball.visible=$('ball').checked&&trajectory.length>0;
  if(ball.visible){let high=trajectory.findIndex(p=>p.time>=time);if(high<0)high=trajectory.length-1;const b=trajectory[high],a=trajectory[Math.max(0,high-1)],span=b.time-a.time,u=span>0?Math.min(1,Math.max(0,(time-a.time)/span)):0;ball.position.fromArray(a.position??a.positionMeters).lerp(new THREE.Vector3().fromArray(b.position??b.positionMeters),u);ball.scale.setScalar(current.ball.radius??.11);}
  $('timeline').value=String(time);$('time').textContent=`${time.toFixed(3)} / ${duration(current).toFixed(3)} s`;
  const e=events(current).find(e=>Math.abs(eventTime(e)-time)<.035);
  $('phase').textContent=e?(names[e.type]??e.type):time>=duration(current)-.001?'סיום':time<.1?'כניסה':`פריים ${Math.round(time*30)}`;
  render();
}
function setTime(t){if(!Number.isFinite(t))throw new Error('Finite time required');play(false);time=Math.max(0,Math.min(duration(current),t));pose();return snapshot();}
async function animation(entry){
  if(!assets.has(entry.id)){const file=entry.asset??entry.animation??`clips/${entry.id}.glb`;assets.set(entry.id,loader.loadAsync(runtimeURL(file)));}
  const asset=await assets.get(entry.id);return asset.animations.find(a=>a.name===(entry.animationName??entry.id))??asset.animations[0];
}
async function select(id,{preserveOrigin=false}={}){
  const entry=clips.find(c=>c.id===id);if(!entry)throw new Error(`Unknown clip ${id}`);
  const token=++selection;pending=true;$('phase').textContent='טוען…';$('error').hidden=true;
  if(!preserveOrigin)originId=id;
  try{
    const isKeeper=(entry.role??entry.metadata?.role)==='keeper',file=entry.model??(isKeeper&&catalog.keeperModel?catalog.keeperModel:catalog.model??'reference/idle_relaxed.glb');
    const [clip,record]=await Promise.all([animation(entry),loadModel(file,isKeeper)]);if(token!==selection)return;activate(record);
    if(!clip)throw new Error('No animation tracks');
    mixer.stopAllAction();current=entry;time=0;action=mixer.clipAction(clip);action.reset();action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();action.paused=true;
    for(const button of document.querySelectorAll('.clip-button'))button.setAttribute('aria-pressed',String(button.dataset.clip===id));
    $('title').textContent=entry.label??entry.labelHe??entry.id;$('stage-title').textContent=$('title').textContent;
    $('description').textContent=descriptions[entry.id]??(entry.id.startsWith('dive_')?'דחיפה מהרגל התומכת, הושטת הידיים אל הכדור וספיגת הנחיתה על הצד.':entry.id.startsWith('getup_keeper_')?'גלגול קצר מהצד, איסוף הרגליים וקימה לעמידת שמירה.':'');
    const next=typeof entry.next==='string'?entry.next:entry.next?.id??entry.recovery;
    $('next').textContent=next?`המשך לקימה: ${clips.find(c=>c.id===next)?.label??next}`:'';
    $('sheet').href=new URL(`sheets/${id}.png`,base).href;
    $('timeline').max=String(duration(entry));$('events').replaceChildren();
    for(const e of events(entry)){
      const at=eventTime(e);if(!Number.isFinite(at)||at<0||at>duration(entry))continue;
      const button=document.createElement('button');button.type='button';button.textContent=names[e.type]??e.type;
      const label=document.createElement('small');label.textContent=`${at.toFixed(3)} s`;button.append(label);button.onclick=()=>setTime(at);$('events').append(button);
    }
    pending=false;pose();return snapshot();
  }catch(error){pending=false;play(false);$('error').hidden=false;$('error').textContent=`טעינת התנועה נכשלה: ${error.message}`;console.error(error);throw error;}
}
function snapshot(){
  const transforms=bones.map(b=>{b.getWorldPosition(temp);return {name:b.name,position:temp.toArray(),localRotation:b.quaternion.toArray(),scale:b.scale.toArray(),matrix:b.matrixWorld.elements.slice()};});
  return {id:current?.id,time,duration:current?duration(current):null,view:currentView,modelAsset:modelSource,keeperTint,playing,pending,bones:transforms,finite:transforms.every(b=>[...b.position,...b.localRotation,...b.scale,...b.matrix].every(Number.isFinite)),root:model?.getObjectByName('Root')?.position.toArray(),renderer:renderer.info.render};
}
for(const button of document.querySelectorAll('[data-view]'))button.onclick=()=>view(button.dataset.view);
$('play').onclick=()=>play(!playing);$('restart').onclick=()=>{time=0;pose();};$('timeline').oninput=()=>setTime(Number($('timeline').value));$('skeleton').onchange=pose;$('ball').onchange=pose;
let previous=performance.now();
renderer.setAnimationLoop(now=>{
  const dt=Math.min(.05,Math.max(0,(now-previous)/1000));previous=now;
  if(playing&&current&&!pending){
    const elapsed=time+dt*Number($('speed').value);
    if(elapsed>duration(current)+.08){
      const next=typeof current.next==='string'?current.next:current.next?.id??current.recovery;
      if($('chain').checked&&next)select(next,{preserveOrigin:true});
      else if(elapsed>duration(current)+.4)select(originId??current.id,{preserveOrigin:true});
      else time=elapsed;
    }else time=elapsed;
    const held=time;time=Math.min(duration(current),time);pose();time=held;
  }
  render();
});
try{
  const response=await fetch(new URL('runtime/catalog.json',base));if(!response.ok)throw new Error(`HTTP ${response.status}`);catalog=await response.json();clips=catalog.clips;
  if(!clips?.length)throw new Error('Empty motion catalog');
  activate(await loadModel(catalog.model??'reference/idle_relaxed.glb'));
  clips.forEach((entry,i)=>{const button=document.createElement('button');button.type='button';button.className='clip-button';button.dataset.clip=entry.id;button.setAttribute('aria-pressed','false');const index=document.createElement('span');index.className='clip-number';index.textContent=String(i+1).padStart(2,'0');const text=document.createElement('span'),label=document.createElement('strong'),detail=document.createElement('small');label.textContent=entry.label??entry.labelHe??entry.id;detail.textContent=`${entry.id} · ${duration(entry).toFixed(2)} s`;text.append(label,detail);button.append(index,text);button.onclick=()=>select(entry.id);$('clips').append(button);});
  window.__review={select,setTime,view,snapshot,play,clips:clips.map(c=>({id:c.id,label:c.label,duration:duration(c),role:c.role,events:events(c)})),ready:true};
  resize();view('three');await select(clips[0].id);
}catch(error){play(false);$('error').hidden=false;$('error').textContent=`לא ניתן לפתוח את התצוגה. ${error.message}`;console.error(error);}
