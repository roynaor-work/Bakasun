// SPDX-License-Identifier: CC0-1.0
// One shared AnimationMixer and absolute clip time keep every actor synchronized.
import * as THREE from './vendor/three.module.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';

const $=id=>document.getElementById(id),stage=$('stage');
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.18;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.domElement.setAttribute('aria-hidden','true');stage.prepend(renderer.domElement);
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(34,1,.05,160);
scene.add(new THREE.HemisphereLight(0xc9efff,0x193d32,2.2));
const key=new THREE.DirectionalLight(0xffebc6,3.3);key.position.set(3,7,5);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-9;key.shadow.camera.right=9;key.shadow.camera.top=9;key.shadow.camera.bottom=-9;key.shadow.normalBias=.018;key.shadow.bias=-.0002;scene.add(key);scene.add(key.target);
const rim=new THREE.DirectionalLight(0x75e7d2,2.2);rim.position.set(-4,4,-5);scene.add(rim);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(160,160),new THREE.MeshStandardMaterial({color:0x183b35,roughness:.95,metalness:0}));floor.rotation.x=-Math.PI/2;floor.position.y=-.008;floor.receiveShadow=true;scene.add(floor);
const pitch=new THREE.Group();scene.add(pitch);
const lineMat=new THREE.LineBasicMaterial({color:0x63887a,transparent:true,opacity:.27});
function line(points){const l=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p))),lineMat);pitch.add(l);return l;}
for(let i=-12;i<=12;i+=2){line([[-30,.001,i],[30,.001,i]]);line([[i,.002,-30],[i,.002,30]]);}
const circle=[];for(let n=0;n<=96;n++){const a=n/96*Math.PI*2;circle.push([Math.cos(a)*2.1,.004,Math.sin(a)*2.1]);}line(circle);
const contactGroup=new THREE.Group();scene.add(contactGroup);
const contactGeometry=new THREE.SphereGeometry(.027,10,7),contactMaterial=new THREE.MeshBasicMaterial({color:0xffd77e});
const loader=new GLTFLoader(),cache=new Map();
let catalog,current,model,mixer,action,time=0,playing=true,speed=1,view='three',request=0,last=performance.now(),maxSpan=1.8,maxHeight=2.0,centerHeight=.9;
const center=new THREE.Vector3(),previousCenter=new THREE.Vector3();
const eventLabels={prepare:'הכנה',approach:'התקרבות',contact:'מגע',embrace:'חיבוק',jump:'ניתור',takeoff:'ניתור',apex:'שיא הקפיצה',land:'נחיתה',landing:'נחיתה',release:'שחרור',recover:'התאוששות',finish:'סיום',hold:'החזקה',lift:'הרמה',raise:'הרמה',lower:'הורדה',start:'פתיחה',celebrate:'חגיגה',bow:'קידה',salute:'הצדעה',slide:'החלקה',trophy_collect:'איסוף הגביע',trophy_raise:'הרמת הגביע',trophy_hold:'החזקת הגביע',trophy_lower:'הורדת הגביע',chest_contact:'מגע חזה',circle_lock:'סגירת המעגל',crowd_wave:'נפנוף לקהל',dance_finish:'סיום הריקוד',dance_start:'תחילת הריקוד',inverted:'באוויר',knees_down:'ירידה לברכיים',lap_salute:'הצדעה בריצה',mount:'עלייה על הגב',present:'הצגת הגביע',receive:'קבלת הגביע',slide_stop:'עצירת ההחלקה',stand:'קימה'};
const label=e=>e.label??eventLabels[e.type]??e.type.replaceAll('_',' ');
function getModel(id){if(!cache.has(id)){const c=catalog.clips.find(c=>c.id===id);cache.set(id,loader.loadAsync(c.asset));}return cache.get(id);}
function actorRoots(){return(current?.actors??[]).map(a=>model?.getObjectByName(a.rootNode??`${a.id}_Root`)).filter(Boolean);}
function actorBone(actor,bone){return model?.getObjectByName(`${actor}_${bone}`)??model?.getObjectByName(`${actor}/${bone}`);}
function currentBounds(){
  const box=new THREE.Box3();
  model?.traverse(o=>{if(o.isBone||/_(Root|Hips|Head|Hand|Foot)$/.test(o.name))box.expandByPoint(o.getWorldPosition(new THREE.Vector3()));});
  model?.traverse(o=>{if(o.isMesh&&!o.isSkinnedMesh){o.geometry.computeBoundingBox();box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));}});
  if(box.isEmpty())box.setFromCenterAndSize(new THREE.Vector3(0,.8,0),new THREE.Vector3(1,1.7,1));
  return box;
}
function follow(){
  if(!model)return;
  const bounds=currentBounds();bounds.getCenter(center);center.y=centerHeight;
  const size=bounds.getSize(new THREE.Vector3()),spread=Math.max(size.x,size.z,1.25);
  const aspect=Math.max(.3,camera.aspect),halfHeight=Math.max(maxHeight*.66,(maxSpan+.9)/(2*aspect));
  const distance=halfHeight/Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
  const directions={three:[.60,.37,1],front:[0,.18,1],side:[1,.20,0],back:[0,.20,-1]};
  const direction=new THREE.Vector3(...directions[view]).normalize();
  camera.position.copy(center).addScaledVector(direction,distance*1.12);camera.lookAt(center.x,center.y+.11,center.z);
  key.position.set(center.x+3,7,center.z+5);key.target.position.set(center.x,0,center.z);rim.position.set(center.x-4,4,center.z-5);
}
function contactPoint(spec){
  const bone=spec.node?model?.getObjectByName(spec.node):actorBone(spec.actor,spec.bone);if(!bone)return null;
  return bone.localToWorld(new THREE.Vector3(...(spec.local??[0,0,0])));
}
function updateContacts(){
  while(contactGroup.children.length){const x=contactGroup.children[0];contactGroup.remove(x);if(x.isLine){x.geometry.dispose();x.material.dispose();}}
  const active=(current.contacts??[]).filter(c=>time>=c.start-1e-6&&time<=c.end+1e-6);
  for(const c of active){
    for(const spec of [c.a,c.b].filter(Boolean)){const p=contactPoint(spec);if(p){const dot=new THREE.Mesh(contactGeometry,contactMaterial);dot.position.copy(p);contactGroup.add(dot);}}
    if(c.a&&c.b){const a=contactPoint(c.a),b=contactPoint(c.b);if(a&&b){const l=new THREE.Line(new THREE.BufferGeometry().setFromPoints([a,b]),new THREE.LineBasicMaterial({color:0xffcf78}));contactGroup.add(l);}}
  }
  $('contact-state').classList.toggle('active',!!active.length);
  $('contact-state').textContent=active.length?`מגע מתואם · ${active.length} קשרים`:(current.actors.length>1?`${current.actors.length} משתתפים · ציר זמן משותף`:'ציר זמן משותף');
}
function render(){if(!current||!model)return;action.paused=false;mixer.setTime(Math.min(time,current.duration));model.updateMatrixWorld(true);follow();updateContacts();renderer.render(scene,camera);$('timeline').value=time;$('time').value=`${time.toFixed(2)} / ${current.duration.toFixed(2)} s`;const ev=[...(current.events??[])].filter(e=>e.time<=time+.0001).at(-1);$('phase').textContent=ev?label(ev):'הכנה';}
function projectedBounds(){
  const out={minX:1,minY:1,maxX:-1,maxY:-1,vertices:0};const v=new THREE.Vector3();
  model?.traverse(o=>{if(!o.isMesh||!o.visible)return;if(o.isSkinnedMesh)o.skeleton.update();const a=o.geometry.attributes.position;for(let i=0;i<a.count;i++){o.getVertexPosition(i,v);o.localToWorld(v);v.project(camera);out.minX=Math.min(out.minX,v.x);out.minY=Math.min(out.minY,v.y);out.maxX=Math.max(out.maxX,v.x);out.maxY=Math.max(out.maxY,v.y);out.vertices++;}});
  return {...out,inside:out.minX>=-1&&out.maxX<=1&&out.minY>=-1&&out.maxY<=1};
}
function resize(){const r=stage.getBoundingClientRect();renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();render();}
new ResizeObserver(resize).observe(stage);
async function load(id){
  const token=++request,c=catalog.clips.find(c=>c.id===id);if(!c)throw new Error(`Unknown clip ${id}`);
  $('status').textContent='טוען חגיגה…';
  const gltf=await getModel(id);if(token!==request)return;
  if(model){scene.remove(model);mixer.stopAllAction();mixer.uncacheRoot(model);}
  current=c;model=gltf.scene;scene.add(model);mixer=new THREE.AnimationMixer(model);action=mixer.clipAction(gltf.animations[0]);action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();
  model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=false;o.frustumCulled=false;}});
  // Fit the actors' formation, excluding world travel, throughout the clip.
  maxSpan=1.8;let minY=0,maxY=1.8;for(let i=0;i<=20;i++){action.paused=false;mixer.setTime(c.duration*i/20);model.updateMatrixWorld(true);const box=currentBounds(),size=box.getSize(new THREE.Vector3());maxSpan=Math.max(maxSpan,size.x,size.z);minY=Math.min(minY,box.min.y);maxY=Math.max(maxY,box.max.y+.18);}maxHeight=maxY-minY;centerHeight=(maxY+minY)/2;
  time=0;action.reset().play();mixer.setTime(0);model.updateMatrixWorld(true);
  const index=catalog.clips.indexOf(c);$('clip-index').textContent=`${String(index+1).padStart(2,'0')} / ${catalog.clips.length}`;$('clip-title').textContent=c.label??c.title??c.id;
  $('clip-meta').textContent=`${c.actors.length} ${c.actors.length===1?'משתתף':'משתתפים'} · ${c.duration.toFixed(1)} שניות · ${c.frameCount} פריימים`;
  $('timeline').max=c.duration;$('asset-link').href=c.asset;$('sheet-link').href=`sheets/${c.id}.webp`;
  for(const b of document.querySelectorAll('.clip-button'))b.setAttribute('aria-current',String(b.dataset.clip===id));
  $('events').replaceChildren();$('markers').replaceChildren();
  for(const e of c.events??[]){const button=document.createElement('button');button.textContent=`${label(e)} ${e.time.toFixed(2)}`;button.addEventListener('click',()=>seek(e.time));$('events').append(button);const marker=document.createElement('i');marker.className='marker';marker.style.left=`${e.time/c.duration*100}%`;$('markers').append(marker);}
  $('status').textContent='';render();return c;
}
function seek(t){time=Math.max(0,Math.min(current.duration,t));playing=false;updatePlay();render();}
function updatePlay(){$('play').innerHTML=playing?'<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="M3 2h4v12H3zm6 0h4v12H9z"/></svg>':'<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="M4 2v12l10-6z"/></svg>';$('play').setAttribute('aria-label',playing?'עצירה':'ניגון');}
function setView(v){if(!['three','front','side','back'].includes(v))return;view=v;for(const b of document.querySelectorAll('[data-view]'))b.setAttribute('aria-pressed',String(b.dataset.view===v));render();}
$('play').addEventListener('click',()=>{if(!current)return;if(!playing&&time>=current.duration)time=0;playing=!playing;updatePlay();});
$('restart').addEventListener('click',()=>{if(current){time=0;render();}});
$('timeline').addEventListener('input',()=>seek(Number($('timeline').value)));
$('speed').addEventListener('change',()=>speed=Number($('speed').value));
for(const b of document.querySelectorAll('[data-view]'))b.addEventListener('click',()=>setView(b.dataset.view));
document.addEventListener('keydown',e=>{if(e.code==='Space'&&!/INPUT|BUTTON|SELECT/.test(document.activeElement.tagName)){e.preventDefault();$('play').click();}});
function animate(now){requestAnimationFrame(animate);const dt=Math.min((now-last)/1000,.08);last=now;if(playing&&current&&model){time+=dt*speed;if(time>current.duration)time=0;render();}}requestAnimationFrame(animate);
try{
  const response=await fetch('./catalog.json');if(!response.ok)throw Error('catalog.json unavailable');catalog=await response.json();$('clip-count').textContent=catalog.clips.length;
  for(const [i,c]of catalog.clips.entries()){const button=document.createElement('button');button.className='clip-button';button.dataset.clip=c.id;button.setAttribute('aria-current','false');const n=document.createElement('span');n.className='clip-num';n.textContent=String(i+1).padStart(2,'0');const name=document.createElement('span');name.className='clip-name';name.textContent=c.label??c.title??c.id;const actors=document.createElement('span');actors.className='clip-actors';actors.textContent=c.actors.length;button.append(n,name,actors);button.addEventListener('click',()=>load(c.id).catch(fail));$('clips').append(button);}
  window.celebrationPreview={load,seek,setView,pause(){playing=false;updatePlay();},play(){playing=true;updatePlay();},render,get catalog(){return catalog;},get current(){return current;},get time(){return time;},get playing(){return playing;},get mixerTime(){return mixer?.time;},get model(){return model;},get renderer(){return renderer;},projectedBounds,bounds(){return currentBounds().min.toArray().concat(currentBounds().max.toArray());}};
  resize();await load(new URLSearchParams(location.search).get('clip')??catalog.clips[0].id);updatePlay();
}catch(error){fail(error);}
function fail(error){console.error(error);$('status').textContent=location.protocol==='file:'?'לתצוגה ללא אינטרנט: חלצו את החבילה והפעילו את start-preview.py.':'לא ניתן לטעון את החגיגה. בדקו שקובצי החבילה נמצאים יחד.';}
