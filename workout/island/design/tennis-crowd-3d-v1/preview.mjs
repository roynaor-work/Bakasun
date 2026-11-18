import * as T from '../../vendor/three.module.js';
import {GLTFLoader} from '../../vendor/GLTFLoader.js';
import {createCrowd} from './runtime/crowd.mjs';

const $ = id => document.getElementById(id);
const canvas = $('view');
const renderer = new T.WebGLRenderer({canvas, antialias:true, powerPreference:'high-performance'});
renderer.setPixelRatio(1); // Fixed for reproducible software-renderer comparison.
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.toneMapping = T.NoToneMapping;
const scene = new T.Scene();
scene.background = new T.Color('#bed0ce');
scene.add(new T.HemisphereLight('#f2f4e9','#68736c',2));
const sun = new T.DirectionalLight('#fff1d7',2);
sun.position.set(-12,20,10); scene.add(sun);
const camera = new T.PerspectiveCamera(40.3,1,.1,200);
const views = {
  landscape:{position:[0,12.8,25],target:[0,.4,-.7],label:'מצלמת המשחק — רוחב'},
  portrait:{position:[0,18,25],target:[0,.4,-.7],label:'מצלמת המשחק — גובה'},
  side:{position:[24,10,3],target:[-3,1,0],label:'מבט צד — עומק הישיבה והגוף'},
  rear:{position:[0,8,28],target:[0,1,13.7],label:'מאחורי היציע — נפח הראש, הגב והזרועות'},
  close:{position:[2.7,3,7.5],target:[-1,1.4,12.8],label:'תקריב — ידיים, תסרוקות וגווני עור'},
  roster:{position:[0,2.2,5.6],target:[0,.85,-.5],label:'12 דמויות — גוף, גובה וצבע'}
};
const params = new URLSearchParams(location.search);
let cameraName = 'landscape', mode = '3d', elapsed = 0, manualCheer = 0, benchmarking = false;
const placements = [-1,1].flatMap(sign => [-10,0,10].map(z => ({x:sign*10.4,z,yaw:-sign*Math.PI/2})))
  .concat([-1,1].flatMap(sign => [-5,5].map(x => ({x,z:sign*19.5,yaw:sign<0?Math.PI:0}))));
const fitZ = z => Math.abs(z)>=5 ? Math.sign(z)*(Math.abs(z)-2.885) : z;
const seats = [];
for(const p of placements) for(let row=0;row<5;row++) for(let col=0;col<12;col++) {
  const x = col<6 ? -4.5+col*.7 : .95+(col-6)*.7, z = .48+row*.88-.06;
  seats.push({id:seats.length,x:p.x+Math.cos(p.yaw)*x+Math.sin(p.yaw)*z,
    y:.28+row*.42-.025,z:fitZ(p.z)-Math.sin(p.yaw)*x+Math.cos(p.yaw)*z,
    yaw:p.yaw+Math.PI,row,col});
}
const environment = new T.Group(); scene.add(environment);
function box(size,position,color) {
  const mesh = new T.Mesh(new T.BoxGeometry(...size),new T.MeshBasicMaterial({color}));
  mesh.position.set(...position); environment.add(mesh); return mesh;
}
box([50,.12,60],[0,-.15,0],'#667c73');
box([15,.08,26],[0,-.04,0],'#55927d');
box([8.23,.04,18],[0,.03,0],'#527da0');
const linePoints = [];
function line(a,b) {linePoints.push(...a,...b);}
for(const x of [-4.115,4.115]) line([x,.065,-9],[x,.065,9]);
for(const z of [-9,9]) line([-4.115,.065,z],[4.115,.065,z]);
for(const z of [-5.3,5.3]) line([-4.115,.065,z],[4.115,.065,z]);
line([0,.065,-5.3],[0,.065,5.3]);
const lines = new T.BufferGeometry();lines.setAttribute('position',new T.Float32BufferAttribute(linePoints,3));
environment.add(new T.LineSegments(lines,new T.LineBasicMaterial({color:'#e3e7d9'})));
box([10,.045,.045],[0,.91,0],'#e1e4d4');
box([.06,.91,.06],[-5,.455,0],'#2f4744');box([.06,.91,.06],[5,.455,0],'#2f4744');
for(let i=-24;i<=24;i++)box([.015,.85,.015],[i*.2,.43,0],'#3e5755');
const ball = new T.Mesh(new T.IcosahedronGeometry(.13,1),new T.MeshBasicMaterial({color:'#eff58f'}));scene.add(ball);
const loader = new GLTFLoader(), existing = new URL('../../assets/tennis-stadium-v1/',import.meta.url);
const dependencies = [];
let crowd, baseline, roster;
const status = {ready:false, errors:[], modelsLoaded:0, softwareRenderer:null, benchmark:null};
window.crowdPreview = {status};

function selectCamera(name) {
  if(!views[name]) throw new Error(`Unknown camera: ${name}`);
  cameraName=name;const v=views[name];camera.position.fromArray(v.position);camera.lookAt(...v.target);camera.updateProjectionMatrix();
  $('caption').textContent=v.label;
  document.querySelectorAll('[data-camera]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.camera===name)));
  if(crowd) crowd.root.visible=name!=='roster'&&mode==='3d';
  if(baseline) baseline.visible=name!=='roster'&&mode==='atlas';
  if(roster) roster.root.visible=name==='roster';
  environment.visible=name!=='roster';
  ball.visible=name!=='roster';
}
function selectMode(next) {
  if(!['3d','atlas'].includes(next))throw new Error('Unknown mode');
  mode=next;$('baseline').checked=next==='atlas';selectCamera(cameraName);
  $('triangles').textContent=(mode==='3d'?126000:1200).toLocaleString('he-IL');
  $('draws').textContent=mode==='3d'?'12':'1';
}

async function loadStand() {
  const gltf = await loader.loadAsync(new URL('stand-10m.glb',existing).href);
  dependencies.push('existing:stand-10m.glb');gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse(source=>{
    if(!source.isMesh)return;
    const mesh=new T.InstancedMesh(source.geometry,source.material,10),dummy=new T.Object3D(),m=new T.Matrix4();
    placements.forEach((p,i)=>{dummy.position.set(p.x,0,fitZ(p.z));dummy.rotation.y=p.yaw;dummy.updateMatrix();
      m.multiplyMatrices(dummy.matrix,source.matrixWorld);mesh.setMatrixAt(i,m);});
    mesh.frustumCulled=false;environment.add(mesh);
  });
}
async function loadBaseline() {
  const atlas=await new T.TextureLoader().loadAsync(new URL('crowd-atlas.webp',existing).href);
  dependencies.push('existing:crowd-atlas.webp');atlas.colorSpace=T.SRGBColorSpace;
  atlas.generateMipmaps=false;atlas.minFilter=atlas.magFilter=T.LinearFilter;
  const geometry=new T.PlaneGeometry(.88,1.76);geometry.translate(0,.88,0);
  geometry.setAttribute('cell',new T.InstancedBufferAttribute(new Float32Array(seats.flatMap(s=>[(s.id*7+s.row*3)%8,((s.id*47)%101)/101])),2));
  geometry.setAttribute('shade',new T.InstancedBufferAttribute(new Float32Array(seats.map(s=>.85-s.row*.04+(s.id%7)*.017)),1));
  const cheer={value:0},clock={value:0},material=new T.MeshBasicMaterial({map:atlas,side:T.DoubleSide,alphaTest:.5,color:'#b0c0cf'});
  material.onBeforeCompile=shader=>{
    shader.uniforms.uCheer=cheer;shader.uniforms.uTime=clock;
    shader.vertexShader=shader.vertexShader.replace('#include <uv_pars_vertex>','#include <uv_pars_vertex>\nattribute vec2 cell; attribute float shade; uniform float uCheer; uniform float uTime; varying vec2 vCellUv; varying float vShade;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nfloat ph=cell.y*6.2831; float up=position.y/1.76; float cheerNow=step(cell.y,uCheer); transformed.x+=sin(uTime*1.6+ph)*0.05*up; transformed.y+=cheerNow*abs(sin(uTime*7.0+ph*3.0))*0.12*uCheer; transformed.y+=sin(uTime*2.1+ph*2.0)*0.012*up;')
      .replace('#include <uv_vertex>','#include <uv_vertex>\nfloat idx=cell.x*2.0+step(cell.y,uCheer); float col=mod(idx,8.0); float row=floor(idx/8.0); vec2 safeUv=mix(vec2(1.0/128.0,1.0/256.0),vec2(127.0/128.0,255.0/256.0),uv); vCellUv=(vec2(col,1.0-row-1.0)+safeUv)*vec2(1.0/8.0,1.0/2.0); vShade=shade*mix(0.58,1.0,smoothstep(0.0,0.55,uv.y));');
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_pars_fragment>','#include <map_pars_fragment>\nvarying vec2 vCellUv; varying float vShade;').replace('#include <map_fragment>','diffuseColor*=texture2D(map,vCellUv); diffuseColor.rgb*=vShade;');
  };
  material.customProgramCacheKey=()=>'crowd-preview-existing-atlas';
  const mesh=new T.InstancedMesh(geometry,material,600),dummy=new T.Object3D();
  seats.forEach((s,i)=>{
    const hash=n=>{const r=Math.sin(i*n)*43758.5453;return r-Math.floor(r);};
    const jitter=hash(12.9898),scale=.92+hash(78.233)*.2;
    const toCamera=Math.atan2(-s.x,25-s.z),delta=Math.atan2(Math.sin(toCamera-s.yaw),Math.cos(toCamera-s.yaw));
    dummy.position.set(s.x,s.y,s.z);dummy.rotation.y=s.yaw+delta*.6+(jitter-.5)*.7;
    dummy.scale.setScalar(scale);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
  });
  mesh.frustumCulled=false;mesh.userData={cheer,clock};return mesh;
}

function resize(){const w=canvas.clientWidth,h=canvas.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
new ResizeObserver(resize).observe(canvas);resize();selectCamera(params.get('camera')||'landscape');
function render(seconds=elapsed,celebration=0){
  const bp=[Math.sin(seconds*.8)*3.6,1.2+Math.abs(Math.sin(seconds*1.7))*1.6,Math.sin(seconds*.65)*7.8];
  ball.position.fromArray(bp);crowd.update({seconds,celebration,ballPosition:bp});
  roster?.update({seconds,celebration,ballPosition:[0,2,10]});
  baseline.userData.cheer.value=celebration;baseline.userData.clock.value=seconds;
  renderer.render(scene,camera);
}
const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
async function measure(selectedMode,{warmup=30,samples=120}={}){
  selectMode(selectedMode);
  for(let i=0;i<warmup;i++){await nextFrame();render(i/60,.75);}
  const raf=[],submit=[],draws=[],tris=[];let previous=performance.now();
  for(let i=0;i<samples;i++){
    await nextFrame();const start=performance.now();raf.push(start-previous);previous=start;
    render(i/60,.75);submit.push(performance.now()-start);
    draws.push(renderer.info.render.calls);tris.push(renderer.info.render.triangles);
  }
  const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
  const mean=values=>values.reduce((a,b)=>a+b,0)/values.length;
  return {mode:selectedMode,samples,warmup,fps:1000/mean(raf),medianFrameMs:median(raf),
    p95FrameMs:[...raf].sort((a,b)=>a-b)[Math.floor(raf.length*.95)],
    medianSubmitMs:median(submit),sceneDrawCalls:median(draws),sceneTriangles:median(tris),
    crowdTriangles:selectedMode==='3d'?crowd.metrics.triangles:1200,crowdDrawCalls:selectedMode==='3d'?12:1};
}
async function benchmark(options={}){
  if(benchmarking)throw new Error('Benchmark already running');benchmarking=true;
  const oldMode=mode,oldCamera=cameraName;selectCamera(options.camera||'landscape');
  $('benchmark').disabled=true;$('status').textContent='מודד את האטלס הקיים ואת קהל התלת־ממד באותם תנאים…';
  try{
    const runs=[];for(const selected of options.order||['atlas','3d','3d','atlas'])runs.push(await measure(selected,options));
    const result={date:new Date().toISOString(),userAgent:navigator.userAgent,renderer:status.softwareRenderer,
      camera:cameraName,viewport:[canvas.width,canvas.height],devicePixelRatio:1,runs,
      note:'Crowd A/B in the same preview scene, not a full-game or phone benchmark. RAF FPS includes vsync; submit time is CPU submission, not GPU time.'};
    status.benchmark=result;$('results').hidden=false;$('results').textContent=JSON.stringify(result,null,2);
    $('status').textContent='המדידה הושלמה. ההשוואה היא לאותו יציע בתצוגה זו.';return result;
  }finally{benchmarking=false;$('benchmark').disabled=false;selectCamera(oldCamera);selectMode(oldMode);}
}
window.crowdPreview.benchmark=benchmark;
window.crowdPreview.setCamera=selectCamera;
window.crowdPreview.setMode=selectMode;
window.crowdPreview.frame=({seconds=0,celebration=0}={})=>render(seconds,celebration);
window.crowdPreview.pause=false;
document.querySelectorAll('[data-camera]').forEach(b=>b.onclick=()=>selectCamera(b.dataset.camera));
$('baseline').onchange=e=>selectMode(e.target.checked?'atlas':'3d');
$('cheer').onclick=()=>{manualCheer=3;};
$('benchmark').onclick=()=>benchmark().catch(e=>{$('status').textContent=e.message;});
try{
  await loadStand();
  crowd=await createCrowd({T,GLTFLoader,seats});scene.add(crowd.root);
  status.modelsLoaded=crowd.manifest.assets.length;
  baseline=await loadBaseline();scene.add(baseline);
  // Separate 12-instance group for art inspection; hidden in every 600-fan view.
  roster=await createCrowd({T,GLTFLoader,seats:Array.from({length:12},(_,id)=>({id,x:(id%6-2.5)*.95,y:0,z:Math.floor(id/6)*-1.6,yaw:0}))});scene.add(roster.root);
  const ext=renderer.getContext().getExtension('WEBGL_debug_renderer_info');
  status.softwareRenderer=ext?renderer.getContext().getParameter(ext.UNMASKED_RENDERER_WEBGL):'not exposed';
  Object.assign(status,{ready:true,dependencies,metrics:crowd.metrics,wasmBlocked:!document.querySelector('meta[http-equiv="Content-Security-Policy"]').content.includes('wasm-unsafe-eval')});
  $('fans').textContent='600';$('weight').textContent=(crowd.manifest.payloadBytes/1000).toFixed(1);
  selectMode('3d');selectCamera(params.get('camera')||'landscape');
  $('status').textContent='כל 12 המודלים נטענו. הראש עוקב אחר הכדור; בחגיגה הידיים עולות ונוספת קפיצה קלה.';
  let previous=performance.now(),fpsStart=previous,frameCount=0;
  function tick(now){requestAnimationFrame(tick);if(benchmarking||window.crowdPreview.pause){previous=now;return;}
    const dt=Math.min((now-previous)/1000,.1);previous=now;elapsed+=dt;manualCheer=Math.max(0,manualCheer-dt);
    const periodic=$('auto').checked&&elapsed%9>6?Math.min(1,(elapsed%9-6)*2,(9-elapsed%9)*2):0;
    render(elapsed,Math.max(periodic,Math.min(1,manualCheer)));frameCount++;
    if(now-fpsStart>600){$('fps').textContent=(frameCount*1000/(now-fpsStart)).toFixed(1);frameCount=0;fpsStart=now;}
  }
  render();requestAnimationFrame(tick);
}catch(error){status.errors.push(String(error));$('status').textContent=`טעינה נכשלה: ${error.message}`;console.error(error);}
