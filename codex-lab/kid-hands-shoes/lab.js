import * as THREE from './vendor/three.module.js';
import {createHand, HAND_PARAMETERS} from './hand.js';
import {createShoe, SHOE_PARAMETERS} from './shoe.js';

// Coordinates and light intensities stay fixed between revisions and captures.
export const CAMERA_PRESETS = Object.freeze({
  front: [0, 0.12, 7], side: [7, 0.12, 0], back: [0, 0.12, -7],
  threeQuarter: [4.8, 2.5, 6], top: [0, 7, 0], bottom: [0, -7, 0]
});
export const LIGHTING = Object.freeze({hemisphere: 2.1, key: 3.2, fill: 1.15, rim: 1.7});
const viewNames = {front:'חזית', side:'צד', back:'גב', threeQuarter:'שלושה רבעים', top:'מלמעלה', bottom:'מלמטה'};
let currentView = 'threeQuarter', currentRevision = 'final', wireframe = false;
let entries = [], stages = [], totalBuildMs = 0, revisionCache = new Map();
let ready = false, frames = 0;
const buildHistory = {};

function makeStage(id) {
  const container = document.getElementById(id);
  const renderer = new THREE.WebGLRenderer({alpha:true, antialias:true, preserveDrawingBuffer:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.autoClear = false;
  renderer.info.autoReset = false;
  renderer.domElement.setAttribute('aria-hidden','true');
  container.append(renderer.domElement);
  return {container, renderer};
}

function sceneFor(model) {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff6e6, 0x708f83, LIGHTING.hemisphere));
  for (const [color, intensity, position] of [
    [0xffeddb,LIGHTING.key,[-3,5,6]], [0xd4e9f1,LIGHTING.fill,[4,2,2]], [0xffffff,LIGHTING.rim,[1,4,-4]]
  ]) {const light = new THREE.DirectionalLight(color,intensity);light.position.set(...position);scene.add(light);}
  scene.add(model);
  return scene;
}

function inventory(model) {
  let triangles = 0, meshes = 0, vertices = 0;
  const parts = [];
  model.traverse(node=>{
    if (!node.isMesh) return;
    const geometry = node.geometry;
    const count = (geometry.index?.count ?? geometry.attributes.position.count)/3;
    triangles += count; vertices += geometry.attributes.position.count; meshes++;
    parts.push({name:node.name || 'mesh',triangles:count,vertices:geometry.attributes.position.count});
  });
  const box = new THREE.Box3().setFromObject(model);
  return {triangles,vertices,meshes,parts,bounds:{min:box.min.toArray(),max:box.max.toArray()}};
}

function build(revision) {
  if (revisionCache.has(revision)) return revisionCache.get(revision);
  const start = performance.now();
  const hands = ['open','fist','wave'].map(pose=>createHand(pose,{revision}));
  const shoe = createShoe({revision});
  const objects = hands.map((model,i)=>({name:`hand-${['open','fist','wave'][i]}`,buildMs:model.userData.buildMs,...inventory(model),parameters:model.userData.parameters,validation:model.userData.validation}));
  objects.push({name:'football-shoe',buildMs:shoe.userData.buildMs,...inventory(shoe),parameters:shoe.userData.parameters,validation:shoe.userData.validation});
  const record = {hands,shoe,objects,buildMs:performance.now()-start};
  buildHistory[revision] = record.buildMs;
  revisionCache.set(revision,record);
  return record;
}

function configureCamera(entry) {
  const rect = entry.element.getBoundingClientRect();
  const aspect = Math.max(rect.width,1)/Math.max(rect.height,1);
  // Fixed vertical span for an asset; only horizontal extent follows viewport ratio.
  const halfHeight = entry.kind === 'hand' ? 1.62 : 1.95;
  entry.camera.left = -halfHeight*aspect; entry.camera.right = halfHeight*aspect;
  entry.camera.top = halfHeight; entry.camera.bottom = -halfHeight;
  const view = entry.fixedView ?? currentView;
  entry.camera.position.set(...CAMERA_PRESETS[view]);
  entry.camera.up.set(0,1,0);
  if (view==='top' || view==='bottom') entry.camera.up.set(0,0,1);
  entry.camera.lookAt(0,0,0);
  entry.camera.updateProjectionMatrix();
}

function mountRevision(revision) {
  const record = build(revision);
  totalBuildMs = record.buildMs;
  entries = [];
  document.querySelectorAll('[data-hand]').forEach((element,i)=>{
    entries.push({element,scene:sceneFor(record.hands[i]),model:record.hands[i],camera:new THREE.OrthographicCamera(-2,2,2,-2,.01,30),stage:stages[0],kind:'hand'});
  });
  document.querySelectorAll('[data-shoe]').forEach(element=>{
    const model = record.shoe.clone(true);
    entries.push({element,scene:sceneFor(model),model,camera:new THREE.OrthographicCamera(-2,2,2,-2,.01,30),stage:stages[1],kind:'shoe',fixedView:element.dataset.shoe==='primary'?null:element.dataset.shoe});
  });
  applyWireframe();
  entries.forEach(configureCamera);
  updateUI();
  draw();
}

function applyWireframe() {
  entries.forEach(entry=>entry.model.traverse(node=>{if(node.isMesh){for(const material of [node.material].flat()) material.wireframe=wireframe;}}));
}

function draw() {
  for (const stage of stages) {
    const base = stage.container.getBoundingClientRect();
    const renderer = stage.renderer;
    const width = Math.max(1,Math.round(base.width)), height = Math.max(1,Math.round(base.height));
    const size = renderer.getSize(new THREE.Vector2());
    if(size.x!==width || size.y!==height){renderer.setSize(width,height,false);entries.filter(e=>e.stage===stage).forEach(configureCamera);}
    renderer.setScissorTest(false); renderer.setClearColor(0x000000,0); renderer.clear();
    renderer.info.reset(); renderer.setScissorTest(true);
    for (const entry of entries.filter(e=>e.stage===stage)) {
      const r = entry.element.getBoundingClientRect();
      const x = r.left-base.left, y=height-(r.bottom-base.top);
      renderer.setViewport(x,y,r.width,r.height);
      renderer.setScissor(x,y,r.width,r.height);
      renderer.render(entry.scene,entry.camera);
    }
    renderer.setScissorTest(false);
  }
  frames++;
}

function updateUI() {
  document.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-pressed',button.dataset.view===currentView));
  document.querySelectorAll('[data-revision]').forEach(button=>button.setAttribute('aria-pressed',button.dataset.revision===currentRevision));
  document.getElementById('shoe-primary-label').textContent=viewNames[currentView];
  const triangles=build(currentRevision).objects.reduce((sum,o)=>sum+o.triangles,0);
  document.getElementById('live-metrics').innerHTML=`<b>${triangles.toLocaleString('he-IL')}</b> משולשים בארבעת הדגמים<br><b>${totalBuildMs.toFixed(0)}</b> מילישניות לבניית הגאומטריה`;
}

function metrics() {
  const record=build(currentRevision), gl=stages[0].renderer.getContext();
  const debug=gl.getExtension('WEBGL_debug_renderer_info');
  return {
    revision:currentRevision,view:currentView,objects:record.objects,totalBuildMs,
    modelTriangles:record.objects.reduce((s,o)=>s+o.triangles,0),
    displayedTriangles:stages.reduce((s,stage)=>s+stage.renderer.info.render.triangles,0),
    drawCalls:stages.reduce((s,stage)=>s+stage.renderer.info.render.calls,0),
    renderer:{threeRevision:THREE.REVISION,webgl:gl.getParameter(gl.VERSION),gpu:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),userAgent:navigator.userAgent},
    viewport:{width:innerWidth,height:innerHeight,devicePixelRatio,renderPixelRatio:stages[0].renderer.getPixelRatio()},
    cameras:{presets:CAMERA_PRESETS,handVerticalSpan:3.24,shoeVerticalSpan:3.9,target:[0,0,0],projection:'orthographic'},
    lighting:LIGHTING,parameters:{hands:HAND_PARAMETERS,shoe:SHOE_PARAMETERS},
    reference:{status:'missing',bodyHeadRatio:'2.5–2.7 requested; no complete body model, unmeasured'},buildHistory
  };
}

async function measureFPS(durationMs=5000) {
  // Each measured requestAnimationFrame includes rendering both canvases and seven views.
  const samples=[]; let start,last;
  return new Promise(resolve=>{
    function sample(timestamp){
      if(start===undefined){start=last=timestamp;requestAnimationFrame(sample);return;}
      samples.push(timestamp-last);last=timestamp;
      if(timestamp-start<durationMs){requestAnimationFrame(sample);return;}
      const sorted=[...samples].sort((a,b)=>a-b),elapsedMs=timestamp-start;
      resolve({fps:samples.length*1000/elapsedMs,frames:samples.length,elapsedMs,frameTimeMedianMs:sorted[Math.floor(sorted.length*.5)],frameTimeP95Ms:sorted[Math.floor(sorted.length*.95)],method:'requestAnimationFrame while rendering seven fixed views',documentVisibility:document.visibilityState});
    }
    requestAnimationFrame(sample);
  });
}

window.lab={ready:false,setView(view){if(!CAMERA_PRESETS[view])throw Error(`Unknown view ${view}`);currentView=view;entries.forEach(configureCamera);updateUI();draw();},setRevision(revision){if(!['baseline','final'].includes(revision))throw Error('Unknown revision');currentRevision=revision;mountRevision(revision);},metrics,measureFPS,render:draw};
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>window.lab.setView(button.dataset.view)));
document.querySelectorAll('[data-revision]').forEach(button=>button.addEventListener('click',()=>window.lab.setRevision(button.dataset.revision)));
document.getElementById('wireframe').addEventListener('click',event=>{wireframe=!wireframe;event.currentTarget.setAttribute('aria-pressed',wireframe);applyWireframe();draw();});
try {
  stages=[makeStage('hands-viewport'),makeStage('shoe-viewport')];
  mountRevision('final');
  ready=true;window.lab.ready=true;
  const loop=()=>{if(ready)draw();requestAnimationFrame(loop);};requestAnimationFrame(loop);
}catch(error){const element=document.getElementById('error');element.hidden=false;element.textContent=`המעבדה לא נטענה: ${error.message}`;console.error(error);}
