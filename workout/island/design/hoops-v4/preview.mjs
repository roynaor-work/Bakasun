// Standalone review surface. No game modules or game state are imported here.
import * as THREE from '../../vendor/three.module.js';
import {GLTFLoader} from '../../vendor/GLTFLoader.js';
import {DRACOLoader} from '../../vendor/DRACOLoader.js';

const $ = id => document.getElementById(id);
const profiles = [
  {role:'pg',height:1.78,description:'רכז · נמוך וזריז'},
  {role:'sg',height:1.88,description:'קלע · צר ואתלטי'},
  {role:'sf',height:1.99,description:'סמול פורוורד · מאוזן וארוך'},
  {role:'pf',height:2.09,description:'פאוור פורוורד · רחב וחזק'},
  {role:'c',height:2.20,description:'סנטר · הגבוה בחמישייה, ארוך גפיים'}
];
let teams = {
  home:{team_primary:'#F5A536',team_secondary:'#132A3D',team_trim:'#FFE9B5'},
  away:{team_primary:'#20BFCC',team_secondary:'#14394E',team_trim:'#D1FCFF'}
};
const clips = ['idle','dribble','shoot','steal','block','run'];
const state = {mode:'lineup',role:'pg',clip:'idle',time:0,team:'home',prop:'hoop',playing:false,speed:1,view:'front',yaw:0,pitch:.035,zoom:1};
const errors = [], actors = [];
let arena = null, arenaPromise, ballAsset = null, lastFrame = performance.now(), readyComplete = false, modeRequest = 0;
let playerMetadata = null;
const props = {ball:null,hoop:null};let propsPromise;
if(new URLSearchParams(location.search).has('capture'))document.body.classList.add('capture');
document.body.dataset.sceneMode = state.mode;

const canvas = $('canvas');
const renderer = new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true,alpha:false});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#1b3040');
const camera = new THREE.OrthographicCamera();
scene.add(new THREE.HemisphereLight('#e3f4ff','#41536a',2.2));
const key = new THREE.DirectionalLight('#ffe7cf',3.1);key.position.set(-3,7,6);key.castShadow = true;
key.shadow.mapSize.set(2048,2048);key.shadow.camera.left=-6;key.shadow.camera.right=6;key.shadow.camera.top=6;key.shadow.camera.bottom=-6;key.shadow.camera.far=20;key.shadow.normalBias=.015;key.shadow.bias=-.0001;scene.add(key);
const fill = new THREE.DirectionalLight('#aedff7',1.8);fill.position.set(4,3,1);scene.add(fill);
const rim = new THREE.DirectionalLight('#75b9d6',2.2);rim.position.set(0,4,-4);scene.add(rim);

const studio = new THREE.Group();scene.add(studio);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:'#263e50',roughness:.88}));
floor.rotation.x=-Math.PI/2;floor.position.y=-.008;floor.receiveShadow=true;studio.add(floor);
const baselines = new THREE.Group();studio.add(baselines);
function line(points,color,opacity=1){const object=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p))),new THREE.LineBasicMaterial({color,transparent:opacity<1,opacity}));baselines.add(object);return object;}
line([[-2.7,.002,.18],[2.7,.002,.18]],'#aecbd9',.30);
line([[-2.7,.002,-.6],[2.7,.002,-.6]],'#aecbd9',.12);
for(let i=-10;i<=10;i++){const x=i*.25;line([[x,.003,.14],[x,.003,i%4===0?.04:.09]],'#bad3df',i%4===0?.5:.18);}
for(const y of [.5,1,1.5,2])line([[-2.45,y,-.45],[2.45,y,-.45]],'#aecbd9',.105);
line([[-2.48,0,-.45],[-2.48,2.25,-.45]],'#aecbd9',.22);
line([[2.48,0,-.45],[2.48,2.25,-.45]],'#aecbd9',.22);
const draco = new DRACOLoader().setDecoderPath(new URL('../../vendor/draco/',import.meta.url).href).setWorkerLimit(1);
const loader = new GLTFLoader().setDRACOLoader(draco);
const actorsGroup = new THREE.Group();scene.add(actorsGroup);
const propsGroup = new THREE.Group();propsGroup.visible=false;scene.add(propsGroup);

function markPressed(selector,key,value){for(const node of document.querySelectorAll(selector))node.setAttribute('aria-pressed',String(node.dataset[key]===value));}
function fail(error){const message=String(error?.message||error);errors.push(message);$('error').hidden=false;$('error').textContent=`לא ניתן לטעון את התצוגה: ${message}`;$('status').textContent='הטעינה לא הושלמה';console.error(error);}
function materialsOf(object){const result=new Set();object.traverse(node=>{if(node.isMesh)for(const material of (Array.isArray(node.material)?node.material:[node.material]))result.add(material);});return [...result];}
function boundsOf(object){object.updateMatrixWorld(true);object.traverse(node=>{if(node.isSkinnedMesh)node.computeBoundingBox();});const box=new THREE.Box3().setFromObject(object);return {min:box.min.toArray(),max:box.max.toArray(),size:box.getSize(new THREE.Vector3()).toArray()};}

async function loadActor(profile,index){
  const url=`assets/players/${profile.role}.glb`;
  const gltf=await loader.loadAsync(new URL(url,import.meta.url).href);
  const wrapper=new THREE.Group();wrapper.name=`review_${profile.role}`;wrapper.add(gltf.scene);actorsGroup.add(wrapper);
  gltf.scene.traverse(node=>{if(node.isMesh){node.castShadow=true;node.receiveShadow=true;node.frustumCulled=false;node.material=Array.isArray(node.material)?node.material.map(m=>m.clone()):node.material.clone();}});
  const actor={...profile,index,url,model:gltf.scene,wrapper,mixer:new THREE.AnimationMixer(gltf.scene),clips:gltf.animations,clipMetadata:playerMetadata.players.find(p=>p.id===profile.role).clips,action:null,ball:null,hand:null,label:document.createElement('div')};
  actor.materials=materialsOf(actor.model);
  actor.model.traverse(node=>{if(node.isBone&&/^(mixamorig[:_]?)?RightHand$/i.test(node.name))actor.hand=node;});
  actor.label.className='actor-label';actor.label.innerHTML=`<strong>${profile.role.toUpperCase()}</strong><span>${profile.height.toFixed(2)} m</span>`;$('labels').append(actor.label);
  return actor;
}
function selectAction(actor,name){
  const clip=actor.clips.find(c=>c.name.toLowerCase()===name)||actor.clips.find(c=>c.name.toLowerCase().endsWith(name));
  if(!clip)throw Error(`${actor.role.toUpperCase()}: חסר קליפ ${name}`);
  actor.mixer.stopAllAction();actor.action=actor.mixer.clipAction(clip);actor.action.reset().setLoop(actor.clipMetadata[name].loop?THREE.LoopRepeat:THREE.LoopOnce,actor.clipMetadata[name].loop?Infinity:1);actor.action.clampWhenFinished=true;actor.action.play();
  if(name==='shoot'&&actor.hand){const release=actor.clipMetadata.shoot.events.find(e=>e.name==='ball_release').atSeconds;actor.mixer.setTime(release);actor.wrapper.updateMatrixWorld(true);actor.releaseSocket=actor.wrapper.worldToLocal(palmSocket(actor));}
  sampleActor(actor,state.time);actor.model.updateMatrixWorld(true);
}
function duration(){return actors.find(a=>a.role===state.role)?.action?.getClip().duration||1;}
function isLoop(){return actors.find(a=>a.role===state.role)?.clipMetadata[state.clip]?.loop??true;}
function clipTime(){const d=duration();return isLoop()?state.time%d:Math.min(state.time,d);}
function sampleActor(actor,time){actor.action.paused=false;actor.action.enabled=true;actor.mixer.setTime(time);}
function updatePlaybackUI(){const d=duration(),t=clipTime();$('time').max=String(d);$('time').value=String(t);$('time-output').textContent=`${t.toFixed(2)} / ${d.toFixed(2)} s`;$('play').setAttribute('aria-pressed',String(state.playing));$('play').setAttribute('aria-label',state.playing?'השהיית האנימציה':'ניגון האנימציה');$('play').innerHTML=state.playing?'<span aria-hidden="true">Ⅱ</span> השהיה':'<span aria-hidden="true">▶</span> ניגון';}
function layoutActors(){
  actorsGroup.visible=state.mode==='lineup'||state.mode==='individual';studio.visible=state.mode!=='arena';
  if(arena)arena.visible=state.mode==='arena';
  propsGroup.visible=state.mode==='props';for(const [name,model] of Object.entries(props))if(model)model.visible=state.mode==='props'&&state.prop===name;
  for(const actor of actors){
    actor.wrapper.visible=state.mode==='lineup'||(state.mode==='individual'&&actor.role===state.role);
    actor.wrapper.position.set(state.mode==='lineup'?(actor.index-2)*.86:0,0,0);
    actor.label.style.display=actor.wrapper.visible?'':'none';
    actor.label.classList.toggle('selected',actor.role===state.role);
    if(actor.ball)actor.ball.visible=actor.wrapper.visible&&state.clip!=='idle'&&state.clip!=='block'&&state.clip!=='run';
  }
  baselines.visible=state.mode==='lineup';
}
function updateLabels(){
  for(const actor of actors){if(!actor.wrapper.visible||state.mode==='arena')continue;const v=new THREE.Vector3().setFromMatrixPosition(actor.wrapper.matrixWorld);v.y=-.23;v.z=.1;v.project(camera);actor.label.style.left=`${(v.x+1)*canvas.clientWidth/2}px`;actor.label.style.top=`${(1-v.y)*canvas.clientHeight/2}px`;}
}
function frameCamera(){
  const width=canvas.clientWidth,height=canvas.clientHeight;if(!width||!height)return;
  const ratio=renderer.getPixelRatio();if(canvas.width!==Math.floor(width*ratio)||canvas.height!==Math.floor(height*ratio))renderer.setSize(width,height,false);
  const aspect=width/height;
  let center=new THREE.Vector3(0,1.12,0),halfWidth=2.57,halfHeight=1.83,distance=18;
  if(state.mode==='lineup'&&(state.clip==='block'||state.clip==='shoot')){center.y=1.42;halfHeight=2.14;}
  if(state.mode==='individual'){center.y=state.clip==='block'||state.clip==='shoot'?1.45:1.13;halfWidth=1.5;halfHeight=state.clip==='block'||state.clip==='shoot'?2.05:1.65;}
  const framedObject=state.mode==='arena'?arena:state.mode==='props'?props[state.prop]:null;
  if(framedObject){
    const box=new THREE.Box3().setFromObject(framedObject),size=box.getSize(new THREE.Vector3());center=box.getCenter(new THREE.Vector3());distance=Math.max(3,size.length()*3);
    camera.position.copy(center).addScaledVector(new THREE.Vector3(Math.sin(state.yaw)*Math.cos(state.pitch),Math.sin(state.pitch),Math.cos(state.yaw)*Math.cos(state.pitch)),distance);camera.lookAt(center);camera.updateMatrixWorld();
    halfWidth=0;halfHeight=0;for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){const p=new THREE.Vector3(x,y,z).applyMatrix4(camera.matrixWorldInverse);halfWidth=Math.max(halfWidth,Math.abs(p.x));halfHeight=Math.max(halfHeight,Math.abs(p.y));}
    const margin=state.mode==='props'?1.4:1.09;halfWidth*=margin;halfHeight*=state.mode==='props'?1.4:1.13;
  }else{
    camera.position.copy(center).addScaledVector(new THREE.Vector3(Math.sin(state.yaw)*Math.cos(state.pitch),Math.sin(state.pitch),Math.cos(state.yaw)*Math.cos(state.pitch)),distance);camera.lookAt(center);
    // Reserve a little more vertical space for the heading on short, wide screens.
    if(height<380)halfHeight+=.2;
  }
  const half=Math.max(halfHeight,halfWidth/aspect)/state.zoom;
  camera.left=-half*aspect;camera.right=half*aspect;camera.top=half;camera.bottom=-half;camera.near=.01;camera.far=distance*4+300;camera.updateProjectionMatrix();camera.updateMatrixWorld();
}
function render(){frameCamera();scene.updateMatrixWorld(true);updateBalls();updateLabels();renderer.render(scene,camera);return diagnostics(false);}
function palmSocket(actor){actor.wrapper.updateMatrixWorld(true);return actor.hand?actor.hand.localToWorld(new THREE.Vector3(0,.055,0)).add(new THREE.Vector3(0,0,.105)):new THREE.Vector3(actor.wrapper.position.x+.42,actor.height*.48,.22);}
function updateBalls(){
  for(const actor of actors){if(!actor.ball?.visible)continue;
    const t=clipTime(),position=palmSocket(actor);
    if(state.clip==='dribble'){
      const bounce=actor.clipMetadata.dribble.events.find(e=>e.name==='ball_bounce').atSeconds;
      // Presentation-only bounce: the palm supplies the lateral path; the
      // source event fixes the one ground contact in this motion cycle.
      const descent=Math.max(0,1-Math.abs(t-bounce)/bounce);
      position.y=THREE.MathUtils.lerp(position.y,.12,descent);
    }else if(state.clip==='shoot'){
      const release=actor.clipMetadata.shoot.events.find(e=>e.name==='ball_release').atSeconds;
      if(t>release){const flight=t-release;position.copy(actor.wrapper.localToWorld(actor.releaseSocket.clone()));position.y+=3.9*flight-2.3*flight*flight;position.z+=3.4*flight;}
    }
    position.y=Math.max(.12,position.y);
    actor.ball.position.copy(position);actor.ball.rotation.set(state.time*3,state.time*2,0);
  }
}
function setTeam(team){if(!teams[team])throw Error(`קבוצה לא מוכרת: ${team}`);state.team=team;markPressed('[data-team]','team',team);for(const actor of actors)for(const material of actor.materials){const key=Object.keys(teams[team]).find(name=>material.name.toLowerCase().startsWith(name));if(key){material.color.set(teams[team][key]);material.needsUpdate=true;}}render();return team;}
function selectRole(role){const profile=profiles.find(p=>p.role===String(role).toLowerCase());if(!profile)throw Error(`עמדה לא מוכרת: ${role}`);state.role=profile.role;markPressed('[data-role]','role',state.role);$('selected-height').textContent=`${profile.height.toFixed(2)} m`;$('role-description').textContent=profile.description;if(state.mode==='individual'){$('stage-title').textContent=profile.description.split(' · ')[0];$('stage-counter').textContent=state.role.toUpperCase();}layoutActors();updatePlaybackUI();render();return state.role;}
function selectClip(clip){if(!clips.includes(clip))throw Error(`קליפ לא מוכר: ${clip}`);state.clip=clip;state.time=0;$('clip').value=clip;for(const actor of actors)selectAction(actor,clip);layoutActors();updatePlaybackUI();render();return clip;}
function setTime(seconds){state.time=Math.max(0,Number(seconds)||0);for(const actor of actors)sampleActor(actor,state.time);updatePlaybackUI();render();return state.time;}
function setPlaying(value){if(value&&!isLoop()&&state.time>=duration())setTime(0);state.playing=Boolean(value);updatePlaybackUI();return state.playing;}
function setView(view){if(!['front','three-quarter','back'].includes(view))throw Error(`מבט לא מוכר: ${view}`);state.view=view;state.yaw=view==='front'?0:view==='back'?Math.PI:.58;state.pitch=state.mode==='arena'?.75:view==='three-quarter'?.12:.035;state.zoom=1;markPressed('[data-view]','view',view);render();return view;}
function loadProps(){
  if(!propsPromise)propsPromise=(async()=>{
    const gltf=await loader.loadAsync(new URL('assets/hoop.glb',import.meta.url).href);
    props.hoop=gltf.scene;props.ball=ballAsset.clone(true);props.ball.position.y=.12;
    for(const model of Object.values(props)){propsGroup.add(model);model.traverse(node=>{if(node.isMesh){node.castShadow=true;node.receiveShadow=true;}});}
    layoutActors();return props;
  })().catch(error=>{propsPromise=null;throw error;});
  return propsPromise;
}
async function selectProp(name){if(!Object.hasOwn(props,name))throw Error(`אביזר לא מוכר: ${name}`);await loadProps();state.prop=name;markPressed('[data-prop]','prop',name);if(state.mode==='props'){updatePropsHeading();state.yaw=.58;state.pitch=.12;state.zoom=1;state.view='three-quarter';markPressed('[data-view]','view',state.view);}layoutActors();render();return name;}
function updatePropsHeading(){$('stage-title').textContent=state.prop==='hoop'?'הסל':'הכדור';$('stage-caption').textContent=state.prop==='hoop'?'טבעת בגובה 3.05 מ׳ · לוח ורשת':'כדור משחק · רדיוס 12 ס״מ';$('stage-counter').textContent=state.prop.toUpperCase();$('stage-footer').textContent='מסובבים ובוחנים מכל זווית.';}
async function setMode(mode){
  if(!['lineup','individual','arena','props'].includes(mode))throw Error(`מצב לא מוכר: ${mode}`);
  const request=++modeRequest;
  state.mode=mode;document.body.dataset.sceneMode=mode;markPressed('button[data-mode]','mode',mode);
  for(const control of document.querySelectorAll('.player-controls button,.player-controls select,.player-controls input'))control.disabled=mode==='arena'||mode==='props';
  $('props-controls').hidden=mode!=='props';
  if(mode==='arena'){
    setPlaying(false);$('status').textContent='טוען את האולם…';
    if(!arenaPromise)arenaPromise=loader.loadAsync(new URL('assets/arena.glb',import.meta.url).href).then(gltf=>{arena=gltf.scene;scene.add(arena);arena.traverse(n=>{if(n.isMesh){n.receiveShadow=true;n.castShadow=false;}});arena.visible=state.mode==='arena';return arena;}).catch(error=>{arenaPromise=null;throw error;});
    await arenaPromise;if(request!==modeRequest)return state.mode;state.yaw=.56;state.pitch=.78;state.view='three-quarter';state.zoom=1;
  }else if(mode==='props'){setPlaying(false);$('status').textContent='טוען את האביזרים…';await loadProps();if(request!==modeRequest)return state.mode;state.yaw=.58;state.pitch=.12;state.zoom=1;state.view='three-quarter';}
  else{state.yaw=0;state.pitch=.035;state.zoom=1;state.view='front';}
  const headings={lineup:['THE STARTING FIVE','החמישייה','אותו קו רצפה · גובה במטרים'],individual:['PLAYER STUDY',profiles.find(p=>p.role===state.role).description.split(' · ')[0],'מסובבים את הדמות ובוחנים את התנועה'],arena:['HOME COURT','האולם','פרקט, יציע, קהל ושני סלים'],props:['EQUIPMENT','האביזרים','סל וכדור בקנה מידה אמיתי']};
  $('stage-kicker').textContent=headings[mode][0];$('stage-title').textContent=headings[mode][1];$('stage-caption').textContent=headings[mode][2];$('stage-counter').textContent=mode==='arena'?'THE COURT / THE CROWD':mode==='individual'?state.role.toUpperCase():'PG / SG / SF / PF / C';$('stage-footer').textContent=mode==='arena'?'המגרש מוכן למשחק.':'גובה שונה. אופי שונה.';
  if(mode==='props')updatePropsHeading();
  layoutActors();markPressed('[data-view]','view',state.view);$('status').textContent='מוכן לתצוגה';render();return mode;
}
function diagnostics(includeAssets=true){
  const result={ready:readyComplete,state:{...state,duration:duration()},errors:[...errors],renderer:{width:canvas.clientWidth,height:canvas.clientHeight,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles},arenaLoaded:Boolean(arena)};
  if(includeAssets)result.assets=actors.map(actor=>({role:actor.role,url:actor.url,heightExpected:actor.height,visible:actor.wrapper.visible,clips:actor.clips.map(c=>({name:c.name,duration:c.duration,tracks:c.tracks.length})),bounds:boundsOf(actor.model),materials:actor.materials.map(m=>({name:m.name,color:m.color?.getHexString(),hasMap:Boolean(m.map)}))}));
  if(includeAssets)result.props=Object.entries(props).map(([name,model])=>({name,url:`assets/${name}.glb`,loaded:Boolean(model),visible:Boolean(model?.visible&&propsGroup.visible),bounds:model?boundsOf(model):null}));
  return result;
}

const ready=(async()=>{
  const metadataResponse=await fetch(new URL('assets/players/player-metadata.json',import.meta.url));if(!metadataResponse.ok)throw Error('לא ניתן לטעון את תיאור השחקנים');playerMetadata=await metadataResponse.json();teams={home:playerMetadata.teams.amber,away:playerMetadata.teams.cyan};
  const loaded=await Promise.all(profiles.map(loadActor));actors.push(...loaded);
  // The ball is a separate asset and remains replaceable at game integration.
  ballAsset=(await loader.loadAsync(new URL('assets/ball.glb',import.meta.url).href)).scene;
  for(const actor of actors){actor.ball=ballAsset.clone(true);actor.ball.traverse(n=>{if(n.isMesh)n.castShadow=true;});scene.add(actor.ball);}
  selectClip('idle');setTeam(state.team);selectRole(state.role);await setMode('lineup');readyComplete=true;$('status').textContent='5 שחקנים · מוכן';render();
  return diagnostics();
})();ready.catch(fail);

for(const button of document.querySelectorAll('button[data-mode]'))button.addEventListener('click',()=>ready.then(()=>setMode(button.dataset.mode)).catch(fail));
for(const button of document.querySelectorAll('[data-role]'))button.addEventListener('click',()=>ready.then(()=>{selectRole(button.dataset.role);if(state.mode!=='lineup')return setMode('individual');}).catch(fail));
for(const button of document.querySelectorAll('[data-team]'))button.addEventListener('click',()=>ready.then(()=>setTeam(button.dataset.team)).catch(fail));
for(const button of document.querySelectorAll('[data-prop]'))button.addEventListener('click',()=>ready.then(()=>selectProp(button.dataset.prop)).catch(fail));
for(const button of document.querySelectorAll('[data-view]'))button.addEventListener('click',()=>setView(button.dataset.view));
$('clip').addEventListener('change',()=>ready.then(()=>{selectClip($('clip').value);setPlaying(state.clip!=='idle');}).catch(fail));
$('play').addEventListener('click',()=>ready.then(()=>{if(state.clip==='idle')selectClip('dribble');setPlaying(!state.playing);}).catch(fail));
$('time').addEventListener('input',()=>{setPlaying(false);setTime($('time').value);});
$('speed').addEventListener('change',()=>{state.speed=Number($('speed').value);});
$('reset-view').addEventListener('click',()=>{if(state.mode==='arena'){state.yaw=.56;state.pitch=.78;state.zoom=1;render();}else setView('front');});
let drag=null;
canvas.addEventListener('pointerdown',event=>{drag={x:event.clientX,y:event.clientY,yaw:state.yaw,pitch:state.pitch};canvas.setPointerCapture(event.pointerId);});
canvas.addEventListener('pointermove',event=>{if(!drag)return;state.yaw=drag.yaw-(event.clientX-drag.x)*.008;state.pitch=THREE.MathUtils.clamp(drag.pitch+(event.clientY-drag.y)*.006,-.14,1.25);markPressed('[data-view]','view','');render();});
canvas.addEventListener('pointerup',()=>{drag=null;});canvas.addEventListener('pointercancel',()=>{drag=null;});
canvas.addEventListener('wheel',event=>{event.preventDefault();state.zoom=THREE.MathUtils.clamp(state.zoom*Math.exp(-event.deltaY*.001),.6,2.5);render();},{passive:false});
new ResizeObserver(()=>render()).observe($('stage'));
function tick(now){const dt=Math.min((now-lastFrame)/1000,.05);lastFrame=now;if(state.playing&&readyComplete&&(state.mode==='lineup'||state.mode==='individual')){state.time+=dt*state.speed;if(!isLoop()&&state.time>=duration()){state.time=duration();state.playing=false;}for(const actor of actors)sampleActor(actor,state.time);updatePlaybackUI();render();}requestAnimationFrame(tick);}requestAnimationFrame(tick);
window.__HOOPS_V4__={ready,setMode,selectRole,selectClip,selectProp,setTime,setTeam,setView,setPlaying,render,diagnostics,get renderer(){return renderer;},get scene(){return scene;},get actors(){return actors;},get state(){return {...state};}};
render();
