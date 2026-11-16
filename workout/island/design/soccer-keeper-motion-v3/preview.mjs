/** CC0-1.0. Native GLB playback; the external actor track is applied once.
 * No pose correction, root retargeting, or substitute animation is used here.
 */
import * as THREE from '../soccer-motion-v8/runtime/vendor/three.module.js';
import {GLTFLoader} from '../soccer-motion-v8/runtime/vendor/GLTFLoader.js';
import {clone as cloneSkeleton} from '../soccer-motion-v8/runtime/vendor/SkeletonUtils.js';
const $=id=>document.getElementById(id);
const descriptions={
  keeper_ready:['ערנות · איזון','ברכיים רכות, ידיים פתוחות ומבט קדימה לפני הבעיטה.'],
  keeper_shuffle:['עבודת רגליים','צעד צד מוביל, איסוף הרגל השנייה וחזרה לעמדת תגובה.'],
  keeper_dive_low:['תגובה נמוכה','דחיפה הצידה, ידיים לכדור וספיגת הנחיתה על הצד.'],
  keeper_dive_high:['תגובה גבוהה','העמסה, דחיפה למעלה והושטת הידיים אל הכדור.'],
  keeper_catch_two_hands:['אחיזה · שליטה','שתי הידיים פוגשות את הכדור ומביאות אותו אל הגוף.'],
  keeper_punch:['הרחקת כדור','הכנה מתחת לכדור, הושטת אגרוף ומעקב אחר ההרחקה.'],
  keeper_throw:['הוצאת כדור','פתיחת הכתף, הטלה ביד אחת והמשך תנועה אחרי השחרור.'],
  keeper_punt:['הוצאת כדור','שחרור מהידיים, תנופת הרגל ומעקב אחרי הבעיטה.'],
  keeper_celebrate:['רגע של שמחה','תגובת שמחה קצרה וחזרה למוכנות למשחק.'],
  keeper_disappointed:['אחרי ספיגה','הורדת הראש והכתפיים לפני חזרה לעמדה.'],
  field_miss:['אחרי החטאה','תגובה גופנית להחטאה, עצירה והתאוששות.'],
  field_group_celebrate:['חוגגים יחד','שלושה שחקנים בתנועה משותפת, עם הפרש זמן קטן ביניהם.'],
  field_enter:['עולים לשחק','צעדים קדימה וכניסה רגועה אל המגרש.'],
  field_clap:['תודה מהדשא','מחיאות כפיים קצרות מול הקהל והחברים לקבוצה.'],
};
const eventNames={footstrike:'מגע רגל',toeoff:'סיום תמיכה',contact:'מגע בכדור',catch:'תפיסה',release:'שחרור',punch:'אגרוף',kick:'בעיטה',takeoff:'דחיפה',land:'נחיתה',recover:'התאוששות',clap:'מחיאה',celebrate:'חגיגה',settle:'חזרה לעמדה',support:'תמיכה',peak:'שיא התנועה',save:'הצלה',body_land:'נחיתה על הצד',secure:'הצמדה לחזה',drop:'הפלת הכדור',fist_pump:'הנפת אגרוף',head_drop:'הורדת הראש',miss_reaction:'תגובה להחטאה',team_join:'הצטרפות לקבוצה',goal_cheer:'חגיגת שער',possession_transfer:'העברת החזקה'};
const canvas=$('stage'),renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const scene=new THREE.Scene();scene.background=new THREE.Color('#193327');scene.fog=new THREE.Fog('#193327',10,24);
const camera=new THREE.PerspectiveCamera(34,1,.02,60),cameraTarget=new THREE.Vector3();
scene.add(new THREE.HemisphereLight('#f5f7de','#304430',2.4));
const sunlight=new THREE.DirectionalLight('#fff3d5',3.2);sunlight.position.set(3,6,5);sunlight.castShadow=true;sunlight.shadow.mapSize.set(1024,1024);sunlight.shadow.camera.left=-5;sunlight.shadow.camera.right=5;sunlight.shadow.camera.top=5;sunlight.shadow.camera.bottom=-5;sunlight.shadow.normalBias=.015;sunlight.shadow.bias=-.0001;scene.add(sunlight);
const rim=new THREE.DirectionalLight('#bddbc6',2);rim.position.set(-4,3,-3);scene.add(rim);
const ground=new THREE.Mesh(new THREE.PlaneGeometry(50,50),new THREE.MeshStandardMaterial({color:'#294931',roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-.013;ground.receiveShadow=true;scene.add(ground);
const grid=new THREE.GridHelper(20,40,'#b3c28c','#718564');grid.position.y=-.009;grid.material.transparent=true;grid.material.opacity=.13;scene.add(grid);
const lineMaterial=new THREE.MeshBasicMaterial({color:'#c4d7a5',transparent:true,opacity:.43});
for(const x of[-2.4,2.4]){const line=new THREE.Mesh(new THREE.PlaneGeometry(.018,3.2),lineMaterial);line.rotation.x=-Math.PI/2;line.position.set(x,-.006,-.5);scene.add(line);}
const baseline=new THREE.Mesh(new THREE.PlaneGeometry(4.8,.018),lineMaterial);baseline.rotation.x=-Math.PI/2;baseline.position.set(0,-.006,-2.1);scene.add(baseline);
const ball=new THREE.Mesh(new THREE.SphereGeometry(.105,24,16),new THREE.MeshStandardMaterial({color:'#f2ead9',roughness:.5}));ball.castShadow=true;scene.add(ball);
const seam=new THREE.Mesh(new THREE.TorusGeometry(.1053,.002,4,48),new THREE.MeshBasicMaterial({color:'#465546'}));ball.add(seam);for(const angle of[Math.PI/2,-Math.PI/3]){const s=seam.clone();s.rotation.y=angle;ball.add(s);}
const loader=new GLTFLoader(),catalogURL=new URL('./catalog.json',import.meta.url);
let clips=[],current,actors=[],time=0,playing=!matchMedia('(prefers-reduced-motion: reduce)').matches,ready=false,loadNumber=0,view='three';
let envelope=new THREE.Box3(new THREE.Vector3(-.8,0,-.5),new THREE.Vector3(.8,2,.5));
const durationOf=c=>c.durationSeconds??c.duration??1;
const eventTime=e=>e.timeSeconds??e.atSeconds??e.time??(e.frame??0)/30;
const eventType=e=>e.type??e.name??e.event;
function interpolate(keys,t,property){
  if(!keys?.length)return null;const at=k=>k.time??k.t??0;
  let i=keys.findIndex(k=>at(k)>=t);if(i<0)i=keys.length-1;
  const b=keys[i],a=keys[Math.max(0,i-1)],u=at(b)>at(a)?THREE.MathUtils.clamp((t-at(a))/(at(b)-at(a)),0,1):0;
  const A=a[property],B=b[property];if(Array.isArray(A)&&Array.isArray(B))return A.map((x,j)=>x+(B[j]-x)*u);
  return Number.isFinite(A)&&Number.isFinite(B)?A+(B-A)*u:null;
}
function actorPose(at){
  const d=durationOf(current);
  for(const a of actors){
    const localTime=THREE.MathUtils.clamp(at-a.delay,0,d);
    a.action.time=Math.min(localTime,Math.max(0,a.action.getClip().duration-1e-8));a.action.paused=true;a.mixer.update(0);
    const travel=current.referenceTravel?.samples??[],p=interpolate(travel,localTime,'position')??[0,0,0],yaw=interpolate(travel,localTime,'yawRadians')??0;
    a.group.position.fromArray(p).add(a.offset);a.group.rotation.y=yaw;a.group.updateMatrixWorld(true);
    a.skeleton.visible=$('skeleton').checked;
  }
  const bp=interpolate(current.ball?.samples??current.ball?.keys??[],at,'position');
  const range=current.ballVisibleRange;
  ball.visible=$('ball').checked&&Array.isArray(bp)&&(!range||(at>=range[0]&&at<=range[1]));
  if(ball.visible){const p=interpolate(current.referenceTravel?.samples??[],at,'position')??[0,0,0],yaw=interpolate(current.referenceTravel?.samples??[],at,'yawRadians')??0;
    ball.position.fromArray(bp).applyAxisAngle(new THREE.Vector3(0,1,0),yaw).add(new THREE.Vector3(...p));ball.scale.setScalar((current.ball?.radius??.105)/.105);ball.rotation.x=at*3;
  }
}
function fitCamera(){
  const directions={three:[2.5,1.05,3.5],front:[0,.25,4],side:[4,.4,.03]},direction=new THREE.Vector3(...directions[view]).normalize();
  const right=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),direction).normalize(),up=new THREE.Vector3().crossVectors(direction,right).normalize();
  cameraTarget.copy(envelope.getCenter(new THREE.Vector3()));
  const halfV=Math.tan(THREE.MathUtils.degToRad(camera.fov/2)),halfH=halfV*camera.aspect;
  let distance=1.8;const lo=envelope.min,hi=envelope.max;
  for(const x of[lo.x,hi.x])for(const y of[lo.y,hi.y])for(const z of[lo.z,hi.z]){const delta=new THREE.Vector3(x,y,z).sub(cameraTarget);distance=Math.max(distance,Math.abs(delta.dot(right))/halfH*1.16+delta.dot(direction),Math.abs(delta.dot(up))/halfV*1.27+delta.dot(direction));}
  camera.position.copy(cameraTarget).addScaledVector(direction,distance);camera.lookAt(cameraTarget);camera.updateProjectionMatrix();
}
function setView(name){if(!['three','front','side'].includes(name))throw Error('Unknown view');view=name;for(const b of document.querySelectorAll('[data-view]'))b.setAttribute('aria-pressed',String(b.dataset.view===name));fitCamera();}
function updatePose(){
  if(!ready)return;const sampled=Math.min(durationOf(current),Math.floor((time+1e-7)*30)/30);actorPose(sampled);
  const total=Math.round(durationOf(current)*30),frame=Math.round(sampled*30);$('scrub').value=String(frame);$('time').textContent=`${sampled.toFixed(2)} / ${durationOf(current).toFixed(2)}`;$('frame').textContent=`${frame} / ${total}`;
  const event=(current.events??[]).find(e=>Math.abs(eventTime(e)-sampled)<.05);$('phase').textContent=event?(eLabel(event)):(current.loop?'מחזור תנועה':'תנועה חד־פעמית');
}
function eLabel(e){return e.label??e.labelHe??eventNames[eventType(e)]??'רגע בתנועה';}
function render(){renderer.render(scene,camera);}
function setPlaying(value){playing=value;$('play').textContent=playing?'השהיה':'ניגון';$('play').setAttribute('aria-label',playing?'השהיה':'ניגון');}
function seek(value){if(!ready)throw Error('Clip is loading');time=THREE.MathUtils.clamp(value,0,durationOf(current));setPlaying(false);updatePose();render();}
function disposeModelResources(roots){
  // Team clones share mesh resources but own their skinned Skeleton instances.
  // Also use this path for GLBs whose async completion lost the selection race.
  const geometries=new Set(),materials=new Set(),textures=new Set(),skeletons=new Set();
  for(const root of new Set(roots))root?.traverse(o=>{
    if(o.geometry)geometries.add(o.geometry);
    if(o.skeleton)skeletons.add(o.skeleton);
    for(const material of Array.isArray(o.material)?o.material:o.material?[o.material]:[]){materials.add(material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value);}
  });
  // Skeleton.dispose releases its bone texture. Exclude it from the shared set
  // in case a model also references that texture as a material input.
  const releasedBoneTextures=new Set();
  skeletons.forEach(skeleton=>{const texture=skeleton.boneTexture;if(texture&&releasedBoneTextures.has(texture))skeleton.boneTexture=null;else if(texture){textures.delete(texture);releasedBoneTextures.add(texture);}skeleton.dispose();});
  geometries.forEach(value=>value.dispose());materials.forEach(value=>value.dispose());textures.forEach(value=>value.dispose());
}
function disposeActors(){
  for(const a of actors){a.mixer.stopAllAction();a.mixer.uncacheRoot(a.model);scene.remove(a.group);scene.remove(a.skeleton);a.skeleton.dispose();}
  disposeModelResources(actors.map(a=>a.model));actors=[];
}
function measureEnvelope(){
  const box=new THREE.Box3();
  for(let i=0;i<=32;i++){actorPose(durationOf(current)*i/32);for(const a of actors)a.model.traverse(o=>{if(o.isBone)box.expandByPoint(o.getWorldPosition(new THREE.Vector3()));});}
  // Constant geometric margin contains hands, head, boots and cloth beyond joints.
  box.expandByVector(new THREE.Vector3(.20,.22,.24));box.min.y=Math.min(-.03,box.min.y);envelope=box;
  actorPose(0);fitCamera();
}
async function selectClip(c){
  const sequence=++loadNumber;ready=false;current=c;time=0;$('error').hidden=true;$('phase').textContent='טוען…';
  const detail=descriptions[c.id]??['',c.description??c.notes??''];$('title').textContent=c.label??c.labelHe??c.id;$('subtitle').textContent=detail[0];$('description').textContent=detail[1];$('role').textContent=c.role==='field'?'שחקן שדה':'שוער';$('scrub').max=String(Math.round(durationOf(c)*30));$('sheet-link').href=`./sheets/${c.id}.png`;
  for(const b of document.querySelectorAll('.clip-button'))b.setAttribute('aria-pressed',String(b.dataset.clip===c.id));
  if(innerWidth<600)document.querySelector('.clip-button[aria-pressed="true"]')?.scrollIntoView({block:'nearest',inline:'center'});
  $('events').replaceChildren();for(const e of c.events??[]){const at=eventTime(e);if(!Number.isFinite(at))continue;const b=document.createElement('button');b.className='event-button';b.type='button';b.textContent=eLabel(e);const t=document.createElement('span');t.textContent=`${at.toFixed(2)} s`;b.append(t);b.addEventListener('click',()=>seek(at));$('events').append(b);}
  try{
    const asset=await loader.loadAsync(new URL(c.asset??`clips/${c.id}.glb`,catalogURL).href);if(sequence!==loadNumber){disposeModelResources(asset.scenes??[asset.scene]);return;}
    const clip=asset.animations.find(a=>a.name===c.id)??asset.animations[0];if(!clip){disposeModelResources(asset.scenes??[asset.scene]);throw Error('אין תנועה בקובץ.');}asset.scene.traverse(o=>{if(o.isMesh)o.castShadow=true;});disposeActors();
    const team=c.category==='team'||c.id==='field_group_celebrate',count=team?(c.team?.count??3):1,offsets=c.team?.offsets??[[0,0,0],[-.9,0,-.25],[.9,0,-.25]],delays=c.team?.phaseOffsetsSeconds??[0,.1,.2];
    for(let i=0;i<count;i++){const model=i?cloneSkeleton(asset.scene):asset.scene,group=new THREE.Group();group.add(model);scene.add(group);const mixer=new THREE.AnimationMixer(model),action=mixer.clipAction(clip);action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();const skeleton=new THREE.SkeletonHelper(model);skeleton.material.depthTest=false;skeleton.material.transparent=true;skeleton.material.opacity=.65;skeleton.renderOrder=5;scene.add(skeleton);actors.push({model,group,mixer,action,skeleton,offset:new THREE.Vector3(...(team?offsets[i]??[0,0,0]:[0,0,0])),delay:team?delays[i]??0:0});}
    $('team-note').textContent=team?'שלושה שחקנים · הפרש 0.1 ש׳':'';measureEnvelope();ready=true;updatePose();render();
  }catch(error){if(sequence!==loadNumber)return;setPlaying(false);$('phase').textContent='הטעינה נכשלה';$('error').hidden=false;$('error').textContent=`לא ניתן לטעון את התנועה. ${error.message}`;console.error(error);throw error;}
}
function resize(){const{width,height}=canvas.getBoundingClientRect();if(!width||!height)return;renderer.setSize(width,height,false);camera.aspect=width/height;fitCamera();}
new ResizeObserver(resize).observe(canvas);resize();
for(const b of document.querySelectorAll('[data-view]'))b.addEventListener('click',()=>{setView(b.dataset.view);render();});
$('play').addEventListener('click',()=>{if(ready&&time>=durationOf(current))time=0;setPlaying(!playing);});$('restart').addEventListener('click',()=>{if(ready){time=0;updatePose();render();}});$('scrub').addEventListener('input',()=>seek(Number($('scrub').value)/30));for(const id of['ball','skeleton'])$(id).addEventListener('change',()=>{updatePose();render();});
let previous=performance.now();renderer.setAnimationLoop(now=>{const dt=Math.min(.1,Math.max(0,(now-previous)/1000));previous=now;if(playing&&ready){time+=dt*Number($('speed').value);const d=durationOf(current);if(current.loop)time%=d;else if(time>=d){time=d;setPlaying(false);}updatePose();}render();});
window.keeperPreview={get ready(){return ready;},get current(){return current;},get clips(){return clips;},select:async id=>{const c=clips.find(c=>c.id===id);if(!c)throw Error(`Unknown clip ${id}`);await selectClip(c);},seek,setView,setPlaying,
  inspect(){const positions=[],skins=[];for(const a of actors)a.model.traverse(o=>{if(o.isBone)positions.push({name:o.name,position:o.getWorldPosition(new THREE.Vector3()).toArray()});if(o.isSkinnedMesh)skins.push({joints:o.skeleton.bones.length,vertices:o.geometry.attributes.position.count});});return{actorCount:actors.length,positions,skins,ballVisible:ball.visible,ballPosition:ball.position.toArray(),finite:positions.every(p=>p.position.every(Number.isFinite)),cameraEnvelope:envelope.min.toArray().concat(envelope.max.toArray()),nativeFrame:Math.floor((time+1e-7)*30)};},
  snapshot(width=394,height=420){if(!ready)throw Error('Clip is loading');const ratio=renderer.getPixelRatio();renderer.setPixelRatio(1);renderer.setSize(width,height,false);camera.aspect=width/height;fitCamera();updatePose();render();const data=canvas.toDataURL('image/png');renderer.setPixelRatio(ratio);resize();render();return data;},
};
setPlaying(playing);
try{const response=await fetch(catalogURL);if(!response.ok)throw Error(`HTTP ${response.status}`);const catalog=await response.json();clips=catalog.clips??catalog;if(!Array.isArray(clips)||!clips.length)throw Error('ספריית התנועות ריקה.');$('clip-count').textContent=String(clips.length).padStart(2,'0');for(const[i,c]of clips.entries()){const b=document.createElement('button');b.type='button';b.className='clip-button';b.dataset.clip=c.id;b.setAttribute('aria-pressed','false');const n=document.createElement('span');n.className='clip-number';n.textContent=String(i+1).padStart(2,'0');const text=document.createElement('span'),strong=document.createElement('strong'),small=document.createElement('small');strong.textContent=c.label??c.labelHe??c.id;small.textContent=`${c.role==='field'?'שחקן שדה':'שוער'} · ${durationOf(c).toFixed(2)} ש׳`;text.append(strong,small);b.append(n,text);b.addEventListener('click',()=>selectClip(c).catch(()=>{}));$('clips').append(b);}await selectClip(clips.find(c=>c.id==='keeper_ready')??clips[0]);}
catch(error){$('title').textContent='התצוגה לא נטענה';$('error').hidden=false;$('error').textContent=`יש לפתוח דרך שרת HTTP מקומי. ${error.message}`;console.error(error);}
