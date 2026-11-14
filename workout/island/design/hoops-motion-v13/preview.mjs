/** Original hoops-motion-v13 preview. SPDX-License-Identifier: CC0-1.0.
 * Reads native uncompressed GLB animations. Reference heading rotates only the
 * demonstration group; the animation's Root track stays fixed at identity.
 */
import * as THREE from '../soccer-motion-v8/runtime/vendor/three.module.js';
import {GLTFLoader} from '../soccer-motion-v8/runtime/vendor/GLTFLoader.js';
import {makeClipBridge} from './runtime/player.mjs';
const $ = id => document.getElementById(id);
const descriptions = {
  "idle": [
    "עמידה רגועה",
    "נשימה · איזון",
    "נשימה עדינה, כתפיים משוחררות והעברת משקל טבעית."
  ],
  "idle_ball": [
    "עמידה עם כדור",
    "שליטה · מנוחה",
    "אחיזה רגועה בכדור לצד נשימה ותנועת גוף עדינה."
  ],
  "jog": [
    "ריצה קלה",
    "קצב בינוני",
    "יד ורגל נגדיות, מרפקים כפופים ונטייה קלה קדימה."
  ],
  "run": [
    "ריצה",
    "קצב מהיר",
    "נדנוד זרועות נגדי והתאוששות עקב עם תמיכה יציבה."
  ],
  "sprint": [
    "ספרינט",
    "קצב מרבי",
    "נטייה קדימה, תנופת זרועות וברכיים פעילות."
  ],
  "accelerate": [
    "האצה",
    "עמידה ← ריצה",
    "העברת משקל קדימה, דחיפה וכניסה לקצב ריצה."
  ],
  "stop": [
    "עצירה",
    "ריצה ← עמידה",
    "ספיגת העומס בברכיים והחזרת המשקל לעמידה מאוזנת."
  ],
  "turn_45": [
    "פנייה 45°",
    "שינוי כיוון",
    "מבט ונטיית הגוף מובילים פנייה מתונה."
  ],
  "turn_90": [
    "פנייה 90°",
    "שינוי כיוון",
    "רגל תומכת וזרועות מאזנות בזמן שינוי כיוון."
  ],
  "turn_180": [
    "פנייה 180°",
    "היפוך כיוון",
    "סיבוב הגוף מעל התמיכה וחזרה לצעדים פעילים."
  ],
  "cross": [
    "חיתוך",
    "הטעיה · שינוי כיוון",
    "הטיית הגוף והחלפת קו תנועה בצעדים רציפים."
  ],
  "defensive_slide": [
    "החלקה בהגנה",
    "צעדי צד",
    "עמידה נמוכה, רגל מובילה פותחת והרגל השנייה חוזרת."
  ],
  "defense_stance": [
    "עמידת הגנה",
    "ערנות · איזון",
    "ברכיים כפופות, גב פעיל וידיים זמינות לתגובה."
  ],
  "dribble_stand": [
    "כדרור בעמידה",
    "שליטה בכדור",
    "דחיפת הכדור, קפיצה מהרצפה ואיסוף בקצב ברור."
  ],
  "dribble_run": [
    "כדרור בריצה",
    "ריצה · שליטה",
    "צעדים טבעיים לצד מחזורי כדרור ותנועת היד החופשית."
  ],
  "dribble_cross": [
    "קרוסאובר",
    "החלפת יד",
    "הכדור חוצה מול הגוף, עם העברת משקל לצד השני."
  ],
  "dribble_behind": [
    "כדרור מאחורי הגב",
    "החלפת יד",
    "העברת הכדור מאחורי הגוף תוך שמירת איזון."
  ],
  "dribble_spin": [
    "כדרור בסיבוב",
    "סיבוב · שליטה",
    "כדרור נמוך וסיבוב גוף רציף סביב ציר התמיכה."
  ],
  "dribble_low": [
    "כדרור נמוך",
    "הגנה על הכדור",
    "כפיפה נמוכה ומחזור כדור קצר וקרוב לגוף."
  ],
  "pass_chest": [
    "מסירת חזה",
    "שחרור קדימה",
    "הכנה בשתי ידיים, יישור מרפקים ושחרור מהחזה."
  ],
  "pass_bounce": [
    "מסירת הקפצה",
    "מסירה לרצפה",
    "דחיפה קדימה ולמטה, נגיעה ברצפה והמשך המסירה."
  ],
  "pass_overhead": [
    "מסירה מעל הראש",
    "שחרור גבוה",
    "הרמת הכדור מעל הראש ויישור הזרועות קדימה."
  ],
  "pass_behind": [
    "מסירה מאחורי הגב",
    "הטעיה · שחרור",
    "סיבוב כתף ושחרור הכדור מעבר לקו הגב."
  ],
  "jump_shot": [
    "קליעה בקפיצה",
    "עלייה · שחרור",
    "כפיפת ברכיים, קפיצה, יישור הזרוע ומעקב כף היד."
  ],
  "set_shot": [
    "קליעה מהמקום",
    "איזון · שחרור",
    "דחיפה מהרגליים ושחרור גבוה ללא קפיצה גדולה."
  ],
  "layup": [
    "צעד וחצי",
    "צעדים · סיום",
    "איסוף הכדור, צעד מסיים ועלייה לשחרור ביד אחת."
  ],
  "dunk": [
    "הטבעה",
    "עלייה · מגע",
    "טעינה, קפיצה גבוהה, הושטת הכדור מעל הראש ונחיתה."
  ],
  "fadeaway": [
    "קליעה בנסיגה",
    "ניתור לאחור",
    "הגוף מתרחק תוך כדי עלייה, שחרור ונחיתה מאוזנת."
  ],
  "block": [
    "חסימה",
    "תגובה · מגע",
    "דחיפה מהרגליים וקפיצה עם יד מושטת לנקודת המגע."
  ],
  "steal_reach": [
    "ניסיון חטיפה",
    "תגובה · הושטת יד",
    "צעד תגובה קצר, הושטת יד וחזרה לעמדת הגנה."
  ],
  "celebrate_short": [
    "חגיגה קצרה",
    "תגובה חיובית",
    "מחוות ניצחון קצרה עם גוף וכתפיים בתנועה."
  ],
  "disappointed": [
    "אכזבה",
    "תגובה רגועה",
    "ירידת כתפיים ומבט רגעי למטה, ואז חזרה לעמידה."
  ]
};
const eventNames = {bounce:'קפיצה מהרצפה',release:'שחרור הכדור',footstrike:'מגע רגל',toeoff:'סיום תמיכה',entry:'תחילת מעבר',exit:'סיום מעבר',left_contact:'רגל שמאל',right_contact:'רגל ימין',contact:'מגע',touch:'נגיעה',ball_touch:'נגיעה בכדור',accelerate:'האצה',decelerate:'האטה',turn:'פנייה',plant:'תמיכה',foot_contact:'מגע רגל',takeoff:'דחיפה',land:'נחיתה'};
const canvas = $('stage');
const renderer = new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
renderer.outputColorSpace=THREE.SRGBColorSpace; renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.25;
const scene=new THREE.Scene();scene.background=new THREE.Color('#162130');scene.fog=new THREE.Fog('#162130',6,13);
const camera=new THREE.PerspectiveCamera(34,1,.01,35);
let framingScale=1,currentView='three',cameraOrigin=[0,0,0];
const views={three:[2.8,1.9,3.6],front:[0,1.75,4.6],side:[4.6,1.8,.12]};
function setView(name){if(!views[name])throw new Error('Unknown view');currentView=name;camera.position.fromArray(views[name].map((v,i)=>v*framingScale+cameraOrigin[i]));camera.lookAt(cameraOrigin[0],cameraOrigin[1]+1.05*framingScale,cameraOrigin[2]+.08);for(const b of document.querySelectorAll('[data-view]'))b.setAttribute('aria-pressed',String(b.dataset.view===name));}
setView('three');
scene.add(new THREE.HemisphereLight('#eaf4de','#425e4d',2.2));
const key=new THREE.DirectionalLight('#fff2d8',3);key.position.set(3,5,4);scene.add(key);
const rim=new THREE.DirectionalLight('#a3d4c6',2);rim.position.set(-3,3,-2);scene.add(rim);
const ground=new THREE.Mesh(new THREE.PlaneGeometry(30,30),new THREE.MeshStandardMaterial({color:'#a36b3d',roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-.012;scene.add(ground);
const grid=new THREE.GridHelper(12,48,'#f3d6a4','#bd8854');grid.position.y=-.008;grid.material.transparent=true;grid.material.opacity=.25;scene.add(grid);
const ring=new THREE.Mesh(new THREE.RingGeometry(.72,.725,96),new THREE.MeshBasicMaterial({color:'#70856a',transparent:true,opacity:.45,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=-.005;scene.add(ring);
scene.add(new THREE.ArrowHelper(new THREE.Vector3(0,0,1),new THREE.Vector3(0,.008,1.05),.55,'#c2d9ac',.09,.05));
const shadow=new THREE.Mesh(new THREE.CircleGeometry(.30,40),new THREE.MeshBasicMaterial({color:'#26201b',transparent:true,opacity:.22,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=-.004;scene.add(shadow);
const actor=new THREE.Group();scene.add(actor);
const ball=new THREE.Mesh(new THREE.SphereGeometry(.11,24,16),new THREE.MeshStandardMaterial({color:'#d96b22',roughness:.6}));actor.add(ball);
const seam=new THREE.Mesh(new THREE.TorusGeometry(.1102,.0018,4,48),new THREE.MeshBasicMaterial({color:'#322822'}));ball.add(seam);const seam2=seam.clone();seam2.rotation.y=Math.PI/2;ball.add(seam2);
const soleMarkers=['LeftFoot','RightFoot'].map(name=>{const marker=new THREE.Mesh(new THREE.SphereGeometry(.016,12,8),new THREE.MeshBasicMaterial({color:'#d8c375',depthTest:false,transparent:true,opacity:.8}));marker.renderOrder=10;scene.add(marker);return{name,marker};});
const position=new THREE.Vector3(),rotation=new THREE.Quaternion(),loader=new GLTFLoader();
let clips=[],motions=[],current,model,mixer,action,skeleton,time=0,playing=true,loadNumber=0,ready=false,activeBridge=null;
const modelURL=new URL('./runtime/reference/athlete.glb',import.meta.url);

const catalogURL=new URL('./runtime/catalog.json',import.meta.url);
const idOf=c=>c.id??c.name;
const durationOf=c=>c.durationSeconds??c.duration??1;
const eventTime=e=>e.timeSeconds??e.time??e.atSeconds??(e.frame??0)/30;
const eventType=e=>e.type??e.event??e.name;
function interpolate(keys,t,property){if(!keys.length)return null;let i=keys.findIndex(k=>(k.time??k.t??0)>=t);if(i<0)i=keys.length-1;const b=keys[i],a=keys[Math.max(0,i-1)],ta=a.time??a.t??0,tb=b.time??b.t??0,u=tb>ta?THREE.MathUtils.clamp((t-ta)/(tb-ta),0,1):0;const x=a[property],y=b[property];if(Array.isArray(x))return x.map((v,j)=>v+(y[j]-v)*u);return x+(y-x)*u;}
function updatePose(){
  if(!current||!action||!ready)return;
  action.time=Math.min(time,Math.max(0,action.getClip().duration-1e-8));action.paused=true;mixer.update(0);
  if(activeBridge){const pose=activeBridge.bridge.sample(Math.min(activeBridge.elapsed,activeBridge.bridge.duration));for(const[name,q]of Object.entries(pose.rotations))model.getObjectByName(name)?.quaternion.fromArray(q);model.getObjectByName('Hips').position.fromArray(pose.hips);}
  const travel=current.referenceTravel?.samples??[],heading=interpolate(travel,time,'yawRadians'),world=interpolate(travel,time,'position');actor.rotation.y=$('heading').checked&&Number.isFinite(heading)?heading:0;actor.position.fromArray($('heading').checked&&Array.isArray(world)&&!activeBridge?world:[0,0,0]);cameraOrigin=actor.position.toArray();camera.position.fromArray(views[currentView].map((v,i)=>v*framingScale+cameraOrigin[i]));camera.lookAt(actor.position.x,actor.position.y+1.05*framingScale,actor.position.z+.08);shadow.position.x=actor.position.x;shadow.position.z=actor.position.z;
  actor.updateMatrixWorld(true);const lift=Math.max(0,(model.getObjectByName('Hips')?.position.y??.86)-.86);shadow.scale.setScalar(Math.max(.5,1-lift*.32));shadow.material.opacity=.22/(1+lift);skeleton.visible=$('skeleton').checked;
  for(const{name,marker}of soleMarkers){const bone=model.getObjectByName(name);marker.visible=$('soles').checked&&!!bone;if(bone){bone.getWorldPosition(position);bone.getWorldQuaternion(rotation);marker.position.copy(position).add(new THREE.Vector3(0,-.08,0).applyQuaternion(rotation));}}
  const bp=interpolate(current.ball?.samples??[],time,'position');ball.visible=!activeBridge&&$('ball').checked&&Array.isArray(bp);if(ball.visible){const radius=current.ball?.radius??.11;ball.scale.setScalar(radius/.11);ball.position.fromArray(bp);ball.rotation.x=time*(current.speedMps??2)/radius;}
  if(activeBridge){$('phase').textContent='מעבר רציף לתנועה';$('time').textContent=`${activeBridge.elapsed.toFixed(2)} / ${activeBridge.bridge.duration.toFixed(2)}`;return;}
  const d=durationOf(current),frame=Math.round(time*30);$('scrub').value=String(frame);$('time').textContent=`${time.toFixed(2)} / ${d.toFixed(2)}`;$('frame').textContent=`פריים ${frame} / ${Math.round(d*30)}`;
  const event=(current.events??[]).find(e=>Math.abs(eventTime(e)-time)<.045);$('phase').textContent=event?(eventNames[eventType(event)]??'אירוע תנועה'):(current.loop?'מחזור תנועה':'מעבר תנועה');
}
function render(){renderer.render(scene,camera);}
function setPlaying(value){playing=value;$('play').textContent=playing?'השהיה Ⅱ':'ניגון ▶';$('play').setAttribute('aria-label',playing?'השהיה':'ניגון');}
function seek(t){activeBridge=null;if(!ready)throw new Error('Clip is loading');time=THREE.MathUtils.clamp(t,0,durationOf(current));setPlaying(false);updatePose();render();}
function disposeModel(){if(!model)return;mixer.stopAllAction();mixer.uncacheRoot(model);actor.remove(model);scene.remove(skeleton);model.traverse(o=>{if(o.isMesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material]){for(const v of Object.values(m))if(v?.isTexture)v.dispose();m.dispose();}}});skeleton.dispose();model=undefined;}
async function selectClip(c){
  activeBridge=null;const sequence=++loadNumber;ready=false;current=c;time=0;$('error').hidden=true;$('phase').textContent='טוען…';
  const id=idOf(c);framingScale=id==='dunk'?1.6:/^(jump_shot|layup|fadeaway|block)$/.test(id)?1.4:1;setView(currentView);const detail=descriptions[id]??[c.label??id,'',c.notes??''];$('title').textContent=detail[0];$('description').textContent=detail[2];for(const b of document.querySelectorAll('.clip-button'))b.setAttribute('aria-pressed',String(b.dataset.clip===id));if(innerWidth<=600)document.querySelector('.clip-button[aria-pressed="true"]')?.scrollIntoView({block:'nearest',inline:'center'});
  const d=durationOf(c);$('scrub').max=String(Math.round(d*30));$('loop-label').textContent=c.loop?'תנועה מחזורית':'תנועה חד־פעמית';$('events').replaceChildren();
  for(const e of c.events??[]){const type=eventType(e),at=eventTime(e);if(!Number.isFinite(at))continue;const button=document.createElement('button');button.type='button';button.className='event-button';const label=document.createElement('span');label.textContent=eventNames[type]??type;const stamp=document.createElement('small');stamp.textContent=`${at.toFixed(3)} s`;button.append(label,stamp);button.addEventListener('click',()=>seek(at));$('events').append(button);}
  try{
    const path=c.file??c.asset??`clips/${id}.glb`,url=new URL(path.startsWith('runtime/')?path.slice(8):path,catalogURL);
    const [asset,character]=await Promise.all([loader.loadAsync(url.href),loader.loadAsync(modelURL.href)]);if(sequence!==loadNumber)return;if(!asset.animations.length)throw new Error('לקובץ אין ערוץ תנועה.');
    disposeModel();model=character.scene;actor.add(model);mixer=new THREE.AnimationMixer(model);action=mixer.clipAction(asset.animations.find(a=>a.name===id)||asset.animations[0]);action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();skeleton=new THREE.SkeletonHelper(model);skeleton.material.depthTest=false;skeleton.material.transparent=true;skeleton.material.opacity=.65;skeleton.renderOrder=5;scene.add(skeleton);ready=true;updatePose();render();
  }catch(error){if(sequence!==loadNumber)return;setPlaying(false);$('phase').textContent='הטעינה נכשלה';$('error').hidden=false;$('error').textContent=`לא ניתן לטעון את הקליפ. ${error.message}`;console.error(error);throw error;}
}
function bridgeFrom(id){if(!ready)return;const fromMotion=motions.find(c=>c.id===id),toMotion=motions.find(c=>c.id===current.id);activeBridge={bridge:makeClipBridge({fromMotion,toMotion,duration:.4}),elapsed:0};time=0;setPlaying(true);updatePose();render();}
async function bridgeTo(id){if(!ready)return;const fromMotion=motions.find(c=>c.id===current.id),fromTime=time,toMotion=motions.find(c=>c.id===id);await selectClip(clips.find(c=>c.id===id));activeBridge={bridge:makeClipBridge({fromMotion,toMotion,fromTime,duration:.4}),elapsed:0};time=0;setPlaying(true);updatePose();render();}
$('from-idle').addEventListener('click',()=>bridgeFrom('idle'));$('from-run').addEventListener('click',()=>bridgeFrom('run'));$('to-idle').addEventListener('click',()=>bridgeTo('idle'));$('to-run').addEventListener('click',()=>bridgeTo('run'));
function resize(){const{width,height}=canvas.getBoundingClientRect();renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();if(innerWidth<=600)document.querySelector('.clip-button[aria-pressed="true"]')?.scrollIntoView({block:'nearest',inline:'center'});}
new ResizeObserver(resize).observe(canvas);resize();
for(const b of document.querySelectorAll('[data-view]'))b.addEventListener('click',()=>setView(b.dataset.view));
$('play').addEventListener('click',()=>setPlaying(!playing));$('restart').addEventListener('click',()=>{if(ready){time=0;updatePose();}});$('scrub').addEventListener('input',()=>seek(Number($('scrub').value)/30));for(const id of['ball','soles','skeleton','heading'])$(id).addEventListener('change',updatePose);
let previous=performance.now();renderer.setAnimationLoop(now=>{const dt=Math.min(.05,Math.max(0,(now-previous)/1000));previous=now;if(playing&&ready){if(activeBridge){activeBridge.elapsed+=dt*Number($('speed').value);if(activeBridge.elapsed>=activeBridge.bridge.duration){activeBridge=null;time=0;}updatePose();render();return;}time+=dt*Number($('speed').value);const d=durationOf(current);if(current.loop)time%=d;else if(time>d+.35)time=0;const elapsed=time;time=Math.min(time,d);updatePose();time=elapsed;}render();});
function poseSnapshot(){model.updateMatrixWorld(true);const joints={};for(const name of['Root','Hips','Spine','Chest','Neck','Head','LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand','LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot']){const bone=model.getObjectByName(name);joints[name]={position:bone.getWorldPosition(new THREE.Vector3()).toArray(),quaternion:bone.getWorldQuaternion(new THREE.Quaternion()).toArray()};}return{time,bridgeActive:!!activeBridge,actorPosition:actor.position.toArray(),joints};}
window.hoopsMotionPreview={poseSnapshot,get ready(){return ready;},get current(){return current;},get clips(){return clips;},get bridgeActive(){return!!activeBridge;},bridgeFrom,bridgeTo,select:async id=>{const c=clips.find(c=>idOf(c)===id);if(!c)throw new Error(`Unknown clip ${id}`);await selectClip(c);},seek,setView,setPlaying,snapshot(width=400,height=440){if(!ready)throw new Error('Clip is loading');const oldRatio=renderer.getPixelRatio();renderer.setPixelRatio(1);renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();updatePose();render();const data=canvas.toDataURL('image/png');renderer.setPixelRatio(oldRatio);resize();render();return data;}};
try{motions=(await(await fetch(new URL('./runtime/motions.json',import.meta.url))).json()).clips;const response=await fetch(catalogURL);if(!response.ok)throw new Error(`HTTP ${response.status}`);const catalog=await response.json();clips=Array.isArray(catalog)?catalog:catalog.clips;if(!clips?.length)throw new Error('ספריית התנועות ריקה.');$('clip-count').textContent=`01 — ${clips.length}`;
  for(const[i,c]of clips.entries()){const id=idOf(c);framingScale=id==='dunk'?1.6:/^(jump_shot|layup|fadeaway|block)$/.test(id)?1.4:1;setView(currentView);const detail=descriptions[id]??[c.label??id,'',''],button=document.createElement('button');button.type='button';button.className='clip-button';button.dataset.clip=id;button.setAttribute('aria-pressed','false');const number=document.createElement('span');number.className='clip-number';number.textContent=String(i+1).padStart(2,'0');const text=document.createElement('span'),title=document.createElement('strong'),sub=document.createElement('small');title.textContent=detail[0];sub.textContent=detail[1];text.append(title,sub);button.append(number,text);button.addEventListener('click',()=>selectClip(c).catch(()=>{}));$('clips').append(button);}
  await selectClip(clips.find(c=>idOf(c)==='run')??clips[0]);
}catch(error){$('title').textContent='לא ניתן לטעון את הספרייה';$('error').hidden=false;$('error').textContent=`פתחו את התצוגה דרך שרת HTTP מקומי. ${error.message}`;console.error(error);}
