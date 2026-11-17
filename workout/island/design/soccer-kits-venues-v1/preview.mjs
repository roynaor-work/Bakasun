import * as T from './vendor/three.module.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {DRACOLoader} from './vendor/DRACOLoader.js';
import {clone} from './vendor/SkeletonUtils.js';
import {applyKitNumber} from './apply.mjs';

const $=id=>document.getElementById(id), all=selector=>[...document.querySelectorAll(selector)];
const query=new URLSearchParams(location.search), api={ready:false,error:null};
window.__soccerKitLab=api;
let renderer,kitData,venueData,numberLibrary,activeVenue,actors=[],environment,heroes,envCamera,heroCamera,hemisphere,key,rim;
const cache=new Map(),state={kit:0,venue:0,number:7,view:'pair',mode:'kits',playing:false,yaw:0,zoom:1};
let kitGeneration=0,venueGeneration=0,pending=0,lastFrame=0;
const draco=new DRACOLoader().setDecoderPath('vendor/draco/').setDecoderConfig({type:'wasm'}).setWorkerLimit(2);
const loader=new GLTFLoader().setDRACOLoader(draco);
const load=file=>{
  if(!cache.has(file))cache.set(file,loader.loadAsync(file).catch(error=>{cache.delete(file);throw error;}));
  return cache.get(file);
};
const fetchJSON=async file=>{const response=await fetch(file);if(!response.ok)throw Error(`${file}: HTTP ${response.status}`);return response.json();};
function busy(value){pending+=value;$('loading').hidden=pending<=0;}
function fail(error){
  api.error=String(error?.message||error);api.ready=false;
  $('loading').hidden=true;$('error').hidden=false;
  $('error-detail').textContent=location.protocol==='file:'?'יש לפתוח דרך שרת מקומי, לפי ההוראות בדוח.':'יש לבדוק שכל קובצי החבילה נמצאים בתיקייה ולהפעיל מחדש את התצוגה.';
  console.error(error);
}
function kitIcon(p){return `<svg viewBox="0 0 48 60" aria-hidden="true"><path d="M14 3 5 8 1 20 10 23 13 16 13 33 35 33 35 16 38 23 47 20 43 8 34 3 30 7 18 7Z" fill="${p.shirt}"/><path d="m18 3 6 5 6-5" fill="none" stroke="${p.trim}" stroke-width="3"/><path d="M13 35 35 35 37 48 26 48 24 42 22 48 11 48Z" fill="${p.shorts}"/><path d="M14 50 21 50 21 59 14 59ZM27 50 34 50 34 59 27 59Z" fill="${p.socks}"/><path d="M13 32H35" stroke="${p.trim}" stroke-width="2"/></svg>`;}
function pressed(selector,value,key){all(selector).forEach(button=>button.setAttribute('aria-pressed',String(button.dataset[key]===value)));}
function updateUI(){
  const kit=kitData.kits[state.kit],venue=venueData.venues[state.venue];
  $('kit-title').textContent=kit.label;$('kit-index').textContent=String(kit.index).padStart(2,'0');
  $('kit-title').classList.toggle('long-title',kit.label.length>12);
  $('palette').innerHTML=[['shirt','חולצה'],['shorts','מכנסיים'],['socks','גרביים']].map(([key,label])=>`<span class="color-region"><i style="background:${kit.palette[key]}"></i>${label}</span>`).join('');
  $('number').value=String(state.number);
  all('[data-kit]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.kit)===state.kit)));
  all('[data-venue]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.venue)===state.venue)));
  pressed('button[data-view]',state.view,'view');pressed('button[data-mode]',state.mode,'mode');
  $('stage').dataset.mode=state.mode;
  $('motion').setAttribute('aria-pressed',String(state.playing));
  $('motion').innerHTML=`<span aria-hidden="true">${state.playing?'Ⅱ':'▷'}</span> ${state.playing?'עצירת תנועה':'בתנועה'}`;
  $('venue-badge').textContent=venue.id==='stadium-night'?'לילה · 4 זרקורים':venue.id==='neighborhood'?'שכונה · אור אחר הצהריים':'שמש · שלוש שכבות יציע';
  $('stage-caption').textContent=state.mode==='venue'?`${venue.label} · ${venue.pitch.widthMeters} × ${venue.pitch.lengthMeters} מ׳`:
    state.view==='pair'?'אותה ערכה · קדמי וגב':state.view==='back'?`מבט גב · מספר ${state.number}`:'מבט קדמי';
  $('stage-count').textContent=state.mode==='venue'?`0${state.venue+1} / 03`:`${String(kit.index).padStart(2,'0')} / 08`;
}
function resize(){
  if(!renderer)return;
  const w=$('stage').clientWidth,h=$('stage').clientHeight;
  renderer.setSize(w,h,false);
  envCamera.aspect=heroCamera.aspect=w/h;envCamera.updateProjectionMatrix();heroCamera.updateProjectionMatrix();
  cameras();render();
}
function cameras(){
  if(!activeVenue)return;
  const venue=venueData.venues[state.venue];
  if(state.mode==='venue'){
    const position=new T.Vector3(...venue.camera.position);
    position.applyAxisAngle(new T.Vector3(0,1,0),state.yaw*.3).multiplyScalar(state.zoom);
    envCamera.position.copy(position);envCamera.lookAt(...venue.camera.target);envCamera.fov=42;
  }else{
    const street=venue.id==='neighborhood';
    envCamera.position.set(street?14:24,street?6:8,street?18:36);
    envCamera.lookAt(0,street?6:10,street?-25:-58);envCamera.fov=48;
  }
  envCamera.updateProjectionMatrix();
  const fitDistance=Math.max(5.05,(state.view==='pair'?2.7:1.4)/(2*Math.tan(T.MathUtils.degToRad(13.5))*heroCamera.aspect));
  heroCamera.position.set(0,1.25,fitDistance*state.zoom);heroCamera.lookAt(0,.94,0);heroCamera.fov=27;heroCamera.updateProjectionMatrix();
  for(let i=0;i<actors.length;i++){
    const actor=actors[i],pair=state.view==='pair';
    actor.group.visible=pair||i===0;
    actor.group.position.set(pair?(i===0?.62:-.62):0,.045,0);
    actor.root.rotation.y=state.yaw+(pair?(i===0?.12:Math.PI-.12):state.view==='back'?Math.PI:0);
  }
}
function aim(root,boneName,childName,direction){
  const bone=root.getObjectByName(boneName),child=root.getObjectByName(childName);
  root.updateMatrixWorld(true);
  const from=child.getWorldPosition(new T.Vector3()).sub(bone.getWorldPosition(new T.Vector3())).normalize();
  const world=new T.Quaternion().setFromUnitVectors(from,new T.Vector3(...direction).normalize()).multiply(bone.getWorldQuaternion(new T.Quaternion()));
  bone.quaternion.copy(bone.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(world));
  root.updateMatrixWorld(true);
}
function restoreBind(actor){
  actor.mixer.stopAllAction();
  for(const b of actor.bind){b.node.position.copy(b.p);b.node.quaternion.copy(b.q);b.node.scale.copy(b.s);}
  actor.root.updateMatrixWorld(true);
}
function pose(actor){
  restoreBind(actor);
  if(state.playing){actor.mixer.clipAction(actor.clip).reset().play();actor.mixer.update(.08);}
  else{
    // Presentation pose only; the GLB bind transforms remain untouched.
    aim(actor.root,'LeftArm','LeftForeArm',[.13,-1,.04]);
    aim(actor.root,'LeftForeArm','LeftHand',[.03,-1,.16]);
    aim(actor.root,'RightArm','RightForeArm',[-.13,-1,.04]);
    aim(actor.root,'RightForeArm','RightHand',[-.03,-1,.16]);
  }
}
function cleanActors(){
  for(const actor of actors){
    actor.mixer.stopAllAction();actor.mixer.uncacheRoot(actor.root);
    const skeletons=new Set();
    actor.root.traverse(node=>{if(node.isSkinnedMesh)skeletons.add(node.skeleton);});
    for(const skeleton of skeletons)skeleton.dispose();
    actor.group.traverse(node=>{if(node.isMesh&&node.userData.previewOwnedMaterial)node.material.dispose();if(node.userData.ownedNumberMaterial)node.material.dispose();});
    heroes.remove(actor.group);
  }
  actors=[];
}
function makeActor(gltf,index){
  const root=clone(gltf.scene),group=new T.Group();group.name='KitPresentation_'+index;
  let sourceHeight=0;
  root.traverse(node=>{
    if(node.isMesh){
      node.frustumCulled=false;
      if(!node.name.startsWith('BackNumber_')){node.material=node.material.clone();node.userData.previewOwnedMaterial=true;}
      if(!node.name.startsWith('BackNumber_')){node.geometry.computeBoundingBox();sourceHeight=Math.max(sourceHeight,node.geometry.boundingBox.max.y);}
    }
  });
  root.scale.setScalar(1.8/sourceHeight);
  group.add(root);
  const disk=new T.Mesh(new T.CylinderGeometry(.52,.54,.05,48),new T.MeshStandardMaterial({color:0x9db6af,roughness:.95}));
  disk.position.y=-.026;disk.userData.previewOwnedMaterial=true;group.add(disk);
  const ring=new T.Mesh(new T.TorusGeometry(.53,.008,6,48),new T.MeshBasicMaterial({color:0xd3ed8b}));
  ring.rotation.x=-Math.PI/2;ring.position.y=-.001;ring.userData.previewOwnedMaterial=true;group.add(ring);
  const shadow=new T.Mesh(new T.CircleGeometry(.31,40),new T.MeshBasicMaterial({color:0x102329,transparent:true,opacity:.25,depthWrite:false}));
  shadow.rotation.x=-Math.PI/2;shadow.position.y=.002;shadow.userData.previewOwnedMaterial=true;group.add(shadow);
  // Procedural presentation geometry is owned here; decoded kit geometry stays cached.
  disk.userData.presentationGeometry=ring.userData.presentationGeometry=shadow.userData.presentationGeometry=true;
  const mixer=new T.AnimationMixer(root),bind=[];
  root.traverse(node=>{if(node.isBone)bind.push({node,p:node.position.clone(),q:node.quaternion.clone(),s:node.scale.clone()});});
  const actor={root,group,mixer,bind,clip:gltf.animations.find(c=>c.name==='run')};
  if(!actor.clip)throw Error('The kit is missing its authored run.');
  applyKitNumber(root,numberLibrary,state.number,kitData.kits[state.kit].palette.number);
  heroes.add(group);pose(actor);return actor;
}
async function setKit(value){
  const index=typeof value==='string'?kitData.kits.findIndex(k=>k.id===value):value;
  if(!Number.isInteger(index)||index<0||index>=8)throw RangeError('Unknown kit.');
  const generation=++kitGeneration;busy(1);
  try{
    const gltf=await load(kitData.kits[index].file);
    if(generation!==kitGeneration)return;
    state.kit=index;
    for(const actor of actors)actor.group.traverse(node=>{if(node.userData.presentationGeometry)node.geometry.dispose();});
    cleanActors();actors=[makeActor(gltf,0),makeActor(gltf,1)];
    updateUI();cameras();render();
  }finally{busy(-1);}
}
async function setVenue(value){
  const index=typeof value==='string'?venueData.venues.findIndex(k=>k.id===value):value;
  if(!Number.isInteger(index)||index<0||index>=3)throw RangeError('Unknown venue.');
  const generation=++venueGeneration;busy(1);
  try{
    const gltf=await load(venueData.venues[index].file);
    if(generation!==venueGeneration)return;
    if(activeVenue)environment.remove(activeVenue);
    activeVenue=gltf.scene;environment.add(activeVenue);state.venue=index;
    const atmosphere=venueData.venues[index].lighting.atmosphere;
    environment.background=new T.Color(atmosphere.background);
    environment.fog=new T.Fog(atmosphere.background,atmosphere.fogNear,atmosphere.fogFar);
    // Skies are a self-contained unlit dome and must not inherit scene fog.
    activeVenue.traverse(node=>{if(node.isMesh&&node.name.startsWith('Sky'))node.material.fog=false;if(node.isMesh&&node.material.transparent)node.material.depthWrite=false;});
    hemisphere.color.set(atmosphere.sky);hemisphere.groundColor.set(atmosphere.ground);hemisphere.intensity=atmosphere.hemisphereIntensity;
    heroHemisphere.color.copy(hemisphere.color);heroHemisphere.groundColor.copy(hemisphere.groundColor);heroHemisphere.intensity=hemisphere.intensity;
    key.color.set(index===1?'#D1E4FF':index===2?'#FFDCB2':'#FFF1DD');key.intensity=index===1?1.8:2.5;
    rim.color.set(index===1?'#A5DFFF':'#B3D7E0');rim.intensity=index===1?1.3:.8;
    renderer.toneMappingExposure=atmosphere.exposure;
    updateUI();cameras();render();
  }finally{busy(-1);}
}
function setNumber(number){
  if(!Number.isInteger(number)||number<1||number>11)throw RangeError('Number must be 1..11.');
  for(const actor of actors)applyKitNumber(actor.root,numberLibrary,number,kitData.kits[state.kit].palette.number);
  state.number=number;updateUI();render();
}
function setView(view){if(!['front','back','pair'].includes(view))throw RangeError('Unknown view.');state.view=view;state.mode='kits';updateUI();cameras();render();}
function setMode(mode){if(!['kits','venue'].includes(mode))throw RangeError('Unknown mode.');state.mode=mode;state.yaw=0;state.zoom=1;updateUI();cameras();render();}
function setMotion(playing){state.playing=!!playing;for(const actor of actors)pose(actor);lastFrame=performance.now();updateUI();render();}
function rotate(yaw){state.yaw=yaw;cameras();render();}
function render(){
  if(!renderer||!activeVenue)return;
  renderer.info.reset();
  renderer.clear();renderer.render(environment,envCamera);
  if(state.mode==='kits'){renderer.clearDepth();renderer.render(heroes,heroCamera);}
}
function diagnostics(){
  return {ready:api.ready,error:api.error,...state,kitId:kitData?.kits[state.kit].id,venueId:venueData?.venues[state.venue].id,
    viewport:{width:innerWidth,height:innerHeight,canvasWidth:$('stage').clientWidth,canvasHeight:$('stage').clientHeight},
    renderer:renderer?{drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,textures:renderer.info.memory.textures}:null,
    actors:actors.map(a=>{
      let body,number;
      a.root.traverse(n=>{if(n.isSkinnedMesh){if(n.userData.role==='back-number')number=n;else body=n;}});
      return {visible:a.group.visible,number:number?.userData.number,canonicalBones:body?.skeleton.bones.map(b=>b.name),
        numberUsesBodySkeleton:number?.skeleton===body?.skeleton,numberVertices:number?.geometry.attributes.position.count,
        numberColor:number?.material.color.getHexString(),animationTime:a.mixer.time};
    }),venueNodes:activeVenue?['Sky','Stands_Tier01','Stands_Tier02','Stands_Tier03','Boards_Blank'].map(name=>({name,present:!!activeVenue.getObjectByName(name)})):[]};
}
let heroHemisphere;
async function init(){
  [kitData,venueData]=await Promise.all([fetchJSON('kits.json'),fetchJSON('venues.json')]);
  $('kits').innerHTML=kitData.kits.map((kit,i)=>`<button class="kit-card" type="button" data-kit="${i}" aria-label="${kit.label}" aria-pressed="${i===0}"><span class="kit-code">${String(i+1).padStart(2,'0')}</span>${kitIcon(kit.palette)}<span class="kit-short">${kit.label.split(' ')[0]}</span></button>`).join('');
  $('venues').innerHTML=venueData.venues.map((v,i)=>`<button type="button" data-venue="${i}" aria-pressed="${i===0}">${v.label}</button>`).join('');
  $('number').innerHTML=Array.from({length:11},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join('');
  renderer=new T.WebGLRenderer({canvas:$('canvas'),antialias:true,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(2,devicePixelRatio||1));renderer.outputColorSpace=T.SRGBColorSpace;
  renderer.toneMapping=T.ACESFilmicToneMapping;renderer.autoClear=false;renderer.info.autoReset=false;
  environment=new T.Scene();heroes=new T.Scene();envCamera=new T.PerspectiveCamera(42,1,.1,900);heroCamera=new T.PerspectiveCamera(27,1,.02,30);
  hemisphere=new T.HemisphereLight(0xc4e1e8,0x657d61,1.35);environment.add(hemisphere);
  heroHemisphere=hemisphere.clone();heroes.add(heroHemisphere);
  key=new T.DirectionalLight(0xfff1dd,2.5);key.position.set(2.5,4,4);heroes.add(key);
  rim=new T.DirectionalLight(0xb3d7e0,.8);rim.position.set(-2,2,-3);heroes.add(rim);
  numberLibrary=(await load(kitData.numberLibrary.file)).scene;
  const qNumber=Number(query.get('number'));if(Number.isInteger(qNumber)&&qNumber>=1&&qNumber<=11)state.number=qNumber;
  if(['front','back','pair'].includes(query.get('view')))state.view=query.get('view');
  if(query.get('mode')==='venue')state.mode='venue';
  const ki=Math.max(0,kitData.kits.findIndex(k=>k.id===query.get('kit'))),vi=Math.max(0,venueData.venues.findIndex(v=>v.id===query.get('venue')));
  await setVenue(vi);await setKit(ki);resize();
  all('[data-kit]').forEach(b=>b.addEventListener('click',()=>setKit(Number(b.dataset.kit)).catch(fail)));
  all('[data-venue]').forEach(b=>b.addEventListener('click',()=>setVenue(Number(b.dataset.venue)).catch(fail)));
  all('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
  all('button[data-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
  $('number').addEventListener('change',()=>setNumber(Number($('number').value)));
  $('motion').addEventListener('click',()=>{setMode('kits');setMotion(!state.playing);});
  $('reset').addEventListener('click',()=>{state.zoom=1;rotate(0);});
  $('retry').addEventListener('click',()=>location.reload());
  let drag;
  $('canvas').addEventListener('pointerdown',event=>{drag={id:event.pointerId,x:event.clientX};$('canvas').setPointerCapture(event.pointerId);});
  $('canvas').addEventListener('pointermove',event=>{if(!drag||drag.id!==event.pointerId)return;rotate(state.yaw+(event.clientX-drag.x)*.011);drag.x=event.clientX;});
  for(const name of['pointerup','pointercancel','lostpointercapture'])$('canvas').addEventListener(name,()=>{drag=null;});
  $('canvas').addEventListener('wheel',event=>{event.preventDefault();state.zoom=T.MathUtils.clamp(state.zoom*Math.exp(event.deltaY*.0008),.8,1.65);cameras();render();},{passive:false});
  $('canvas').addEventListener('keydown',event=>{
    if(['ArrowLeft','ArrowRight',' ','Home'].includes(event.key))event.preventDefault();
    if(event.key==='ArrowLeft')rotate(state.yaw-.15);if(event.key==='ArrowRight')rotate(state.yaw+.15);
    if(event.key===' ')setMotion(!state.playing);if(event.key==='Home'){state.zoom=1;rotate(0);}
  });
  $('canvas').addEventListener('webglcontextlost',event=>{event.preventDefault();fail(Error('WebGL context lost; reload to restore all decoded assets.'));});
  new ResizeObserver(resize).observe($('stage'));
  document.addEventListener('visibilitychange',()=>{lastFrame=performance.now();});
  Object.assign(api,{ready:true,setKit,setVenue,setNumber,setView,setMode,setMotion,rotate,render,diagnostics,kitData,venueData});
  $('loading').hidden=true;
  function frame(now){
    requestAnimationFrame(frame);
    if(!api.ready||!state.playing||document.hidden||state.mode!=='kits')return;
    if(now-lastFrame<1000/30)return;
    const dt=Math.min(.08,(now-lastFrame)/1000);lastFrame=now;
    for(const actor of actors)actor.mixer.update(dt);
    render();
  }
  requestAnimationFrame(frame);
}
init().catch(fail);
