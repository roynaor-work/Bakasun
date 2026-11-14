/** CC0-1.0. One WebGL context for synchronized before/after review. */
import * as T from '../../vendor/three.module.js';
import {GLTFLoader} from '../../vendor/GLTFLoader.js';
import {clone} from '../../vendor/SkeletonUtils.js';
import {decorateAthlete,DEFAULT_COLORS} from './runtime/appearance.mjs';
import {loadMotionCatalog} from './runtime/motion.mjs';

const $=id=>document.getElementById(id);
const definitions=[
  {id:'full',title:'01 / הדמות בתנועה',note:'אותו קליפ ואותו זמן בשתי הגרסאות',caption:'בחרו תנועה מכל הספריות. הדמות המלאה מנגנת גם כשחלוניות הפרטים מציגות תנוחת בדיקה.'},
  {id:'hands',title:'02 / אגודל ושתי קבוצות אצבעות',note:'צורה בלבד · ללא עצמות נוספות',caption:'חריץ אמיתי בצללית מפריד את האגודל; חריץ נוסף מחלק את האצבעות לשתי קבוצות. כף היד היא מעטפת אחת.'},
  {id:'gloves',title:'03 / כפפות שוער',note:'אותה גאומטריה · מורף נפח',caption:'נפח מוגדל, צבע משני ופס בשורש כף היד. צבע הכפפה מתעדכן עם הצבע המשני בסרגל.'},
  {id:'back',title:'04 / מספר על הגב',note:'0–99 · צבע הפסים',caption:'ספרות בשיידר על החולצה. הסימן נצמד לאותו משטח מונפש וללא תוספת משולשים.'},
  {id:'shorts',title:'05 / מספר על המכנסיים',note:'אותו מספר · אותו צבע',caption:'המספר מופיע גם על קדמת המכנסיים; ספרה בודדת ממורכזת ו־0 הוא מספר תקין.'},
  {id:'crest',title:'06 / מקום לסמל קבוצה',note:'מסכת מגן גיאומטרית',caption:'מגן חלול בחזה, ללא מיתוג או סמל של מועדון אמיתי.'},
];
const slots=[];
for(const spec of definitions){
  const section=document.createElement('section');section.className='comparison';section.id=spec.id;
  const heading=document.createElement('div');heading.className='heading';
  const h=document.createElement('h2');h.textContent=spec.title;const small=document.createElement('small');small.textContent=spec.note;heading.append(h,small);
  const pair=document.createElement('div');pair.className='pair';
  for(const after of [false,true]){
    const el=document.createElement('div');el.className='view '+(after?'after':'before');el.dataset.panel=spec.id+'-'+(after?'after':'before');
    const tag=document.createElement('span');tag.className='tag';tag.textContent=after?'אחרי · v2':'לפני · גוף v22';el.append(tag);pair.append(el);
    slots.push({spec,after,el});
  }
  const cap=document.createElement('p');cap.className='caption';cap.textContent=spec.caption;section.append(heading,pair,cap);$('comparisons').append(section);
}
const canvas=$('stage'),renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
const loader=new GLTFLoader(),sources=new Map();
const manifest=await (await fetch('body-manifest.json')).json();
let clips,currentClip,playing=true,time=0,last=performance.now(),activeBody='',building=false,dirty=true;
const colors=()=>({...DEFAULT_COLORS,uniform_primary:$('primary').value,uniform_secondary:$('secondary').value,uniform_trim:$('trim').value});
async function loadSource(body,after){
  const key=body+after;
  if(!sources.has(key))sources.set(key,loader.loadAsync(after?`runtime/models/${body}.glb`:`../../assets/athlete-body-v22/models/${body}.glb`));
  return sources.get(key);
}
function paintBefore(root){
  const palette=Object.keys(DEFAULT_COLORS).map(n=>new T.Color(colors()[n]));
  root.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;const g=mesh.geometry,c=g.attributes.color,r=g.attributes._region;
    for(let i=0;i<c.count;i++){const col=palette[r.getX(i)];c.setXYZ(i,col.r,col.g,col.b);}c.needsUpdate=true;
    const sport=$('sport').value;
    for(const name of ['basketball','hockey','tennis'])mesh.morphTargetInfluences[mesh.morphTargetDictionary[name]]=sport===name?1:0;
  });
}
function appearance(slot){
  if(slot.after)slot.appearance.update({number:Number($('number').value),colors:colors(),sport:$('sport').value,
    gloves:slot.spec.id==='gloves'||(slot.spec.id==='full'&&$('keeper').checked),
    numbers:['full','back','shorts'].includes(slot.spec.id),crest:['full','crest'].includes(slot.spec.id)});
  else paintBefore(slot.root);
  dirty=true;
}
async function build(body){
  building=true;$('body').disabled=true;
  try{
    const data=await Promise.all([loadSource(body,false),loadSource(body,true)]);
    for(const slot of slots){
      slot.mixer?.stopAllAction();slot.mixer?.uncacheRoot(slot.root);slot.appearance?.dispose();
      if(slot.root&&!slot.after)slot.root.traverse(m=>{if(m.isMesh){m.geometry.dispose();m.material.dispose();}});
      slot.root?.traverse(m=>m.skeleton?.dispose());
      const root=clone(data[slot.after?1:0].scene);slot.root=root;slot.bones={};
      root.traverse(m=>{if(m.isBone)slot.bones[m.name]=m;});
      if(slot.after)slot.appearance=decorateAthlete(T,root,{bodyId:body});
      else root.traverse(m=>{if(m.isMesh){m.geometry=m.geometry.clone();m.material=m.material.clone();m.frustumCulled=false;}});
      const scene=new T.Scene();scene.background=new T.Color('#cfd7d2');scene.add(root);
      scene.add(new T.HemisphereLight(0xffffff,0x657b73,2.1));
      const sun=new T.DirectionalLight(0xfff1d7,2.7);sun.position.set(3,5,4);scene.add(sun);
      const fill=new T.DirectionalLight(0xc8e3ff,1.5);fill.position.set(-3,2,-4);scene.add(fill);
      slot.scene=scene;slot.camera=new T.PerspectiveCamera(28,1,.01,30);slot.mixer=new T.AnimationMixer(root);
      slot.rest={};for(const [n,b] of Object.entries(slot.bones))slot.rest[n]={p:b.position.clone(),q:b.quaternion.clone()};
      appearance(slot);
    }
    activeBody=body;setClip(currentClip?.name||'soccer-v9/run');
    const m=manifest.models.find(m=>m.id===body);
    $('status').textContent=`מוכן · ${clips.size} קליפים · ${m.trianglesBefore.toLocaleString()} ← ${m.trianglesAfter.toLocaleString()} משולשים · שלד זהה ב־18 עצמות`;
  }finally{building=false;$('body').disabled=false;}
}
function setClip(id){
  currentClip=clips.get(id)||clips.values().next().value;$('clip').value=currentClip.name;time=0;
  for(const slot of slots){slot.mixer.stopAllAction();slot.action=slot.mixer.clipAction(currentClip);slot.action.setLoop(T.LoopOnce,1);slot.action.clampWhenFinished=true;slot.action.play();}
  dirty=true;
}
function pose(slot,at){
  if(slot.spec.id==='full'||$('detailMotion').checked){slot.action.time=at;slot.mixer.update(0);}
  else{
    for(const [name,bone] of Object.entries(slot.bones)){bone.position.copy(slot.rest[name].p);bone.quaternion.copy(slot.rest[name].q);}
    if(['hands','gloves'].includes(slot.spec.id)){slot.bones.LeftArm.rotation.z=.65;slot.bones.RightArm.rotation.z=-.65;}
  }
  slot.root.updateMatrixWorld(true);slot.root.traverse(o=>o.skeleton?.update());
}
function frame(slot,width,height){
  const target=new T.Vector3(),dir=new T.Vector3(),kind=slot.spec.id;
  let span;
  if(['hands','gloves'].includes(kind)){
    slot.bones.LeftHand.localToWorld(target.set(-.016,-.075,.005));dir.set(.1,.1,1);span=.255;
  }else if(kind==='back'){
    slot.bones.Chest.getWorldPosition(target);target.y-=.12;dir.set(-.10,.08,-1);span=.66;
  }else if(kind==='shorts'){
    slot.bones.Hips.getWorldPosition(target);target.y-=.13;dir.set(.06,.02,1);span=.39;
  }else if(kind==='crest'){
    slot.bones.Chest.localToWorld(target.set(.055,-.025,.025));dir.set(.06,.04,1);span=.31;
  }else{
    slot.bones.Hips.getWorldPosition(target);target.y+=.01;dir.set(.30,.09,1);span=2.30;
  }
  const camera=slot.camera;camera.aspect=width/height;
  const d=span/(2*Math.tan(T.MathUtils.degToRad(camera.fov/2)))*Math.max(1,1/camera.aspect);
  camera.position.copy(target).addScaledVector(dir.normalize(),d);camera.lookAt(target);camera.updateProjectionMatrix();
}
function render(at=time){
  const w=innerWidth,h=innerHeight;
  if(canvas.width!==Math.round(w*renderer.getPixelRatio())||canvas.height!==Math.round(h*renderer.getPixelRatio()))renderer.setSize(w,h,false);
  renderer.setScissorTest(false);renderer.setClearColor(0x101a1b,0);renderer.clear();renderer.setScissorTest(true);
  for(const slot of slots){
    if(!slot.scene)continue;
    const rect=slot.el.getBoundingClientRect();if(rect.bottom<0||rect.top>h)continue;
    pose(slot,at);frame(slot,rect.width,rect.height);
    renderer.setViewport(rect.left,h-rect.bottom,rect.width,rect.height);
    renderer.setScissor(rect.left,h-rect.bottom,rect.width,rect.height);renderer.render(slot.scene,slot.camera);
  }
  $('time').value=currentClip?at/currentClip.duration:0;$('seconds').textContent=at.toFixed(2)+' שנ׳';
  dirty=false;
}
function fail(error){$('status').textContent='התצוגה לא נטענה: '+error.message;console.error(error);}
try{
  clips=await loadMotionCatalog(T);const groups=new Map();$('clip').replaceChildren();
  for(const id of clips.keys()){
    const groupName=id.split('/')[0];let group=groups.get(groupName);
    if(!group){group=document.createElement('optgroup');group.label=groupName;$('clip').append(group);groups.set(groupName,group);}
    const option=document.createElement('option');option.value=id;option.textContent=id.slice(groupName.length+1);group.append(option);
  }
  await build('soccer');window.athletePreview={slots,clips,renderer,manifest,setClip,build,render,pose,
    get body(){return activeBody;},get time(){return time;},
    setTime(t){playing=false;time=Math.max(0,Math.min(currentClip.duration,t));$('play').textContent='ניגון';render();},
    setAppearance(spec){for(const slot of slots)if(slot.after)slot.appearance.update(spec);render();}};
  window.previewReady=true;
}catch(error){fail(error);}
$('body').addEventListener('change',()=>build($('body').value).catch(fail));
$('clip').addEventListener('change',()=>setClip($('clip').value));
for(const id of ['primary','secondary','trim','sport','keeper'])$(id).addEventListener('input',()=>{for(const slot of slots)appearance(slot);});
$('number').addEventListener('input',()=>{const n=Number($('number').value);if(!Number.isInteger(n)||n<0||n>99){$('number').setCustomValidity('בחרו מספר שלם בין 0 ל־99');return;}$('number').setCustomValidity('');for(const slot of slots)appearance(slot);});
$('play').addEventListener('click',()=>{playing=!playing;$('play').textContent=playing?'עצירה':'ניגון';});
$('time').addEventListener('input',()=>{playing=false;$('play').textContent='ניגון';time=Number($('time').value)*currentClip.duration;dirty=true;});
$('detailMotion').addEventListener('input',()=>{dirty=true;});
addEventListener('scroll',()=>{dirty=true;},{passive:true});
addEventListener('resize',()=>{dirty=true;});
function tick(now){const dt=Math.min(.05,(now-last)/1000);last=now;if(currentClip&&!building){if(playing)time=(time+dt)%currentClip.duration;if(playing||dirty)render();}requestAnimationFrame(tick);}
requestAnimationFrame(tick);
