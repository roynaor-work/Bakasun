import * as THREE from '../../vendor/three.module.js';
import {GLTFLoader} from '../../vendor/GLTFLoader.js';
import {DRACOLoader} from '../viewer/draco/DRACOLoader.js';

// This viewer plays the embedded GLB tracks directly. No retargeting at runtime.
const $=id=>document.getElementById(id);
const labels={skier:'גולש אלפיני','fir-a':'אשוח מושלג · א׳','fir-b':'אשוח מושלג · ב׳','fir-c':'אשוח מושלג · ג׳','rock-small':'סלע קטן','rock-large':'סלע גדול','snow-sign':'שלט מסלול','slalom-gate':'שער סלאלום','start-gate':'שער זינוק','finish-gate':'שער סיום',mogul:'מוגול','ice-wall':'קיר קרח','snow-powder':'אבקת שלג'};
const descriptions={skier:'סקיאר מפורט עם ציוד סקי, שלד קנוני של 18 עצמות וחמש תנועות מוטמעות.','fir-a':'אשוח עטוף בשלג, להצבה בשולי המסלול.','fir-b':'צללית אשוח חלופית לגיוון קו היער.','fir-c':'אשוח נמוך ומלא להוספת צפיפות בשולי המסלול.','rock-small':'סלע מושלג לסימון שולי מסלול טבעיים.','rock-large':'גוש סלע גדול עם כיפת שלג.','snow-sign':'שלט דרך להצבה בצמתים ובכניסות למסלול.','slalom-gate':'שער דגל לסימון קו הגלישה.','start-gate':'מסגרת הזינוק של המסלול האלפיני.','finish-gate':'שער סיום רחב עם קורת רוחב.','mogul':'תלולית שלג חלקה ליצירת מקטעי מוגולים.','ice-wall':'קיר קרח מפוסל עם סדקים, שכבות וכיפת שלג.','snow-powder':'שלוש שכבות שקופות עם 16 פריימים של התפזרות אבקה.'};
const clipLabels={glide:'גלישה',crouch:'כריעה',boost:'בוסט',fall:'נפילה',get_up:'קימה'};
const categories={skier:'THE ATHLETE','fir-a':'SNOW FOREST','fir-b':'SNOW FOREST','fir-c':'SNOW FOREST','rock-small':'ALPINE ROCK','rock-large':'ALPINE ROCK','snow-sign':'WAYFINDING','slalom-gate':'RACE COURSE','start-gate':'RACE COURSE','finish-gate':'RACE COURSE',mogul:'SNOW TERRAIN','ice-wall':'FROZEN TERRAIN','snow-powder':'SNOW EFFECT'};
const records=new Map(),mixers=[];
let studioMixer;const scenicFog=new THREE.Fog('#d8e6ec',15,65);
const scene=new THREE.Scene();scene.background=new THREE.Color('#d8e6ec');scene.fog=scenicFog;
const scenic=new THREE.Group(),studio=new THREE.Group();scene.add(scenic,studio);studio.visible=false;
const camera=new THREE.PerspectiveCamera(36,1,.02,250);
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.13;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.domElement.setAttribute('aria-label','סקיאר ועולם מושלג בתלת ממד');$('stage').append(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xf3fbff,0x8497a7,2));
const sun=new THREE.DirectionalLight(0xffeed9,3.1);sun.position.set(-9,13,8);sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-18,right:18,top:22,bottom:-18,near:.1,far:65});
sun.shadow.normalBias=.025;sun.shadow.bias=-.0001;sun.shadow.radius=3;scene.add(sun);
const rim=new THREE.DirectionalLight(0xaed3ec,.9);rim.position.set(5,4,-9);scene.add(rim);
const snow=new THREE.MeshStandardMaterial({color:0xf3f7f7,roughness:.92});
const floor=new THREE.Mesh(new THREE.PlaneGeometry(250,250),snow);floor.rotation.x=-Math.PI/2;floor.position.y=-.014;floor.receiveShadow=true;scene.add(floor);
const draco=new DRACOLoader().setDecoderPath(new URL('../viewer/draco/',import.meta.url).href).setDecoderConfig({type:'wasm'}).setWorkerLimit(2);
const loader=new GLTFLoader().setDRACOLoader(draco);
let skier,mixer,activeAction,helper,selected,worldManifest,skierManifest,mode='scene',playing=true,clipName='glide',wire=false,rigVisible=false;
let yaw=.48,elevation=.19,distance=5.2,baseDistance=5.2,target=new THREE.Vector3(0,.72,0);
let last=0,frameCount=0,readyDone=false;

function resize(){const w=$('stage').clientWidth,h=$('stage').clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();if(readyDone)render();}
new ResizeObserver(resize).observe($('stage'));
function updateCamera(){camera.position.set(target.x+Math.sin(yaw)*Math.cos(elevation)*distance,target.y+Math.sin(elevation)*distance,target.z+Math.cos(yaw)*Math.cos(elevation)*distance);camera.lookAt(target);camera.updateMatrixWorld();}
function render(){updateCamera();scene.updateMatrixWorld(true);renderer.render(scene,camera);frameCount++;}
function inspectObject(object){let triangles=0,vertices=0,meshes=0;object.traverse(o=>{if(o.isMesh){const g=o.geometry;meshes++;vertices+=g.attributes.position.count;triangles+=(g.index?g.index.count:g.attributes.position.count)/3;}});return {triangles,vertices,meshes};}
function prep(object){object.traverse(o=>{if(!o.isMesh)return;o.castShadow=true;o.receiveShadow=true;o.frustumCulled=!o.isSkinnedMesh;for(const m of Array.isArray(o.material)?o.material:[o.material]){if(m.transparent){m.depthWrite=false;o.castShadow=false;}m.wireframe=wire;}});return object;}
async function getJSON(path){const r=await fetch(new URL(path,import.meta.url));if(!r.ok)throw Error(`${path}: HTTP ${r.status}`);return r.json();}
async function loadRecord(meta,path){const url=new URL(path,import.meta.url);const response=await fetch(url);if(!response.ok)throw Error(`${path}: HTTP ${response.status}`);const bytes=await response.arrayBuffer();const gltf=await loader.parseAsync(bytes,new URL('.',url).href);prep(gltf.scene);const record={...meta,bytes:bytes.byteLength,url:url.href,gltf,...inspectObject(gltf.scene)};records.set(meta.id,record);return record;}
function addWorld(id,x,z,scale=1,angle=0){const source=records.get(id);if(!source)throw Error(`Missing world asset ${id}`);const obj=source.gltf.scene.clone(true);obj.position.set(x,0,z);obj.scale.setScalar(scale);obj.rotation.y=angle;scenic.add(obj);return obj;}
function buildTerrain(){
  const g=new THREE.PlaneGeometry(160,90,90,65);g.rotateX(-Math.PI/2);const p=g.attributes.position;
  for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i)-52;const ridge=Math.exp(-(((z+53)/19)**2));const waves=10+7*Math.sin(x*.09)+3*Math.sin(x*.21+.8)+2*Math.cos(x*.37);p.setXYZ(i,x,Math.max(0,ridge*waves),z);}g.computeVertexNormals();
  const mountain=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:0xb4c9d7,roughness:1,flatShading:true}));mountain.receiveShadow=true;scenic.add(mountain);
  // Repeated world models remain shared geometry/materials, as in a future game.
  const trees=[[-5,-6,1.1],[-6.4,-10,1.35],[-7,-15,1.1],[-10,-9,1.25],[-11,-18,1.6],[-15,-22,1.5],[6,-10,1.1],[8,-16,1.5],[12,-21,1.6],[16,-25,1.8],[-18,-29,1.7],[6,-24,1.25],[-7,-31,1.3],[10,-33,1.5],[19,-35,1.5],[-18,-39,1.8],[-13,-43,1.6],[3,-37,1.3]];
  trees.forEach(([x,z,s],i)=>addWorld(`fir-${'abc'[i%3]}`,x-4,z-12,s*.75,i*1.7));
  addWorld('rock-large',-4.8,-6.8,.36,.4);addWorld('rock-small',4.9,-6.4,.8,-.5);addWorld('rock-large',9,-20,1.3,2);addWorld('snow-sign',-1.8,-8,.7,-.3);
  addWorld('slalom-gate',-4.5,-14,.7,0);addWorld('slalom-gate',-2,-22,.7,.15);addWorld('start-gate',-10,-37,.8,Math.PI);addWorld('finish-gate',-10,-56,.8,Math.PI);
  addWorld('ice-wall',-18,-24,.75,.15);
  [[-1,-13],[1,-17],[-.5,-21],[2,-24]].forEach(([x,z])=>addWorld('mogul',x,z,.65,0));
  const powder=addWorld('snow-powder',0,-.55,.6,0);powder.visible=true;
  if(records.get('snow-powder').gltf.animations.length){const pm=new THREE.AnimationMixer(powder);pm.clipAction(records.get('snow-powder').gltf.animations[0]).play();mixers.push(pm);}
  // The light ski tracks are presentation marks; they do not move the athlete.
  for(const side of [-1,1]){const points=Array.from({length:24},(_,i)=>new THREE.Vector3(side*.12+Math.sin(i*.13)*.55,.003,-i*.32));const marks=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),60,.008,3,false),new THREE.MeshStandardMaterial({color:0xb1ccd8,roughness:1}));marks.receiveShadow=true;scenic.add(marks);}
}
function playClip(name,{paused=false,time=0}={}){
  const clip=records.get('skier')?.gltf.animations.find(c=>c.name===name);if(!clip)throw Error(`Missing embedded clip: ${name}`);
  mixer.stopAllAction();activeAction=mixer.clipAction(clip).reset();
  const meta=skierManifest.clips?.find(c=>(c.name??c.id)===name);const loop=meta?.loop??['glide','crouch','boost'].includes(name);
  activeAction.setLoop(loop?THREE.LoopRepeat:THREE.LoopOnce,loop?Infinity:1);activeAction.clampWhenFinished=true;activeAction.play();mixer.update(0);activeAction.time=Math.max(0,Math.min(clip.duration,time));mixer.update(0);
  clipName=name;playing=!paused;document.querySelectorAll('[data-clip]').forEach(b=>{b.classList.toggle('active',b.dataset.clip===name);b.setAttribute('aria-pressed',String(b.dataset.clip===name));});$('clip-label').textContent=clipLabels[name]??name;updateTransport();render();return clip.duration;
}
function updateTransport(){if(!activeAction)return;const t=activeAction.time,d=activeAction.getClip().duration;$('timeline').value=d?t/d:0;$('clip-time').textContent=`${t.toFixed(2)} / ${d.toFixed(2)} s`;$('play-toggle').setAttribute('aria-label',playing?'השהיה':'ניגון');$('play-toggle').title=playing?'השהיה':'ניגון';$('play-icon').innerHTML=playing?'<path d="M8 5v14M16 5v14"/>':'<path d="m8 5 11 7-11 7Z"/>';}
function resetView(){const mobile=innerWidth<601;if(mode==='scene'||selected==='skier'){target.set(0,.7,0);baseDistance=mobile?4.8:5.1;yaw=mobile?-.12:.48;elevation=.17;}else{const o=studio.children[0];o.updateMatrixWorld(true);const b=new THREE.Box3().setFromObject(o);b.getCenter(target);const size=b.getSize(new THREE.Vector3());const fov=camera.fov*Math.PI/180;const availableWidth=mobile?.82:.5,availableHeight=mobile?.36:.66;const projectedWidth=size.x*Math.cos(.55)+size.z*Math.sin(.55);const fit=Math.max(size.y/availableHeight,projectedWidth/(camera.aspect*availableWidth));baseDistance=Math.max(1.5,fit/(2*Math.tan(fov/2))*1.15);yaw=.55;elevation=.21;}distance=baseDistance;render();}
function showAsset(id){
  if(!records.has(id))throw Error(`Unknown asset ${id}`);selected=id;
  studioMixer?.stopAllAction();studioMixer=null;while(studio.children.length)studio.remove(studio.children[0]);
  let obj;if(id==='skier'){obj=skier;scenic.remove(skier);studio.add(skier);}else{obj=records.get(id).gltf.scene.clone(true);studio.add(obj);if(records.get(id).gltf.animations.length){studioMixer=new THREE.AnimationMixer(obj);studioMixer.clipAction(records.get(id).gltf.animations[0]).play();}if(skier.parent!==scenic)scenic.add(skier);}
  skier.visible=id==='skier'||mode==='scene';helper.visible=rigVisible&&skier.visible;
  document.querySelectorAll('[data-asset]').forEach(b=>{b.classList.toggle('active',b.dataset.asset===id);b.setAttribute('aria-pressed',String(b.dataset.asset===id));});
  const r=records.get(id);$('asset-name').textContent=labels[id]??id;$('asset-category').textContent=categories[id]??'WORLD OBJECT';$('asset-description').textContent=descriptions[id]??'';$('asset-tris').textContent=r.triangles.toLocaleString('en');$('asset-bytes').textContent=`${(r.bytes/1000).toFixed(1)} kB`;$('download-asset').href=r.url;
  $('player-panel').hidden=id!=='skier';$('asset-info').hidden=id==='skier';$('rig-toggle').disabled=id!=='skier';resetView();return {...inspectObject(obj),id};
}
function setMode(next){
  if(!['scene','library'].includes(next))throw Error(`Unknown mode ${next}`);mode=next;scene.fog=next==='scene'?scenicFog:null;document.body.classList.toggle('library',next==='library');scenic.visible=next==='scene';studio.visible=next==='library';$('asset-panel').hidden=next!=='library';$('asset-info').hidden=true;document.querySelectorAll('[data-mode]').forEach(b=>{b.classList.toggle('active',b.dataset.mode===next);b.setAttribute('aria-pressed',String(b.dataset.mode===next));});
  if(next==='library')showAsset(selected??'skier');else{scenic.add(skier);skier.visible=true;$('player-panel').hidden=false;$('rig-toggle').disabled=false;helper.visible=rigVisible;resetView();}return next;
}
function setWire(value){wire=value;for(const record of records.values())record.gltf.scene.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])m.wireframe=wire;});$('wire-toggle').setAttribute('aria-pressed',String(wire));render();}
function seek(normalized,{renderFrame=true}={}){playing=false;activeAction.paused=false;activeAction.time=THREE.MathUtils.clamp(normalized,0,1)*activeAction.getClip().duration;mixer.update(0);updateTransport();if(renderFrame)render();}
function deformedBounds(){
  scene.updateMatrixWorld(true);const box=new THREE.Box3(),v=new THREE.Vector3();let count=0;
  skier.traverse(o=>{if(!o.isMesh)return;if(o.isSkinnedMesh)o.skeleton.update();const a=o.geometry.attributes.position;for(let i=0;i<a.count;i++){v.fromBufferAttribute(a,i);if(o.isSkinnedMesh)o.applyBoneTransform(i,v);v.applyMatrix4(o.matrixWorld);if(![v.x,v.y,v.z].every(Number.isFinite))throw Error('Non-finite deformed vertex');box.expandByPoint(v);count++;}});
  return {min:box.min.toArray(),max:box.max.toArray(),vertices:count};
}
document.querySelectorAll('[data-clip]').forEach(b=>b.onclick=()=>playClip(b.dataset.clip));document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
$('timeline').oninput=()=>seek(+$('timeline').value);$('play-toggle').onclick=()=>{if(!playing&&activeAction.time>=activeAction.getClip().duration-.001){playClip(clipName);return;}playing=!playing;updateTransport();};
$('rig-toggle').onclick=()=>{rigVisible=!rigVisible;helper.visible=rigVisible&&skier.visible;$('rig-toggle').setAttribute('aria-pressed',String(rigVisible));render();};$('wire-toggle').onclick=()=>setWire(!wire);$('reset-view').onclick=resetView;
const pointers=new Map();let drag;
renderer.domElement.addEventListener('pointerdown',e=>{pointers.set(e.pointerId,[e.clientX,e.clientY]);drag={x:e.clientX,y:e.clientY,pinch:pointers.size===2?pinchDistance():null};renderer.domElement.setPointerCapture(e.pointerId);});
function pinchDistance(){const p=[...pointers.values()];return Math.hypot(p[0][0]-p[1][0],p[0][1]-p[1][1]);}
renderer.domElement.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId)||!drag)return;pointers.set(e.pointerId,[e.clientX,e.clientY]);if(pointers.size===2){const now=pinchDistance();if(drag.pinch)distance=THREE.MathUtils.clamp(distance*drag.pinch/now,baseDistance*.45,baseDistance*2.8);drag.pinch=now;}else{yaw-=(e.clientX-drag.x)*.006;elevation=THREE.MathUtils.clamp(elevation+(e.clientY-drag.y)*.004,.035,1.1);}drag.x=e.clientX;drag.y=e.clientY;render();});
for(const name of ['pointerup','pointercancel','lostpointercapture'])renderer.domElement.addEventListener(name,e=>{pointers.delete(e.pointerId);drag=null;});
renderer.domElement.addEventListener('wheel',e=>{e.preventDefault();distance=THREE.MathUtils.clamp(distance*Math.exp(e.deltaY*.001),baseDistance*.45,baseDistance*2.8);render();},{passive:false});

const ready=(async()=>{
  [skierManifest,worldManifest]=await Promise.all([getJSON('./manifest.json'),getJSON('../alpine-world/manifest.json')]);
  await Promise.all([loadRecord({id:'skier',...skierManifest},'./'+(skierManifest.file??'skier.glb')),...worldManifest.models.map(m=>loadRecord(m,'../alpine-world/'+m.file))]);
  skier=records.get('skier').gltf.scene;scenic.add(skier);mixer=new THREE.AnimationMixer(skier);helper=new THREE.SkeletonHelper(skier);helper.visible=false;helper.material.depthTest=false;helper.renderOrder=10;scene.add(helper);buildTerrain();
  // A local repeatable snow map adds surface detail without any CDN requests.
  const texture=await new THREE.TextureLoader().loadAsync(new URL('../alpine-track/textures/deep-snow.webp',import.meta.url).href);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(65,65);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());snow.map=texture;snow.needsUpdate=true;
  $('asset-count').textContent=records.size;$('world-count').textContent=worldManifest.models.length;$('clip-count').textContent=String(records.get('skier').gltf.animations.length).padStart(2,'0');
  $('asset-list').replaceChildren(...['skier',...worldManifest.models.map(m=>m.id)].map((id,i)=>{const r=records.get(id);return r;}).map((r,i)=>{const b=document.createElement('button');b.dataset.asset=r.id;b.innerHTML=`<span class="asset-no">${String(i+1).padStart(2,'0')}</span><span>${labels[r.id]??r.id}</span><span class="asset-sub">GLB</span>`;b.onclick=()=>showAsset(r.id);return b;}));
  readyDone=true;resize();playClip('glide');resetView();if(new URL(location.href).searchParams.get('mode')==='library')setMode('library');
  $('load-status').textContent=`${records.size} נכסים נטענו`;$('loading').classList.add('done');setTimeout(()=>$('loading').hidden=true,650);
  requestAnimationFrame(function tick(now){const dt=last?Math.min((now-last)/1000,.05):0;last=now;if(playing){mixer.update(dt*+$('speed').value);for(const m of mixers)m.update(dt);if(activeAction.paused)playing=false;updateTransport();render();}if(mode==='library'&&studioMixer){studioMixer.update(dt);render();}requestAnimationFrame(tick);});
  return {assets:records.size,clips:records.get('skier').gltf.animations.map(c=>c.name)};
})();
ready.catch(e=>{$('loading').hidden=true;$('error').hidden=false;$('error').textContent=`טעינת הנכסים נכשלה: ${e.message}. יש לפתוח את הצופה דרך שרת מקומי משורש המאגר.`;$('load-status').textContent='הטעינה נכשלה';console.error(e);});
window.alpineViewer={ready,playClip,seek,setMode,showAsset,setWire,resetView,render,deformedBounds,pause(){playing=false;updateTransport();},frameSubject(){target.set(0,.66,0);distance=3.8;yaw=.45;elevation=.14;render();},snapshot(){scene.updateMatrixWorld(true);const bones=[];skier.traverse(o=>{if(o.isBone)bones.push({name:o.name,parent:o.parent?.name,position:o.getWorldPosition(new THREE.Vector3()).toArray(),quaternion:o.getWorldQuaternion(new THREE.Quaternion()).toArray()});});return {mode,selected,clip:clipName,time:activeAction.time,duration:activeAction.getClip().duration,playing,frameCount,bones,render: {...renderer.info.render},assets:[...records.values()].map(r=>({id:r.id,bytes:r.bytes,...inspectObject(r.gltf.scene),clips:r.gltf.animations.map(c=>({name:c.name,duration:c.duration,tracks:c.tracks.length}))})),bounds:deformedBounds()};}};
