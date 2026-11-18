/** Original soccer-locomotion-v2 preview. SPDX-License-Identifier: CC0-1.0.
 * Reads native uncompressed GLB animations. Reference heading rotates only the
 * demonstration group; the animation's Root track stays fixed at identity.
 */
import * as THREE from '../soccer-motion-v8/runtime/vendor/three.module.js';
import {GLTFLoader} from '../soccer-motion-v8/runtime/vendor/GLTFLoader.js';
const $ = id => document.getElementById(id);
const descriptions = {
  idle_relaxed:['עמידה רגועה','נשימה · מנוחה','נשימה עדינה, כתפיים משוחררות ומרפקים כפופים קלות.'],
  idle_weight_shift:['העברת משקל','מנוחה · איזון','העברת משקל מדודה בין הרגליים עם ידיים רפויות.'],
  idle_scan:['מבט סביב','מנוחה · ערנות','סריקת המגרש בתנועת ראש קטנה, תוך שמירה על עמידה נינוחה.'],
  walk:['הליכה','קצב נינוח','יד ורגל נגדיות, צעדים נמוכים ומעבר מדורג בין כפות הרגליים.'],
  jog:['ריצה קלה','קצב בינוני','תנופת זרועות נגד הרגליים, מרפקים כפופים ונטייה קלה קדימה.'],
  run:['ריצה','קצב מהיר','מרפקים קרובים ל־90°, תנועת זרועות חופשית והתאוששות העקב.'],
  sprint:['ספרינט','קצב מרבי','תנופת זרועות רחבה, נטייה קדימה וברכיים פעילות.'],
  idle_to_run:['האצה לריצה','עמידה → ריצה','הגוף מקדים את הדחיפה והצעדים מתארכים בהדרגה.'],
  run_to_idle:['האטה לעצירה','ריצה → עמידה','ספיגת העומס בברכיים והחזרת המשקל לעמידה מאוזנת.'],
  turn_left_45:['פנייה 45° לשמאל','ריצה · שינוי כיוון','הטיית הגוף פנימה ומבט המוביל את הפנייה.'],
  turn_right_45:['פנייה 45° לימין','ריצה · שינוי כיוון','הטיית הגוף פנימה ומבט המוביל את הפנייה.'],
  turn_left_90:['פנייה 90° לשמאל','ריצה · שינוי כיוון','איזון באמצעות הזרועות בזמן שינוי כיוון חד.'],
  turn_right_90:['פנייה 90° לימין','ריצה · שינוי כיוון','איזון באמצעות הזרועות בזמן שינוי כיוון חד.'],
  turn_left_180:['פנייה 180° לשמאל','ריצה · חזרה לאחור','האטה לתמיכה, שינוי כיוון וחזרה לצעדי ריצה.'],
  turn_right_180:['פנייה 180° לימין','ריצה · חזרה לאחור','האטה לתמיכה, שינוי כיוון וחזרה לצעדי ריצה.'],
  strafe_left:['צעדי צד לשמאל','תנועה צדית','רגל מובילה פותחת והרגל השנייה חוזרת בלי הצטלבות.'],
  strafe_right:['צעדי צד לימין','תנועה צדית','רגל מובילה פותחת והרגל השנייה חוזרת בלי הצטלבות.'],
  run_backward:['ריצה לאחור','מבט קדימה','צעדים קצרים ונשלטים לאחור, עם זרועות מאזנות.'],
  run_ball:['ריצה עם כדור','נגיעות קצרות','כדור קרוב לרגל ונגיעות קלות, עם ידיים המשמרות שיווי משקל.'],
};
const eventNames = {footstrike:'מגע רגל',toeoff:'סיום תמיכה',entry:'תחילת מעבר',exit:'סיום מעבר',left_contact:'רגל שמאל',right_contact:'רגל ימין',contact:'מגע',touch:'נגיעה',ball_touch:'נגיעה בכדור',accelerate:'האצה',decelerate:'האטה',turn:'פנייה',plant:'תמיכה',foot_contact:'מגע רגל',takeoff:'דחיפה',land:'נחיתה'};
const canvas = $('stage');
const renderer = new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
renderer.outputColorSpace=THREE.SRGBColorSpace; renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.25;
const scene=new THREE.Scene();scene.background=new THREE.Color('#142925');scene.fog=new THREE.Fog('#142925',6,13);
const camera=new THREE.PerspectiveCamera(34,1,.01,35);
const views={three:[2.6,1.6,3.0],front:[0,1.4,4.0],side:[4.0,1.45,.12]};
function setView(name){if(!views[name])throw new Error('Unknown view');camera.position.fromArray(views[name]);camera.lookAt(0,.86,.08);for(const b of document.querySelectorAll('[data-view]'))b.setAttribute('aria-pressed',String(b.dataset.view===name));}
setView('three');
scene.add(new THREE.HemisphereLight('#eaf4de','#425e4d',2.2));
const key=new THREE.DirectionalLight('#fff2d8',3);key.position.set(3,5,4);scene.add(key);
const rim=new THREE.DirectionalLight('#a3d4c6',2);rim.position.set(-3,3,-2);scene.add(rim);
const ground=new THREE.Mesh(new THREE.PlaneGeometry(30,30),new THREE.MeshStandardMaterial({color:'#1e3830',roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-.012;scene.add(ground);
const grid=new THREE.GridHelper(12,48,'#61735d','#344d3e');grid.position.y=-.008;grid.material.transparent=true;grid.material.opacity=.25;scene.add(grid);
const ring=new THREE.Mesh(new THREE.RingGeometry(.72,.725,96),new THREE.MeshBasicMaterial({color:'#70856a',transparent:true,opacity:.45,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=-.005;scene.add(ring);
scene.add(new THREE.ArrowHelper(new THREE.Vector3(0,0,1),new THREE.Vector3(0,.008,1.05),.55,'#c2d9ac',.09,.05));
const actor=new THREE.Group();scene.add(actor);
const ball=new THREE.Mesh(new THREE.SphereGeometry(.11,24,16),new THREE.MeshStandardMaterial({color:'#f4ead2',roughness:.6}));actor.add(ball);
const seam=new THREE.Mesh(new THREE.TorusGeometry(.1102,.0018,4,48),new THREE.MeshBasicMaterial({color:'#556951'}));ball.add(seam);const seam2=seam.clone();seam2.rotation.y=Math.PI/2;ball.add(seam2);
const soleMarkers=['LeftFoot','RightFoot'].map(name=>{const marker=new THREE.Mesh(new THREE.SphereGeometry(.016,12,8),new THREE.MeshBasicMaterial({color:'#d8c375',depthTest:false,transparent:true,opacity:.8}));marker.renderOrder=10;scene.add(marker);return{name,marker};});
const position=new THREE.Vector3(),rotation=new THREE.Quaternion(),loader=new GLTFLoader();
let clips=[],current,model,mixer,action,skeleton,time=0,playing=true,loadNumber=0,ready=false;
const catalogURL=new URL('./runtime/catalog.json',import.meta.url);
const idOf=c=>c.id??c.name;
const durationOf=c=>c.durationSeconds??c.duration??1;
const eventTime=e=>e.time??e.atSeconds??(e.frame??0)/30;
const eventType=e=>e.type??e.event??e.name;
function interpolate(keys,t,property){if(!keys.length)return null;let i=keys.findIndex(k=>(k.time??k.t??0)>=t);if(i<0)i=keys.length-1;const b=keys[i],a=keys[Math.max(0,i-1)],ta=a.time??a.t??0,tb=b.time??b.t??0,u=tb>ta?THREE.MathUtils.clamp((t-ta)/(tb-ta),0,1):0;const x=a[property],y=b[property];if(Array.isArray(x))return x.map((v,j)=>v+(y[j]-v)*u);return x+(y-x)*u;}
function updatePose(){
  if(!current||!action||!ready)return;
  action.time=Math.min(time,Math.max(0,action.getClip().duration-1e-8));action.paused=true;mixer.update(0);
  const heading=interpolate(current.referenceTravel?.samples??[],time,'yawRadians');actor.rotation.y=$('heading').checked&&Number.isFinite(heading)?heading:0;
  actor.updateMatrixWorld(true);skeleton.visible=$('skeleton').checked;
  for(const{name,marker}of soleMarkers){const bone=model.getObjectByName(name);marker.visible=$('soles').checked&&!!bone;if(bone){bone.getWorldPosition(position);bone.getWorldQuaternion(rotation);marker.position.copy(position).add(new THREE.Vector3(0,-.08,0).applyQuaternion(rotation));}}
  const bp=interpolate(current.ball?.samples??[],time,'position');ball.visible=$('ball').checked&&Array.isArray(bp);if(ball.visible){const radius=current.ball?.radius??.11;ball.scale.setScalar(radius/.11);ball.position.fromArray(bp);ball.rotation.x=time*(current.speedMps??2)/radius;}
  const d=durationOf(current),frame=Math.round(time*30);$('scrub').value=String(frame);$('time').textContent=`${time.toFixed(2)} / ${d.toFixed(2)}`;$('frame').textContent=`פריים ${frame} / ${Math.round(d*30)}`;
  const event=(current.events??[]).find(e=>Math.abs(eventTime(e)-time)<.045);$('phase').textContent=event?(eventNames[eventType(event)]??'אירוע תנועה'):(current.loop?'מחזור תנועה':'מעבר תנועה');
}
function render(){renderer.render(scene,camera);}
function setPlaying(value){playing=value;$('play').textContent=playing?'השהיה Ⅱ':'ניגון ▶';$('play').setAttribute('aria-label',playing?'השהיה':'ניגון');}
function seek(t){if(!ready)throw new Error('Clip is loading');time=THREE.MathUtils.clamp(t,0,durationOf(current));setPlaying(false);updatePose();render();}
function disposeModel(){if(!model)return;mixer.stopAllAction();mixer.uncacheRoot(model);actor.remove(model);scene.remove(skeleton);model.traverse(o=>{if(o.isMesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material]){for(const v of Object.values(m))if(v?.isTexture)v.dispose();m.dispose();}}});skeleton.dispose();model=undefined;}
async function selectClip(c){
  const sequence=++loadNumber;ready=false;current=c;time=0;$('error').hidden=true;$('phase').textContent='טוען…';
  const id=idOf(c),detail=descriptions[id]??[c.label??id,'',c.notes??''];$('title').textContent=detail[0];$('description').textContent=detail[2];for(const b of document.querySelectorAll('.clip-button'))b.setAttribute('aria-pressed',String(b.dataset.clip===id));if(innerWidth<=600)document.querySelector('.clip-button[aria-pressed="true"]')?.scrollIntoView({block:'nearest',inline:'center'});
  const d=durationOf(c);$('scrub').max=String(Math.round(d*30));$('loop-label').textContent=c.loop?'תנועה מחזורית':'תנועה חד־פעמית';$('events').replaceChildren();
  for(const e of c.events??[]){const type=eventType(e),at=eventTime(e);if(!Number.isFinite(at))continue;const button=document.createElement('button');button.type='button';button.className='event-button';const label=document.createElement('span');label.textContent=eventNames[type]??type;const stamp=document.createElement('small');stamp.textContent=`${at.toFixed(3)} s`;button.append(label,stamp);button.addEventListener('click',()=>seek(at));$('events').append(button);}
  try{
    const path=c.file??c.asset??`clips/${id}.glb`,url=new URL(path.startsWith('runtime/')?path.slice(8):path,catalogURL);
    const asset=await loader.loadAsync(url.href);if(sequence!==loadNumber)return;if(!asset.animations.length)throw new Error('לקובץ אין ערוץ תנועה.');
    disposeModel();model=asset.scene;actor.add(model);mixer=new THREE.AnimationMixer(model);action=mixer.clipAction(asset.animations.find(a=>a.name===id)||asset.animations[0]);action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();skeleton=new THREE.SkeletonHelper(model);skeleton.material.depthTest=false;skeleton.material.transparent=true;skeleton.material.opacity=.65;skeleton.renderOrder=5;scene.add(skeleton);ready=true;updatePose();render();
  }catch(error){if(sequence!==loadNumber)return;setPlaying(false);$('phase').textContent='הטעינה נכשלה';$('error').hidden=false;$('error').textContent=`לא ניתן לטעון את הקליפ. ${error.message}`;console.error(error);throw error;}
}
function resize(){const{width,height}=canvas.getBoundingClientRect();renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();if(innerWidth<=600)document.querySelector('.clip-button[aria-pressed="true"]')?.scrollIntoView({block:'nearest',inline:'center'});}
new ResizeObserver(resize).observe(canvas);resize();
for(const b of document.querySelectorAll('[data-view]'))b.addEventListener('click',()=>setView(b.dataset.view));
$('play').addEventListener('click',()=>setPlaying(!playing));$('restart').addEventListener('click',()=>{if(ready){time=0;updatePose();}});$('scrub').addEventListener('input',()=>seek(Number($('scrub').value)/30));for(const id of['ball','soles','skeleton','heading'])$(id).addEventListener('change',updatePose);
let previous=performance.now();renderer.setAnimationLoop(now=>{const dt=Math.min(.05,Math.max(0,(now-previous)/1000));previous=now;if(playing&&ready){time+=dt*Number($('speed').value);const d=durationOf(current);if(current.loop)time%=d;else if(time>d+.35)time=0;const elapsed=time;time=Math.min(time,d);updatePose();time=elapsed;}render();});
window.locomotionPreview={get ready(){return ready;},get current(){return current;},get clips(){return clips;},select:async id=>{const c=clips.find(c=>idOf(c)===id);if(!c)throw new Error(`Unknown clip ${id}`);await selectClip(c);},seek,setView,setPlaying,snapshot(width=400,height=440){if(!ready)throw new Error('Clip is loading');const oldRatio=renderer.getPixelRatio();renderer.setPixelRatio(1);renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();updatePose();render();const data=canvas.toDataURL('image/png');renderer.setPixelRatio(oldRatio);resize();render();return data;}};
try{const response=await fetch(catalogURL);if(!response.ok)throw new Error(`HTTP ${response.status}`);const catalog=await response.json();clips=Array.isArray(catalog)?catalog:catalog.clips;if(!clips?.length)throw new Error('ספריית התנועות ריקה.');$('clip-count').textContent=`01 — ${clips.length}`;
  for(const[i,c]of clips.entries()){const id=idOf(c),detail=descriptions[id]??[c.label??id,'',''],button=document.createElement('button');button.type='button';button.className='clip-button';button.dataset.clip=id;button.setAttribute('aria-pressed','false');const number=document.createElement('span');number.className='clip-number';number.textContent=String(i+1).padStart(2,'0');const text=document.createElement('span'),title=document.createElement('strong'),sub=document.createElement('small');title.textContent=detail[0];sub.textContent=detail[1];text.append(title,sub);button.append(number,text);button.addEventListener('click',()=>selectClip(c).catch(()=>{}));$('clips').append(button);}
  await selectClip(clips.find(c=>idOf(c)==='run')??clips[0]);
}catch(error){$('title').textContent='לא ניתן לטעון את הספרייה';$('error').hidden=false;$('error').textContent=`פתחו את התצוגה דרך שרת HTTP מקומי. ${error.message}`;console.error(error);}
