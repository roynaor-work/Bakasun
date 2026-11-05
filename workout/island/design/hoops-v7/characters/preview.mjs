import * as THREE from './vendor/three.module.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { DRACOLoader } from './vendor/DRACOLoader.js';
import { MeshoptDecoder } from './vendor/meshopt_decoder.module.js';
import { ACTIONS, createMotionController } from './source/motion.mjs';

const $ = id => document.getElementById(id);
const $$ = query => [...document.querySelectorAll(query)];
const PACK = window.__HOOPS_PACK__ || null;
const PROFILES = [
  {id:'pg',role:'PG',label:'רכז',title:'רכז.',description:'מבנה קל. שליטה קרובה.',build:'קל וזריז',heightMeters:1.78,number:'07'},
  {id:'sg',role:'SG',label:'קלע',title:'קלע.',description:'טווח ארוך. שחרור מדויק.',build:'ארוך וקל',heightMeters:1.88,number:'12'},
  {id:'sf',role:'SF',label:'סמול פורוורד',title:'כנף.',description:'אורך, איזון ותנועה.',build:'מאוזן ואתלטי',heightMeters:1.99,number:'24'},
  {id:'pf',role:'PF',label:'פאוור פורוורד',title:'פאוור.',description:'כתפיים רחבות. בסיס יציב.',build:'רחב ושרירי',heightMeters:2.09,number:'35'},
  {id:'c',role:'C',label:'סנטר',title:'סנטר.',description:'גובה, מוטת ידיים ונוכחות.',build:'גבוה וארוך',heightMeters:2.20,number:'44'},
  {id:'referee',role:'REF',label:'שופט',title:'השופט.',description:'תנועה חופשית. מבט ממוקד.',build:'מבנה בינוני',heightMeters:1.86,number:'00'},
];
const TEAMS = {
  teal:{team_primary:'#318b85',team_secondary:'#1a3439',team_trim:'#ece7d6',compression:'#263a3e'},
  ivory:{team_primary:'#e6dfca',team_secondary:'#d8cfb5',team_trim:'#267a76',compression:'#33494b'},
};
const UI_CATEGORIES = {dribble:'כדרור',shoot:'קליעה',shot:'קליעה',finish:'סיומת',dunk:'דאנק',locomotion:'תנועה על המגרש',defense:'הגנה',ball:'שליטה בכדור',control:'שליטה בכדור',expression:'תגובה',reaction:'תגובה',misc:'תנועות נוספות'};
let renderer,scene,camera,shadowLight,ground,crowdGroup,rulerGroup;
let selectedId='pg',view='near',team='teal',actionId='hold',playing=true,speed=1,lodMode='auto';
let readyFlag=false,frameCount=0,frameClock=0,measuredFps=0,lastClock=performance.now(),lastRendered=0;
let renderError=null,captureMode=false;
const actors=[];
const performanceMetrics={readyAtUtc:null,renderedFrames:0,playbackFrames:0,totalRenderCpuMs:0,latestRenderCpuMs:0,renderCpuSamples:[],playbackWallMs:0,frameGapSamples:[],longFramesOver50ms:0};
let sharedAtlasNormal=null;
let sharedBallTexture=null,sharedBallBump=null,sharedShadowTexture=null;
const cameraState={yaw:.10,pitch:.04,distance:3.8,target:new THREE.Vector3(0,1,0),zoom:1};
const tmpVec=new THREE.Vector3();
let resolveReady,rejectReady;
const ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
// Consumers can await ready before applying deterministic capture settings.
window.__hoopsLab={ready,captureReady:false,version:'hoops-characters-v7',actors,profiles:PROFILES,actions:ACTIONS,
  setView,selectRole,selectAction,seek,setTime:seek,setTeam,pause,setPlaying,setSpeed,
  setLOD,setCrowd,setRuler,render,diagnostics,setCamera,
  get state(){return {selectedId,view,team,actionId,playing,speed,lodMode};},
  get scene(){return scene;},get camera(){return camera;},get renderer(){return renderer;},
};

function decodeBase64(input){const binary=atob(input);const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes;}
async function assetBuffer(path){if(PACK?.files?.[path])return decodeBase64(PACK.files[path]).buffer;const response=await fetch(path);if(!response.ok)throw new Error(`${path}: ${response.status}`);return response.arrayBuffer();}
async function loadProfileData(){const [rig,authoring]=await Promise.all(['rig.json','model-authoring.json'].map(async name=>JSON.parse(new TextDecoder().decode(await assetBuffer(name)))));for(const profile of PROFILES){const source=authoring.profiles?.find(p=>p.id===profile.id);if(source){profile.heightMeters=source.heightMeters||profile.heightMeters;profile.number=source.number??profile.number;profile.authoredTriangles=source.triangles;profile.authoredLOD1Triangles=source.lod1Triangles;}profile.palms=rig.profiles?.[profile.id]?.palms;}}
function setProgress(count){$('loading-progress').style.width=`${Math.min(100,count/12*100)}%`;$('loading-detail').textContent=`דמויות ורמות פירוט · ${count} / 12`;}
function fail(error){renderError=String(error?.stack||error);console.error(error);$('error').hidden=false;$('error').textContent='טעינת התצוגה נכשלה. יש לפתוח את standalone.html המקומי או להגיש את התיקייה בשרת מקומי. '+String(error?.message||error);$('loading').classList.add('is-done');$('status').textContent='שגיאת טעינה';rejectReady(error);}

function makeFloorTexture(){
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=1024;
  const ctx=canvas.getContext('2d');let state=87341;
  const rand=()=>{state=(1664525*state+1013904223)>>>0;return state/4294967296;};
  ctx.fillStyle='#82745c';ctx.fillRect(0,0,1024,1024);
  for(let row=0;row<16;row++)for(let col=-1;col<5;col++){
    const x=col*256+(row%2)*128,y=row*64;
    const shade=rand()*14;ctx.fillStyle=`rgb(${129+shade},${114+shade},${90+shade})`;ctx.fillRect(x+1,y+1,254,62);
    for(let grain=0;grain<40;grain++){const yy=y+rand()*64;ctx.strokeStyle=`rgba(75,58,35,${.015+rand()*.035})`;ctx.lineWidth=.5+rand();ctx.beginPath();ctx.moveTo(x,yy);ctx.bezierCurveTo(x+80,yy-2,x+160,yy+3,x+256,yy);ctx.stroke();}
  }
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(4,4);texture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());return texture;
}
function makeShadow(){if(!sharedShadowTexture){const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const ctx=canvas.getContext('2d');const gr=ctx.createRadialGradient(64,64,5,64,64,63);gr.addColorStop(0,'rgba(0,0,0,.30)');gr.addColorStop(.45,'rgba(0,0,0,.16)');gr.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=gr;ctx.fillRect(0,0,128,128);sharedShadowTexture=new THREE.CanvasTexture(canvas);}const mesh=new THREE.Mesh(new THREE.PlaneGeometry(.95,.80),new THREE.MeshBasicMaterial({map:sharedShadowTexture,transparent:true,depthWrite:false,opacity:.65}));mesh.rotation.x=-Math.PI/2;mesh.position.y=.007;return mesh;}
function line(points,color='#b9c7b7',opacity=.24){return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p))),new THREE.LineBasicMaterial({color,transparent:true,opacity}));}
function makeScene(){
  const stage=$('stage');renderer=new THREE.WebGLRenderer({canvas:$('canvas'),antialias:true,alpha:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));renderer.setSize(stage.clientWidth,stage.clientHeight,false);
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.02;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  scene=new THREE.Scene();scene.fog=new THREE.Fog('#273438',9,25);
  camera=new THREE.PerspectiveCamera(34,stage.clientWidth/stage.clientHeight,.015,80);
  scene.add(new THREE.HemisphereLight('#e3edf0','#a98d67',1.2));
  shadowLight=new THREE.DirectionalLight('#fff0d9',3.0);shadowLight.position.set(2.8,5.3,4);shadowLight.castShadow=true;shadowLight.shadow.mapSize.set(1024,1024);shadowLight.shadow.camera.left=-4.8;shadowLight.shadow.camera.right=4.8;shadowLight.shadow.camera.top=3.7;shadowLight.shadow.camera.bottom=-3.7;shadowLight.shadow.camera.near=.5;shadowLight.shadow.camera.far=14;shadowLight.shadow.bias=-.00015;shadowLight.shadow.normalBias=.012;shadowLight.shadow.radius=2;shadowLight.target.position.set(0,1,0);scene.add(shadowLight,shadowLight.target);
  const fill=new THREE.DirectionalLight('#d9eaf1',1.0);fill.position.set(-4,2.6,4);scene.add(fill);
  const rim=new THREE.DirectionalLight('#b5d5d0',1.8);rim.position.set(2.5,4,-4);scene.add(rim);
  const floorMat=new THREE.MeshStandardMaterial({color:'#c5bba5',roughness:.68,metalness:0,map:makeFloorTexture()});
  ground=new THREE.Mesh(new THREE.PlaneGeometry(60,60),floorMat);ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;ground.position.y=-.002;scene.add(ground);
  // Unbranded court markings stay outside the primary anatomy silhouette.
  const arc=[];for(let i=0;i<=80;i++){const a=i/80*Math.PI;arc.push([Math.cos(a)*4.4,.008,-Math.sin(a)*4.4-1]);}scene.add(line(arc,'#dfdfc8',.22));
  scene.add(line([[-12,.009,-2.7],[12,.009,-2.7]],'#dfdfc8',.20));
  scene.add(line([[-12,.009,3.5],[12,.009,3.5]],'#dfdfc8',.12));
  rulerGroup=new THREE.Group();rulerGroup.visible=false;scene.add(rulerGroup);
  for(let i=0;i<=24;i++){const y=i/10;rulerGroup.add(line([[-.54,y,0],[-.54+(i%5===0?.09:.04),y,0]],'#d4e7da',i%5===0?.5:.2));}
  rulerGroup.add(line([[-.54,0,0],[-.54,2.4,0]],'#c1d4c6',.22));
  crowdGroup=makeCrowd();crowdGroup.visible=false;scene.add(crowdGroup);
  new ResizeObserver(resize).observe(stage);
  installCameraControls();
}
function makeCrowd(){
  const group=new THREE.Group();group.name='Anonymous instanced crowd';
  const count=240;const bodies=new THREE.InstancedMesh(new THREE.CylinderGeometry(.10,.15,.33,6,1),new THREE.MeshStandardMaterial({color:'#a6bcb7',roughness:.95}),count);
  const heads=new THREE.InstancedMesh(new THREE.SphereGeometry(.085,8,5),new THREE.MeshStandardMaterial({color:'#ac886b',roughness:.92}),count);
  const matrix=new THREE.Matrix4(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3(1,1,1);const colors=['#456668','#394f5d','#8c8876','#a5b1a2','#646454'];
  for(let i=0;i<count;i++){
    const row=Math.floor(i/40),col=i%40,x=(col-19.5)*.34,y=.38+row*.30,z=-4.7-row*.40;
    matrix.compose(new THREE.Vector3(x,y,z),rotation,scale);bodies.setMatrixAt(i,matrix);bodies.setColorAt(i,new THREE.Color(colors[(i*7+row)%colors.length]));
    matrix.compose(new THREE.Vector3(x,y+.26,z-.005),rotation,scale);heads.setMatrixAt(i,matrix);heads.setColorAt(i,new THREE.Color(['#c79e80','#87614f','#a27b5f','#e0b79b'][i%4]));
  }
  bodies.instanceMatrix.needsUpdate=true;heads.instanceMatrix.needsUpdate=true;group.add(bodies,heads);
  const stands=new THREE.Mesh(new THREE.BoxGeometry(15,.12,3),new THREE.MeshStandardMaterial({color:'#293b3c',roughness:.9}));stands.position.set(0,.09,-5.8);group.add(stands);return group;
}
function makeBall(){
  if(sharedBallTexture){const ball=new THREE.Mesh(new THREE.SphereGeometry(.12,24,16),new THREE.MeshStandardMaterial({map:sharedBallTexture,bumpMap:sharedBallBump,bumpScale:.0022,roughness:.88,metalness:0}));ball.castShadow=true;ball.name='Presentation basketball';return ball;}
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;const ctx=canvas.getContext('2d');ctx.fillStyle='#a9582e';ctx.fillRect(0,0,512,256);
  let seed=33;const rand=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};
  for(let i=0;i<22000;i++){const x=rand()*512,y=rand()*256;ctx.fillStyle=i%2?'#c16b3a80':'#713c2670';ctx.fillRect(x,y,.7,.7);}
  ctx.strokeStyle='#362b20';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(0,128);ctx.lineTo(512,128);ctx.moveTo(128,0);ctx.lineTo(128,256);ctx.moveTo(384,0);ctx.lineTo(384,256);ctx.stroke();
  ctx.beginPath();for(let x=0;x<=512;x++){const y=128+100*Math.sin(x/512*Math.PI*2);if(x===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.stroke();
  const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;sharedBallTexture=tex;
  const bumpCanvas=document.createElement('canvas');bumpCanvas.width=512;bumpCanvas.height=256;const bump=bumpCanvas.getContext('2d');bump.fillStyle='#686868';bump.fillRect(0,0,512,256);
  for(let row=0;row<86;row++)for(let col=0;col<172;col++){const x=col*3+(row%2)*1.5,y=row*3,g=bump.createRadialGradient(x,y,.15,x,y,1.25);g.addColorStop(0,'#bcbcbc');g.addColorStop(.6,'#929292');g.addColorStop(1,'#666666');bump.fillStyle=g;bump.fillRect(x-1.25,y-1.25,2.5,2.5);}
  bump.strokeStyle='#303030';bump.lineWidth=3;bump.beginPath();bump.moveTo(0,128);bump.lineTo(512,128);bump.moveTo(128,0);bump.lineTo(128,256);bump.moveTo(384,0);bump.lineTo(384,256);bump.stroke();bump.beginPath();for(let x=0;x<=512;x++){const y=128+100*Math.sin(x/512*Math.PI*2);if(!x)bump.moveTo(x,y);else bump.lineTo(x,y);}bump.stroke();sharedBallBump=new THREE.CanvasTexture(bumpCanvas);
  const ball=new THREE.Mesh(new THREE.SphereGeometry(.12,24,16),new THREE.MeshStandardMaterial({map:tex,bumpMap:sharedBallBump,bumpScale:.0022,roughness:.88,metalness:0}));ball.castShadow=true;ball.name='Presentation basketball';return ball;
}
function configureModel(root,sharedTextures=new Map()){
  const droppedTextures=new Set();
  root.traverse(object=>{
    if(!object.isMesh)return;object.castShadow=true;object.receiveShadow=false;object.frustumCulled=false;
    const materials=Array.isArray(object.material)?object.material:[object.material];
    object.material=materials.map(material=>{const m=material.clone();m.userData.originalColor=m.color?.getHex();m.userData.originalName=m.name;
      for(const slot of ['map','normalMap','roughnessMap','metalnessMap','alphaMap']){if(!m[slot])continue;const key=m.name+':'+slot;if(sharedTextures.has(key)){const previous=m[slot];m[slot]=sharedTextures.get(key);if(previous!==m[slot])droppedTextures.add(previous);}else sharedTextures.set(key,m[slot]);}
      // Authoring uses the identical normal atlas for all six profiles and both
      // LODs. Reuse one GPU texture rather than uploading twelve equal images.
      if(m.normalMap){if(sharedAtlasNormal){if(m.normalMap!==sharedAtlasNormal)droppedTextures.add(m.normalMap);m.normalMap=sharedAtlasNormal;}else sharedAtlasNormal=m.normalMap;sharedTextures.set(m.name+':normalMap',m.normalMap);}
      if(m.map){m.map.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());}
      if(/skin/i.test(m.name)){m.roughness=.73;m.metalness=0;}
      if(/hair|brow|lash/i.test(m.name)){m.roughness=.86;if(m.transparent){m.alphaTest=.18;m.depthWrite=true;}}
      if(/team_|jersey|short|compression/i.test(m.name)){m.roughness=.87;m.metalness=0;}
      return m;});if(!Array.isArray(object.material)||object.material.length===1)object.material=object.material[0];
  });
  // Low/high GLBs are portable files with their own embedded images. Once the
  // runtime materials share the retained atlas, release the redundant decoded
  // ImageBitmaps as well as avoiding duplicate GPU uploads.
  const retained=new Set();root.traverse(object=>{if(!object.isMesh)return;for(const material of Array.isArray(object.material)?object.material:[object.material])for(const slot of ['map','normalMap','roughnessMap','metalnessMap','alphaMap'])if(material[slot])retained.add(material[slot]);});
  const retainedImages=new Set([...retained].map(texture=>texture.source?.data)),closedImages=new Set();for(const texture of droppedTextures){if(retained.has(texture))continue;texture.dispose();const image=texture.source?.data;if(!PACK?.images&&image&&!retainedImages.has(image)&&typeof image.close==='function'&&!closedImages.has(image)){image.close();closedImages.add(image);}}
}
function shareLODRig(high,low){
  const bones=new Map(),meshes=new Map();let sharedSkeleton=null;high.traverse(object=>{if(object.isBone)bones.set(object.name,object);if(object.isSkinnedMesh){meshes.set(object.name,object);sharedSkeleton||=object.skeleton;}});
  const lowMeshes=[];low.traverse(object=>{if(object.isSkinnedMesh)lowMeshes.push(object);});
  if(!lowMeshes.length||lowMeshes.some(mesh=>mesh.skeleton.bones.some(bone=>!bones.has(bone.name))))return false;
  for(const mesh of lowMeshes){
    const bindMatrix=mesh.bindMatrix.clone();
    const matching=sharedSkeleton&&mesh.skeleton.bones.length===sharedSkeleton.bones.length&&mesh.skeleton.bones.every((bone,index)=>bone.name===sharedSkeleton.bones[index].name&&mesh.skeleton.boneInverses[index].elements.every((value,component)=>Math.abs(value-sharedSkeleton.boneInverses[index].elements[component])<1e-5));
    const skeleton=matching?sharedSkeleton:new THREE.Skeleton(mesh.skeleton.bones.map(bone=>bones.get(bone.name)),mesh.skeleton.boneInverses.map(matrix=>matrix.clone()));
    mesh.bind(skeleton,bindMatrix);
    const source=meshes.get(mesh.name)||[...meshes.values()].find(candidate=>JSON.stringify(candidate.morphTargetDictionary)===JSON.stringify(mesh.morphTargetDictionary));
    if(source&&source.morphTargetInfluences&&mesh.morphTargetInfluences)mesh.morphTargetInfluences=source.morphTargetInfluences;
  }
  return true;
}
async function loadModels(){
  // Portable GLBs embed their own images; the standalone copy pools equal image
  // bytes across all twelve models. Resolve those resources to local Blob URLs
  // and let ImageBitmapLoader decode each unique atlas once during loading.
  const manager=new THREE.LoadingManager(),imageURLs=new Map(),previousCache=THREE.Cache.enabled;
  if(PACK?.images){THREE.Cache.enabled=true;manager.setURLModifier(url=>{const image=PACK.images[url];if(!image)return url;if(!imageURLs.has(url))imageURLs.set(url,URL.createObjectURL(new Blob([decodeBase64(image.base64)],{type:image.mimeType})));return imageURLs.get(url);});}
  const draco=new DRACOLoader(manager);draco.setDecoderPath('vendor/draco/');draco.setDecoderConfig({type:'wasm'});draco.setWorkerLimit(2);
  if(PACK){draco._loadLibrary=(name,responseType)=>{const key='vendor/draco/'+name;const value=PACK.files[key];if(!value)return Promise.reject(new Error('Missing embedded decoder '+name));const buffer=decodeBase64(value);return Promise.resolve(responseType==='arraybuffer'?buffer.buffer:new TextDecoder().decode(buffer));};}
  const loader=new GLTFLoader(manager);loader.setDRACOLoader(draco);loader.setMeshoptDecoder(MeshoptDecoder);let loaded=0;
  try{
  for(const profile of PROFILES){
    const wrapper=new THREE.Group();wrapper.name='Actor '+profile.id;scene.add(wrapper);
    const lod=new THREE.LOD();lod.autoUpdate=false;wrapper.add(lod);
    const shadow=makeShadow();wrapper.add(shadow);
    const ball=makeBall();wrapper.add(ball);
    const actor={id:profile.id,profile,wrapper,lod,ball,shadow,root:null,controller:null,roots:[],controllers:[],currentLevel:0};
    const sharedTextures=new Map();
    for(const level of [0,1]){
      const path=`models/${profile.id}${level?'-lod1':''}.glb`;
      const buffer=await assetBuffer(path);const gltf=await new Promise((resolve,reject)=>loader.parse(buffer,'',resolve,reject));
      const model=gltf.scene;model.name=`${profile.id} LOD ${level}`;configureModel(model,sharedTextures);if(level===1)model.traverse(object=>{if(object.isMesh)object.castShadow=false;});
      const shared=level===1&&shareLODRig(actor.roots[0],model);
      const controller=shared?actor.controllers[0]:createMotionController(model,{ball,profile,id:profile.id});
      if(!shared){controller.setAction(actionId,{immediate:true});controller.seek(0);}
      actor.roots.push(model);actor.controllers.push(controller);lod.addLevel(model,level?7:0,.12);
      loaded++;setProgress(loaded);
    }
    actor.root=actor.roots[0];actor.controller=actor.controllers[0];actors.push(actor);
  }
  return draco;
  }catch(error){draco.dispose();throw error;}finally{if(PACK?.images){for(const url of imageURLs.values())URL.revokeObjectURL(url);THREE.Cache.clear();THREE.Cache.enabled=previousCache;}}
}
function currentActor(){return actors.find(actor=>actor.id===selectedId)||actors[0];}
function synchronizePose(targetActors,phase){for(const actor of targetActors)for(const controller of new Set(actor.controllers)){controller.setAction(actionId,{immediate:true});controller.seek(phase);}}
function setTeam(value){if(!TEAMS[value])return false;team=value;for(const actor of actors)for(const root of actor.roots)root.traverse(object=>{if(!object.isMesh)return;for(const material of Array.isArray(object.material)?object.material:[object.material]){const name=material.userData.originalName||material.name;if(actor.id==='referee')continue;for(const [slot,color]of Object.entries(TEAMS[team]))if(name===slot||name.startsWith(slot+'.')){material.color.set(color);break;}}});$$('[data-team]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.team===team)));render();return true;}
function selectRole(id){if(!PROFILES.some(profile=>profile.id===id))return false;const phase=currentActor()?.controller.getDiagnostics().phase||0;selectedId=id;const actor=currentActor();if(actor)synchronizePose([actor],phase);$$('[data-role]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.role===selectedId)));updateStage();layoutActors();resetCamera();render();return true;}
function selectAction(id,options={}){id=({hold:'idle_hold',dribble:'dribble_right',shoot:'shot_jump'})[id]||id;const found=ACTIONS.find(action=>action.id===id);if(!found)return false;actionId=id;for(const actor of actors)for(const controller of new Set(actor.controllers))controller.setAction(id,{immediate:!playing,...options});$('action').value=id;if(view==='far')layoutActors();reframePreservingOrbit();updateStage();render();return true;}
function setView(value){if(!['near','far','face','hands','cloth'].includes(value))return false;const phase=currentActor()?.controller.getDiagnostics().phase||0;if(value==='far'&&view!=='far')synchronizePose(actors,phase);view=value;$$('[data-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.view===view)));layoutActors();resetCamera();updateStage();render();return true;}
function pause(value=true){return setPlaying(!value);}
function setPlaying(value){const next=Boolean(value),action=ACTIONS.find(action=>action.id===actionId);if(next&&!playing&&!action?.loop&&currentActor()?.controller.getDiagnostics().phase>=.999)seek(0);playing=next;lastClock=lastRendered=performance.now();frameClock=0;frameCount=0;updatePlayUI();return playing;}
function setSpeed(value){speed=THREE.MathUtils.clamp(Number(value)||1,.1,2);$('speed').value=String(speed);return speed;}
function seek(phase){const p=THREE.MathUtils.clamp(Number(phase)||0,0,1);for(const actor of actors)for(const controller of new Set(actor.controllers))controller.seek(p);$('timeline').value=String(p);if(['face','hands','cloth'].includes(view))reframePreservingOrbit();render();return p;}
function setLOD(value){if(!['auto','high','low'].includes(value))return false;lodMode=value;$('lod').value=value;updateLOD();render();return true;}
function setCrowd(value){if(crowdGroup)crowdGroup.visible=Boolean(value);$('crowd').checked=Boolean(value);render();}
function setRuler(value){if(rulerGroup)rulerGroup.visible=Boolean(value);$('ruler').checked=Boolean(value);render();}
function updatePlayUI(){$('play').setAttribute('aria-pressed',String(playing));$('play').setAttribute('aria-label',playing?'השהיית התנועה':'ניגון התנועה');$('play-icon').textContent=playing?'Ⅱ':'▶︎';$('play-text').textContent=playing?'השהיה':'ניגון';}
function updateStage(){
  $('stage').dataset.view=view;
  $('stage').dataset.action=actionId;
  const profile=PROFILES.find(profile=>profile.id===selectedId);$('role-label').textContent=profile.label;$('profile-height').innerHTML=`${profile.heightMeters.toFixed(2)} <small>m</small>`;$('profile-build').textContent=profile.build;
  $('stage-title').textContent=view==='far'?'שישה על קו אחד.':profile.title;
  $('stage-description').textContent=view==='far'?'אותו קנה מידה. שש נוכחויות שונות.':view==='face'?'מבט מקרוב · פנים, שיער ופיאות':view==='hands'?'מבט מקרוב · אצבעות ומגע בכדור':view==='cloth'?'מבט מקרוב · אריגה, תפרים וקפלים':profile.description;
  const index=PROFILES.findIndex(p=>p.id===selectedId)+1;$('view-kicker').textContent=view==='far'?'THE LINEUP / 01—06':`ATHLETE STUDY / ${String(index).padStart(2,'0')}`;
  $('stage-role-code').textContent=view==='far'?'PG / SG / SF / PF / C / REF':`${profile.role} · ${profile.heightMeters.toFixed(2)} m`;
  const action=ACTIONS.find(action=>action.id===actionId);$('status').textContent=readyFlag?(action?.label||actionId):'טוען את הדמויות…';
  $('height-labels').innerHTML=view==='far'?PROFILES.map(profile=>`<div class="height-tag" data-label="${profile.id}"><b>${profile.role}</b><span>${profile.heightMeters.toFixed(2)} m</span></div>`).join(''):'';
}
function actionEnvelope(height){
  if(actionId.startsWith('dunk_'))return {height:Math.max(3.40,height+.65),width:1.45};
  const lift={shot_set:.45,shot_jump:.70,shot_fadeaway:.75,shot_stepback:.70,layup:.85,euro_step:.65,block:.76,rebound:.90,celebrate:.28,referee_signal:.26}[actionId]||0;
  const width=actionId==='fall'?Math.max(1.65,height*.95):actionId==='defense_shuffle'?1.65:1.3;
  return {height:height+lift,width};
}
function lineupSpacing(){return actionId==='fall'?1.80:actionId==='defense_shuffle'?1.25:1.04;}
function layoutActors(){const spacing=lineupSpacing();for(let i=0;i<actors.length;i++){const actor=actors[i];actor.wrapper.visible=view==='far'||actor.id===selectedId;actor.wrapper.position.set(view==='far'?(i-2.5)*spacing:0,0,0);actor.wrapper.rotation.set(0,0,0);}if(rulerGroup)rulerGroup.position.x=view==='far'?-2.5*spacing-.4:0;}
function resetCamera(){
  const profile=PROFILES.find(profile=>profile.id===selectedId);const h=profile.heightMeters,aspect=camera?.aspect||1;
  cameraState.yaw=view==='far'?.01:.10;cameraState.pitch=view==='far'?.015:.035;cameraState.zoom=1;
  if(view==='face'){const bone=currentActor()?.roots[0].getObjectByName('Head');if(bone){bone.getWorldPosition(tmpVec);cameraState.target.copy(tmpVec).add(new THREE.Vector3(0,h*.025,.02));}else cameraState.target.set(0,h*.902,.02);cameraState.distance=.74;cameraState.yaw=.12;cameraState.pitch=.015;}
  else if(view==='cloth'){const bone=currentActor()?.roots[0].getObjectByName('Chest');if(bone){bone.getWorldPosition(tmpVec);cameraState.target.copy(tmpVec).add(new THREE.Vector3(.04,h*.005,.085));}else cameraState.target.set(.04,h*.73,.04);cameraState.distance=.72;cameraState.yaw=.55;cameraState.pitch=.03;}
  else if(view==='hands'){const d=currentActor()?.controller.getDiagnostics();const ball=d?.ballPosition;cameraState.target.set(ball?.[0]??0,(ball?.[1]??h*.58)-.035,ball?.[2]??.36);cameraState.distance=1.15;cameraState.yaw=.15;cameraState.pitch=.01;}
  else if(view==='far'){const envelope=actionEnvelope(2.20),width=lineupSpacing()*5+Math.max(1.45,envelope.width);cameraState.target.set(0,envelope.height*.45,0);cameraState.distance=Math.max((envelope.height+.35)/(2*Math.tan(THREE.MathUtils.degToRad(17)))*1.12,width/(2*Math.tan(THREE.MathUtils.degToRad(17))*aspect)*1.08);if(!['idle','idle_hold'].includes(actionId))cameraState.distance*=1.10;}
  else{const envelope=actionEnvelope(h);cameraState.target.set(0,envelope.height*.43,.02);cameraState.distance=envelope.height/(2*Math.tan(THREE.MathUtils.degToRad(17))*.68);cameraState.distance=Math.max(cameraState.distance,envelope.width/(2*Math.tan(THREE.MathUtils.degToRad(17))*aspect));}
  updateCamera();
}
function reframePreservingOrbit(){if(!camera)return;const {yaw,pitch,zoom}=cameraState;resetCamera();cameraState.yaw=yaw;cameraState.pitch=pitch;cameraState.zoom=zoom;updateCamera();}
function followDetailTarget(dt){if(view!=='face'&&view!=='cloth')return;const profile=currentActor()?.profile,bone=currentActor()?.roots[0].getObjectByName(view==='face'?'Head':'Chest');if(!bone||!profile)return;bone.getWorldPosition(tmpVec);if(view==='face')tmpVec.add(new THREE.Vector3(0,profile.heightMeters*.025,.02));else tmpVec.add(new THREE.Vector3(.04,profile.heightMeters*.005,.085));cameraState.target.lerp(tmpVec,1-Math.exp(-dt*24));updateCamera();}
function setCamera(options={}){if(options.yaw!==undefined)cameraState.yaw=Number(options.yaw);if(options.pitch!==undefined)cameraState.pitch=Number(options.pitch);if(options.distance!==undefined)cameraState.distance=Number(options.distance);if(options.target)cameraState.target.fromArray(options.target);if(options.zoom!==undefined)cameraState.zoom=Number(options.zoom);updateCamera();render();return cameraState;}
function updateCamera(){if(!camera)return;const distance=cameraState.distance*cameraState.zoom,minPitch=Math.asin(THREE.MathUtils.clamp((.07-cameraState.target.y)/distance,-1,1));cameraState.pitch=Math.max(cameraState.pitch,minPitch);camera.position.set(cameraState.target.x+Math.sin(cameraState.yaw)*Math.cos(cameraState.pitch)*distance,cameraState.target.y+Math.sin(cameraState.pitch)*distance,cameraState.target.z+Math.cos(cameraState.yaw)*Math.cos(cameraState.pitch)*distance);camera.lookAt(cameraState.target);camera.updateMatrixWorld();updateLOD();}
function updateLOD(){if(!camera)return;for(const actor of actors){actor.lod.update(camera);let level=lodMode==='low'?1:0;if(lodMode==='auto'){if(view==='far')level=1;else if(view==='near'&&cameraState.zoom>1.6)level=actor.lod.getCurrentLevel();}actor.roots.forEach((root,index)=>root.visible=index===level);actor.currentLevel=level;actor.root=actor.roots[level];actor.controller=actor.controllers[level];actor.ball.castShadow=level===0;}if(shadowLight)shadowLight.castShadow=actors.some(actor=>actor.wrapper.visible&&actor.currentLevel===0);}
function resize(){if(!renderer||!camera)return;const stage=$('stage'),w=stage.clientWidth,h=stage.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();if(readyFlag){resetCamera();render();}}
function render(){if(!renderer||!scene||!camera)return;for(const actor of actors){if(!actor.wrapper.visible)continue;actor.ball.visible=view!=='cloth'&&(actor.controller?.getDiagnostics().ballVisible??true);}scene.updateMatrixWorld(true);
  // A paused inspection can move an outer wrapper and switch LOD in the same
  // turn. Flush the common bone palette after that placement before rendering.
  const palettes=new Set();for(const actor of actors)if(actor.wrapper.visible)actor.root.traverse(object=>{if(object.isSkinnedMesh)palettes.add(object.skeleton);});for(const skeleton of palettes)skeleton.update();const started=performance.now();renderer.render(scene,camera);const elapsed=performance.now()-started;performanceMetrics.renderedFrames++;performanceMetrics.totalRenderCpuMs+=elapsed;performanceMetrics.latestRenderCpuMs=elapsed;performanceMetrics.renderCpuSamples.push(elapsed);if(performanceMetrics.renderCpuSamples.length>300)performanceMetrics.renderCpuSamples.shift();positionLabels();updateMeasurements();}
function positionLabels(){if(view!=='far'||!camera)return;const stage=$('stage');for(const actor of actors){const tag=document.querySelector(`[data-label="${actor.id}"]`);if(!tag)continue;tmpVec.set(actor.wrapper.position.x,-.065,.1).project(camera);tag.style.left=`${(tmpVec.x*.5+.5)*stage.clientWidth}px`;tag.style.top=`${(-tmpVec.y*.5+.5)*stage.clientHeight}px`;}}
function countTriangles(root){let result=0;root.traverse(object=>{if(!object.isMesh)return;const geometry=object.geometry;if(!geometry)return;const count=geometry.index?.count||geometry.getAttribute('position')?.count||0;result+=count/3*(object.isInstancedMesh?object.count:1);});return Math.round(result);}
function diagnostics(){
  const visible=actors.filter(actor=>actor.wrapper.visible),sorted=[...performanceMetrics.renderCpuSamples].sort((a,b)=>a-b),gaps=performanceMetrics.frameGapSamples;
  const performanceReport={readyAtUtc:performanceMetrics.readyAtUtc,renderedFrames:performanceMetrics.renderedFrames,playbackFrames:performanceMetrics.playbackFrames,playbackWallSeconds:performanceMetrics.playbackWallMs/1000,latestRenderCpuMs:performanceMetrics.latestRenderCpuMs,meanRenderCpuMs:performanceMetrics.totalRenderCpuMs/Math.max(1,performanceMetrics.renderedFrames),recentRenderCpuP95Ms:sorted.length?sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.95))]:0,recentFrameGapMeanMs:gaps.reduce((a,b)=>a+b,0)/Math.max(1,gaps.length),longFramesOver50ms:performanceMetrics.longFramesOver50ms,timingScope:'Renderer CPU submission and actual wall-clock RAF gaps; no GPU timer and no physical-phone measurement.'};
  return {version:'hoops-characters-v7',threeRevision:THREE.REVISION,ready:readyFlag,offline:!!PACK,source:location.protocol,view,selectedId,team,actionId,playing,speed,lodMode,viewport:{width:$('stage').clientWidth,height:$('stage').clientHeight,devicePixelRatio:renderer?.getPixelRatio()},renderer:renderer?{triangles:renderer.info.render.triangles,calls:renderer.info.render.calls,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,fps:Math.round(measuredFps*10)/10}:null,performance:performanceReport,crowd:{enabled:!!crowdGroup?.visible,instances:240,instancedDraws:2},camera:{position:camera?.position.toArray(),target:cameraState.target.toArray(),yaw:cameraState.yaw,pitch:cameraState.pitch,distance:cameraState.distance*cameraState.zoom},actors:visible.map(actor=>({id:actor.id,lod:actor.currentLevel,triangles:countTriangles(actor.root),heightMeters:actor.profile.heightMeters,motion:actor.controller?.getDiagnostics()})),error:renderError};
}
function updateMeasurements(){if(!renderer||!readyFlag)return;const current=currentActor(),motion=current?.controller?.getDiagnostics();$('triangles').textContent=renderer.info.render.triangles.toLocaleString('en')+' triangles';$('drawcalls').textContent=renderer.info.render.calls+' draws';$('actual-lod').textContent=lodMode==='auto'?`AUTO · LOD ${current?.currentLevel||0}`:`LOD ${current?.currentLevel||0}`;$('fps').textContent=measuredFps?Math.round(measuredFps)+' fps':'— fps';const action=ACTIONS.find(action=>action.id===actionId),duration=action?.duration||1;const phase=motion?.phase||0;$('timeline').value=String(phase);$('time-output').textContent=`${(phase*duration).toFixed(2)} / ${duration.toFixed(2)} s`;$('scene-count').textContent=`18 BONES · LOD ${current?.currentLevel||0}`;}
function installCameraControls(){
  const canvas=$('canvas'),pointers=new Map();let pinchDistance=0;
  canvas.addEventListener('pointerdown',event=>{canvas.setPointerCapture(event.pointerId);pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});if(pointers.size===2){const p=[...pointers.values()];pinchDistance=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);} });
  canvas.addEventListener('pointermove',event=>{if(!pointers.has(event.pointerId))return;const previous=pointers.get(event.pointerId);pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});if(pointers.size===1){cameraState.yaw-=(event.clientX-previous.x)*.008;cameraState.pitch=THREE.MathUtils.clamp(cameraState.pitch+(event.clientY-previous.y)*.005,-.35,.6);}else if(pointers.size===2){const p=[...pointers.values()],distance=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);cameraState.zoom=THREE.MathUtils.clamp(cameraState.zoom*pinchDistance/Math.max(5,distance),.45,2.5);pinchDistance=distance;}updateCamera();render();});
  const up=event=>pointers.delete(event.pointerId);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);
  canvas.addEventListener('wheel',event=>{event.preventDefault();cameraState.zoom=THREE.MathUtils.clamp(cameraState.zoom*Math.exp(event.deltaY*.001),.45,2.5);updateCamera();render();},{passive:false});
}
function installUI(){
  const groups=new Map();for(const action of ACTIONS){const category=action.category||'misc';if(!groups.has(category))groups.set(category,[]);groups.get(category).push(action);}
  $('action').innerHTML=[...groups].map(([category,actions])=>`<optgroup label="${UI_CATEGORIES[category]||category}">${actions.map(action=>`<option value="${action.id}">${action.label}</option>`).join('')}</optgroup>`).join('');
  $('action-count').textContent=`${ACTIONS.length} קליפים`;
  actionId=ACTIONS.some(action=>action.id==='idle_hold')?'idle_hold':ACTIONS[0]?.id;
  $('action').value=actionId;
  $$('[data-role]').forEach(button=>button.addEventListener('click',()=>selectRole(button.dataset.role)));
  $$('[data-view]').forEach(button=>button.addEventListener('click',()=>setView(button.dataset.view)));
  $$('[data-team]').forEach(button=>button.addEventListener('click',()=>setTeam(button.dataset.team)));
  $('action').addEventListener('change',()=>selectAction($('action').value));
  $('play').addEventListener('click',()=>setPlaying(!playing));$('speed').addEventListener('change',()=>setSpeed($('speed').value));
  $('hold-toggle').addEventListener('click',()=>{const dribble=ACTIONS.find(action=>action.id==='dribble_right')||ACTIONS.find(action=>action.id.includes('dribble'));selectAction(actionId==='idle_hold'?dribble.id:'idle_hold',{immediate:false});setPlaying(true);});
  $('timeline').addEventListener('input',()=>{pause(true);seek($('timeline').value);});
  $('lod').addEventListener('change',()=>setLOD($('lod').value));$('crowd').addEventListener('change',()=>setCrowd($('crowd').checked));$('ruler').addEventListener('change',()=>setRuler($('ruler').checked));
  $('reset-camera').addEventListener('click',()=>{resetCamera();render();});
  $('rotate-front').addEventListener('click',()=>setCamera({yaw:0}));$('rotate-side').addEventListener('click',()=>setCamera({yaw:.65}));$('rotate-back').addEventListener('click',()=>setCamera({yaw:Math.PI}));
  $('copy-diagnostics').addEventListener('click',async()=>{const text=JSON.stringify(diagnostics(),null,2);try{await navigator.clipboard.writeText(text);$('copy-diagnostics').textContent='הדוח הועתק';}catch{const textarea=document.createElement('textarea');textarea.value=text;document.body.append(textarea);textarea.select();document.execCommand('copy');textarea.remove();$('copy-diagnostics').textContent='הדוח הועתק';}});
}
function tick(clock){requestAnimationFrame(tick);if(!readyFlag||document.hidden||!playing)return;const elapsed=(clock-lastRendered)/1000;if(elapsed<1/30-.001)return;const wallDt=(clock-lastClock)/1000,dt=Math.min(wallDt,.1);lastClock=clock;lastRendered=clock;
  if(playing)for(const actor of actors){if(!actor.wrapper.visible)continue;for(const controller of new Set(actor.controllers))controller.update(dt*speed);}
  // The full-body camera stays fixed across a clip. Detail views follow only
  // their anatomical subject so a jump cannot send the face out of the frame.
  followDetailTarget(dt);
  performanceMetrics.playbackFrames++;performanceMetrics.playbackWallMs+=wallDt*1000;performanceMetrics.frameGapSamples.push(wallDt*1000);if(performanceMetrics.frameGapSamples.length>300)performanceMetrics.frameGapSamples.shift();if(wallDt>.05)performanceMetrics.longFramesOver50ms++;
  frameClock+=wallDt;frameCount++;if(frameClock>1){measuredFps=frameCount/frameClock;frameClock=0;frameCount=0;}
  render();
}
async function main(){await loadProfileData();installUI();makeScene();const decoder=await loadModels();decoder.dispose();readyFlag=true;performanceMetrics.readyAtUtc=new Date().toISOString();layoutActors();resetCamera();setTeam(team);updateStage();$('loading-progress').style.width='100%';$('loading').classList.add('is-done');$('loading').setAttribute('aria-hidden','true');window.__hoopsLab.captureReady=true;lastClock=lastRendered=performance.now();document.addEventListener('visibilitychange',()=>{lastClock=lastRendered=performance.now();});render();resolveReady(window.__hoopsLab);requestAnimationFrame(tick);}
main().catch(fail);
