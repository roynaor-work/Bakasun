/** Original interactive asset review scene. CC0-1.0; see LICENSES.md. */
import * as T from '../../vendor/three.module.js';
import {GLTFLoader} from '../../vendor/GLTFLoader.js';

const modelList = [
  ['grandstand','יציע מודולרי','GRANDSTAND / 20 M',[-20,0,-18],0],
  ['pit-building','בניין פיטס','PIT BUILDING',[6,0,-20],0],
  ['start-gantry','שער זינוק','START GANTRY',[-23,0,0],Math.PI/2],
  ['control-tower','מגדל שיפוט','CONTROL TOWER',[29,0,-17],0],
  ['tire-barrier','מחסום צמיגים','TIRE BARRIER',[-9,0,10],0],
  ['chainlink-fence','גדר רשת','CHAINLINK FENCE',[3,0,10],0],
  ['sponsor-board','שלט מסלול','RACE BOARD',[16,0,11],0],
];
const textureList = [
  ['asphalt-clean','אספלט נקי','COLOR / TILE 4 M'],
  ['asphalt-skid','אספלט וסימני צמיגים','COLOR / TILE 4 M'],
  ['kerb-red-white','קרב אדום־לבן','COLOR / TILE 2 M'],
  ['kerb-normal','נורמל לקרב','NORMAL / OPENGL'],
  ['gravel-runoff','חצץ בריחה','COLOR / TILE 4 M'],
  ['grass-01','דשא רענן','COLOR / TILE 4 M'],
  ['grass-02','דשא יבש','COLOR / TILE 4 M'],
  ['grass-03','דשא כהה','COLOR / TILE 4 M'],
  ['concrete-barrier','בטון וקיר הגנה','COLOR / TILE 4 M'],
  ['tire-barrier','גומי מחסום','COLOR / TILE 2 M'],
  ['paint-white','סימון לבן','COLOR / TILE 2 M'],
  ['paint-yellow','סימון צהוב','COLOR / TILE 2 M'],
  ['asphalt-pits','אספלט פיטס','COLOR / TILE 4 M'],
  ['crowd-atlas','קהל מצויר','ARTWORK / CROWD ATLAS'],
  ['sponsor-race','שלט מקורי','ARTWORK / RACE'],
];
const byId = id => document.getElementById(id);
const state = window.__racingPreview = {
  ready:false, errors:[], loadedModels:[], loadedTextures:[], mode:'overview',
  selectedModel:null, lighting:'day', renderCount:0, focus:null, setMode:null,
};
const canvas = byId('scene');
const viewport = byId('viewport');
const textures = new Map(), assets = new Map();
const resources = new Set();
let renderer, scene, camera, venue, track, inspection, ground, sun, fill;
let mode = 'overview', selected = null, disposed = false, autoRotate = false;
let yaw = .59, elevation = .75, distance = 78, target = new T.Vector3(0,3,-2);
let frameHandle = 0, lastTime = 0;
const markError = error => { const message=String(error?.message || error); state.errors.push(message); console.error(error); };

function button(container, className, html, callback) {
  const node=document.createElement('button'); node.type='button'; node.className=className;
  node.innerHTML=html; node.addEventListener('click',callback); container.append(node); return node;
}
for (let i=0;i<modelList.length;i++) {
  const [key,label,subtitle]=modelList[i];
  const node=button(byId('models'),'model-card',`<span class="number">0${i+1}</span><b>${label}</b><small>${subtitle}</small>`,()=>focus(key));
  node.dataset.model=key;
}
for (const [key,label,subtitle] of textureList) {
  const node=button(byId('textures'),'texture-card',`<span class="swatch"><img src="textures/${key}.webp" alt="${label}" loading="lazy"></span><b>${label}</b><small>${subtitle}</small>`,()=>inspectTexture(key));
  node.dataset.texture=key;
}

function own(resource) { resources.add(resource); return resource; }
function texture(key, repeatX=1, repeatY=1) {
  const source=textures.get(key);
  if (!source) throw Error(`Missing texture: ${key}`);
  const result=own(source.clone()); result.wrapS=result.wrapT=T.RepeatWrapping;
  result.repeat.set(repeatX,repeatY); result.needsUpdate=true; return result;
}
function material(key,repeatX,repeatY,extra={}) {
  return own(new T.MeshStandardMaterial({map:texture(key,repeatX,repeatY),roughness:.93,metalness:0,...extra}));
}
function plane(group,w,h,x,y,z,mat) {
  const mesh=new T.Mesh(own(new T.PlaneGeometry(w,h)),mat);
  mesh.rotation.x=-Math.PI/2; mesh.position.set(x,y,z); mesh.receiveShadow=true;
  if(group===inspection) mesh.userData.inspectionOwned=true;
  group.add(mesh); return mesh;
}
function solid(group,size,position,color) {
  const mesh=new T.Mesh(own(new T.BoxGeometry(...size)),own(new T.MeshStandardMaterial({color,roughness:.85})));
  mesh.position.set(...position); mesh.castShadow=mesh.receiveShadow=true; group.add(mesh); return mesh;
}
function buildTrack() {
  ground=plane(scene,120,100,0,-.045,0,material('grass-01',24,20));
  track=new T.Group(); track.name='PreviewRoad'; scene.add(track);
  plane(track,84,16,0,0,0,material('asphalt-clean',21,4));
  plane(track,30,15,14,.004,0,material('asphalt-skid',7.5,3.75));
  plane(track,64,6,0,.007,-12,material('asphalt-pits',16,1.5));
  plane(track,84,5,0,-.01,12,material('gravel-runoff',21,1.25));
  plane(track,17,13,-30,-.018,24,material('grass-02',4.25,3.25));
  plane(track,20,12,25,-.017,25,material('grass-03',5,3));
  for (const z of [-8.5,8.5]) {
    const kerb=material('kerb-red-white',21,1,{normalMap:texture('kerb-normal',21,1),normalScale:new T.Vector2(.7,.7)});
    plane(track,84,1,0,.07,z,kerb);
  }
  const white=material('paint-white',21,.1), yellow=material('paint-yellow',16,.12);
  for (const z of [-7.3,7.3]) plane(track,84,.16,0,.015,z,white);
  plane(track,64,.16,0,.018,-10,yellow);
  for (let x=-37;x<40;x+=8) plane(track,3,.13,x,.017,0,white);
  for (let row=0;row<2;row++) for(let column=0;column<16;column++) {
    const mat=own(new T.MeshStandardMaterial({color:(column+row)%2?'#eeeade':'#1d2927',roughness:.85}));
    plane(track,.65,1,-23+row*.65,.023,-7.5+column,mat);
  }
  // A low unbranded pit wall gives the assembled scene a continuous boundary.
  for(let x=-35;x<36;x+=5) {
    const wall=solid(track,[4.9,.75,.45],[x,.375,-9.8],'#c5c8b8');
    const old=wall.material; resources.delete(old); old.dispose();
    wall.material=material('concrete-barrier',2,1);
  }
  inspection=new T.Group(); inspection.name='TextureInspection'; inspection.visible=false; scene.add(inspection);
}
function buildEnvironment() {
  // An original local colour gradient, used only for gentle material reflections.
  const envCanvas=document.createElement('canvas'); envCanvas.width=128; envCanvas.height=64;
  const ctx=envCanvas.getContext('2d'); const gradient=ctx.createLinearGradient(0,0,0,64);
  gradient.addColorStop(0,'#9fc8ce'); gradient.addColorStop(.45,'#f4edda');
  gradient.addColorStop(.56,'#829b84'); gradient.addColorStop(1,'#385744');
  ctx.fillStyle=gradient; ctx.fillRect(0,0,128,64);
  const environment=own(new T.CanvasTexture(envCanvas)); environment.mapping=T.EquirectangularReflectionMapping;
  environment.colorSpace=T.SRGBColorSpace; scene.environment=environment;
}
function updateCamera() {
  camera.position.set(target.x+distance*Math.sin(yaw)*Math.cos(elevation),target.y+distance*Math.sin(elevation),target.z+distance*Math.cos(yaw)*Math.cos(elevation));
  camera.lookAt(target); requestRender();
}
function requestRender() {
  if (!frameHandle && renderer && !disposed) frameHandle=requestAnimationFrame(render);
}
function render(now=0) {
  frameHandle=0;
  if(disposed) return;
  if(autoRotate) {
    yaw+=Math.min(.05,Math.max(0,(now-lastTime)/1000))*.15;
    camera.position.set(target.x+distance*Math.sin(yaw)*Math.cos(elevation),target.y+distance*Math.sin(elevation),target.z+distance*Math.cos(yaw)*Math.cos(elevation));
    camera.lookAt(target);
  }
  lastTime=now; renderer.render(scene,camera); state.renderCount++;
  state.drawStats={triangles:renderer.info.render.triangles,calls:renderer.info.render.calls};
  if(autoRotate) requestRender();
}
function setActive() {
  byId('overview').classList.toggle('active',mode==='overview');
  byId('seams').classList.toggle('active',mode==='seams');
  document.querySelectorAll('[data-model]').forEach(b=>b.classList.toggle('active',mode==='focus'&&b.dataset.model===selected));
  document.querySelectorAll('[data-texture]').forEach(b=>b.classList.toggle('active',['seams','artwork'].includes(mode)&&b.dataset.texture===state.selectedTexture));
  state.mode=mode; state.selectedModel=mode==='focus'?selected:null;
}
function resetCamera() {
  if(mode==='focus') { frameAsset(); return; }
  if(mode==='seams'||mode==='artwork') { target.set(0,0,0); distance=32; yaw=0; elevation=1.15; updateCamera(); return; }
  yaw=.59; elevation=.75;
  fitBounds(new T.Box3(new T.Vector3(-43,0,-25),new T.Vector3(39,10,15)),1.10);
  updateCamera();
}
function overview() {
  if(!state.ready) return;
  mode='overview'; venue.visible=track.visible=ground.visible=true; inspection.visible=false;
  byId('scene-label').textContent='כל הסביבה'; byId('scene-detail').textContent='יחידות מטרים · חזית +Z';
  setActive(); resetCamera();
}
function clearInspection() {
  while(inspection.children.length) {
    const child=inspection.children[0];
    if(child.userData.inspectionOwned) {
      const owned=[child.geometry,child.material,...Object.values(child.material).filter(value=>value?.isTexture)];
      for(const item of new Set(owned)) { resources.delete(item);item.dispose(); }
    }
    // Model clones share the original GLB's resources; only the clone is removed.
    inspection.remove(child);
  }
}
function frameAsset() {
  const box=new T.Box3().setFromObject(inspection);
  yaw=.46; elevation=.32; fitBounds(box,1.16);
  camera.near=.05; camera.updateProjectionMatrix(); updateCamera();
}
function fitBounds(box,padding=1.15) {
  box.getCenter(target);
  const away=new T.Vector3(Math.sin(yaw)*Math.cos(elevation),Math.sin(elevation),Math.cos(yaw)*Math.cos(elevation));
  const right=new T.Vector3().crossVectors(new T.Vector3(0,1,0),away).normalize();
  const up=new T.Vector3().crossVectors(away,right).normalize();
  const tanV=Math.tan(T.MathUtils.degToRad(camera.fov/2));
  const tanH=tanV*(camera.aspect||1);
  distance=3.8;
  for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]) {
    const point=new T.Vector3(x,y,z).sub(target),depth=point.dot(away);
    distance=Math.max(distance,depth+Math.abs(point.dot(right))*padding/tanH,depth+Math.abs(point.dot(up))*padding/tanV);
  }
}
function focus(key) {
  if(!assets.has(key)) return false;
  mode='focus'; selected=key; clearInspection();
  venue.visible=track.visible=false; ground.visible=true; inspection.visible=true;
  const clone=assets.get(key).clone(true); clone.position.set(0,0,0); clone.rotation.set(0,0,0);
  inspection.add(clone);
  const record=modelList.find(item=>item[0]===key);
  byId('scene-label').textContent=record[1]; byId('scene-detail').textContent=record[2]+' · +Z';
  setActive(); frameAsset(); return true;
}
function inspectTexture(key='asphalt-clean') {
  if(!textures.has(key)) return false;
  const artwork=['crowd-atlas','sponsor-race'].includes(key);
  mode=artwork?'artwork':'seams'; state.selectedTexture=key; clearInspection();
  venue.visible=track.visible=ground.visible=false; inspection.visible=true;
  const isNormal=key==='kerb-normal';
  if(artwork) {
    const image=textures.get(key).image;
    plane(inspection,18,18*image.height/image.width,0,0,0,own(new T.MeshBasicMaterial({map:texture(key,1,1),side:T.DoubleSide})));
    const label=textureList.find(item=>item[0]===key)?.[1]||key;
    byId('scene-label').textContent=label;
    byId('scene-detail').textContent='יצירה מקורית · תצוגת האיור בשלמותו';
    setActive(); resetCamera(); return true;
  }
  // All three samples repeat exactly three times in both UV directions.
  const selectedMaterial=isNormal?own(new T.MeshBasicMaterial({map:texture(key,3,3)})):material(key,3,3,
    key==='kerb-red-white'?{normalMap:texture('kerb-normal',3,3),normalScale:new T.Vector2(.7,.7)}:{});
  plane(inspection,13,13,0,0,0,selectedMaterial);
  plane(inspection,7,7,-10.7,0,0,material('asphalt-clean',3,3));
  plane(inspection,7,7,10.7,0,0,material('kerb-red-white',3,3,{normalMap:texture('kerb-normal',3,3),normalScale:new T.Vector2(.7,.7)}));
  const label=textureList.find(item=>item[0]===key)?.[1]||key;
  byId('scene-label').textContent=label+' · חזרתיות 3×3';
  byId('scene-detail').textContent='מרכז: המרקם שנבחר · צדדים: אספלט וקרב';
  setActive(); resetCamera(); return true;
}
function lighting(value) {
  const dusk=value==='dusk'; state.lighting=value;
  sun.color.set(dusk?'#ffb470':'#fff3dc'); sun.intensity=dusk?2.2:2.65;
  sun.position.set(dusk?-24:28,dusk?18:55,35);
  fill.intensity=dusk?1.65:2.05; fill.color.set(dusk?'#809cbc':'#dcecea');
  scene.background.set(dusk?'#6c8891':'#bdcec5');
  scene.fog.color.copy(scene.background);
  renderer.toneMappingExposure=dusk?.95:1.1;
  byId('day').classList.toggle('active',!dusk); byId('dusk').classList.toggle('active',dusk);
  requestRender();
}

const pointer = {id:null,x:0,y:0,moved:false};
function pointerDown(event) { pointer.id=event.pointerId; pointer.x=event.clientX;pointer.y=event.clientY;pointer.moved=false;canvas.setPointerCapture(event.pointerId); }
function pointerMove(event) {
  if(event.pointerId!==pointer.id) return;
  const dx=event.clientX-pointer.x,dy=event.clientY-pointer.y;
  if(Math.abs(dx)+Math.abs(dy)>1) pointer.moved=true;
  yaw-=dx*.006; elevation=T.MathUtils.clamp(elevation+dy*.004,.08,1.5);
  pointer.x=event.clientX;pointer.y=event.clientY;updateCamera();
}
function pointerUp(event) {
  if(event.pointerId!==pointer.id) return;
  pointer.id=null;
  if(!pointer.moved&&mode==='overview') {
    const rect=canvas.getBoundingClientRect(); const mouse=new T.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
    const ray=new T.Raycaster();ray.setFromCamera(mouse,camera);
    const hit=ray.intersectObject(venue,true)[0];
    if(hit) { let object=hit.object;while(object.parent!==venue&&object.parent)object=object.parent; if(object.userData.modelKey)focus(object.userData.modelKey); }
  }
}
function wheel(event) { event.preventDefault();distance=T.MathUtils.clamp(distance*Math.exp(event.deltaY*.001),2,170);updateCamera(); }
function resize() {
  if(!renderer) return; const width=viewport.clientWidth,height=viewport.clientHeight;
  renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();
  if(mode==='focus'||mode==='overview') resetCamera(); else requestRender();
}
let observer;
async function boot() {
  try {
    renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.6)); renderer.outputColorSpace=T.SRGBColorSpace;
    renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
    scene=new T.Scene();scene.background=new T.Color('#bdcec5');scene.fog=new T.Fog('#bdcec5',180,350);
    camera=new T.PerspectiveCamera(42,1,.1,500);
    sun=new T.DirectionalLight('#fff3dc',2.65);sun.position.set(28,55,35);sun.castShadow=true;
    sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-58,right:58,top:46,bottom:-46,near:.1,far:140});
    sun.shadow.normalBias=.035;sun.shadow.bias=-.0003;scene.add(sun);
    fill=new T.HemisphereLight('#dcecea','#687350',2.05);scene.add(fill);
    const rim=new T.DirectionalLight('#b3cccf',.65);rim.position.set(-38,20,-35);scene.add(rim);
    buildEnvironment();venue=new T.Group();venue.name='RacingEnvironment';scene.add(venue);
    const loader=new GLTFLoader(),textureLoader=new T.TextureLoader();
    const tasks=[...textureList.map(async([key])=>{
      const value=await textureLoader.loadAsync(new URL(`textures/${key}.webp`,import.meta.url).href);
      value.colorSpace=key.includes('normal')?T.NoColorSpace:T.SRGBColorSpace;
      value.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());own(value);textures.set(key,value);
      state.loadedTextures.push(key);byId('progress').textContent=`${state.loadedTextures.length} מרקמים · ${state.loadedModels.length} דגמים`;
    }),...modelList.map(async([key,label,subtitle,position,rotation])=>{
      const gltf=await loader.loadAsync(new URL(`runtime/${key}.glb`,import.meta.url).href);
      const asset=gltf.scene;asset.position.set(...position);asset.rotation.y=rotation;asset.userData.modelKey=key;
      asset.traverse(object=>{
        if(!object.isMesh)return;object.castShadow=true;object.receiveShadow=true;
        own(object.geometry);
        for(const mat of Array.isArray(object.material)?object.material:[object.material]) {
          own(mat);for(const value of Object.values(mat))if(value?.isTexture)own(value);
        }
      });
      assets.set(key,asset);venue.add(asset);state.loadedModels.push(key);
      byId('progress').textContent=`${state.loadedTextures.length} מרקמים · ${state.loadedModels.length} דגמים`;
    })];
    const results=await Promise.allSettled(tasks);
    for(const result of results)if(result.status==='rejected')markError(result.reason);
    if(state.errors.length)throw Error(`${state.errors.length} assets failed to load`);
    buildTrack();observer=new ResizeObserver(resize);observer.observe(viewport);resize();updateCamera();
    state.ready=true;state.focus=focus;state.setMode=value=>value==='seams'?inspectTexture():overview();
    state.inspectTexture=inspectTexture;state.setLighting=lighting;state.resetCamera=resetCamera;
    state.bounds=Object.fromEntries([...assets].map(([key,asset])=>{const box=new T.Box3().setFromObject(asset);return[key,{min:box.min.toArray(),max:box.max.toArray()}]}));
    byId('loading').hidden=true;byId('load-status').textContent='7 דגמים · 15 מרקמים נטענו';
    byId('overview').addEventListener('click',overview);byId('seams').addEventListener('click',()=>inspectTexture());
    byId('day').addEventListener('click',()=>lighting('day'));byId('dusk').addEventListener('click',()=>lighting('dusk'));
    byId('reset-camera').addEventListener('click',resetCamera);
    byId('rotate').addEventListener('click',()=>{autoRotate=!autoRotate;byId('rotate').setAttribute('aria-pressed',String(autoRotate));lastTime=performance.now();requestRender()});
    canvas.addEventListener('pointerdown',pointerDown);canvas.addEventListener('pointermove',pointerMove);
    canvas.addEventListener('pointerup',pointerUp);canvas.addEventListener('pointercancel',()=>{pointer.id=null});canvas.addEventListener('wheel',wheel,{passive:false});
    canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();if(disposed)return;markError(Error('WebGL context lost; reload to restore the preview.'));byId('load-status').textContent='התצוגה נעצרה — יש לרענן';});
    requestRender();
  } catch(error) {
    markError(error);byId('loading').querySelector('b').textContent='התצוגה לא נטענה';
    byId('progress').textContent='יש לפתוח דרך שרת מקומי ולבדוק שכל הקבצים זמינים.';
    byId('load-status').textContent='שגיאה בטעינה';
  }
}
function dispose() {
  disposed=true;cancelAnimationFrame(frameHandle);observer?.disconnect();
  canvas.removeEventListener('pointerdown',pointerDown);canvas.removeEventListener('pointermove',pointerMove);
  canvas.removeEventListener('pointerup',pointerUp);canvas.removeEventListener('wheel',wheel);
  for(const resource of resources)resource.dispose?.();resources.clear();
  renderer?.renderLists.dispose();renderer?.dispose();renderer?.forceContextLoss();
}
state.dispose=dispose;window.addEventListener('pagehide',dispose,{once:true});
boot();
