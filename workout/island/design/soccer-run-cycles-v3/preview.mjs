/** Original native-GLB preview. SPDX-License-Identifier: CC0-1.0.
 * The optional world scenario belongs to the preview actor, never the GLB Root.
 */
import * as THREE from '../soccer-motion-v8/runtime/vendor/three.module.js';
import {GLTFLoader} from '../soccer-motion-v8/runtime/vendor/GLTFLoader.js';

const $=id=>document.getElementById(id);
const descriptions={
  idle_relaxed:['עמידה רגועה','נשימה קלה ומשקל מאוזן.'],
  jog:['ג׳וג','צעדים קלים ותנופת ידיים נגדית.'],
  run:['ריצה','קצב המשחק, מרפקים כפופים ותמיכה יציבה.'],
  sprint:['ספרינט','צעדים מהירים, דחיפה ונטייה קדימה.'],
  referee_run:['ריצת שופט','ריצה בטווח 4–6 מ׳/ש׳.'],
  keeper_ready_side_steps:['מוכנות שוער','צעדי צד קצרים, ברכיים רכות וידיים מוכנות.'],
  keeper_catch_chest:['תפיסה בגובה החזה','שתי ידיים אל הכדור וספיגה אל הגוף.'],
  keeper_catch_head:['תפיסה בגובה הראש','מבט אל הכדור ואיסוף נשלט בשתי ידיים.'],
};
const durationOf=c=>c.durationSeconds??c.duration??1;
const rateOf=c=>c.nativeRate??120;
const labelOf=c=>descriptions[c.id]?.[0]??c.label??c.id;
const detailOf=c=>descriptions[c.id]?.[1]??c.notes??(c.category==='transition'?'מעבר רציף בין עמידה לריצה.':'תנועה מקורית על השלד הקנוני.');
const eventNames={footstrike:'מגע רגל',toeoff:'שחרור תמיכה',contact:'תפיסת כדור',catch:'תפיסת כדור',release:'שחרור כדור',entry:'תחילת גשר',exit:'סיום גשר',land:'נחיתה'};
const eventTime=e=>e.timeSeconds??e.atSeconds??e.time??(e.frame??0)/120;
const eventType=e=>e.type??e.name??e.event;
function sampleTrack(keys,time,property){
  if(!keys?.length)return null;
  const at=k=>k.time??k.t??0;
  let lo=0,hi=keys.length-1;
  while(lo<hi){const mid=(lo+hi)>>1;if(at(keys[mid])<time)lo=mid+1;else hi=mid;}
  const b=keys[lo],a=keys[Math.max(0,lo-1)],span=at(b)-at(a),u=span>0?THREE.MathUtils.clamp((time-at(a))/span,0,1):0;
  const av=a[property],bv=b[property];
  if(av===undefined||bv===undefined)return null;
  return Array.isArray(av)?av.map((v,i)=>v+(bv[i]-v)*u):av+(bv-av)*u;
}

const canvas=$('stage');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.12;
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const scene=new THREE.Scene();scene.background=new THREE.Color('#243d2b');scene.fog=new THREE.Fog('#243d2b',8,22);
const camera=new THREE.PerspectiveCamera(33,1,.02,60);
const views={three:[2.6,1.6,3.2],front:[0,1.40,4.2],side:[4.1,1.40,.16]};
let view='three';
function setView(name){if(!views[name])throw Error(`Unknown view ${name}`);view=name;for(const button of document.querySelectorAll('[data-view]'))button.setAttribute('aria-pressed',String(button.dataset.view===name));updateCamera();render();}
scene.add(new THREE.HemisphereLight('#fff6dc','#435b3d',2.0));
const key=new THREE.DirectionalLight('#fff2d8',2.8);key.position.set(3,6,4);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-3;key.shadow.camera.right=3;key.shadow.camera.top=3;key.shadow.camera.bottom=-3;key.shadow.camera.near=.5;key.shadow.camera.far=15;key.shadow.normalBias=.015;key.shadow.bias=-.0002;scene.add(key);scene.add(key.target);
const rim=new THREE.DirectionalLight('#d3e9c8',1.6);rim.position.set(-3,3,-2);scene.add(rim);
const ground=new THREE.Mesh(new THREE.PlaneGeometry(160,160),new THREE.MeshStandardMaterial({color:'#33533a',roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-.012;ground.receiveShadow=true;scene.add(ground);
const grid=new THREE.GridHelper(100,200,'#8a9a6d','#5c7550');grid.position.y=-.010;grid.material.transparent=true;grid.material.opacity=.22;scene.add(grid);
const actor=new THREE.Group();scene.add(actor);
const ball=new THREE.Mesh(new THREE.SphereGeometry(.105,24,16),new THREE.MeshStandardMaterial({color:'#ecebdd',roughness:.65}));ball.castShadow=true;actor.add(ball);
for(const rotation of[[0,0,0],[Math.PI/2,0,0],[0,Math.PI/2,0]]){const seam=new THREE.Mesh(new THREE.TorusGeometry(.1054,.0018,4,48),new THREE.MeshBasicMaterial({color:'#354638'}));seam.rotation.set(...rotation);ball.add(seam);}
const soleLocal=new THREE.Vector3(0,-.08,0),worldPosition=new THREE.Vector3(),worldRotation=new THREE.Quaternion();
const probes=['LeftFoot','RightFoot'].map((name,i)=>{
  const color=i===0?'#e0ed9d':'#a7d9e2';
  const marker=new THREE.Mesh(new THREE.SphereGeometry(.013,10,8),new THREE.MeshBasicMaterial({color,depthTest:false}));marker.renderOrder=8;
  const anchor=new THREE.Mesh(new THREE.RingGeometry(.026,.043,30),new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,depthTest:false}));anchor.rotation.x=-Math.PI/2;anchor.renderOrder=7;
  const geometry=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]);
  const line=new THREE.Line(geometry,new THREE.LineBasicMaterial({color,depthTest:false}));line.renderOrder=8;
  scene.add(marker,anchor,line);return{name,marker,anchor,line};
});
const loader=new GLTFLoader(),catalogURL=new URL('./catalog.json',import.meta.url);
let clips=[],current,model,mixer,action,skeleton,time=0,lap=0,playing=true,ready=false,sequence=0,anchors=[];
function actorScenario(t,cycle=lap){
  const samples=current?.referenceTravel?.samples??[],position=sampleTrack(samples,t,'position')??[0,0,0],yaw=sampleTrack(samples,t,'yawRadians')??0;
  if(current?.loop&&samples.length>1&&cycle){const first=samples[0].position??[0,0,0],last=samples.at(-1).position??first;for(let i=0;i<3;i++)position[i]+=(last[i]-first[i])*cycle;}
  return{position,yaw};
}
function applyNative(t){action.time=THREE.MathUtils.clamp(t,0,action.getClip().duration);action.paused=true;mixer.update(0);model.updateMatrixWorld(true);}
function setActorScenario(t){const {position,yaw}=actorScenario(t);actor.position.set(0,0,0);actor.rotation.y=0;if($('travel').checked){actor.position.fromArray(position);actor.rotation.y=yaw;}actor.updateMatrixWorld(true);}
function getSole(name){const bone=model.getObjectByName(name);if(!bone)return null;bone.getWorldPosition(worldPosition);bone.getWorldQuaternion(worldRotation);return worldPosition.clone().add(soleLocal.clone().applyQuaternion(worldRotation));}
function computeAnchors(){
  anchors=[];const savedLap=lap;lap=0;
  for(const window of current.supports??[]){const start=window.startSeconds??window.start,end=window.endSeconds??window.end;if(!Number.isFinite(start)||!Number.isFinite(end))continue;applyNative(start);setActorScenario(start);const point=getSole(window.bone);if(point)anchors.push({...window,start,end,point:point.toArray()});}
  lap=savedLap;
}
function updateCamera(){
  const origin=actor.position,offset=views[view];camera.position.set(origin.x+offset[0],offset[1],origin.z+offset[2]);camera.lookAt(origin.x,.83,origin.z+.045);
  ground.position.x=origin.x;ground.position.z=origin.z;
  grid.position.x=Math.floor(origin.x/5)*5;grid.position.z=Math.floor(origin.z/5)*5;
  key.position.set(origin.x+3,6,origin.z+4);key.target.position.set(origin.x,.6,origin.z);key.target.updateMatrixWorld();
}
function updatePose(){
  if(!ready)return;
  applyNative(time);setActorScenario(time);updateCamera();
  skeleton.visible=$('skeleton').checked;
  const duration=durationOf(current),nativeRate=rateOf(current),frame=Math.round(time*nativeRate),supports=[];
  for(const probe of probes){
    const point=getSole(probe.name),support=anchors.find(w=>w.bone===probe.name&&time>=w.start-1e-7&&time<=w.end+1e-7),visible=$('soles').checked&&!!point;
    probe.marker.visible=visible;probe.anchor.visible=visible&&!!support&&$('travel').checked;probe.line.visible=probe.anchor.visible;
    if(point)probe.marker.position.copy(point);
    if(support&&point){
      supports.push(probe.name==='LeftFoot'?'שמאל':'ימין');
      const anchor=new THREE.Vector3(...support.point);if(current.loop&&lap){const samples=current.referenceTravel?.samples??[];if(samples.length>1){const first=samples[0].position??[0,0,0],last=samples.at(-1).position??first;anchor.add(new THREE.Vector3(...last.map((v,i)=>(v-first[i])*lap)));}}
      probe.anchor.position.copy(anchor);probe.anchor.position.y=.002;
      const p=probe.line.geometry.attributes.position;p.setXYZ(0,point.x,point.y,point.z);p.setXYZ(1,anchor.x,anchor.y,anchor.z);p.needsUpdate=true;
    }
  }
  const ballPosition=sampleTrack(current.ball?.samples??current.ball?.keys??[],time,'position');ball.visible=Array.isArray(ballPosition);
  if(ball.visible){ball.position.fromArray(ballPosition);ball.scale.setScalar((current.ball?.radius??.105)/.105);}
  $('scrub').value=String(frame);$('time').textContent=`${time.toFixed(3)} / ${duration.toFixed(3)}`;$('frame').textContent=`${frame} / ${Math.round(duration*nativeRate)} · ${nativeRate} הרץ`;
  const event=(current.events??[]).find(e=>Math.abs(eventTime(e)-time)<.025);
  $('phase').textContent=event?(eventNames[eventType(event)]??'אירוע תנועה'):(current.loop?'תנועה מחזורית':'תנועה חד־פעמית');
  $('support-state').textContent=supports.length?`תמיכה: ${supports.join(' + ')}`:(current.locomotion?'שלב מעוף':'בין תמיכות');
}
function render(){renderer.render(scene,camera);}
function setPlaying(value){playing=!!value;$('play').textContent=playing?'Ⅱ':'▷';$('play').setAttribute('aria-label',playing?'השהיה':'ניגון');}
function seek(seconds){if(!ready)throw Error('Clip is loading');time=THREE.MathUtils.clamp(seconds,0,durationOf(current));lap=0;setPlaying(false);updatePose();render();}
function disposeAsset(root){root.traverse(o=>{if(!o.isMesh)return;o.geometry.dispose();for(const material of Array.isArray(o.material)?o.material:[o.material]){for(const v of Object.values(material))if(v?.isTexture)v.dispose();material.dispose();}});}
function disposeModel(){if(!model)return;mixer.stopAllAction();mixer.uncacheRoot(model);actor.remove(model);scene.remove(skeleton);skeleton.geometry.dispose();skeleton.material.dispose();disposeAsset(model);model=undefined;}
async function select(id){
  const c=typeof id==='string'?clips.find(c=>c.id===id):id;if(!c)throw Error(`Unknown clip ${id}`);
  const token=++sequence;ready=false;current=c;time=0;lap=0;anchors=[];$('error').hidden=true;$('phase').textContent='טוען…';
  $('title').textContent=labelOf(c);$('description').textContent=detailOf(c);
  const speed=c.speedMps??0,range=c.speedRangeMps??c.speedRange;
  $('native-speed').textContent=Array.isArray(range)?`${range[0]}–${range[1]} מ׳/ש׳`:(speed>0?`${speed.toFixed(1)} מ׳/ש׳`:'עמידה');
  $('scrub').max=String(Math.round(durationOf(c)*rateOf(c)));$('loop-label').textContent=c.loop?'מחזור רציף':'תנועה חד־פעמית';
  for(const button of document.querySelectorAll('.clip-button'))button.setAttribute('aria-pressed',String(button.dataset.clip===c.id));
  try{
    const asset=await loader.loadAsync(new URL(c.asset??c.file??`clips/${c.id}.glb`,catalogURL).href);
    if(token!==sequence){disposeAsset(asset.scene);return;}
    if(!asset.animations.length)throw Error('לקובץ אין תנועה מוטמעת.');
    disposeModel();model=asset.scene;model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=false;}});actor.add(model);
    mixer=new THREE.AnimationMixer(model);action=mixer.clipAction(asset.animations.find(a=>a.name===c.id)??asset.animations[0]);action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();
    skeleton=new THREE.SkeletonHelper(model);skeleton.material.depthTest=false;skeleton.material.transparent=true;skeleton.material.opacity=.6;skeleton.renderOrder=5;scene.add(skeleton);
    computeAnchors();ready=true;updatePose();render();$('library-status').textContent=`${clips.length} תנועות · שלד משותף`;
  }catch(error){if(token!==sequence)return;setPlaying(false);$('error').hidden=false;$('error').textContent=`טעינת התנועה נכשלה. ${error.message}`;$('phase').textContent='שגיאת טעינה';console.error(error);throw error;}
}
function resize(){const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;renderer.setSize(rect.width,rect.height,false);camera.aspect=rect.width/rect.height;camera.updateProjectionMatrix();render();}
new ResizeObserver(resize).observe(canvas);resize();
for(const button of document.querySelectorAll('[data-view]'))button.addEventListener('click',()=>setView(button.dataset.view));
$('play').addEventListener('click',()=>setPlaying(!playing));$('restart').addEventListener('click',()=>{if(ready){time=0;lap=0;updatePose();}});$('scrub').addEventListener('input',()=>seek(Number($('scrub').value)/rateOf(current)));
for(const id of ['travel','soles','skeleton'])$(id).addEventListener('change',()=>{if(id==='travel'&&ready)computeAnchors();updatePose();render();});
let previous=performance.now();renderer.setAnimationLoop(now=>{
  const dt=Math.min(.08,Math.max(0,(now-previous)/1000));previous=now;
  if(playing&&ready){time+=dt*Number($('speed').value);const duration=durationOf(current);if(current.loop){while(time>=duration){time-=duration;lap++;}}else if(time>duration){time=duration;setPlaying(false);}updatePose();}
  render();
});
window.__preview={get ready(){return ready;},get current(){return current;},get clips(){return clips;},select,seek,setView,setPlaying,
  setWorldTravel(value){$('travel').checked=!!value;if(ready){computeAnchors();updatePose();render();}},
  snapshot(width=394,height=420){if(!ready)throw Error('Clip is loading');const ratio=renderer.getPixelRatio();renderer.setPixelRatio(1);renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();updatePose();render();const image=canvas.toDataURL('image/png');renderer.setPixelRatio(ratio);resize();render();return image;},
  state(){return{id:current?.id,time,lap,playing,ready,view,actor:actor.position.toArray(),worldTravel:$('travel').checked,nativeRate:current?rateOf(current):null,renderer:renderer.info.render};},
};
try{
  const response=await fetch(catalogURL);if(!response.ok)throw Error(`HTTP ${response.status}`);const catalog=await response.json();clips=Array.isArray(catalog)?catalog:catalog.clips;if(!clips?.length)throw Error('לא נמצאו תנועות.');
  $('clip-count').textContent=String(clips.length).padStart(2,'0');
  for(const [index,c] of clips.entries()){
    const button=document.createElement('button');button.type='button';button.className='clip-button';button.dataset.clip=c.id;button.setAttribute('aria-pressed','false');
    const number=document.createElement('span');number.className='clip-number';number.textContent=String(index+1).padStart(2,'0');
    const text=document.createElement('span'),title=document.createElement('strong'),sub=document.createElement('small');title.textContent=labelOf(c);sub.textContent=(c.speedMps>0?`${c.speedMps.toFixed(1)} מ׳/ש׳ · `:'')+(c.loop?'מחזור':'קליפ');text.append(title,sub);button.append(number,text);button.addEventListener('click',()=>select(c).catch(()=>{}));$('clips').append(button);
  }
  const requested=new URLSearchParams(location.search).get('clip');await select(clips.find(c=>c.id===requested)??clips.find(c=>c.id==='run')??clips[0]);
  if(new URLSearchParams(location.search).get('paused')==='1')setPlaying(false);
}catch(error){$('title').textContent='לא ניתן לטעון את הספרייה';$('error').hidden=false;$('error').textContent=`פתחו את התצוגה דרך שרת מקומי. ${error.message}`;console.error(error);}
