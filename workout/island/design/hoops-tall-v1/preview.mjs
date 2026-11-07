/** Original CC0-1.0. A local, WebAssembly-free review of the tall canonical18 characters. */
import * as THREE from 'three';
import {GLTFLoader} from '../hoops-motion-v8/runtime/vendor/GLTFLoader.js';
import {createActor,applyFrame,sampleClip,calibrateDunk,forwardKinematics,palmPoint} from './runtime/retarget.mjs';

const $=id=>document.getElementById(id);
const LABELS={guard:'רכז',wing:'קיצוני',center:'סנטר'};
const NUMBERS={guard:'01',wing:'02',center:'03'};
const state={ready:false,actors:[],metrics:[],clip:null,row:null,time:0,playing:true,speed:1,sourceMode:false,colorway:0,straight:false,loading:false};
const cache=new Map();
let catalog=[],profiles=[];
const scene=new THREE.Scene();
scene.background=new THREE.Color('#b7bfa9');
scene.fog=new THREE.Fog('#b7bfa9',19,39);
const renderer=new THREE.WebGLRenderer({canvas:$('canvas'),antialias:true,alpha:false});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.2;
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const camera=new THREE.OrthographicCamera(-5.1,5.1,4.8,-.3,.1,70);
const ambient=new THREE.HemisphereLight('#ffffec','#637d5c',2.7);
scene.add(ambient);
const sun=new THREE.DirectionalLight('#fff6d4',3.4);
sun.position.set(-4,9,7);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);
Object.assign(sun.shadow.camera,{left:-7,right:7,top:6,bottom:-6,near:.5,far:22});
sun.shadow.normalBias=.025;sun.shadow.bias=-.0002;
scene.add(sun);
const fill=new THREE.DirectionalLight('#e0edff',1.1);fill.position.set(6,4,-5);scene.add(fill);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(75,70),new THREE.MeshStandardMaterial({color:'#a8ad91',roughness:1}));
floor.rotation.x=-Math.PI/2;floor.position.y=-.025;floor.receiveShadow=true;scene.add(floor);
const court=new THREE.Mesh(new THREE.PlaneGeometry(14,11),new THREE.MeshStandardMaterial({color:'#a58e63',roughness:.88}));
court.rotation.x=-Math.PI/2;court.position.set(0,-.008,0);court.receiveShadow=true;scene.add(court);
const lineMat=new THREE.LineBasicMaterial({color:'#dedac3',transparent:true,opacity:.66});
function line(points,material=lineMat){const g=new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p)));const l=new THREE.Line(g,material);scene.add(l);return l;}
for(let x=-7;x<=7.001;x+=.32)line([[x,-.004,-5.5],[x,-.004,5.5]],new THREE.LineBasicMaterial({color:'#736c4b',transparent:true,opacity:.12}));
for(let z=-5.5;z<=5.5;z+=1.4)line([[-7,-.003,z],[7,-.003,z]],new THREE.LineBasicMaterial({color:'#d5c193',transparent:true,opacity:.10}));
line([[-6.5,.003,-4.7],[-6.5,.003,4.7],[6.5,.003,4.7],[6.5,.003,-4.7],[-6.5,.003,-4.7]]);
line([[-6.5,.004,0],[6.5,.004,0]]);
const arc=[];for(let i=0;i<=96;i++){const a=i/96*Math.PI*2;arc.push([Math.cos(a)*1.45,.005,Math.sin(a)*1.45]);}line(arc);
const hoops=[];
const hoopMat=new THREE.MeshStandardMaterial({color:'#354c43',roughness:.8,metalness:.15});
const metalMat=new THREE.MeshStandardMaterial({color:'#b55f39',roughness:.5,metalness:.35});
const ivoryMat=new THREE.MeshStandardMaterial({color:'#ece9d3',roughness:.9});
function buildHoop(){
  const g=new THREE.Group();
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(.043,.06,3.7,12),hoopMat);pole.position.set(.7,1.85,-1.3);pole.castShadow=true;g.add(pole);
  const base=new THREE.Mesh(new THREE.BoxGeometry(.62,.12,.48),hoopMat);base.position.set(.7,.06,-1.3);base.castShadow=true;g.add(base);
  const supportStart=new THREE.Vector3(.7,3.35,-1.3),supportEnd=new THREE.Vector3(0,3.35,-.34),supportVector=supportEnd.clone().sub(supportStart);
  const brace=new THREE.Mesh(new THREE.CylinderGeometry(.04,.04,supportVector.length(),10),hoopMat);brace.position.copy(supportStart).add(supportEnd).multiplyScalar(.5);brace.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),supportVector.normalize());g.add(brace);
  // Transparent painted backboard keeps hands and the rim visible in the comparison.
  const board=new THREE.Mesh(new THREE.BoxGeometry(1.05,.65,.035),new THREE.MeshPhysicalMaterial({color:'#e1e6cc',transparent:true,opacity:.25,roughness:.55,depthWrite:false}));
  board.position.set(0,3.43,-.34);g.add(board);
  const frame=new THREE.EdgesGeometry(board.geometry);const edges=new THREE.LineSegments(frame,new THREE.LineBasicMaterial({color:'#4c6557',transparent:true,opacity:.7}));edges.position.copy(board.position);g.add(edges);
  const target=new THREE.Line(new THREE.BufferGeometry().setFromPoints([[-.22,3.12,-.315],[-.22,3.39,-.315],[.22,3.39,-.315],[.22,3.12,-.315]] .map(p=>new THREE.Vector3(...p))),new THREE.LineBasicMaterial({color:'#d9dfc6'}));g.add(target);
  const rim=new THREE.Mesh(new THREE.TorusGeometry(.225,.013,8,48),metalMat);rim.rotation.x=Math.PI/2;rim.position.y=3.05;g.add(rim);
  const netPoints=[];
  for(let k=0;k<12;k++){const a=k/12*Math.PI*2,b=(k+.5)/12*Math.PI*2;for(const sign of [-1,1]){netPoints.push(new THREE.Vector3(Math.cos(a)*.217,3.035,Math.sin(a)*.217),new THREE.Vector3(Math.cos(b+sign*.14)*.15,2.79,Math.sin(b+sign*.14)*.15));netPoints.push(new THREE.Vector3(Math.cos(b+sign*.14)*.15,2.79,Math.sin(b+sign*.14)*.15),new THREE.Vector3(Math.cos(a)*.12,2.62,Math.sin(a)*.12));}}
  const net=new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(netPoints),new THREE.LineBasicMaterial({color:'#e9ebd7',transparent:true,opacity:.72}));g.add(net);
  const goal=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-.48,3.3,0),new THREE.Vector3(.48,3.3,0)]),new THREE.LineDashedMaterial({color:'#47765c',dashSize:.06,gapSize:.04,transparent:true,opacity:.55}));goal.computeLineDistances();g.add(goal);
  for(const h of [1,2,3]){const tick=new THREE.Mesh(new THREE.BoxGeometry(.12,.012,.013),ivoryMat);tick.position.set(.73,h,-1.24);g.add(tick);}
  return g;
}
const ballGeometry=new THREE.SphereGeometry(.12,24,16);
const ballMaterial=new THREE.MeshStandardMaterial({color:'#d88039',roughness:.75});
function makeBall(){
  const group=new THREE.Group();const shell=new THREE.Mesh(ballGeometry,ballMaterial);shell.castShadow=true;group.add(shell);
  const mat=new THREE.MeshStandardMaterial({color:'#443d2c',roughness:1});
  for(const a of [0,Math.PI/2]){const ring=new THREE.Mesh(new THREE.TorusGeometry(.1202,.0023,5,48),mat);ring.rotation.y=a;group.add(ring);}
  const ring=new THREE.Mesh(new THREE.TorusGeometry(.1202,.0023,5,48),mat);ring.rotation.x=Math.PI/2;group.add(ring);return group;
}
let palettes=[{primary:'#176f77',secondary:'#102a40',trim:'#f4e3b8'},{primary:'#a74332',secondary:'#302b49',trim:'#f6e5bf'}];
function setColorway(value){
  state.colorway=Number(value)||0;
  for(const actor of state.actors)actor.scene.traverse(o=>{if(!o.isMesh)return;for(const material of Array.isArray(o.material)?o.material:[o.material]){
    const name=material.name.toLowerCase();
    const key=/trim|piping|accent/.test(name)?'trim':/secondary/.test(name)?'secondary':/uniform|jersey|shorts|team/.test(name)?'primary':null;
    if(key&&material.color){material.color.set(palettes[state.colorway][key]);material.needsUpdate=true;}
  }});
  $('colorway').setAttribute('aria-pressed',String(!!state.colorway));
  $('colorway').lastChild.textContent=state.colorway?'מדי גחלת':'מדי לגונה';
  $('colorway').querySelector('.swatch').style.backgroundColor=palettes[state.colorway].primary;
}
function resize(){
  const rect=$('stage').getBoundingClientRect();renderer.setSize(rect.width,rect.height,false);
  const aspect=rect.width/rect.height,viewWidth=Math.max(9.7,5.3*aspect),viewHeight=viewWidth/aspect;
  camera.left=-viewWidth/2;camera.right=viewWidth/2;camera.top=viewHeight/2;camera.bottom=-viewHeight/2;
  camera.position.set(state.straight?0:3.6,4.5,13);camera.lookAt(0,1.95,0);camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe($('stage'));
function profileCard(profile,index){
  const el=document.createElement('article');el.className='profile';el.id=`profile-${profile.id}`;
  const ratio=profile.armRatio??profile.relativeArmLength??([1,1.08,1.12][index]);
  el.innerHTML=`<div class="profile-top"><span class="profile-name">${LABELS[profile.id]||profile.id} <span class="profile-number">${NUMBERS[profile.id]||index+1}</span></span><span class="profile-height">${profile.heightMeters.toFixed(2)}<small>מ׳</small></span></div><p class="profile-spec">כתף עד כף יד ${(profile.armLengthMeters||profile.armLength||0).toFixed(2)} מ׳ · יחס ${Number(ratio).toFixed(2)}</p><div class="measurements"><div><span class="metric-label">כף יד בשיא</span><span class="metric-value" data-palm>—</span></div><div><span class="metric-label">עליית אגן</span><span class="metric-value" data-jump>—</span></div></div>`;
  return el;
}
async function fetchJSON(path){const res=await fetch(path);if(!res.ok)throw new Error(`${path}: HTTP ${res.status}`);return res.json();}
async function fetchClip(row){
  const key=row.library+'/'+row.id;if(!cache.has(key))cache.set(key,(async()=>{
    const res=await fetch(row.path);if(!res.ok)throw new Error(`${row.path}: HTTP ${res.status}`);
    let bytes=new Uint8Array(await res.arrayBuffer());
    if(bytes[0]===31&&bytes[1]===139){const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));bytes=new Uint8Array(await new Response(stream).arrayBuffer());}
    return JSON.parse(new TextDecoder().decode(bytes));
  })());return cache.get(key);
}
function measure(clip,profile){
  if(clip.id.startsWith('dunk_'))return calibrateDunk(clip,profile);
  let peakPalmHeight=-Infinity,peakTime=0;
  for(const frame of clip.keyframes){const fk=forwardKinematics(profile,frame);const h=Math.max(fk.palms.LeftHand[1],fk.palms.RightHand[1]);if(h>peakPalmHeight){peakPalmHeight=h;peakTime=frame.time;}}
  const lift=Math.max(0,...clip.keyframes.map(f=>f.hipsOffsetMeters?.[1]||0));
  return {jumpScale:1,requiredJump:lift,peakHipsLift:lift,sourcePeakHipsLift:lift,peakPalmHeight,peakTime,hands:['RightHand'],pass:null};
}
function updateMetrics(){
  if(!state.clip)return;
  const dunk=state.clip.id.startsWith('dunk_');
  state.metrics=state.actors.map(actor=>{
    const calibrated=measure(state.clip,actor.profile),m={...calibrated};
    if(state.sourceMode&&dunk){const fk=forwardKinematics(actor.profile,sampleClip(state.clip,m.peakTime));m.peakPalmHeight=Math.min(...m.hands.map(h=>fk.palms[h][1]));m.peakHipsLift=m.sourcePeakHipsLift;m.jumpScale=1;m.pass=false;}
    const card=$(`profile-${actor.profile.id}`);
    card.querySelector('[data-palm]').innerHTML=`${m.peakPalmHeight.toFixed(2)} <small>מ׳</small>${dunk&&!state.sourceMode&&m.pass?'<b class="pass">✓</b>':''}`;
    card.querySelector('[data-jump]').innerHTML=`${Math.max(0,m.peakHipsLift).toFixed(2)} <small>מ׳</small>`;
    return m;
  });
  $('jump-explanation').textContent=dunk?(state.sourceMode?'גובה הניתור המקורי: כ־1.55 מ׳. זהו הקליפ לפני התאמת עוצמת הניתור.':'עוצמת הניתור מותאמת לטווח ההגעה; סיבובי המפרקים נשמרים.'):'בקליפ זה תנועת האגן המקורית נשמרת. ההתאמה נדרשת לקליפי ההטבעה.';
  $('peak').textContent=dunk?'שיא ההטבעה ↗':'שיא ההגעה ↗';
  // Align each rim with the calibrated palm at the dunk's measured peak.
  state.actors.forEach((actor,i)=>{
    const m=measure(state.clip,actor.profile),frame=sampleClip(state.clip,m.peakTime),fk=forwardKinematics(actor.profile,frame,{jumpScale:m.jumpScale});
    const p=dunk?fk.palms.RightHand:[0,0,.65];
    hoops[i].position.set(actor.lane+p[0],0,p[2]);
  });
}
function updateControls(){
  const seconds=state.time*(state.clip?.durationSeconds||0);$('time').value=state.time;
  $('time-label').textContent=`${seconds.toFixed(2)} / ${(state.clip?.durationSeconds||0).toFixed(2)} s`;
  $('play').textContent=state.playing?'Ⅱ':'▷';$('play').setAttribute('aria-label',state.playing?'השהה':'נגן');
}
function setTime(value){state.time=Math.max(0,Math.min(1,Number(value)));renderPose();updateControls();return state.time;}
function setSourceJump(value){state.sourceMode=!!value;$('original').classList.toggle('selected',state.sourceMode);$('calibrated').classList.toggle('selected',!state.sourceMode);$('original').setAttribute('aria-pressed',String(state.sourceMode));$('calibrated').setAttribute('aria-pressed',String(!state.sourceMode));updateMetrics();renderPose();}
function renderPose(){
  if(!state.clip)return;
  const frame=sampleClip(state.clip,state.time);
  state.actors.forEach((actor,i)=>{
    const metrics=state.metrics[i];applyFrame(actor,frame,{jumpScale:metrics.jumpScale});
    const hand=state.clip.id.endsWith('_left')?'LeftHand':'RightHand';
    const palm=actor.bones[hand].localToWorld(new THREE.Vector3().fromArray(palmPoint(actor.profile,hand)));
    actor.palmMarker.position.copy(palm);
    const visible=state.clip.ball?.visible!==false&&(state.clip.ball?.trajectory?.length>0||state.clip.ballContactWindows?.length>0);
    actor.ball.visible=visible;
    if(visible){
      const normal=new THREE.Vector3(0,0,1).applyQuaternion(actor.bones[hand].getWorldQuaternion(new THREE.Quaternion()));
      actor.ball.position.copy(palm).addScaledVector(normal,.12);
      if(state.clip.id==='dunk_two_hands'&&state.time<=.62){
        const guide=actor.bones.LeftHand.localToWorld(new THREE.Vector3().fromArray(palmPoint(actor.profile,'LeftHand')));
        actor.ball.position.copy(palm).add(guide).multiplyScalar(.5);
      }
      // The ball is a target-hand guide; after a dunk release it drops through that actor's rim.
      if(state.clip.id.startsWith('dunk_')&&state.time>.62){const u=Math.min(1,(state.time-.62)/.25);actor.ball.position.set(hoops[i].position.x,3.14-2.5*u*u,hoops[i].position.z);}
      actor.ball.rotation.set(state.time*Math.PI*4,0,state.time*Math.PI);
    }
  });
}
function populateLibrary(library){
  const options=catalog.filter(c=>c.library===library);$('clip').replaceChildren(...options.map(row=>{const o=document.createElement('option');o.value=row.id;o.textContent=row.label||row.id;return o;}));
  $('clip-count').textContent=`${options.length} קליפים`;
  const quick=library==='v9'?[['dribble_forward','כדרור'],['layup_right','צעד וחצי'],['dunk_one_hand','הטבעה'],['dunk_two_hands','שתי ידיים'],['defensive_stance','הגנה'],['rebound_jump','ריבאונד']]:[['dribble_idle','כדרור'],['dribble_run','ריצה'],['block','חסימה'],['pass_chest','מסירה']];
  $('quick-clips').replaceChildren(...quick.filter(([id])=>options.some(o=>o.id===id)).map(([id,label])=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.clip=id;b.onclick=()=>selectClip(library,id);return b;}));
}
let selectionEpoch=0;
async function selectClip(library,id){
  const row=catalog.find(c=>c.library===library&&c.id===id);if(!row)throw new Error(`Unknown clip: ${library}/${id}`);
  const epoch=++selectionEpoch;state.loading=true;$('load-status').textContent='טוען תנועה';
  if($('library').value!==library||!Array.from($('clip').options).some(o=>o.value===id)){ $('library').value=library;populateLibrary(library); }
  $('clip').value=id;
  const clip=await fetchClip(row);if(epoch!==selectionEpoch)return;
  state.clip=clip;state.row=row;state.time=0;state.loading=false;updateMetrics();renderPose();updateControls();
  $('quick-clips').querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.clip===id));
  $('load-status').textContent=`שלוש דמויות · ${library==='v9'?'ספרייה 9':'ספרייה 8'}`;
  return clip;
}
$('play').onclick=()=>{state.playing=!state.playing;updateControls();};
$('time').oninput=e=>{state.playing=false;setTime(e.target.value);};
$('speed').onchange=e=>state.speed=Number(e.target.value);
$('peak').onclick=()=>{state.playing=false;setTime(state.metrics[0]?.peakTime??.5);};
$('colorway').onclick=()=>setColorway(1-state.colorway);
$('camera').onclick=()=>{state.straight=!state.straight;$('camera').textContent=state.straight?'מבט אלכסוני':'מבט ישר';resize();};
$('library').onchange=e=>{populateLibrary(e.target.value);const first=e.target.value==='v9'?'dunk_one_hand':'dribble_idle';selectClip(e.target.value,first).catch(fail);};
$('clip').onchange=e=>selectClip($('library').value,e.target.value).catch(fail);
$('calibrated').onclick=()=>setSourceJump(false);$('original').onclick=()=>setSourceJump(true);
function fail(error){console.error(error);$('load-status').textContent='הטעינה נכשלה';$('stage-error').hidden=false;$('stage-error').textContent=`לא ניתן לטעון את התצוגה. יש לפתוח דרך שרת מקומי משורש המאגר.\n${error.message}`;}
window.__tallPreview={get ready(){return state.ready;},get actors(){return state.actors;},get metrics(){return state.metrics;},get clip(){return state.clip;},get time(){return state.time;},get sourceMode(){return state.sourceMode;},get renderer(){return renderer;},get catalog(){return catalog;},selectClip,setTime,setSourceJump,setColorway,pause(){state.playing=false;updateControls();},play(){state.playing=true;updateControls();}};
async function boot(){
  const [rig,library]=await Promise.all([fetchJSON('rig.json'),fetchJSON('catalog.json')]);
  palettes=rig.palettes||palettes;
  profiles=Array.isArray(rig.profiles)?rig.profiles:Object.entries(rig.profiles).map(([id,p])=>({...p,id}));catalog=library.clips;
  profiles.sort((a,b)=>['guard','wing','center'].indexOf(a.id)-['guard','wing','center'].indexOf(b.id));
  $('profiles').replaceChildren(...profiles.map(profileCard));
  const loader=new GLTFLoader();
  const gltfs=await Promise.all(profiles.map(p=>loader.loadAsync(p.runtimePath||`runtime/${p.id}.glb`)));
  gltfs.forEach((gltf,i)=>{
    const actor=createActor(gltf.scene,profiles[i]);actor.lane=(i-1)*2.6;actor.scene.position.x=actor.lane;
    actor.scene.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});scene.add(actor.scene);
    actor.ball=makeBall();scene.add(actor.ball);
    actor.palmMarker=new THREE.Mesh(new THREE.SphereGeometry(.018,10,8),new THREE.MeshBasicMaterial({color:'#bbf3a8'}));scene.add(actor.palmMarker);
    const hoop=buildHoop();hoop.position.x=actor.lane;scene.add(hoop);hoops.push(hoop);state.actors.push(actor);
  });
  setColorway(0);populateLibrary('v9');await selectClip('v9','dunk_one_hand');resize();state.ready=true;
}
let previous=performance.now(),endHold=0;
function animate(now){requestAnimationFrame(animate);const dt=Math.min(.06,(now-previous)/1000);previous=now;
  if(state.ready&&state.playing&&!state.loading){
    state.time+=dt*state.speed/state.clip.durationSeconds;
    if(state.time>=1){state.time=1;endHold+=dt;if(endHold>(state.clip.loop?.12:.75)){state.time=0;endHold=0;}}
    renderPose();updateControls();
  }
  renderer.render(scene,camera);
}
requestAnimationFrame(animate);boot().catch(fail);
