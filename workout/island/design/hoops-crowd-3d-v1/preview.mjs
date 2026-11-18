import * as T from '../../vendor/three.module.js';
import {GLTFLoader} from '../../vendor/GLTFLoader.js';
import {createHoopsCrowd} from './runtime/crowd.mjs';
import {makeSeats,makeEnvironment,cameraPose} from './scene.mjs';

const $=id=>document.getElementById(id),canvas=$('scene');
document.body.classList.toggle('capture',new URLSearchParams(location.search).has('capture'));
const renderer=new T.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(1);renderer.outputColorSpace=T.SRGBColorSpace;
const scene=new T.Scene();scene.background=new T.Color('#151c22');
const camera=new T.PerspectiveCamera(40,1,.05,180),environment=makeEnvironment();scene.add(environment);
const cameraForward=new T.Vector3();
const seats=makeSeats(),ball=new T.Mesh(new T.IcosahedronGeometry(.12,1),new T.MeshBasicMaterial({color:'#ea8b45'}));scene.add(ball);
let crowd,baseline,gallery,mode='after',view='game',seconds=0,paused=false,busy=false,pose=-1,latest=null;
let previous=performance.now(),fpsStart=previous,frames=0,score=-100;

// Isolated reproduction of the current v8 spectator plane, dimensions,
// atlas UVs and motion. Same 800 review seats as the new crowd, no arena codec.
async function makeBaseline(){
  const texture=await new T.TextureLoader().loadAsync(new URL('../../assets/hoops-v8/arena/crowd.webp',import.meta.url).href);texture.colorSpace=T.SRGBColorSpace;
  const g=new T.PlaneGeometry(.66,1.10);g.translate(0,.54,.04);
  const tile=new Float32Array(800),phase=new Float32Array(800);
  const material=new T.MeshLambertMaterial({map:texture,alphaTest:.46,side:T.DoubleSide,depthWrite:true});material.forceSinglePass=true;
  const uniforms={arenaTime:{value:0},arenaCheer:{value:0},arenaStand:{value:0}};
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
attribute float spectatorTile,spectatorPhase;uniform float arenaTime,arenaCheer,arenaStand;varying float vSpectatorTile;`)
      .replace('#include <begin_vertex>',`#include <begin_vertex>
vSpectatorTile=spectatorTile;float upper=smoothstep(0.20,0.85,position.y);
transformed.x+=sin(arenaTime*1.4+spectatorPhase)*0.018*upper;
transformed.y+=sin(arenaTime*2.2+spectatorPhase)*0.009*upper*(1.0+arenaCheer*3.0)+arenaStand*0.16*upper;
transformed.y*=1.0+arenaStand*0.08*upper;`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float vSpectatorTile;')
      .replace('#include <map_fragment>',`#ifdef USE_MAP
vec2 tile=vec2(mod(vSpectatorTile,8.0),3.0-floor(vSpectatorTile/8.0));
vec2 atlasUv=(tile+vec2(0.018)+vMapUv*0.964)/vec2(8.0,4.0);
diffuseColor*=texture2D(map,atlasUv);
#endif`);
  };
  const mesh=new T.InstancedMesh(g,material,800),d=new T.Object3D();mesh.frustumCulled=false;
  seats.forEach((s,i)=>{
    d.position.set(s.x,s.y+.08,s.z);d.rotation.set(0,s.yaw,0);d.scale.setScalar(.93+(i*17%11)*.012);d.updateMatrix();mesh.setMatrixAt(i,d.matrix);
    mesh.setColorAt(i,new T.Color().setRGB(.75+(i%7)*.025,.75+(i%7)*.025,.75+(i%7)*.025));
    tile[i]=(i*13+Math.floor(i/9)*7)%32;phase[i]=i*2.39996;
  });
  g.setAttribute('spectatorTile',new T.InstancedBufferAttribute(tile,1));g.setAttribute('spectatorPhase',new T.InstancedBufferAttribute(phase,1));
  mesh.name='Before_v8_atlas_800';return {root:mesh,uniforms,metrics:{triangles:1600,draws:1,instances:800,submitted:[0,0,0],overlapping:0}};
}

function resize(){
  const r=canvas.getBoundingClientRect();renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;setCamera();
}
function setCamera(){
  const p=cameraPose(view,camera.aspect<1);camera.position.fromArray(p.position);camera.fov=p.fov;
  if(view==='gallery'&&camera.aspect<1)camera.position.z=30;
  if(view==='levels'&&camera.aspect<1)camera.position.z=11;
  camera.lookAt(...p.target);camera.updateProjectionMatrix();
  crowd?.setCamera(camera.position.toArray(),camera.getWorldDirection(cameraForward).toArray());
  $('view-label').textContent=$('camera').selectedOptions[0].textContent;
}
function setMode(next){mode=next;for(const name of ['before','after'])$(name).setAttribute('aria-pressed',String(mode===name));render();}

function buildGallery(){
  if(gallery){scene.remove(gallery);gallery.traverse(m=>{if(m.isMesh)m.material.dispose();});}
  gallery=new T.Group();gallery.name='VariantReview';const levels=view==='levels',variant=Number($('variant').value);
  const assets=crowd.manifest.assets.filter(a=>levels?a.variant===variant:a.level===0);
  for(const asset of assets){
    const source=crowd.sources[crowd.manifest.assets.indexOf(asset)],mesh=source.clone();mesh.material=source.material.clone();
    mesh.material.onBeforeCompile=shader=>{
      shader.uniforms.shirtTint={value:new T.Color($('home').value)};
      shader.vertexShader='attribute vec4 _part;uniform vec3 shirtTint;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <color_vertex>','#include <color_vertex>\nvColor.rgb*=mix(vec3(1.0),shirtTint,_part.y);');
    };
    mesh.material.customProgramCacheKey=()=> 'hoops-gallery-shirt-v1';
    mesh.position.set(levels?(asset.level-1)*1.5:(asset.variant%6-2.5)*1.6,levels?0:(asset.variant<6?1.9:0),0);
    mesh.rotation.y=Number($('yaw').value)*Math.PI/180;mesh.userData={asset};gallery.add(mesh);
  }
  scene.add(gallery);
}
function render(){
  if(!crowd)return;
  const isGallery=view==='gallery'||view==='levels';
  environment.visible=!isGallery;ball.visible=!isGallery;gallery.visible=isGallery;
  crowd.root.visible=!isGallery&&mode==='after';baseline.root.visible=!isGallery&&mode==='before';
  const age=seconds-score,cheer=age>=0&&age<3.2?Math.exp(-age*1.1):0;
  ball.position.set(Math.sin(seconds*.7)*9,1.5+Math.abs(Math.sin(seconds*1.1))*2,Math.sin(seconds*.4)*4);
  const reduced=$('reduced').checked;
  crowd.update({seconds,ballPosition:ball.position.toArray(),cameraPosition:camera.position.toArray(),cameraForward:camera.getWorldDirection(cameraForward).toArray(),pose,reducedMotion:reduced});
  baseline.uniforms.arenaTime.value=reduced?0:seconds;baseline.uniforms.arenaCheer.value=reduced?0:cheer;baseline.uniforms.arenaStand.value=cheer;
  if(isGallery)for(const mesh of gallery.children){
    const rest=pose<0?mesh.userData.asset.variant%3:pose;
    const cycle=reduced?0:.5-.5*Math.cos(seconds*17.45);
    mesh.morphTargetInfluences.splice(0,3,...(rest===1?[1,0,0]:rest===2?[0,1-cycle,cycle]:[0,0,0]));
    mesh.rotation.y=Number($('yaw').value)*Math.PI/180;
  }
  renderer.render(scene,camera);
  const metrics=isGallery?{triangles:gallery.children.reduce((s,m)=>s+m.userData.asset.triangles,0),draws:gallery.children.length,instances:gallery.children.length,submitted:[],overlapping:0}:mode==='after'?crowd.metrics:baseline.metrics;
  $('fans').textContent=metrics.instances;$('triangles').textContent=metrics.triangles.toLocaleString('en-US');$('draws').textContent=metrics.draws;
  document.querySelector('.live').textContent=`● ${metrics.instances} FANS`;
  $('lod').textContent=metrics.submitted.join(' / ')||'210 / 90 / 24';
  $('overlap').textContent=isGallery?'המודלים באותו קנה מידה':`${metrics.overlapping} אוהדים במעבר · נספרים בשתי הרמות`;
  $('gallery-caption').hidden=!isGallery;
  if(view==='levels')$('gallery-caption').textContent='משמאל לימין: LOD0 · 210 / LOD1 · 90 / LOD2 · 24';
  else $('gallery-caption').textContent='01–06 ישיבה בשורה העליונה · 07–12 עמידה · למטה / למעלה / מחיאות';
  return {...metrics,sceneTriangles:renderer.info.render.triangles,sceneDraws:renderer.info.render.calls};
}
function setView(next){view=next;$('camera').value=next;buildGallery();setCamera();return render();}

const raf=()=>new Promise(r=>requestAnimationFrame(r));
async function benchmark({warmup=12,samples=60}={}){
  if(busy)throw Error('Measurement already running');
  if(view==='gallery'||view==='levels')setView('game');
  resize();
  const saved={mode,paused,seconds};busy=true;$('benchmark').disabled=true;const runs=[];
  try{
    for(const next of ['before','after','after','before']){
      mode=next;seconds=0;score=.4;crowd.onBasket({seconds:.4});
      for(let i=0;i<warmup;i++){await raf();seconds+=1/60;render();}
      const dt=[],submit=[];let last=await raf(),metrics;
      for(let i=0;i<samples;i++){
        const now=await raf();dt.push(now-last);last=now;
        seconds=(warmup+i)/60;const start=performance.now();metrics=render();submit.push(performance.now()-start);
        $('status').textContent=`מדידה ${runs.length+1}/4 · ${i+1}/${samples} · ${next==='before'?'לפני':'אחרי'}`;
      }
      const sorted=[...dt].sort((a,b)=>a-b),sum=dt.reduce((a,b)=>a+b,0);
      runs.push({mode:next,frames:samples,elapsedMs:sum,fps:samples*1000/sum,frameP50:sorted[Math.floor(samples*.5)],frameP95:sorted[Math.floor(samples*.95)],frameIntervalsMs:dt,submitMs:submit,...metrics});
    }
    const gl=renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');
    const result={method:'RAF ABBA; equal fixed animation timeline; basket at 0.4 s; no hardware GPU claim',date:new Date().toISOString(),view,canvas:{width:canvas.width,height:canvas.height,dpr:renderer.getPixelRatio()},warmup,samples,
      renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),userAgent:navigator.userAgent,runs};
    result.summary=['before','after'].map(mode=>{const a=runs.filter(r=>r.mode===mode);return {mode,fps:a.reduce((s,r)=>s+r.frames,0)*1000/a.reduce((s,r)=>s+r.elapsedMs,0),triangles:a[0].triangles,draws:a[0].draws,sceneTriangles:a[0].sceneTriangles,sceneDraws:a[0].sceneDraws,submitted:a[0].submitted,overlapping:a[0].overlapping};});
    latest=result;$('download').disabled=false;$('result').textContent=result.summary.map(s=>`${s.mode==='before'?'לפני':'אחרי'}: ${s.fps.toFixed(2)} FPS · ${s.triangles.toLocaleString('en-US')} משולשי קהל · ${s.draws} קריאות`).join('\n');return result;
  }finally{mode=saved.mode;paused=saved.paused;seconds=saved.seconds;busy=false;$('benchmark').disabled=false;$('status').textContent='800 אוהדים · כל הגאומטריה, כולל מעבר LOD, נספרת';previous=performance.now();render();}
}

async function init(){
  crowd=await createHoopsCrowd({T,GLTFLoader,seats});baseline=await makeBaseline();scene.add(crowd.root,baseline.root);
  for(let i=0;i<12;i++){const o=document.createElement('option');o.value=i;o.textContent=`${String(i+1).padStart(2,'0')} · ${i<6?'יושב':'עומד'} · ${['למטה','למעלה','מוחא'][i%3]}`;$('variant').append(o);}
  buildGallery();resize();render();$('status').textContent='800 אוהדים · כל הגאומטריה, כולל מעבר LOD, נספרת';
  window.hoopsCrowd={renderer,scene,camera,crowd,baseline,seats,render,setMode,setView,benchmark,
    setTime(t){seconds=t;return render();},pause(value=true){paused=value;},
    basket(team=-1){score=seconds;crowd.onBasket({seconds,team});render();},
    state(){return {mode,view,seconds,paused,...render()};}};
  for(const name of ['before','after'])$(name).onclick=()=>setMode(name);
  $('camera').onchange=()=>setView($('camera').value);
  $('basket').onclick=()=>window.hoopsCrowd.basket();
  $('pause').onclick=()=>{paused=!paused;$('pause').setAttribute('aria-pressed',String(paused));$('pause').textContent=paused?'המשך':'השהיה';};
  $('pose').onchange=()=>{pose=Number($('pose').value);render();};
  for(const id of ['home','away'])$(id).oninput=()=>{crowd.setTeamColors($('home').value,$('away').value);buildGallery();render();};
  $('variant').onchange=()=>{if(view!=='levels')setView('levels');else{buildGallery();render();}};
  $('yaw').oninput=()=>render();$('reduced').onchange=()=>render();
  $('benchmark').onclick=()=>benchmark().catch(e=>{$('status').textContent=e.message;});
  $('download').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(latest,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='hoops-crowd-measurement.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),0);};
  new ResizeObserver(()=>{if(!busy){resize();render();}}).observe(canvas.parentElement);
}
function tick(now){
  if(!busy&&crowd){if(!paused)seconds+=Math.min(.1,(now-previous)/1000);render();frames++;
    if(now-fpsStart>1000){$('fps').textContent=(frames*1000/(now-fpsStart)).toFixed(1);frames=0;fpsStart=now;}}
  previous=now;requestAnimationFrame(tick);
}
init().then(()=>requestAnimationFrame(tick)).catch(error=>{$('status').textContent=`הטעינה נכשלה: ${error.message}`;console.error(error);});
