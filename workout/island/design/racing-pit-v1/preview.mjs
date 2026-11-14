// Original standalone asset reviewer; no production game integration. CC0-1.0.
import * as THREE from '../racing-v7/vendor/three.module.js';
import {GLTFLoader} from '../racing-v7/vendor/GLTFLoader.js';
import {clone as cloneSkeleton} from '../racing-v7/vendor/SkeletonUtils.js';

const $ = s => document.querySelector(s);
const catalog = await fetch('source/model-catalog.json').then(r=>{if(!r.ok)throw new Error('model catalog');return r.json();});
const CLIP_NAMES={idle_wait:'המתנה',rush_in:'כניסת הצוות',remove_wheel:'פירוק גלגל',mount_wheel:'הרכבת גלגל',jack_up:'הרמה בג׳ק',jack_down:'הורדה בג׳ק',thumbs_up:'אישור מוכנות',step_back:'נסיגה',wipe_screen:'ניקוי שמשה',signal_release:'אישור יציאה'};
const ACTOR_NAMES={wheel_front_left:'גלגל קדמי שמאל',wheel_front_right:'גלגל קדמי ימין',wheel_rear_left:'גלגל אחורי שמאל',wheel_rear_right:'גלגל אחורי ימין',jack_operator:'מפעיל הג׳ק',screen_cleaner:'מנקה השמשה',light_controller:'אחראי האור'};
const PROP_NAMES={tire_stack:'ערימת צמיגים',wheel_gun:'אקדח גלגל',jack:'ג׳ק',stop_star:'כוכבית עצירה',pit_light_entry:'אור כניסה',pit_light_exit:'אור יציאה',pit_lane_arrows:'חצי נתיב פיטס',speed_limit_symbol:'מהירות מוגבלת',spare_wheel:'גלגל חלופי',cleaning_cloth:'מטלית ניקוי'};
const SOUND_NAMES={wheel_gun_loosen:'אקדח גלגל · פתיחה',wheel_gun_tighten:'אקדח גלגל · סגירה',jack:'הרמת ג׳ק',wheel_drop:'גלגל נופל',crew_cheer:'הצוות מריע',wheel_attach:'חיבור גלגל',engine_exit:'יציאה מהפיטס'};
const stages=[['idle_wait',1],['rush_in',2.8],['jack_up',2.8],['remove_wheel',3.2],['mount_wheel',3.2],['jack_down',2.8],['thumbs_up',2.4],['step_back',3.6]].map(([id,duration],i,a)=>({id,duration,start:a.slice(0,i).reduce((s,v)=>s+v[1],0)}));
const TOTAL=21.8;
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
let mode='sequence', time=0, playing=false, soundEnabled=false, speed=1, ready=false, solo=null, equipment=null;
let selectedActor=catalog.crew[0].id, selectedClip='idle_wait', selectedProp='tire_stack', selectedColor='#18b6bd';
const activeAudio=new Set();
function sound(id) {
  const a=new Audio();
  a.src=`audio/${id}.${a.canPlayType('audio/ogg; codecs="vorbis"')?'ogg':'mp3'}`;
  a.volume=.65;activeAudio.add(a);
  const done=()=>activeAudio.delete(a);a.onended=done;a.onerror=done;
  a.play().catch(done);
  return a;
}
function stopSounds(){for(const a of activeAudio)a.pause();activeAudio.clear();}
for(const [id,label] of Object.entries(SOUND_NAMES)) {
  const card=document.createElement('div');card.className='audio-card';
  const button=document.createElement('button');button.textContent='▶';button.setAttribute('aria-label',`ניגון ${label}`);button.setAttribute('aria-pressed','false');
  const info=document.createElement('div'), title=document.createElement('h3');title.textContent=label;info.append(title);
  for(const format of ['ogg','mp3']){const link=document.createElement('a');link.href=`audio/${id}.${format}`;link.download='';link.textContent=format.toUpperCase();info.append(link);}
  let current;
  button.onclick=()=>{
    if(current&&!current.paused){current.pause();current=null;button.textContent='▶';button.setAttribute('aria-pressed','false');return;}
    current=sound(id);button.textContent='■';button.setAttribute('aria-pressed','true');
    const reset=()=>{current=null;button.textContent='▶';button.setAttribute('aria-pressed','false');};
    current.addEventListener('ended',reset);current.addEventListener('error',reset);
  };
  card.append(button,info);$('#audio-grid').append(card);
}
for(const [i,stage] of stages.entries()){
  const button=document.createElement('button');button.dataset.stage=stage.id;button.setAttribute('aria-current',String(i===0));
  const n=document.createElement('span');n.className='stage-number';n.textContent=`0${i+1}`;
  const label=document.createElement('span');label.textContent=CLIP_NAMES[stage.id];button.append(n,label);
  button.onclick=()=>{time=stage.start;playing=false;stopSounds();update();};$('#stage-list').append(button);
}
for(const actor of catalog.crew){const o=document.createElement('option');o.value=actor.id;o.textContent=ACTOR_NAMES[actor.id];$('#actor-select').append(o);}
for(const [id,label] of Object.entries(CLIP_NAMES)){const o=document.createElement('option');o.value=id;o.textContent=label;$('#clip-select').append(o);}
for(const prop of catalog.props){const o=document.createElement('option');o.value=prop.id;o.textContent=PROP_NAMES[prop.id];$('#equipment-select').append(o);}

let renderer;
try{
  renderer=new THREE.WebGLRenderer({canvas:$('#scene'),antialias:true,alpha:false,powerPreference:'high-performance'});
}catch(error){$('#loading').textContent='תצוגת התלת־ממד אינה זמינה בדפדפן הזה. האייקונים, הצלילים וקישורי ההורדה זמינים בהמשך הדף.';$('#loading').classList.add('error');throw error;}
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const scene=new THREE.Scene();scene.background=new THREE.Color('#b7c9c9');scene.fog=new THREE.Fog('#b7c9c9',22,42);
const camera=new THREE.PerspectiveCamera(35,1,.1,80);
const hemi=new THREE.HemisphereLight('#effaf3','#697579',2.7);scene.add(hemi);
const sun=new THREE.DirectionalLight('#fff0d8',3.5);sun.position.set(4,9,6);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
sun.shadow.camera.left=-8;sun.shadow.camera.right=8;sun.shadow.camera.top=8;sun.shadow.camera.bottom=-8;sun.shadow.normalBias=.025;sun.shadow.bias=-.0001;scene.add(sun);
const rim=new THREE.DirectionalLight('#b5e2ed',1.1);rim.position.set(-5,5,-4);scene.add(rim);
const sequenceGroup=new THREE.Group(),soloGroup=new THREE.Group(),equipmentGroup=new THREE.Group();scene.add(sequenceGroup,soloGroup,equipmentGroup);soloGroup.visible=equipmentGroup.visible=false;
function box(parent,size,position,color,roughness=.9){const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),new THREE.MeshStandardMaterial({color,roughness}));mesh.position.set(...position);mesh.receiveShadow=true;mesh.castShadow=true;parent.add(mesh);return mesh;}
box(sequenceGroup,[24,.10,22],[0,-.065,0],'#b7c6c4');
box(sequenceGroup,[9,.014,6.4],[0,-.005,0],'#a2b6b3');
for(const x of [-2.05,2.05])box(sequenceGroup,[.055,.018,5.2],[x,.005,0],'#ebefd9');
for(const z of [-2.65,2.65])box(sequenceGroup,[4.15,.018,.055],[0,.005,z],'#ebefd9');
// Text-free garage architecture and floor chevrons are presentation geometry only.
box(sequenceGroup,[16,2.8,.22],[0,1.34,-5.0],'#899f9f');
box(sequenceGroup,[16,.25,.26],[0,2.74,-4.98],'#354d53');
for(const x of [-6,-2.9,2.9,6])box(sequenceGroup,[.16,2.8,.40],[x,1.34,-4.85],'#354d53');
for(const x of [-4.4,0,4.4]){box(sequenceGroup,[2.45,2.2,.08],[x,1.05,-4.82],'#637f83');box(sequenceGroup,[2.2,.035,.04],[x,2.36,-4.75],'#d1ddd1');}
for(let i=0;i<8;i++)box(sequenceGroup,[.28,.025,.18],[-1.96+i*.56,.008,2.65],i%2?'#e9eadc':'#314c51');
for(const z of [-1.5,.0,1.5])for(const sign of [-1,1]){const arrow=box(sequenceGroup,[.035,.015,.50],[4.2+sign*.14,.007,z],'#edf0de');arrow.rotation.y=sign*.65;}
for(const parent of [soloGroup,equipmentGroup]){
  box(parent,[18,.08,18],[0,-.07,0],'#b7c6c4');
  const podium=new THREE.Mesh(new THREE.CylinderGeometry(1.24,1.33,.06,64),new THREE.MeshStandardMaterial({color:'#9fb5b2',roughness:.8}));podium.position.y=-.025;podium.receiveShadow=true;parent.add(podium);
}
const loader=new GLTFLoader(), assets=new Map(), actors=[];
function prepare(root){root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});return root;}
function instance(id){return prepare(assets.get(id).scene.clone(true));}
const stations={wheel_front_left:[1.50,0,1.25,-Math.PI/2],wheel_front_right:[-1.50,0,1.25,Math.PI/2],wheel_rear_left:[1.50,0,-1.31,-Math.PI/2],wheel_rear_right:[-1.50,0,-1.31,Math.PI/2],jack_operator:[0,0,3.46,Math.PI],screen_cleaner:[-.80,0,.28,Math.PI/2],light_controller:[2.85,0,2.05,-Math.PI*.73]};
function animator(root,animations){return {root,mixer:new THREE.AnimationMixer(root),animations,clip:null,action:null};}
function sample(actor,clip,t){
  if(actor.clip!==clip){actor.mixer.stopAllAction();actor.clip=clip;actor.action=actor.mixer.clipAction(actor.animations.find(a=>a.name===clip));actor.action.reset().play();actor.action.paused=true;actor.action.setEffectiveWeight(1);}
  actor.action.time=Math.max(0,Math.min(t,actor.action.getClip().duration));actor.mixer.update(0);
}
function setLamp(root,state){root.traverse(o=>{if(!o.isMesh||!/^Lamp/.test(o.name))return;if(!o.userData.localLampMaterial){o.material=o.material.clone();o.userData.localLampMaterial=true;}const label=o.name.replace('Lamp','').toLowerCase();const color={red:'#ef5753',amber:'#ffc857',green:'#73e5a6'}[label];o.material.emissive.set(color);o.material.emissiveIntensity=label===state?2.4:.025;o.material.color.set(label===state?'#ffffff':'#607070');});}
function recolor(root,color){const c=new THREE.Color(color);root.traverse(o=>{if(!o.isMesh)return;const mask=o.geometry.getAttribute('_team_mask')??o.geometry.getAttribute('_TEAM_MASK'),colors=o.geometry.getAttribute('color');if(!mask||!colors)return;if(!o.userData.localColors){o.geometry=o.geometry.clone();o.userData.localColors=true;}const target=o.geometry.getAttribute('color');for(let i=0;i<target.count;i++)if(mask.getX(i)>.5)target.setXYZ(i,c.r,c.g,c.b);target.needsUpdate=true;});}
let car,carPaint=[],jack,stopStar,entryLight,exitLight,loose=[],fresh=[],guns=[],cloth;
const wheelNodes=[],wheelRest=[];
async function load(){
  const all=[...catalog.crew,...catalog.props];let loaded=0;
  await Promise.all(all.map(async asset=>{const gltf=await loader.loadAsync(asset.file);assets.set(asset.id,gltf);loaded++;$('#loading').textContent=`טוען נכסים · ${loaded} / ${all.length}`;}));
  const formula=await loader.loadAsync('../racing-formula/formula.glb');car=prepare(formula.scene);sequenceGroup.add(car);
  car.traverse(o=>{if(o.isMesh){const list=Array.isArray(o.material)?o.material:[o.material];for(const m of list)if(m.name==='Paint 1'&&!carPaint.includes(m)){m.color.set(selectedColor);carPaint.push(m);}}});
  for(const actor of catalog.crew){const gltf=assets.get(actor.id),root=prepare(cloneSkeleton(gltf.scene));sequenceGroup.add(root);actors.push({...animator(root,gltf.animations),id:actor.id,station:stations[actor.id]});}
  for(const id of ['WheelFrontL','WheelFrontR','WheelRearL','WheelRearR']){const node=car.getObjectByName(id);if(!node)throw new Error(`Formula wheel node missing: ${id}`);wheelNodes.push(node);wheelRest.push(node.position.clone());const old=prepare(node.clone(true));sequenceGroup.add(old);loose.push(old);const spare=instance('spare_wheel');sequenceGroup.add(spare);fresh.push(spare);}
  jack=instance('jack');jack.position.set(0,0,2.47);sequenceGroup.add(jack);
  stopStar=instance('stop_star');stopStar.position.set(.74,0,2.85);stopStar.rotation.y=-.35;sequenceGroup.add(stopStar);
  for(const [x,z] of [[-3.2,-3.4],[-2.38,-3.45],[3.15,-3.5]]){const stack=instance('tire_stack');stack.position.set(x,0,z);sequenceGroup.add(stack);}
  entryLight=instance('pit_light_entry');entryLight.position.set(3.55,0,-2.85);entryLight.rotation.y=-.35;sequenceGroup.add(entryLight);
  exitLight=instance('pit_light_exit');exitLight.position.set(3.45,0,2.90);exitLight.rotation.y=-.35;sequenceGroup.add(exitLight);
  for(const [id,x,z,yaw] of [['pit_lane_arrows',4.35,-2.8,-.4],['speed_limit_symbol',4.6,2.45,-.4]]){const prop=instance(id);prop.position.set(x,0,z);prop.rotation.y=yaw;sequenceGroup.add(prop);}
  for(const actor of actors.filter(a=>a.id.startsWith('wheel'))){const gun=instance('wheel_gun');gun.position.set(0,.045,.035);actor.root.getObjectByName('RightHand').add(gun);guns.push({actor,gun});}
  cloth=instance('cleaning_cloth');cloth.position.set(0,-.03,.035);actors.find(a=>a.id==='screen_cleaner').root.getObjectByName('RightHand').add(cloth);
  recolorAll();ready=true;$('#loading').hidden=true;$('#play').disabled=false;update();
  window.pitPreview={get state(){return {ready,mode,time,playing,stage:stageAt(time).id,crew:actors.length,loadedAssets:assets.size,carLift:car.position.y,attachedWheels:wheelNodes.filter(w=>w.visible).length,visibleOldWheels:loose.filter(w=>w.visible).length,exitState:exitLight.userData.state??'red',renderer:renderer.info.render};},seek(t){mode='sequence';time=Math.max(0,Math.min(TOTAL,t));playing=false;setMode('sequence',false);update();},setMode,selectClip(id){selectedClip=id;$('#clip-select').value=id;time=0;setupSolo();update();},setActor(id){selectedActor=id;$('#actor-select').value=id;time=0;setupSolo();update();}};
}
function recolorAll(){for(const actor of actors)recolor(actor.root,selectedColor);if(solo)recolor(solo.root,selectedColor);for(const m of carPaint)m.color.set(selectedColor);}
const target=new THREE.Vector3(0,.65,0);let yaw=.68,pitch=.48,radius=13.3;
function resetCamera(){if(mode==='sequence'){yaw=.68;pitch=.48;radius=13.3;target.set(.15,.65,0);}else{yaw=.52;pitch=.20;radius=mode==='crew'?4.6:5.0;target.set(0,mode==='crew'?.82:.70,mode==='crew'?.22:0);}cameraMove();}
function cameraMove(){camera.position.set(target.x+radius*Math.cos(pitch)*Math.sin(yaw),target.y+radius*Math.sin(pitch),target.z+radius*Math.cos(pitch)*Math.cos(yaw));camera.lookAt(target);}
cameraMove();
let drag=null;
$('#scene').addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,id:e.pointerId};$('#scene').setPointerCapture(e.pointerId);});
$('#scene').addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;yaw-=(e.clientX-drag.x)*.007;pitch=Math.max(.09,Math.min(1.2,pitch+(e.clientY-drag.y)*.005));drag={...drag,x:e.clientX,y:e.clientY};cameraMove();});
for(const event of ['pointerup','pointercancel','lostpointercapture'])$('#scene').addEventListener(event,()=>{drag=null;});
$('#scene').addEventListener('wheel',e=>{e.preventDefault();radius=Math.max(mode==='sequence'?8:2.2,Math.min(22,radius*Math.exp(e.deltaY*.001)));cameraMove();},{passive:false});
$('#reset-camera').onclick=resetCamera;
$('#fullscreen').onclick=()=>{if(document.fullscreenElement)document.exitFullscreen();else $('#viewport').requestFullscreen?.();};
$('#sound-toggle').onclick=()=>{soundEnabled=!soundEnabled;$('#sound-toggle').setAttribute('aria-pressed',String(soundEnabled));$('#sound-toggle').setAttribute('aria-label',soundEnabled?'השתקת צלילי העצירה':'הפעלת צלילי העצירה');if(!soundEnabled)stopSounds();};
function stageAt(t){return stages.findLast(s=>t>=s.start-1e-7)??stages[0];}
const smooth=x=>{x=THREE.MathUtils.clamp(x,0,1);return x*x*(3-2*x);};
function sequence(t){
  const stage=stageAt(t),local=t-stage.start,index=stages.indexOf(stage),u=Math.min(1,local/stage.duration);
  const lift=index<2?0:index===2?.16*smooth((u-.3)/.4):index<5?.16:index===5?.16*(1-smooth((u-.3)/.4)):0;
  const clear=index===7&&local>=2.4;
  car.position.set(0,lift,clear?7*smooth((local-2.4)/1.2):0);
  for(const actor of actors){
    const [x,y,z,angle]=actor.station, forward=new THREE.Vector3(Math.sin(angle),0,Math.cos(angle));
    actor.root.position.set(x,y,z);actor.root.rotation.set(0,angle,0);
    let clip='idle_wait',phase=t%2.4;
    const controller=actor.id==='light_controller';
    if(index===0&&!controller)actor.root.position.addScaledVector(forward,-.96);
    else if(index===1&&!controller){actor.root.position.addScaledVector(forward,-.96);clip='rush_in';phase=local;}
    else if(index===2&&actor.id==='jack_operator'){clip='jack_up';phase=local;}
    else if(index===3&&actor.id.startsWith('wheel')){clip='remove_wheel';phase=local;}
    else if(index===3&&actor.id==='screen_cleaner'){clip='wipe_screen';phase=local;}
    else if(index===4&&actor.id.startsWith('wheel')){clip='mount_wheel';phase=local;}
    else if(index===5&&actor.id==='jack_operator'){clip='jack_down';phase=local;}
    else if(index===6&&!controller){clip='thumbs_up';phase=local;}
    else if(index===7&&!controller){clip='step_back';phase=Math.min(2.4,local);}
    else if(index===7&&controller&&clear){clip='signal_release';phase=(local-2.4)*2;}
    sample(actor,clip,phase);
  }
  jack.position.set(index===7?1.28*smooth(local/2.0):0,0,2.47);
  jack.getObjectByName('LiftPad').position.y=.19+lift;
  jack.getObjectByName('Handle').rotation.x=-.70*(lift/.16);
  stopStar.position.x=.74+(index===7?.8*smooth(local/2):0);
  for(let i=0;i<4;i++){
    const p=wheelRest[i],sign=Math.sign(p.x),old=loose[i],spare=fresh[i],mount=index===4?smooth((u-.22)/.40):index>4?1:0;
    const removed=index===3&&u>=.58||index>3;
    wheelNodes[i].visible=!removed||mount>=1;
    old.visible=removed;old.position.copy(p);old.position.x=sign*(Math.abs(p.x)+1.8*(index===3?smooth((u-.58)/.32):1));old.position.y=index===3?lift+p.y-(lift)*smooth((u-.58)/.32):p.y;
    spare.visible=mount<1;spare.scale.setScalar(p.y/.34);spare.position.set(sign*2.30,p.y,p.z+.48);
    if(index===4)spare.position.lerp(new THREE.Vector3(p.x,p.y+lift,p.z),mount);
  }
  sequenceGroup.updateMatrixWorld(true);
  for(const [i,{gun}] of guns.entries()){
    gun.visible=index>=2&&index<=5;
    const p=wheelRest[i].clone().add(new THREE.Vector3(0,lift,0));
    const origin=gun.getWorldPosition(new THREE.Vector3());const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),p.sub(origin).normalize());
    const parentQ=gun.parent.getWorldQuaternion(new THREE.Quaternion());gun.quaternion.copy(parentQ.invert().multiply(q));
  }
  cloth.visible=index===3;
  setLamp(entryLight,index===0||clear?'green':'amber');setLamp(exitLight,clear?'green':'red');exitLight.userData.state=clear?'green':'red';
  $('#stage-label').textContent=clear?'הנתיב פנוי · יציאה למרוץ':CLIP_NAMES[stage.id];
  $('#current-stage').textContent=clear?'יציאה למרוץ':CLIP_NAMES[stage.id];
  document.querySelectorAll('[data-stage]').forEach(b=>b.setAttribute('aria-current',String(b.dataset.stage===stage.id)));
}
function disposeSolo(){if(!solo)return;solo.mixer.stopAllAction();solo.mixer.uncacheRoot(solo.root);solo.root.traverse(o=>{if(o.isMesh&&o.userData.localColors)o.geometry.dispose();});soloGroup.remove(solo.root);solo=null;}
function setupSolo(){if(!ready)return;disposeSolo();const asset=assets.get(selectedActor),root=prepare(cloneSkeleton(asset.scene));soloGroup.add(root);solo=animator(root,asset.animations);recolor(root,selectedColor);const actor=catalog.crew.find(a=>a.id===selectedActor);$('#actor-info').textContent=`${actor.triangles.toLocaleString('he-IL')} משולשים · 18 עצמות · 10 קליפים`;
  if(selectedClip==='rush_in')target.z=.48;else if(selectedClip==='step_back')target.z=-.32;else target.z=0;cameraMove();
}
function setupEquipment(){if(!ready)return;if(equipment)equipmentGroup.remove(equipment);equipment=instance(selectedProp);equipmentGroup.add(equipment);if(selectedProp==='spare_wheel'){equipment.position.y=.34;}if(['wheel_gun','cleaning_cloth'].includes(selectedProp)){equipment.position.y=.6;equipment.scale.setScalar(2.7);}const prop=catalog.props.find(p=>p.id===selectedProp);$('#equipment-info').textContent=`${prop.triangles.toLocaleString('he-IL')} משולשים · GLB ללא מרקמים`;
  $('#lamp-controls').hidden=!selectedProp.startsWith('pit_light');setLamp(equipment,'red');document.querySelectorAll('[data-lamp]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.lamp==='red')));}
function setMode(next,reset=true){if(!ready)return;mode=next;if(reset){time=0;playing=false;stopSounds();}sequenceGroup.visible=mode==='sequence';soloGroup.visible=mode==='crew';equipmentGroup.visible=mode==='equipment';$('#stage-list').hidden=mode!=='sequence';$('#clip-panel').hidden=mode!=='crew';$('#equipment-panel').hidden=mode!=='equipment';document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));if(mode==='crew')setupSolo();if(mode==='equipment')setupEquipment();$('#play').disabled=mode==='equipment';$('#timeline').disabled=mode==='equipment';if(reset)resetCamera();update();}
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
document.querySelectorAll('[data-color]').forEach(b=>b.onclick=()=>{selectedColor=b.dataset.color;document.querySelectorAll('[data-color]').forEach(c=>c.setAttribute('aria-pressed',String(c===b)));recolorAll();update();});
document.querySelectorAll('[data-lamp]').forEach(b=>b.onclick=()=>{if(equipment)setLamp(equipment,b.dataset.lamp);document.querySelectorAll('[data-lamp]').forEach(c=>c.setAttribute('aria-pressed',String(c===b)));update();});
$('#actor-select').onchange=e=>{selectedActor=e.target.value;time=0;setupSolo();update();};
$('#clip-select').onchange=e=>{selectedClip=e.target.value;time=0;playing=!reducedMotion;setupSolo();update();};
$('#equipment-select').onchange=e=>{selectedProp=e.target.value;setupEquipment();update();};
function duration(){return mode==='crew'?solo?.animations.find(c=>c.name===selectedClip)?.duration??2.4:TOTAL;}
$('#play').onclick=()=>{if(time>=duration()-.01)time=0;playing=!playing;if(!playing)stopSounds();update();};
$('#timeline').oninput=e=>{playing=false;time=Number(e.target.value)/1000*duration();stopSounds();update();};
$('#speed').onchange=e=>{speed=Number(e.target.value);};
function update(){if(!ready)return;if(mode==='sequence')sequence(time);else if(mode==='crew'){sample(solo,selectedClip,time);$('#stage-label').textContent=`${ACTOR_NAMES[selectedActor]} · ${CLIP_NAMES[selectedClip]}`;$('#current-stage').textContent=CLIP_NAMES[selectedClip];}else{$('#stage-label').textContent=PROP_NAMES[selectedProp];$('#current-stage').textContent='תצוגת ציוד';}
  $('#play-glyph').textContent=playing?'Ⅱ':'▶';$('#play-label').textContent=playing?'השהיה':time>=duration()-.01?'ניגון מחדש':mode==='crew'?'ניגון התנועה':'הפעלת העצירה';$('#play').setAttribute('aria-label',$('#play-label').textContent);$('#timeline').value=String(Math.round(time/duration()*1000));$('#time-display').textContent=`${time.toFixed(1)} / ${duration().toFixed(1)}`;
  renderer.render(scene,camera);
}
const events=[['jack',4.64],['wheel_gun_loosen',7.78],['wheel_drop',8.46],['wheel_attach',11.27],['wheel_gun_tighten',11.72],['jack',13.84],['crew_cheer',17],['engine_exit',20.6]];
let last=performance.now();
function frame(now){requestAnimationFrame(frame);const delta=Math.min(.07,(now-last)/1000);last=now;if(!ready||document.hidden)return;if(playing){const old=time;time=Math.min(duration(),time+delta*speed);if(mode==='sequence'&&soundEnabled)for(const [id,at] of events)if(old<at&&time>=at)sound(id);if(time>=duration())playing=false;update();}else renderer.render(scene,camera);}
new ResizeObserver(()=>{const rect=$('#viewport').getBoundingClientRect();renderer.setSize(rect.width,rect.height,false);camera.aspect=rect.width/rect.height;camera.updateProjectionMatrix();update();}).observe($('#viewport'));
document.addEventListener('visibilitychange',()=>{if(document.hidden){playing=false;stopSounds();}last=performance.now();update();});
$('#scene').addEventListener('webglcontextlost',e=>{e.preventDefault();playing=false;$('#loading').hidden=false;$('#loading').textContent='תצוגת התלת־ממד נעצרה. ניתן לטעון את הדף מחדש.';});
load().catch(error=>{$('#loading').hidden=false;$('#loading').classList.add('error');$('#loading').textContent='לא ניתן לטעון את התצוגה. יש לפתוח את הדף דרך שרת HTTP משורש המאגר.';console.error(error);});
requestAnimationFrame(frame);
