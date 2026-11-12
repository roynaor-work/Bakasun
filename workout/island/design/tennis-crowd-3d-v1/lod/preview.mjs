import * as T from '../../../vendor/three.module.js';
import {GLTFLoader} from '../../../vendor/GLTFLoader.js';
import {createCrowd} from '../runtime/crowd.mjs';
import {createLODCrowd} from './runtime/crowd-lod.mjs';
import {seats,environment,ball,loadStand} from './scene.mjs';

const $=id=>document.getElementById(id), fmt=n=>Math.round(n).toLocaleString('he-IL');
const labels={landscape:'משחק · רוחב',portrait:'משחק · גובה',side:'צד',rear:'מאחור',close:'תקריב'};
const canvas=$('view'),renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(1);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.NoToneMapping;
const scene=new T.Scene();scene.background=new T.Color('#bed0ce');scene.add(environment,ball);
scene.add(new T.HemisphereLight('#f2f4e9','#68736c',2));
const sun=new T.DirectionalLight('#fff1d7',2);sun.position.set(-12,20,10);scene.add(sun);
const camera=new T.PerspectiveCamera(40.3,1,.1,200);
const status={ready:false,errors:[],benchmark:null}, api={status,pause:false};
window.lodPreview=api;
let before,after,cameraName='landscape',mode='after',elapsed=0,manualCheer=0,benchmarking=false,downloadURL;
let savedRows=[],localRows=[];

function resize(){renderer.setSize(canvas.clientWidth,canvas.clientHeight,false);camera.aspect=canvas.width/canvas.height;camera.updateProjectionMatrix();}
new ResizeObserver(resize).observe(canvas);resize();
function showMetrics(){
  const m=mode==='before'?before.metrics:after.metrics;
  $('triangles').textContent=fmt(m.triangles);$('draws').textContent=m.draws;
  $('distribution').textContent=mode==='before'?'LOD0: 600 · LOD1: 0 · LOD2: 0':
    `LOD0: ${m.submitted[0]} · LOD1: ${m.submitted[1]} · LOD2: ${m.submitted[2]} · ${m.overlapping} אוהדים במעבר · מקדם מרחק ${m.scale.toFixed(3)}`;
}
function setMode(next){
  if(!['before','after'].includes(next))throw new Error(`Unknown mode ${next}`);
  mode=next;$('mode').value=mode;before.root.visible=mode==='before';after.root.visible=mode==='after';showMetrics();
}
function setCamera(name){
  if(!after.config.cameras[name])throw new Error(`Unknown camera ${name}`);
  cameraName=name;const view=after.config.cameras[name];
  camera.position.fromArray(view.position);camera.lookAt(...view.target);camera.updateProjectionMatrix();
  after.setCamera(camera.position.toArray());$('caption').textContent=labels[name];$('travel').value='0';
  document.querySelectorAll('[data-camera]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.camera===name)));
  showMetrics();
}
function render(seconds=elapsed,celebration=0){
  const bp=[Math.sin(seconds*.8)*3.6,1.2+Math.abs(Math.sin(seconds*1.7))*1.6,Math.sin(seconds*.65)*7.8];
  ball.position.fromArray(bp);
  if(mode==='before')before.update({seconds,celebration,ballPosition:bp});
  else after.update({seconds,celebration,ballPosition:bp,cameraPosition:camera.position.toArray()});
  renderer.render(scene,camera);
  return {sceneTriangles:renderer.info.render.triangles,sceneDrawCalls:renderer.info.render.calls,
    crowdTriangles:mode==='before'?before.metrics.triangles:after.metrics.triangles,
    crowdDrawCalls:mode==='before'?before.metrics.draws:after.metrics.draws};
}
const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
async function measure(selectedMode,{warmup=30,samples=120}={}){
  setMode(selectedMode);
  for(let i=0;i<warmup;i++){await nextFrame();render(i/60,.75);}
  const frames=[],submits=[],counts=[];let previous=performance.now();
  for(let i=0;i<samples;i++){
    await nextFrame();const start=performance.now();frames.push(start-previous);previous=start;
    counts.push(render(i/60,.75));submits.push(performance.now()-start);
  }
  const percentile=(values,p)=>[...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor(values.length*p))];
  const mean=values=>values.reduce((a,b)=>a+b,0)/values.length;
  return {camera:cameraName,mode:selectedMode,warmup,samples,fps:1000/mean(frames),
    medianFrameMs:percentile(frames,.5),p95FrameMs:percentile(frames,.95),medianSubmitMs:percentile(submits,.5),
    ...counts[0],minSceneTriangles:Math.min(...counts.map(c=>c.sceneTriangles)),maxSceneTriangles:Math.max(...counts.map(c=>c.sceneTriangles)),
    submitted:selectedMode==='before'?[600,0,0]:[...after.metrics.submitted],
    distanceScale:selectedMode==='before'?1:after.metrics.scale,frameIntervalsMs:frames};
}
function drawTable(){
  $('measurements').replaceChildren();
  for(const r of [...savedRows,...localRows]){
    const tr=document.createElement('tr');
    const values=[labels[r.camera]??r.camera,(r.mode==='before'?'לפני':'אחרי')+(r.local?' · מקומי':''),
      r.submitted.join(' / '),fmt(r.crowdTriangles),r.crowdDrawCalls,fmt(r.sceneTriangles),r.sceneDrawCalls,r.fps.toFixed(2)];
    for(const value of values){const td=document.createElement('td');td.textContent=value;tr.append(td);}
    $('measurements').append(tr);
  }
}
async function benchmark(options={}){
  if(benchmarking)throw new Error('Measurement already running');
  benchmarking=true;$('benchmark').disabled=true;
  document.querySelectorAll('button[data-camera],select,input').forEach(el=>el.disabled=true);
  const oldCamera=cameraName,oldMode=mode,oldPosition=camera.position.clone(),oldQuaternion=camera.quaternion.clone(),oldTravel=$('travel').value;
  try {
    setCamera(options.camera??cameraName);const runs=[];
    for(const selected of options.order??['before','after','after','before']){
      $('status').textContent=`מודד ${labels[cameraName]} · ${selected==='before'?'לפני':'אחרי'} · ${runs.length+1}/4`;
      runs.push(await measure(selected,options));
    }
    const result={date:new Date().toISOString(),camera:cameraName,viewport:[canvas.width,canvas.height],
      devicePixelRatio:1,userAgent:navigator.userAgent,renderer:status.renderer,runs,
      note:'Same asset-preview scene, 600 fans, software rendering. RAF FPS includes vsync. No phone/full-game claim.'};
    status.benchmark=result;
    for(const selected of ['before','after']){
      const group=runs.filter(r=>r.mode===selected);
      localRows.push({...group[0],fps:group.reduce((n,r)=>n+r.samples,0)/group.reduce((n,r)=>n+r.samples/r.fps,0),local:true});
    }
    drawTable();if(downloadURL)URL.revokeObjectURL(downloadURL);
    downloadURL=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'}));
    $('download').href=downloadURL;$('download').hidden=false;$('status').textContent='המדידה הושלמה.';return result;
  } finally {
    benchmarking=false;$('benchmark').disabled=false;
    document.querySelectorAll('button[data-camera],select,input').forEach(el=>el.disabled=false);
    setCamera(oldCamera);camera.position.copy(oldPosition);camera.quaternion.copy(oldQuaternion);$('travel').value=oldTravel;
    after.setCamera(camera.position.toArray());setMode(oldMode);
  }
}

// A second, static renderer redraws only on gallery interaction. It does no work
// during crowd benchmarks, so the comparison contains only the crowd scene.
let galleryRenderer,galleryScene,galleryCamera,galleryModels=[];
function drawGallery(){
  if(!galleryRenderer)return;
  const levelCanvas=$('levels');galleryRenderer.setSize(levelCanvas.clientWidth,levelCanvas.clientHeight,false);
  const variant=Number($('variant').value),yaw=Number($('yaw').value)*Math.PI/180,arms=Number($('arms').value)/100;
  galleryModels.forEach(({mesh,asset})=>{
    mesh.rotation.y=yaw;
    mesh.morphTargetInfluences[0]=arms;
  });
  galleryRenderer.setScissorTest(true);
  for(let level=0;level<3;level++){
    const left=Math.floor(level*levelCanvas.width/3),right=Math.floor((level+1)*levelCanvas.width/3);
    galleryRenderer.setViewport(left,0,right-left,levelCanvas.height);
    galleryRenderer.setScissor(left,0,right-left,levelCanvas.height);
    galleryCamera.aspect=(right-left)/levelCanvas.height;galleryCamera.updateProjectionMatrix();
    galleryModels.forEach(({mesh,asset})=>mesh.visible=asset.variant===variant&&asset.level===level);
    galleryRenderer.render(galleryScene,galleryCamera);
  }
}
function initGallery(){
  galleryRenderer=new T.WebGLRenderer({canvas:$('levels'),antialias:true});galleryRenderer.setPixelRatio(1);
  galleryRenderer.outputColorSpace=T.SRGBColorSpace;galleryRenderer.toneMapping=T.NoToneMapping;
  galleryScene=new T.Scene();galleryScene.background=new T.Color('#c6d6cf');
  galleryCamera=new T.PerspectiveCamera(34,1,.1,50);galleryCamera.position.set(0,1.65,5.1);galleryCamera.lookAt(0,.85,0);
  for(let i=0;i<12;i++){const option=document.createElement('option');option.value=i;option.textContent=String(i+1).padStart(2,'0');$('variant').append(option);}
  for(const [i,source] of after.sources.entries()){
    const asset=after.manifest.assets[i],mesh=new T.Mesh(source.geometry,source.material);
    galleryScene.add(mesh);galleryModels.push({mesh,asset});
  }
  new ResizeObserver(()=>{if(!benchmarking)drawGallery();}).observe($('levels'));
  for(const id of ['variant','yaw','arms'])$(id).oninput=drawGallery;
  drawGallery();
}

Object.assign(api,{benchmark,setCamera,setMode,frame:({seconds=0,celebration=0}={})=>render(seconds,celebration),
  getMetrics:()=>({...after.metrics}),
  cameraAt(position,target=[0,.4,-.7]){camera.position.fromArray(position);camera.lookAt(...target);after.setCamera(position);showMetrics();},
  gallery:({variant=0,yaw=0,arms=0}={})=>{$('variant').value=variant;$('yaw').value=yaw;$('arms').value=arms*100;drawGallery();}});
try {
  await loadStand();
  before=await createCrowd({T,GLTFLoader,seats,base:new URL('../',import.meta.url)});scene.add(before.root);
  after=await createLODCrowd({T,GLTFLoader,seats});scene.add(after.root);
  const gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
  status.renderer=ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'not exposed';
  status.modelsLoaded=after.sources.length;status.payloadBytes=after.manifest.payloadBytes;
  $('machine').textContent=`Live renderer: ${status.renderer}`;
  setCamera(new URLSearchParams(location.search).get('camera')??'landscape');setMode('after');initGallery();
  for(let variant=0;variant<12;variant++){
    const tr=document.createElement('tr'),assets=after.manifest.assets.filter(a=>a.variant===variant);
    for(const value of [String(variant+1).padStart(2,'0'),...assets.map(a=>a.triangles),fmt(assets.reduce((n,a)=>n+a.bytes,0))]){
      const td=document.createElement('td');td.textContent=value;tr.append(td);
    }$('assets').append(tr);
  }
  const response=await fetch('measurements.json');
  if(response.ok){const saved=await response.json();savedRows=saved.summary??[];drawTable();
    if(saved.renderer)$('machine').textContent=`Recorded: ${saved.renderer} · ${saved.browserVersion} · ${saved.viewport.join('×')} · DPR 1`;}
  document.querySelectorAll('[data-camera]').forEach(b=>b.onclick=()=>setCamera(b.dataset.camera));
  $('mode').onchange=e=>setMode(e.target.value);$('cheer').onclick=()=>manualCheer=3;
  $('benchmark').onclick=()=>benchmark().catch(error=>$('status').textContent=error.message);
  $('travel').oninput=()=>{
    const t=Number($('travel').value)/100,base=after.config.cameras[cameraName];
    const destination=after.config.cameras[cameraName==='rear'?'side':'rear'];
    camera.position.fromArray(base.position.map((v,i)=>v+(destination.position[i]-v)*t));
    camera.lookAt(...base.target.map((v,i)=>v+(destination.target[i]-v)*t));
    after.setCamera(camera.position.toArray());showMetrics();
  };
  let previous=performance.now(),fpsStart=previous,frames=0;
  function tick(now){
    requestAnimationFrame(tick);
    if(benchmarking||api.pause){previous=now;return;}
    const dt=Math.min((now-previous)/1000,.1);previous=now;elapsed+=dt;manualCheer=Math.max(0,manualCheer-dt);
    const periodic=$('auto').checked&&elapsed%9>6?Math.min(1,(elapsed%9-6)*2,(9-elapsed%9)*2):0;
    render(elapsed,Math.max(periodic,Math.min(1,manualCheer)));frames++;
    if(now-fpsStart>600){$('fps').textContent=(frames*1000/(now-fpsStart)).toFixed(1);fpsStart=now;frames=0;}
  }
  render();status.ready=true;$('status').textContent='36 מודלים נטענו. כל 600 האוהדים מוצגים; התקציב כולל גם את המעברים.';requestAnimationFrame(tick);
}catch(error){status.errors.push(String(error));$('status').textContent=`טעינה נכשלה: ${error.message}`;console.error(error);}
