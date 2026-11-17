import * as T from './vendor/three.module.js';
import {loadCityBuilding, disposeCityBuilding} from './runtime.mjs';
import {createOpeningEffect} from './effects.mjs';

const $ = id => document.getElementById(id);
const paths = {
  school: 'M4 6h10v10H4z M7 6V3h4v3 M8 16v-4h2v4',
  hospital: 'M9 15 3 9C0 5 5 2 9 6c4-4 9-1 6 3Z',
  'fire-station': 'M9 2c1 5 5 5 5 9a5 5 0 0 1-10 0c0-3 3-6 5-9Z',
  'police-station': 'M5 6h8v10H5z M12 6V2 M7 9h4 M7 12h4',
  library: 'M9 5 2 3v11l7 2 7-2V3Z M9 5v11',
  museum: 'M2 6h14L9 2Z M4 7v7 M9 7v7 M14 7v7 M2 16h14',
  grocery: 'M2 7h14l-2 9H4Z M5 7l4-5 4 5 M7 10v3 M11 10v3',
  bakery: 'M3 14V9a6 6 0 0 1 12 0v5Z M6 6l1 3 M10 5l1 3',
  patisserie: 'M5 10h8l-1 6H6Z M4 10c-2-3 1-5 3-5 1-4 5-3 5 0 4 0 5 5 2 5',
  'sports-park': 'M16 9A7 7 0 1 1 2 9a7 7 0 0 1 14 0 M2 9h14 M9 2v14',
  'swimming-pool': 'M2 7q2-3 4 0t4 0 4 0 M2 12q2-3 4 0t4 0 4 0',
  playground: 'M3 16V4h7l5 12 M3 8h5 M3 12h7 M10 4v4',
  park: 'M9 2 2 12h14Z M9 12v4',
  'train-station': 'M5 2h8v11H5z M5 7h8 M7 13l-2 3 M11 13l2 3 M7 10h.1 M11 10h.1',
  'bus-stop': 'M3 3h12v10H3z M3 8h12 M6 13v3 M12 13v3',
  lighthouse: 'M6 16 7 6h4l1 10Z M6 6h6L9 2Z M12 5l4-2v5Z',
  harbor: 'M9 5v11 M5 3a4 4 0 0 1 8 0 M3 10v3l6 3 6-3v-3',
  market: 'M2 7h14l-3-5H5Z M4 7v9 M14 7v9 M4 11h10',
  cinema: 'M16 9A7 7 0 1 1 2 9a7 7 0 0 1 14 0 M6 6h.1 M12 6h.1 M6 12h.1 M12 12h.1',
  theatre: 'M2 3h14v13 M2 3v13 M3 4l3 6-3 5 M15 4l-3 6 3 5 M7 16h4',
};
const descriptions = {
  school: 'חצר, כיתות ומגדל שעון', hospital: 'מרחב לטיפול וכניסה מקורה', 'fire-station': 'מוסכים רחבים ומגדל צינורות',
  'police-station': 'תחנה שכונתית עם מגדל קשר', library: 'פינות קריאה ואור מהגג', museum: 'עמודים, גמלון וחצר פסלים',
  grocery: 'תוצרת טרייה מתחת לסוכך', bakery: 'כיכרות חמות וארובת תנור', patisserie: 'עוגות, צבע ומגדלון פינתי',
  'sports-park': 'מגרש שכונתי וספסלי צפייה', 'swimming-pool': 'מסלולי שחייה ומבנה מלתחות', playground: 'מגלשה, נדנדה וארגז חול',
  park: 'שבילים, עצים ומזרקה קטנה', 'train-station': 'רציף, מסילה ושעון התחנה', 'bus-stop': 'סככה, ספסל ותחנה בדרך הביתה',
  lighthouse: 'מגדל פסים ופנס מעל החוף', harbor: 'רציף עץ, מנוף ורחבת מטענים', market: 'שלושה דוכנים ומעבר מרכזי',
  cinema: 'חזית מדורגת וקופת כרטיסים', theatre: 'בית במה, עמודים ומבואה חגיגית',
};
const canvas = $('scene'), status = $('load-state');
let manifest, renderer, scene, camera, models, ground, grid, road, effectRoot;
let effects = [], currentMeshes = [], generation = 0, abort, dirty = true, lastTime = 0;
let azimuth = .63, elevation = .64, zoom = 1, frameSize = 4.6, fitX = 0, fitY = 0, cameraTarget = new T.Vector3(0,.80,0);
const params = new URLSearchParams(location.search);
const state = {buildingId: params.get('building') || 'school', stage: params.get('stage') || 'complete', palette: params.get('palette') || 'sunrise', mode: params.get('view') === 'city' ? 'city' : 'single', loading: false};
const api = {state, get manifest() {return manifest;}, get meshes() {return currentMeshes;}, get effects() {return effects;}, select, render, resetView,
  celebrate, rotate: (a, e = elevation) => {azimuth = a; elevation = e; updateCamera();}, get renderer() {return renderer;}, get camera() {return camera;}};
window.cityPreview = api;

function announce(text, error = false) {status.textContent = text; status.classList.toggle('error', error);}
function setup() {
  renderer = new T.WebGLRenderer({canvas, alpha: true, antialias: true, powerPreference: 'low-power'});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.18;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
  scene = new T.Scene();
  scene.add(new T.HemisphereLight('#fff7e5', '#94a78f', 2.4));
  const sun = new T.DirectionalLight('#fff0d7', 3.0); sun.position.set(-6,12,8); sun.castShadow = true;
  sun.shadow.mapSize.set(1024,1024); sun.shadow.bias = -.0003; sun.shadow.normalBias = .035;
  Object.assign(sun.shadow.camera, {left:-17,right:17,top:17,bottom:-17,near:.5,far:50});
  scene.add(sun);
  const fill = new T.DirectionalLight('#d8efec', .6); fill.position.set(5,4,-4); scene.add(fill);
  camera = new T.OrthographicCamera(-3,3,3,-3,.1,100);
  models = new T.Group(); scene.add(models);
  effectRoot = new T.Group(); scene.add(effectRoot);
  ground = new T.Mesh(new T.PlaneGeometry(70,70), new T.MeshStandardMaterial({color:'#e1e7d3',roughness:1}));
  ground.rotation.x = -Math.PI/2; ground.position.y = -.012; ground.receiveShadow = true; scene.add(ground);
  grid = new T.GridHelper(50,50,'#c9d3bc','#d1d9c4'); grid.position.y = -.007;
  grid.material.transparent = true; grid.material.opacity = .34; scene.add(grid);
  road = new T.Group(); scene.add(road);
  const street = (x,z,w,d) => {
    const mesh = new T.Mesh(new T.BoxGeometry(w,.03,d),new T.MeshStandardMaterial({color:'#b6c1af',roughness:1}));
    mesh.position.set(x,.005,z); mesh.receiveShadow = true; road.add(mesh);
  };
  street(0,2.20,13,.78);
  for (let i=-6;i<=6;i++) {
    const dash=new T.Mesh(new T.BoxGeometry(.38,.015,.035),new T.MeshBasicMaterial({color:'#f4efd9'}));
    dash.position.set(i,.029,2.20);road.add(dash);
  }
  new ResizeObserver(resize).observe(canvas.parentElement);
  canvas.addEventListener('wheel',event=>{event.preventDefault();zoom=T.MathUtils.clamp(zoom*Math.exp(event.deltaY*.001),.65,1.6);updateCamera();},{passive:false});
  let pointer;
  canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;pointer={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{
    if(!pointer||pointer.id!==e.pointerId)return;
    azimuth-=(e.clientX-pointer.x)*.009;elevation=T.MathUtils.clamp(elevation+(e.clientY-pointer.y)*.006,.30,1.23);
    pointer.x=e.clientX;pointer.y=e.clientY;updateCamera();
  });
  const endPointer=()=>{pointer=undefined;};
  canvas.addEventListener('pointerup',endPointer);canvas.addEventListener('pointercancel',endPointer);canvas.addEventListener('lostpointercapture',endPointer);
  canvas.addEventListener('keydown',e=>{
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','Home'].includes(e.key))return;
    e.preventDefault();
    if(e.key==='ArrowLeft')azimuth+=.12;if(e.key==='ArrowRight')azimuth-=.12;
    if(e.key==='ArrowUp')elevation=Math.min(1.23,elevation+.09);if(e.key==='ArrowDown')elevation=Math.max(.30,elevation-.09);
    if(e.key==='+'||e.key==='=')zoom=Math.max(.65,zoom*.9);if(e.key==='-')zoom=Math.min(1.6,zoom*1.1);
    if(e.key==='Home')resetView();else updateCamera();
  });
  requestAnimationFrame(tick);
}
function resize() {
  const {width,height}=canvas.parentElement.getBoundingClientRect();
  renderer.setSize(width,height,false);
  const aspect=width/height,half=Math.max(frameSize/2,fitX/aspect,fitY)*zoom;
  camera.left=-half*aspect;camera.right=half*aspect;camera.top=half;camera.bottom=-half;
  camera.updateProjectionMatrix();dirty=true;
}
function updateCamera() {
  camera.position.set(Math.sin(azimuth)*Math.cos(elevation)*30,Math.sin(elevation)*30,Math.cos(azimuth)*Math.cos(elevation)*30).add(cameraTarget);
  camera.lookAt(cameraTarget);camera.updateMatrixWorld();
  fitX=0;fitY=0;
  for(const mesh of currentMeshes){
    const box=mesh.geometry.boundingBox;
    for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
      const corner=new T.Vector3(x,y,z).add(mesh.position).applyMatrix4(camera.matrixWorldInverse);
      fitX=Math.max(fitX,Math.abs(corner.x)*1.10);fitY=Math.max(fitY,Math.abs(corner.y)*1.10);
    }
  }
  resize();
}
function resetView(){azimuth=.63;elevation=.64;zoom=1;updateCamera();}
function render(){if(renderer){renderer.render(scene,camera);dirty=false;}}
function tick(time) {
  const delta=Math.min(.1,(time-lastTime)/1000);lastTime=time;
  if(!document.hidden){
    for(const effect of effects){if(effect.active){effect.update(delta);dirty=true;}}
    if(dirty)render();
  }
  requestAnimationFrame(tick);
}
function clearEffects(){for(const e of effects)e.dispose();effects=[];}
function bindUI() {
  const list=$('building-list');
  for(const building of manifest.buildings){
    const button=document.createElement('button');button.className='building-button';button.type='button';button.dataset.building=building.id;
    button.innerHTML=`<span class="mini-icon" aria-hidden="true"><svg viewBox="0 0 18 18"><path d="${paths[building.id]}"></path></svg></span><span>${building.nameHe}</span>`;
    button.addEventListener('click',()=>handle(select({buildingId:building.id,mode:'single'})));list.append(button);
  }
  for(const button of document.querySelectorAll('[data-stage]'))button.addEventListener('click',()=>handle(select({stage:button.dataset.stage})));
  for(const button of document.querySelectorAll('[data-palette]'))button.addEventListener('click',()=>handle(select({palette:button.dataset.palette})));
  $('view-mode').addEventListener('click',()=>handle(select({mode:state.mode==='single'?'city':'single'})));
  $('reset-view').addEventListener('click',resetView);
  $('celebrate').addEventListener('click',()=>handle(celebrate()));
}
function handle(promise){promise.catch(error=>{if(error.name!=='AbortError')announce('הטעינה לא הושלמה. נסו שוב, או הפעילו את הקובץ המקומי serve.py.',true);});}
function updateUI() {
  const b=manifest.buildings.find(b=>b.id===state.buildingId);
  $('building-name').textContent=state.mode==='city'?'כל העיר יחד':b.nameHe;
  $('building-description').textContent=state.mode==='city'?'עשרים מקומות, כל אחד והסיפור שלו':descriptions[b.id];
  $('footprint').textContent=state.mode==='city'?'20 מקומות בעיר':`${b.footprint.columns} × ${b.footprint.rows} תאים`;
  $('capacity').textContent=state.mode==='city'?'שכונה מלאה בחיים':`עד ${b.occupancy.capacityPeople} אנשים`;
  for(const button of document.querySelectorAll('[data-building]'))button.setAttribute('aria-pressed',String(button.dataset.building===state.buildingId));
  for(const key of ['stage','palette'])for(const button of document.querySelectorAll(`[data-${key}]`))button.setAttribute('aria-pressed',String(button.dataset[key]===state[key]));
  $('view-mode').setAttribute('aria-pressed',String(state.mode==='city'));
  $('view-mode').textContent=state.mode==='city'?'מבנה אחד':'כל העיר';
  $('celebrate').disabled=state.loading;
  $('control-note').textContent=state.stage==='complete'?'עוד מקום לחוויות חדשות בעיר שלך.':'פתיחה חגיגית משלימה את הבנייה.';
}
async function select(options = {}) {
  if(options.buildingId&&!manifest.buildings.some(b=>b.id===options.buildingId))throw new Error('Unknown building');
  if(options.stage&&!manifest.stages.includes(options.stage))throw new Error('Unknown construction stage');
  if(options.palette&&!manifest.palettes.some(p=>p.id===options.palette))throw new Error('Unknown palette');
  if(options.mode&&!['single','city'].includes(options.mode))throw new Error('Unknown view mode');
  Object.assign(state,options);state.loading=true;updateUI();
  const thisGeneration=++generation;abort?.abort();abort=new AbortController();
  clearEffects();announce('מכינים את המקום…');
  const buildings=state.mode==='city'?manifest.buildings:[manifest.buildings.find(b=>b.id===state.buildingId)];
  // allSettled ensures a cancelled or failed city request cannot leak successfully loaded peers.
  const results=await Promise.allSettled(buildings.map(b=>loadCityBuilding(b,{palette:state.palette,stage:state.stage,signal:abort.signal})));
  const loaded=results.filter(r=>r.status==='fulfilled').map(r=>r.value);
  const failure=results.find(r=>r.status==='rejected');
  if(thisGeneration!==generation||failure){
    for(const mesh of loaded)disposeCityBuilding(mesh);
    if(thisGeneration===generation){state.loading=false;updateUI();}
    if(failure)throw failure.reason;return;
  }
  for(const mesh of currentMeshes)disposeCityBuilding(mesh);currentMeshes=loaded;
  loaded.forEach((mesh,i)=>{
    if(state.mode==='city')mesh.position.set((i%5-2)*4.35,0,(Math.floor(i/5)-1.5)*4.25);
    models.add(mesh);
  });
  road.visible=state.mode==='single';
  if(state.mode==='city'){frameSize=21.8;cameraTarget.set(0,.35,0);}
  else{
    const b=buildings[0],bounds=loaded[0].geometry.boundingBox;
    frameSize=Math.max(3.9,b.footprint.depth*1.25,(bounds.max.y-bounds.min.y)*1.35);
    cameraTarget.set(0,bounds.max.y*.40,0);
  }
  zoom=1;updateCamera();render();state.loading=false;updateUI();
  const triangles=loaded.reduce((sum,mesh)=>sum+mesh.userData.triangles,0);
  $('triangles').textContent=`${triangles.toLocaleString('he-IL')} משולשים`;
  canvas.setAttribute('aria-label',`${state.mode==='city'?'כל העיר':buildings[0].nameHe}, ${state.stage==='complete'?'גמור':state.stage==='foundation'?'יסודות':'חצי בנוי'}. גרירה או חיצים לסיבוב.`);
  announce('');
  const query=new URLSearchParams({building:state.buildingId,stage:state.stage,palette:state.palette,view:state.mode});
  history.replaceState(null,'','?'+query.toString());
}
async function celebrate() {
  if(state.stage!=='complete')await select({stage:'complete'});
  if(state.loading)return;
  clearEffects();
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(!reduced){zoom=Math.max(zoom,1.25);updateCamera();}
  currentMeshes.forEach((mesh,i)=>{
    const anchor=mesh.userData.openingAnchor.map((v,axis)=>v+mesh.position.getComponent(axis));
    const effect=createOpeningEffect(effectRoot,{anchor,reducedMotion:reduced,seed:23+i});effects.push(effect);effect.play();
  });
  announce('המקום פתוח! עוד פינה חדשה בעיר שלך.');dirty=true;
}
api.ready=(async()=>{
  try {
    const response=await fetch('./manifest.json');if(!response.ok)throw new Error('Missing manifest');manifest=await response.json();
    if(!manifest.buildings.some(b=>b.id===state.buildingId))state.buildingId='school';
    if(!manifest.stages.includes(state.stage))state.stage='complete';
    if(!manifest.palettes.some(p=>p.id===state.palette))state.palette='sunrise';
    setup();bindUI();await select();return api;
  } catch(error) {
    if(error.name==='AbortError'&&generation>1)return api;
    announce('לא ניתן לפתוח את התצוגה. חלצו את החבילה והפעילו את serve.py בדפדפן עם WebGL.',true);throw error;
  }
})();
