import * as THREE from './vendor/three.module.js';
import { buildKidBody } from './model.mjs';

// Freeze the camera and lights; only the specimen turns between named views.
const CAMERA = { position:[0,0.875,6], target:[0,0.875,0], height:2.12, minimumWidth:1.34, near:0.1, far:30 };
const LIGHTS = { key:{position:[-3,4.5,5],color:0xfff2e1,intensity:3.1}, fill:{position:[3,2,3],color:0xe3edff,intensity:1.35}, rim:{position:[1,3,-4],color:0xfff5e5,intensity:2.0}, hemisphere:{sky:0xfff5eb,ground:0x9da8be,intensity:1.0} };
const ANGLES = { front:0, side:Math.PI/2, back:Math.PI, threeQuarter:Math.PI/4, frontRepeat:0 };
const LABELS = {front:'חזית',side:'צד',back:'גב',threeQuarter:'שלושה רבעים',frontRepeat:'חזית חוזרת'};
const LESSONS = {
  blockout:['01 · נפחים בסיסיים','קודם בודקים את היחסים','אליפסות וצינורות משמשים רק לבדיקת הגובה, הרוחב ומיקום המפרקים. החיבור ביניהם עדיין נראה כמו חלקים מורכבים.'],
  shaped:['02 · צללית ובגד','הצללית מקבלת רצף','חתכי רוחב משתנים מחוברים במשטח רציף. הכתפיים מתעגלות, השרוולים נפתחים מעט והמכנסיים מקבלים נפח נפרד סביב כל ירך.'],
  final:['03 · קפלים וגימור','הפרטים עובדים בתוך הנפח','שקעים רחבים ורדודים מחליפים קווי קפל חדים. הבגד נשאר עבה ועגול, והמספר יושב על הקימור של החולצה.']
};
const viewport=document.querySelector('#viewport');
const query=new URLSearchParams(location.search);
// Named rejected alternatives, retained so the learning notes can be reproduced.
const experiment=['glossy','flat-numbers'].includes(query.get('experiment'))?query.get('experiment'):null;
let stage=query.get('stage')||'final', palette=query.get('palette')||'blue', view=query.get('view')||'front';
let detail=query.get('detail')==='dense'?'dense':'balanced';
if(!LESSONS[stage])stage='final';
if(!['blue','coral'].includes(palette))palette='blue';
if(!(view in ANGLES))view='front';
let renderer;
try {
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});
} catch(error) {
  const box=document.querySelector('#error'); box.style.display='grid'; box.textContent='WebGL אינו זמין בדפדפן הזה. יש לפתוח בדפדפן שתומך בתלת־ממד.';
  throw error;
}
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.0;
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate=false;
renderer.domElement.setAttribute('aria-label','גוף הילד בבגד רך, ללא ראש, כפות ידיים ונעליים');
viewport.append(renderer.domElement);
const scene=new THREE.Scene(); scene.background=new THREE.Color(0xeae7e2);
const camera=new THREE.OrthographicCamera();
camera.position.fromArray(CAMERA.position); camera.lookAt(new THREE.Vector3(...CAMERA.target));
camera.near=CAMERA.near;camera.far=CAMERA.far;
scene.add(new THREE.HemisphereLight(LIGHTS.hemisphere.sky,LIGHTS.hemisphere.ground,LIGHTS.hemisphere.intensity));
for(const [name,data] of Object.entries(LIGHTS)) {
  if(name==='hemisphere')continue;
  const light=new THREE.DirectionalLight(data.color,data.intensity); light.position.fromArray(data.position);
  if(name==='key') {
    light.castShadow=true; light.shadow.mapSize.set(1024,1024);
    Object.assign(light.shadow.camera,{left:-1.5,right:1.5,top:2.4,bottom:-.6,near:.5,far:12});
    light.shadow.bias=-.0005;light.shadow.normalBias=.018;light.shadow.radius=3;
  }
  scene.add(light);
}
const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.ShadowMaterial({color:0x6d6156,opacity:.14}));
floor.rotation.x=-Math.PI/2;floor.position.y=.005;floor.receiveShadow=true;scene.add(floor);
let kid=null, buildTimeMs=0, renderFrame=null;
function disposeKid() {
  if(!kid)return;
  scene.remove(kid.group);
  if(kid.dispose)kid.dispose();
  else {
    const geometries=new Set(),materials=new Set(),textures=new Set();
    kid.group.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of [].concat(o.material||[])){materials.add(m);for(const val of Object.values(m))if(val?.isTexture)textures.add(val);}});
    geometries.forEach(g=>g.dispose());textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());
  }
}
function build({deferRender=false}={}) {
  disposeKid();
  const start=performance.now(); kid=buildKidBody({stage,palette,detail});
  if(experiment==='glossy')kid.group.traverse(mesh=>{
    for(const material of [].concat(mesh.material||[])){material.roughness=.08;material.clearcoat=.7;material.clearcoatRoughness=.08;material.bumpScale=0;}
  });
  if(experiment==='flat-numbers')kid.group.traverse(mesh=>{
    if(!mesh.name.startsWith('number-10'))return;
    const positions=mesh.geometry.attributes.position;
    for(let i=0;i<positions.count;i++)positions.setZ(i,mesh.name.endsWith('back')?-.198:.198);
    positions.needsUpdate=true;mesh.geometry.computeVertexNormals();
  });
  buildTimeMs=performance.now()-start;
  kid.group.rotation.y=-ANGLES[view];scene.add(kid.group);
  renderer.shadowMap.needsUpdate=true;
  if(!deferRender)render();updateLabels();
}
function render(){renderer.render(scene,camera);}
function resize() {
  const {width,height}=viewport.getBoundingClientRect();
  const aspect=width/Math.max(height,1);
  // Deterministic viewport framing; never fit to a model/stage/view bounding box.
  const worldHeight=Math.max(CAMERA.height,CAMERA.minimumWidth/aspect);
  camera.top=worldHeight/2; camera.bottom=-worldHeight/2;
  camera.left=-worldHeight*aspect/2;camera.right=worldHeight*aspect/2;camera.updateProjectionMatrix();
  renderer.setSize(width,height,false);if(kid)render();
}
function triangleCount(root) {
  let count=0;root.traverse(o=>{if(o.isMesh&&o.visible&&o.geometry)count+=(o.geometry.index?o.geometry.index.count:o.geometry.attributes.position.count)/3;});return count;
}
function updateLabels() {
  document.querySelector('#stage-label').textContent=LESSONS[stage][0];
  document.querySelector('#lesson-title').textContent=LESSONS[stage][1];document.querySelector('#lesson-text').textContent=LESSONS[stage][2];
  document.querySelector('#view-label').textContent=LABELS[view];
  document.querySelector('#triangles').textContent=Math.round(triangleCount(kid.group)).toLocaleString('he-IL');
  document.querySelector('#build').textContent=buildTimeMs.toFixed(1)+' ms';
  document.querySelector('#draw-calls').textContent=renderer.info.render.calls;
  for(const [attr,value] of [['view',view],['palette',palette],['stage',stage],['detail',detail]])document.querySelectorAll(`[data-${attr}]`).forEach(b=>b.setAttribute('aria-pressed',b.dataset[attr]===value?'true':'false'));
}
function setView(value){if(!(value in ANGLES))throw new Error('Unknown view: '+value);view=value;kid.group.rotation.y=-ANGLES[view];renderer.shadowMap.needsUpdate=true;render();updateLabels();}
function setPalette(value){if(!['blue','coral'].includes(value))throw new Error('Unknown palette: '+value);palette=value;build();}
function setStage(value,{deferRender=false}={}){if(!LESSONS[value])throw new Error('Unknown stage: '+value);stage=value;build({deferRender});}
function setDetail(value,{deferRender=false}={}){if(!['balanced','dense'].includes(value))throw new Error('Unknown detail: '+value);detail=value;build({deferRender});}
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
document.querySelectorAll('[data-palette]').forEach(b=>b.addEventListener('click',()=>setPalette(b.dataset.palette)));
document.querySelectorAll('[data-stage]').forEach(b=>b.addEventListener('click',()=>setStage(b.dataset.stage)));
document.querySelectorAll('[data-detail]').forEach(b=>b.addEventListener('click',()=>setDetail(b.dataset.detail)));
resize();build();
new ResizeObserver(resize).observe(viewport);
let fpsStart=performance.now(), fpsFrames=0;
function loop(now) {
  render();fpsFrames++;
  if(now-fpsStart>=1000){document.querySelector('#fps').textContent=(fpsFrames*1000/(now-fpsStart)).toFixed(1)+' FPS';fpsFrames=0;fpsStart=now;}
  renderFrame=requestAnimationFrame(loop);
}
renderFrame=requestAnimationFrame(loop);
function projectY(y) {const point=new THREE.Vector3(0,y,0).project(camera);return (1-point.y)/2*viewport.clientHeight;}
function getMetrics() {
  const parts=new Set(); kid.group.traverse(o=>{if(o.userData.part)parts.add(o.userData.part);});
  const gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
  return {stage,palette,view,detail,experiment,modelTriangles:triangleCount(kid.group),sceneTriangles:triangleCount(scene),drawCalls:renderer.info.render.calls,renderedTriangles:renderer.info.render.triangles,buildTimeMs,modelStats:kid.stats,parts:[...parts],parameters:kid.parameters,
    camera:{...CAMERA,frustum:{left:camera.left,right:camera.right,top:camera.top,bottom:camera.bottom}},lights:LIGHTS,pixelRatio:renderer.getPixelRatio(),canvas:{width:viewport.clientWidth,height:viewport.clientHeight,drawingWidth:renderer.domElement.width,drawingHeight:renderer.domElement.height},
    projection:{neckY:projectY(kid.parameters.neckTopY),ankleY:projectY(kid.parameters.ankleY),centerX:viewport.clientWidth/2},renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),threeRevision:THREE.REVISION};
}
async function measure({durationMs=5000,warmupMs=1000}={}) {
  if(durationMs<1000)throw new Error('Measure at least one second');
  await new Promise(resolve=>setTimeout(resolve,warmupMs));
  const intervals=[];
  const measured=await new Promise(resolve=>{
    let start,previous,frames=0;
    function tick(now){if(start===undefined){start=now;previous=now;}else{intervals.push(now-previous);previous=now;frames++;}if(now-start>=durationMs)resolve({frames,elapsedMs:now-start,fps:frames*1000/(now-start)});else requestAnimationFrame(tick);}
    requestAnimationFrame(tick);
  });
  const sorted=intervals.slice().sort((a,b)=>a-b);
  return {...measured,warmupMs,requestedDurationMs:durationMs,frameMs:{median:sorted[Math.floor(sorted.length/2)],p95:sorted[Math.floor(sorted.length*.95)]},renderer:getMetrics().renderer,renderMode:'continuous requestAnimationFrame; camera and lights fixed; shadow updates only on rebuild/view change'};
}
window.kidLab={ready:true,setView,setPalette,setStage,setDetail,render,getMetrics,measure};
window.addEventListener('pagehide',event=>{if(event.persisted)return;cancelAnimationFrame(renderFrame);disposeKid();renderer.dispose();});
