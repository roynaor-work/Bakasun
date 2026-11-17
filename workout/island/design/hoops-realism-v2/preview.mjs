import * as THREE from '../../vendor/three.module.js';
import { GLTFLoader } from '../../vendor/GLTFLoader.js';

// Asset review only. No game state, storage, remote services, or gameplay hooks.
const $ = id => document.getElementById(id);
const canvas = $('view'), stage = $('stage');
const state = {ready:false,mode:'lineup',clip:'stand',lod:0,team:'mint',player:0,paused:matchMedia('(prefers-reduced-motion: reduce)').matches,time:0,loadedModels:0,errors:[]};
const teams = {
  mint:{primary:'#30af98',secondary:'#163e43',trim:'#f18a62'},
  purple:{primary:'#8256be',secondary:'#332848',trim:'#efbf68'},
  blue:{primary:'#306dc6',secondary:'#182e50',trim:'#eee9df'},
};
let renderer, scene, camera, crowdCatalog, playerCatalog, audioCatalog, applyTeam;
let yaw=0, pitch=0, zoom=1, simTime=0, lastFrame=performance.now(), activeAudio=null, lodRequest=0;
const playerGroup = new THREE.Group(), crowdGroup = new THREE.Group(), environment = new THREE.Group();
const players=[], fanCache=new Map(), pendingFans=new Map(), maskCache=new Map();
const loader = new GLTFLoader(), textureLoader = new THREE.TextureLoader();
const clipLabels={stand:'עמידה',sit:'ישיבה',clap:'מחיאות כפיים',jump:'קפיצה בשמחה',disappointed:'אכזבה',shout:'צעקה'};
const bodyLabels=['רכז זריז','קלע אתלטי','כנף ארוך','פורוורד חזק'];

async function json(path){const response=await fetch(path);if(!response.ok)throw Error(`${path}: HTTP ${response.status}`);return response.json();}
function fail(error){const message=String(error?.message||error);state.errors.push(message);$('error-detail').textContent=message;$('loading').hidden=true;$('error').hidden=false;console.error(error);}
function enableAssetControls(enabled){const footer=document.querySelector('footer');footer.inert=!enabled;footer.setAttribute('aria-disabled',String(!enabled));footer.setAttribute('aria-busy',String(!enabled));footer.querySelectorAll('button,select').forEach(control=>{control.disabled=!enabled;});}
function ground(root){root.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(root);if(!bounds.isEmpty())root.position.y-=bounds.min.y;root.updateMatrixWorld(true);}
function prepare(root){root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;}});}

function createCourt(){
  const floor=new THREE.Mesh(new THREE.BoxGeometry(30,.06,24),new THREE.MeshStandardMaterial({color:0x503d2e,roughness:.84}));
  floor.position.y=-.035;floor.receiveShadow=true;environment.add(floor);
  // Thin strips express the parquet grain without fetching a decorative image.
  const wood=new THREE.MeshStandardMaterial({color:0x584332,roughness:.9});
  for(let i=-25;i<=25;i++){
    const board=new THREE.Mesh(new THREE.BoxGeometry(.43,.003,22),wood);board.position.set(i*.49,-.003,0);board.receiveShadow=true;environment.add(board);
  }
  const lineMat=new THREE.MeshBasicMaterial({color:0xd9c7ab,transparent:true,opacity:.25,depthWrite:false});
  for(const x of [-5.4,5.4]){const line=new THREE.Mesh(new THREE.PlaneGeometry(.028,18),lineMat);line.rotation.x=-Math.PI/2;line.position.set(x,.004,0);environment.add(line);}
  const circle=new THREE.Mesh(new THREE.RingGeometry(3.0,3.024,100),lineMat);circle.rotation.x=-Math.PI/2;circle.position.set(0,.006,-3.5);environment.add(circle);
  const riserMat=new THREE.MeshStandardMaterial({color:0x262728,roughness:.95});
  for(let i=0;i<2;i++){
    const riser=new THREE.Mesh(new THREE.BoxGeometry(10.4,.19,1.05),riserMat);riser.name='CrowdRiser';riser.position.set(0,.095+i*.19,-.7-i*1.0);riser.receiveShadow=true;crowdGroup.add(riser);
  }
}

function initializeScene(){
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.02;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  scene=new THREE.Scene();scene.background=new THREE.Color('#25211e');scene.fog=new THREE.Fog('#25211e',14,30);
  camera=new THREE.PerspectiveCamera(30,1,.05,70);
  scene.add(new THREE.HemisphereLight(0xd8e3ef,0x493326,2.1));
  const key=new THREE.DirectionalLight(0xffe6c4,2.5);key.position.set(-3,7,6);key.castShadow=true;
  key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-8;key.shadow.camera.right=8;key.shadow.camera.top=7;key.shadow.camera.bottom=-5;key.shadow.bias=-.00015;key.shadow.normalBias=.025;scene.add(key);
  const rim=new THREE.DirectionalLight(0xdde6ff,1.5);rim.position.set(4,5,-4);scene.add(rim);
  const fill=new THREE.DirectionalLight(0xffd3aa,1.0);fill.position.set(5,3,5);scene.add(fill);
  scene.add(environment,playerGroup,crowdGroup);createCourt();
  new ResizeObserver(resize).observe(stage);resize();
}

function resize(){if(!renderer)return;const w=stage.clientWidth,h=stage.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();if(state.ready)layout();else frameCamera();draw();}
function frameCamera(){
  if(!camera)return;
  const portrait=camera.aspect<1.4,close=state.mode==='closeup',crowd=state.mode==='crowd';
  const faceHeight=Number(players[state.player]?.record.heightMeters)||1.78;
  let target=new THREE.Vector3(!portrait&&!close&&!crowd?.38:0,close?faceHeight-.20:crowd?1.12:.98,close?.015:crowd?-.55:0);
  let distance=close?.98:crowd?8.2:5.7;
  if(portrait)distance=close?1.65:crowd?14:8.7;
  // Fit horizontal content as well as height on narrow review viewports.
  if(!close)distance=Math.max(distance,(crowd?5.1:3.1)/(Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.aspect));
  distance/=zoom;
  camera.position.set(target.x+Math.sin(yaw)*distance,target.y+distance*(close?.03:crowd?.17:.08)+pitch,target.z+Math.cos(yaw)*distance);
  camera.lookAt(target);camera.updateMatrixWorld();
}

async function loadPlayers(){
  const records=playerCatalog.players||[];
  if(records.length!==4)throw Error('Expected four player body types');
  const teamModule=await import('./source/players-apply-team.mjs');applyTeam=teamModule.applyTeam;
  await Promise.all(records.map(async (record,index)=>{
    const gltf=await loader.loadAsync(record.model),root=gltf.scene;
    const wrap=new THREE.Group();wrap.name=record.id;wrap.add(root);prepare(root);
    const scale=Number(record.scaleToPreferredHeight)||1;root.scale.setScalar(scale);ground(root);
    const bones=Object.fromEntries(['Hips','Chest','LeftArm','RightArm','LeftForeArm','RightForeArm','Head'].map(n=>[n,root.getObjectByName(n)]));
    const bind=Object.fromEntries(Object.entries(bones).filter(([,b])=>b).map(([n,b])=>[n,{position:b.position.clone(),quaternion:b.quaternion.clone()}]));
    let mask=null;if(record.mask){mask=await textureLoader.loadAsync(record.mask);mask.flipY=false;mask.colorSpace=THREE.NoColorSpace;maskCache.set(record.id,mask);}
    const item={record,root,wrap,bones,bind,mask,index};players[index]=item;playerGroup.add(wrap);state.loadedModels++;
    if(applyTeam)item.teamController=applyTeam(THREE,root,teams[state.team],mask);
  }));
  $('model-picker').innerHTML='';
  players.forEach((item,index)=>{
    const button=document.createElement('button');button.dataset.player=index;button.setAttribute('aria-pressed',String(index===state.player));
    button.append(document.createTextNode(item.record.label||bodyLabels[index]));const small=document.createElement('small');small.textContent=`#${item.record.number} · ${(Number(item.record.heightMeters)||1.8).toFixed(2)} מ׳`;button.append(small);button.addEventListener('click',()=>selectPlayer(index));$('model-picker').append(button);
  });
}

function fanFile(fan,lod){const record=fan.lods.find(item=>Number(item.level)===lod);if(!record)throw Error(`${fan.id}: missing LOD${lod}`);return record.path;}
async function loadFans(lod){
  if(fanCache.has(lod))return fanCache.get(lod);
  if(pendingFans.has(lod))return pendingFans.get(lod);
  const work=Promise.all(crowdCatalog.fans.map(async (record,index)=>{
    const gltf=await loader.loadAsync(fanFile(record,lod)),root=gltf.scene;prepare(root);
    const wrap=new THREE.Group();wrap.name=record.id;wrap.add(root);crowdGroup.add(wrap);wrap.visible=false;
    const mixer=new THREE.AnimationMixer(root),actions={};
    for(const clip of gltf.animations)actions[clip.name]=mixer.clipAction(clip);
    for(const clip of crowdCatalog.clips)if(!actions[clip.name])throw Error(`${record.id} missing ${clip.name}`);
    state.loadedModels++;return {record,index,root,wrap,mixer,actions,animations:gltf.animations,lod};
  })).then(items=>{fanCache.set(lod,items);return items;}).finally(()=>pendingFans.delete(lod));
  pendingFans.set(lod,work);return work;
}

function layout(){
  const portrait=camera.aspect<1.4,close=state.mode==='closeup';
  playerGroup.visible=state.mode!=='crowd';crowdGroup.visible=state.mode==='crowd';
  players.forEach((item,i)=>{
    item.wrap.visible=!close||i===state.player;
    item.wrap.position.set(close?0:(i-1.5)*(portrait?1.17:1.28),0,0);
    item.wrap.rotation.y=close?-.12:i===0?.14:i===3?-.14:0;
  });
  for(const [lod,items] of fanCache){
    items.forEach((item,i)=>{
      item.wrap.visible=Number(lod)===state.lod;
      const row=Math.floor(i/8),column=i%8;
      item.wrap.position.set((column-3.5)*1.13,.19+row*.19,-.55-row*1.1);
      item.wrap.rotation.y=(column-3.5)*-.016;
    });
  }
  $('model-picker').classList.toggle('visible',close);
  document.querySelectorAll('[data-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mode===state.mode)));
  $('eyebrow').textContent=close?'מבט מקרוב':state.mode==='crowd'?'שש־עשרה סיבות להריע':'ארבעה על הפרקט';
  $('scene-title').textContent=close?(players[state.player]?.record.label||bodyLabels[state.player]):state.mode==='crowd'?'יציע של אנשים.':'אופי. גוף. תנועה.';
  $('scene-subtitle').textContent=close?'פנים, שיער, תפרי מדים וציוד כדורסל':state.mode==='crowd'?'גילאים, גווני עור, בגדים ומצבי רוח':'מדים ממוספרים, פנים אנושיות, פרופורציות של ספורטאים';
  updateStatus();frameCamera();
}
function updateStatus(){const count=state.mode==='crowd'?crowdCatalog?.fans.length||0:state.mode==='closeup'?1:players.length;const tris=[210,90,24][state.lod];$('asset-status').textContent=state.mode==='crowd'?`${count} אוהדים · ${tris} משולשים לאוהד · ${clipLabels[state.clip]}`:`${count} ${count===1?'שחקן':'שחקנים'} · Canonical18 · ${state.team==='mint'?'מנטה וקורל':state.team==='purple'?'סגול וזהב':'כחול ולבן'}`;}
async function setMode(mode){if(!state.ready)return snapshot();if(!['lineup','crowd','closeup'].includes(mode))throw Error('Unknown view mode');state.mode=mode;layout();draw();return snapshot();}
async function setLOD(value){if(!state.ready)return snapshot();const lod=Number(value);if(![0,1,2].includes(lod))throw Error('Invalid crowd LOD');const request=++lodRequest;$('lod').disabled=true;try{await loadFans(lod);if(request!==lodRequest)return snapshot();state.lod=lod;$('lod').value=String(lod);setClip(state.clip);layout();draw();}finally{if(request===lodRequest)$('lod').disabled=false;}return snapshot();}
function setClip(name){if(!state.ready)return snapshot();if(!crowdCatalog.clips.some(clip=>clip.name===name))throw Error('Unknown crowd clip');state.clip=name;$('clip').value=name;for(const items of fanCache.values())for(const fan of items){fan.mixer.stopAllAction();fan.actions[name].reset().setLoop(THREE.LoopRepeat,Infinity).play();}updateStatus();draw();return snapshot();}
function setTeam(name){if(!state.ready)return snapshot();if(!teams[name])throw Error('Unknown team palette');state.team=name;for(const item of players)item.teamController?.setColors(teams[name]);document.querySelectorAll('[data-team]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.team===name)));updateStatus();draw();return snapshot();}
function selectPlayer(index){if(!state.ready)return snapshot();state.player=Math.max(0,Math.min(players.length-1,Number(index)||0));document.querySelectorAll('[data-player]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.player)===state.player)));layout();draw();return snapshot();}
function setPaused(paused){state.paused=!!paused;$('pause').innerHTML=state.paused?'<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="m3 1 8 5-8 5Z" fill="currentColor"/></svg>':'<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1v10M9 1v10" stroke="currentColor" stroke-width="2"/></svg>';$('pause').setAttribute('aria-pressed',String(state.paused));$('pause').setAttribute('aria-label',state.paused?'הפעלת האנימציה':'השהיית האנימציה');return snapshot();}

function animatePlayers(time){
  for(const item of players){
    if(!item)continue;
    const breath=Math.sin(time*1.65+item.index*.43),{bones,bind}=item;
    for(const [name,bone]of Object.entries(bones))if(bone&&bind[name]){bone.position.copy(bind[name].position);bone.quaternion.copy(bind[name].quaternion);}
    // Canonical bind rotations are identity: subtle breath and relaxed wrists.
    if(bones.Chest)bones.Chest.rotateX(breath*.009);
    if(bones.LeftArm){bones.LeftArm.rotateZ(.14);bones.LeftArm.rotateX(-.045+breath*.012);}
    if(bones.RightArm){bones.RightArm.rotateZ(-.14);bones.RightArm.rotateX(-.065-breath*.012);}
    if(bones.LeftForeArm)bones.LeftForeArm.rotateX(-.20);
    if(bones.RightForeArm)bones.RightForeArm.rotateX(-.20);
    if(bones.Head)bones.Head.rotateY(Math.sin(time*.53+item.index)*.018);
    item.root.updateMatrixWorld(true);
  }
}
function draw(){
  if(!renderer||!scene)return;
  animatePlayers(simTime);
  for(const items of fanCache.values())for(const fan of items){if(fan.lod!==state.lod)continue;const duration=fan.actions[state.clip]?.getClip().duration||3;fan.mixer.setTime(simTime+(fan.index*.193)%duration);fan.root.updateMatrixWorld(true);}
  state.time=simTime;renderer.render(scene,camera);
}
function render(time=simTime){simTime=Math.max(0,Number(time)||0);draw();return snapshot();}
function tick(now){const dt=Math.min(.06,Math.max(0,(now-lastFrame)/1000));lastFrame=now;if(state.ready&&!state.paused)simTime+=dt;draw();requestAnimationFrame(tick);}
function snapshot(){return {...state,loading:!state.ready||pendingFans.size>0,players:players.filter(Boolean).map(item=>({id:item.record.id,number:item.record.number,height:item.record.heightMeters})),crowdLoaded:fanCache.get(state.lod)?.length||0,loadedLODs:[...fanCache.keys()].sort(),canvas:{width:canvas.width,height:canvas.height},viewport:{width:innerWidth,height:innerHeight},drawCalls:renderer?.info.render.calls||0,triangles:renderer?.info.render.triangles||0};}

async function playSound(id=$('sound').value){
  if(!state.ready)return {played:false,reason:'loading'};
  const asset=audioCatalog.assets.find(item=>item.id===id);if(!asset)throw Error('Unknown sound');
  if(activeAudio){activeAudio.pause();activeAudio.currentTime=0;}
  const sound=new Audio();activeAudio=sound;sound.preload='auto';sound.volume=Number(asset.suggested_gain)||.7;
  const format=sound.canPlayType('audio/ogg; codecs="vorbis"')?'ogg':'mp3';sound.src=asset.files[format].path;
  try{await sound.play();}catch(error){if(format==='ogg'){sound.src=asset.files.mp3.path;await sound.play();}else throw error;}
  return {id:asset.id,format:format,duration:asset.duration_seconds};
}
function events(){
  document.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>setMode(button.dataset.mode).catch(fail)));
  document.querySelectorAll('[data-team]').forEach(button=>button.addEventListener('click',()=>setTeam(button.dataset.team)));
  $('clip').addEventListener('change',()=>setClip($('clip').value));$('lod').addEventListener('change',()=>setLOD($('lod').value).catch(fail));
  $('pause').addEventListener('click',()=>setPaused(!state.paused));$('play-sound').addEventListener('click',()=>playSound().catch(fail));
  $('reset-view').addEventListener('click',()=>{yaw=pitch=0;zoom=1;frameCamera();draw();});
  let pointer=null;
  canvas.addEventListener('pointerdown',event=>{pointer={id:event.pointerId,x:event.clientX,y:event.clientY};canvas.setPointerCapture(event.pointerId);});
  canvas.addEventListener('pointermove',event=>{if(!pointer||event.pointerId!==pointer.id)return;yaw=THREE.MathUtils.clamp(yaw+(event.clientX-pointer.x)*.007,-Math.PI,Math.PI);pitch=THREE.MathUtils.clamp(pitch+(event.clientY-pointer.y)*.006,-.5,.8);pointer.x=event.clientX;pointer.y=event.clientY;frameCamera();draw();});
  const end=()=>{pointer=null;};canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);
  canvas.addEventListener('wheel',event=>{event.preventDefault();zoom=THREE.MathUtils.clamp(zoom*Math.exp(-event.deltaY*.0008),.75,1.8);frameCamera();draw();},{passive:false});
  canvas.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();yaw+=event.key==='ArrowLeft'?-.12:.12;frameCamera();draw();}else if(event.code==='Space'){event.preventDefault();setPaused(!state.paused);}});
}

window.__hoopsPreview={get ready(){return state.ready;},get state(){return snapshot();},getState:snapshot,setMode,setLOD,setClip,setTeam,selectPlayer,setPaused,render,playSound};

async function start(){
  enableAssetControls(false);initializeScene();events();setPaused(state.paused);requestAnimationFrame(tick);
  [crowdCatalog,playerCatalog,audioCatalog]=await Promise.all([json('./crowd/catalog.json'),json('./players/catalog.json'),json('./audio/catalog.json')]);
  if(crowdCatalog.fans.length!==16)throw Error('Expected sixteen crowd variants');
  await Promise.all([loadPlayers(),loadFans(0)]);
  $('sound').innerHTML='';for(const asset of audioCatalog.assets){const option=document.createElement('option');option.value=asset.id;option.textContent=asset.label_he;$('sound').append(option);}
  state.ready=true;setClip('stand');layout();enableAssetControls(true);$('loading').hidden=true;draw();
}
start().catch(fail);
