import * as THREE from 'three';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {clone as cloneSkeleton} from './vendor/SkeletonUtils.js';

const $ = id => document.getElementById(id);
const canvas = $('city');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#e5eee9');
const camera = new THREE.OrthographicCamera(-25,25,12,-12,.1,160);
const renderer = new THREE.WebGLRenderer({canvas,antialias:true,alpha:false});
renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.27;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
scene.add(new THREE.HemisphereLight('#fff7df','#8baaa3',2.55));
const sun = new THREE.DirectionalLight('#fff0ce',3.4);
sun.position.set(-16,35,19); sun.castShadow = true;
sun.shadow.mapSize.set(1024,1024); sun.shadow.camera.left=-28;sun.shadow.camera.right=28;
sun.shadow.camera.top=25;sun.shadow.camera.bottom=-25;sun.shadow.camera.far=90;
sun.shadow.normalBias=.035;sun.shadow.bias=-.00015;sun.shadow.radius=3;
scene.add(sun);
let world = new THREE.Group();scene.add(world);
const library = new Map(), actors = [], raycaster = new THREE.Raycaster();
let manifest, mode='city', selected=null, inspectionList=[], simulationTime=0;
let paused=matchMedia('(prefers-reduced-motion: reduce)').matches;
let yaw=.69, elevation=.67, zoom=1, viewSpan=26, target=new THREE.Vector3(0,0,0);
let dirty=true,ready=false,lastFrame=0,frameTime=0;
const categoryHe={building:'בניין',vehicle:'מכונית אזרחית',pedestrian:'הולך רגל',infrastructure:'ברחוב',vegetation:'צמחייה',prop:'אביזר רחוב',ground:'משטח'};
const chapterCopy={
  city:['סיור בעיר','נפגשים בצומת.','שכונות צבעוניות, רחובות פתוחים וקצת תנועה.'],
  building:['שמונה כתובות','לכל בית אופי משלו.','צבע, צללית ופרטים ברורים גם מרחוק.'],
  vehicle:['בדרך','חמישה רכבים. עיר אחת.','קומפקטית, משפחתית, סטיישן, מסחרית וטנדר.'],
  pedestrian:['אנשים ברחוב','העיר יוצאת לטיול.','שלוש דמויות, צבעים שונים והליכה רגועה בלולאה.'],
  street:['בין הבתים','הפרטים שבדרך.','גשר פתוח, מנהרה חלולה וערכת רחוב מודולרית.'],
};

function material(color){return new THREE.MeshStandardMaterial({color,roughness:.9,metalness:0});}
const reusable = new Set();
function box(x,y,z,w,h,d,color,parent=world){
  const geometry=new THREE.BoxGeometry(w,h,d),mat=material(color);
  reusable.add(geometry);reusable.add(mat);
  const mesh=new THREE.Mesh(geometry,mat);mesh.position.set(x,y,z);mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
function clear(){
  for(const a of actors)if(a.mixer){a.mixer.stopAllAction();a.mixer.uncacheRoot(a.asset);}
  world.traverse(n=>{if(n.isSkinnedMesh)n.skeleton.dispose();});
  actors.length=0;scene.remove(world);
  for(const resource of reusable)resource.dispose();reusable.clear();
  // Shared GLB geometry/materials stay in the library across view changes.
  world=new THREE.Group();scene.add(world);
}
function instance(id,x=0,z=0,rotation=0,y=0){
  const entry=library.get(id);if(!entry)throw Error('Unknown asset '+id);
  const asset=cloneSkeleton(entry.gltf.scene);
  asset.position.set(x,y,z);asset.rotation.y=rotation;asset.userData.assetId=id;
  asset.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;n.userData.assetId=id;}});
  world.add(asset);
  if(entry.gltf.animations.length){
    const mixer=new THREE.AnimationMixer(asset);
    const action=mixer.clipAction(entry.gltf.animations[0]);action.setLoop(THREE.LoopRepeat,Infinity);action.play();
    actors.push({asset,mixer,phase:0,kind:'pedestrian'});
  }
  return asset;
}
function cameraUpdate(){
  const aspect=canvas.clientWidth/canvas.clientHeight;
  camera.left=-viewSpan*aspect/2/zoom;camera.right=-camera.left;
  camera.top=viewSpan/2/zoom;camera.bottom=-camera.top;
  camera.position.set(Math.sin(yaw)*Math.cos(elevation)*60,Math.sin(elevation)*60,Math.cos(yaw)*Math.cos(elevation)*60).add(target);
  camera.lookAt(target);camera.updateProjectionMatrix();dirty=true;
}
function resize(){renderer.setSize(canvas.clientWidth,canvas.clientHeight,false);cameraUpdate();}
window.addEventListener('resize',resize);

function ramp(x0,x1,z,y0,y1){
  const p=[x0,y0,z-2.3,x1,y1,z-2.3,x1,y1,z+2.3,x0,y0,z+2.3];
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex([0,2,1,0,3,2]);g.computeVertexNormals();
  const mat=material('#596775');reusable.add(g);reusable.add(mat);
  const mesh=new THREE.Mesh(g,mat);mesh.receiveShadow=true;world.add(mesh);
}
function roadHeight(x){if(x<2.5||x>16.5)return .12;if(x<5)return .12+(x-2.5)/2.5*.9;if(x>14)return 1.02-(x-14)/2.5*.9;return 1.02;}
function buildCity(){
  viewSpan=34;target.set(2.3,.7,-1.4);
  // Preview-only ground, roads and water. All city objects are the shipped GLBs.
  box(-6.5,-.43,0,27,.86,29,'#b0b98c');box(16,-.43,0,8,.86,29,'#b0b98c');
  box(-6.5,.015,0,27,.03,29,'#adbf91');box(16,.015,0,8,.03,29,'#adbf91');
  box(9.5,-.20,0,5,.10,29,'#79b7bd');
  for(let i=0;i<12;i++)box(8.1+(i%3)*1.2,-.14,-13+i*2.25,.58,.012,.07,'#b0d2cb');
  for(const x of [6.85,12.15])box(x,-.02,0,.25,.22,29,'#d4cfb3');
  box(-6.1,.06,2,27.8,.12,4.6,'#596775');
  box(17,.06,2,6,.12,4.6,'#596775');
  box(-2,.06,0,4.6,.12,29,'#596775');
  for(const z of [-.62,4.62]){
    box(-6.5,.13,z,27,.26,.64,'#ece4cc');box(16,.13,z,8,.26,.64,'#ece4cc');
  }
  for(const x of [-4.62,.62])box(x,.13,0,.64,.26,29,'#ece4cc');
  // Dashed center lines and the intersection crossing remain unbranded geometry.
  for(let x=-18;x<2;x+=2.2)if(Math.abs(x+2)>3)box(x,.127,2,.85,.014,.08,'#f0e5ca');
  for(let z=-13;z<14;z+=2.2)if(Math.abs(z-2)>3)box(-2,.127,z,.08,.014,.85,'#f0e5ca');
  for(let x=-3.6;x<=-.4;x+=.64)box(x,.132,5.45,.38,.018,1.0,'#f3eee1');
  ramp(2.5,5,2,.13,1.03);ramp(14,16.5,2,1.03,.13);
  instance('bridge-span',9.5,2,Math.PI/2);
  instance('tunnel-segment',-2,-10,0,.12);
  const placements=[['house-coral',-14,-6.5],['apartment-sun',-8.4,-6.1],['office-blue',3.2,-6.2],['civic-cream',16,-7.3],
    ['shop-mint',-14,8.0],['market-peach',-8.0,8.2],['villa-lilac',3,8],['workshop-teal',16.5,8]];
  for(const [id,x,z]of placements){
    const size=library.get(id).record.sizeMeters;
    box(x,.06,z,size[0]+.65,.12,size[2]+.65,'#d7cfb1');instance(id,x,z,0,.12);
  }
  for(const [x,z,k]of [[-18,-10,0],[-18,-3,1],[-17,12,0],[-11,-12,1],[-5,-12,2],[3,-12,0],[5,12,1],
    [14,-12,1],[19,-2,0],[14,12,2],[-5,12,1],[-18,5.7,0],[4,-1.7,1],[14,-2,0]])instance(['tree-round','tree-column','tree-pine'][k],x,z,0,.03);
  for(const x of [-17,-11,-5,1,15,19])instance('street-lamp',x,-.60,0,.26);
  for(const z of [-5,8])instance('street-lamp',.65,z,-Math.PI/2,.26);
  instance('traffic-light',-4.65,4.6,0,.26);instance('traffic-light',.65,-.6,Math.PI,.26);
  for(const x of [-16,-13,-10])instance('fence-picket',x,11,0,.03);
  for(const z of [-4,7,10])instance('fence-metal',12.6,z,Math.PI/2,.03);
  for(let i=0;i<4;i++)instance(i%2?'cone-tall':'cone-small',-5.8+i*.8,.1,0,.12);
  const fleet=['car-compact','car-sedan','car-wagon','car-van','car-pickup'];
  for(let i=0;i<fleet.length;i++){
    const direction=i%2?-1:1,asset=instance(fleet[i],0,direction===1?3.10:.90,direction*Math.PI/2,.12);
    actors.push({asset,kind:'car',start:-16+i*7.2,direction,speed:1.25+i*.08});
  }
  for(let i=0;i<3;i++){
    const asset=instance(['pedestrian-coral','pedestrian-mint','pedestrian-sun'][i],-14+i*5,4.7,Math.PI/2,.26);
    const a=actors.find(a=>a.asset===asset);Object.assign(a,{path:true,start:-15+i*6,phase:i*.29});
  }
}

function buildGallery(category){
  const list=manifest.assets.filter(a=>category==='street'?['infrastructure','vegetation','prop','ground'].includes(a.category):a.category===category);
  inspectionList=list.map(a=>a.id);
  if(category==='building'){
    viewSpan=27;target.set(2.3,1.8,-1.4);
    list.forEach((a,i)=>{const x=(i%4-1.5)*7,z=(Math.floor(i/4)-.5)*8;
      box(x,-.15,z,6,.3,6,'#d0d8c4');instance(a.id,x,z);});
  }else if(category==='vehicle'){
    viewSpan=14;target.set(1,.6,-.5);
    list.forEach((a,i)=>{const x=(i-2)*3.5;box(x,-.10,0,3,.2,5.5,'#cbd8cb');instance(a.id,x,0,-.15);});
  }else if(category==='pedestrian'){
    viewSpan=5.2;target.set(.5,.8,-.4);
    list.forEach((a,i)=>{const x=(i-1)*1.8,z=-(i-1)*.8;box(x,-.06,z,1.5,.12,1.5,'#d2dccc');instance(a.id,x,z);});
  }else{
    viewSpan=30;target.set(2.5,1,-1);
    list.forEach((a,i)=>{const x=(i%5-2)*6.5,z=(Math.floor(i/5)-1)*7;
      box(x,-.12,z,6,.24,6,'#d1dac9');instance(a.id,x,z, a.id==='bridge-span'?Math.PI/2:0);});
  }
}

function setMode(next){
  if(!ready)return;selected=null;mode=next;clear();
  $('selection').hidden=true;$('chapter').hidden=false;
  const [eye,title,copy]=chapterCopy[next];
  $('chapter').innerHTML='';
  for(const [tag,cls,text]of [['span','eyebrow',eye],['h2','',title],['p','',copy]]){const n=document.createElement(tag);n.className=cls;n.textContent=text;$('chapter').append(n);}
  document.querySelectorAll('[data-mode]').forEach(b=>{b.classList.toggle('active',b.dataset.mode===next);b.setAttribute('aria-pressed',String(b.dataset.mode===next));});
  inspectionList=manifest.assets.map(a=>a.id);if(next==='city')buildCity();else buildGallery(next);
  yaw=.69;elevation=.67;zoom=1;cameraUpdate();updateActors();
}
function inspect(id){
  if(!ready)return;const record=library.get(id)?.record;if(!record)return;
  selected=id;clear();$('chapter').hidden=true;$('selection').hidden=false;
  $('asset-category').textContent=categoryHe[record.category];$('asset-title').textContent=record.labelHe;
  const dimensions=record.sizeMeters.map(v=>v.toFixed(2)).join(' × ');
  $('asset-detail').textContent=`${record.triangles.toLocaleString('he-IL')} משולשים · ${(record.bytes/1000).toFixed(1)} KB\n${dimensions} מ׳${record.category==='pedestrian'?'\nהליכה בלולאה · 30Hz · 18 עצמות':''}`;
  const size=record.sizeMeters;
  viewSpan=Math.max(size[1]*1.8,Math.hypot(size[0],size[2])*.95,2.5);
  target.set(-viewSpan*.16,size[1]*.35,0);yaw=.60;elevation=.38;zoom=1;
  box(0,-.08,0,Math.max(size[0]+1,1.7),.16,Math.max(size[2]+1,1.7),'#d1dac7');
  instance(id);cameraUpdate();updateActors();
}
function setPaused(value){
  paused=value;$('pause').setAttribute('aria-pressed',String(paused));
  const label=paused?'הפעלת תנועה':'השהיית תנועה';$('pause').setAttribute('aria-label',label);$('pause').title=label;
  $('pause-path').setAttribute('d',paused?'M9 5l10 7-10 7z':'M9 6v12M15 6v12');dirty=true;
}
function updateActors(){
  for(const a of actors){
    if(a.mixer)a.mixer.setTime(simulationTime+a.phase);
    if(a.kind==='car'){
      const x=THREE.MathUtils.euclideanModulo(a.start+simulationTime*a.speed*a.direction+19,38)-19;
      a.asset.position.x=x;a.asset.position.y=roadHeight(x);
      const slope=x>2.5&&x<5?.36:x>14&&x<16.5?-.36:0;
      a.asset.rotation.z=Math.atan(slope); // pitch along the world X boulevard.
    }else if(a.path)a.asset.position.x=THREE.MathUtils.euclideanModulo(a.start+simulationTime*.9+17,21)-17;
  }
  dirty=true;
}

document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
$('pause').addEventListener('click',()=>setPaused(!paused));
$('reset').addEventListener('click',()=>{if(selected)inspect(selected);else setMode(mode);});
$('close').addEventListener('click',()=>setMode(mode));
for(const [name,step]of [['previous',-1],['next',1]])$(name).addEventListener('click',()=>{const i=inspectionList.indexOf(selected);inspect(inspectionList[(i+step+inspectionList.length)%inspectionList.length]);});
let pointer=null;
canvas.addEventListener('pointerdown',e=>{pointer={id:e.pointerId,x:e.clientX,y:e.clientY,yaw,elevation,moved:false};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{
  if(!pointer||pointer.id!==e.pointerId)return;
  const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;
  if(Math.hypot(dx,dy)>5)pointer.moved=true;
  if(pointer.moved){yaw=pointer.yaw-dx*.006;elevation=THREE.MathUtils.clamp(pointer.elevation+dy*.005,.18,1.3);cameraUpdate();}
});
canvas.addEventListener('pointerup',e=>{
  if(!pointer||pointer.id!==e.pointerId)return;
  if(!pointer.moved&&ready){
    const r=canvas.getBoundingClientRect();raycaster.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),camera);
    const hit=raycaster.intersectObjects(world.children,true).find(h=>h.object.userData.assetId);
    if(hit)inspect(hit.object.userData.assetId);
  }pointer=null;
});
canvas.addEventListener('pointercancel',()=>{pointer=null;});
canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=THREE.MathUtils.clamp(zoom*Math.exp(-e.deltaY*.001),.55,2.4);cameraUpdate();},{passive:false});
canvas.addEventListener('keydown',e=>{
  if(e.key==='Escape'){setMode(mode);return;}
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){
    e.preventDefault();if(e.key==='ArrowLeft')yaw+=.1;if(e.key==='ArrowRight')yaw-=.1;
    if(e.key==='ArrowUp')elevation=Math.min(1.3,elevation+.1);if(e.key==='ArrowDown')elevation=Math.max(.18,elevation-.1);cameraUpdate();
  }
});
document.addEventListener('visibilitychange',()=>{lastFrame=0;});
function tick(now){
  requestAnimationFrame(tick);
  if(document.hidden){lastFrame=0;return;}
  if(!lastFrame)lastFrame=now;
  const dt=Math.min((now-lastFrame)/1000,.08);lastFrame=now;
  if(ready&&!paused){simulationTime+=dt;updateActors();}
  if(dirty&&now-frameTime>=1000/30){renderer.render(scene,camera);frameTime=now;dirty=false;}
}
window.__catchCity={get ready(){return ready;},get manifest(){return manifest;},get loadedAssets(){return library.size;},
  get mode(){return mode;},get selected(){return selected;},get paused(){return paused;},scene,camera,renderer,library,
  inspect,setMode,setPaused,setTime:t=>{simulationTime=t;updateActors();renderer.render(scene,camera);},
  snapshot:()=>({mode,selected,time:simulationTime,paused,loaded:library.size,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles})};
resize();setPaused(paused);requestAnimationFrame(tick);
try{
  const response=await fetch('./manifest.json');if(!response.ok)throw Error('manifest: HTTP '+response.status);
  manifest=await response.json();const loader=new GLTFLoader();let count=0;
  await Promise.all(manifest.assets.map(async record=>{
    const gltf=await loader.loadAsync(record.path);library.set(record.id,{record,gltf});
    $('loading-count').textContent=`${++count} / ${manifest.assetCount}`;
  }));
  ready=true;$('loader').hidden=true;setMode('city');
}catch(error){
  $('loader').hidden=true;$('error').hidden=false;
  $('error').textContent='לא ניתן לטעון את העיר. יש לפתוח את התצוגה דרך שרת HTTP של המאגר. '+error.message;
  window.__catchCity.error=error.message;console.error(error);
}
