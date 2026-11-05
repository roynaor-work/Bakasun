import * as THREE from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {DRACOLoader} from '../vendor/draco/DRACOLoader.js';
import {createOcean,createAtmosphere,createWake,waveHeight} from './ocean.js';
import {createEffects,createRain} from './effects.js';
import {createCrew} from './crew.js';
import {createSkyProbes} from './lighting.js';

const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const CONFIG={
 corvette:{length:32,beam:6.3,deck:1.85,name:'שחף',label:'קורבטה',en:'CORVETTE',code:'K—12'},
 destroyer:{length:50,beam:8.4,deck:2.45,name:'סער',label:'משחתת',en:'DESTROYER',code:'D—04'},
 cruiser:{length:66,beam:10.6,deck:3,name:'צור',label:'סיירת',en:'CRUISER',code:'C—07'},
 carrier:{length:82,beam:18.6,deck:4.2,name:'אופק',label:'נושאת',en:'CARRIER',code:'H—03'},
};
const embedded=JSON.parse(document.getElementById('naval-assets').textContent);
const bytes=key=>{const str=atob(embedded[key]),a=new Uint8Array(str.length);for(let i=0;i<str.length;i++)a[i]=str.charCodeAt(i);return a;};
const dataURL=key=>'data:image/png;base64,'+embedded[key];
const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const state={ship:'cruiser',fleet:'tide',weather:'sunset',view:'near',quality:'balanced',adaptiveScale:1,paused:reduced,reduced,crew:true,time:0,frozen:false,theta:.79,elevation:.28,zoom:1,storm:0,loading:true};
const adaptationEvents=[];let lastAdaptation=0;
const frames=[];let lastStats=0,elapsed=0,raf=0,disposed=false,lastFrame=0,fireCooldown=0,flashUntil=0,sourceHashes={};
let contextLost=false,contextRestores=0;
const objects=[],vessels=[],textures=[],materials=[],geometries=[];
const scene=new THREE.Scene();scene.fog=new THREE.FogExp2('#4d656e',.0017);
const camera=new THREE.PerspectiveCamera(43,1,.5,2600);
const canvas=$('#sea');let renderer;
try{
 renderer=new THREE.WebGLRenderer({canvas,antialias:false,alpha:false,powerPreference:'high-performance'});
}catch(error){
 $('#loading-progress').textContent='נדרש דפדפן עם WebGL. נסו להפעיל האצת חומרה ולפתוח שוב.';
 window.naval={ready:false,error:String(error)};throw error;
}
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.setClearColor('#57717e');
const sun=new THREE.DirectionalLight('#ffd5a0',3.1);sun.position.set(-90,67,75);sun.castShadow=true;
sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-58;sun.shadow.camera.right=58;sun.shadow.camera.top=58;sun.shadow.camera.bottom=-58;sun.shadow.camera.near=1;sun.shadow.camera.far=240;sun.shadow.normalBias=.15;sun.shadow.bias=-.0003;sun.shadow.radius=2;scene.add(sun,sun.target);
const fill=new THREE.HemisphereLight('#aac9d4','#1d3441',2.2);scene.add(fill);
const rim=new THREE.DirectionalLight('#96c0d0',.65);rim.position.set(80,35,-90);scene.add(rim);
const flash=new THREE.PointLight('#ffb45e',0,55,1.4);scene.add(flash);
const atmosphere=createAtmosphere(scene),effects=createEffects(scene),rain=createRain(scene);
let ocean,crew,selected,primaryMaterial,enemyMaterial,probes;

const manager=new THREE.LoadingManager();
manager.setURLModifier(url=>{
 const clean=url.split(/[?#]/)[0],name=clean.substring(clean.lastIndexOf('/')+1);
 const key='assets/textures/'+name;
 return embedded[key]?dataURL(key):url;
});
class EmbeddedDraco extends DRACOLoader{
 async _loadLibrary(url,type){const b=bytes('vendor/draco/'+url);return type==='arraybuffer'?b.buffer:new TextDecoder().decode(b);}
}
const draco=new EmbeddedDraco(manager).setWorkerLimit(2).setDecoderConfig({type:'wasm'});
const loader=new GLTFLoader(manager).setDRACOLoader(draco);
const gltf=key=>loader.parseAsync(bytes(key).buffer,'');
const texture=async key=>{
 const t=await new THREE.TextureLoader(manager).loadAsync(dataURL(key));
 t.colorSpace=THREE.SRGBColorSpace;t.flipY=false;t.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());textures.push(t);return t;
};
function announce(text){$('#notice').textContent=text;$('#notice').classList.add('visible');clearTimeout(announce.timer);announce.timer=setTimeout(()=>$('#notice').classList.remove('visible'),2200);}
function pressed(selector,value,key){for(const b of $$(selector))b.setAttribute('aria-pressed',String(b.dataset[key]===value));}
function updateText(){
 const c=CONFIG[state.ship];$('#ship-class').textContent=c.label+' / '+c.en;
 $('#ship-name').replaceChildren(document.createTextNode(c.name+' '));const code=document.createElement('span');code.dir='ltr';code.textContent=c.code;$('#ship-name').append(code);
 $('#ship-length').textContent=c.length;$('#fleet-label').textContent=state.fleet==='tide'?'צי הגאות':'צי הגחלת';
 $('#weather-caption').textContent=state.weather==='storm'?'חזית סערה · ים גבה גלי':'שקיעה · רוח מערבית';
 pressed('[data-ship]',state.ship,'ship');pressed('[data-fleet]',state.fleet,'fleet');pressed('[data-weather]',state.weather,'weather');pressed('[data-view]',state.view,'view');
 $('#pause').setAttribute('aria-pressed',String(state.paused));$('#pause').setAttribute('aria-label',state.paused?'המשך התנועה':'השהיית התנועה');
 $('#pause').innerHTML=state.paused?'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7Z"/></svg>':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6v12M16 6v12"/></svg>';
}
function selectShip(kind){
 if(!CONFIG[kind]||state.loading)return;
 state.ship=kind;selected=vessels.find(v=>v.kind===kind);state.theta=camera.aspect<1?.48:.79;state.zoom=1;state.elevation=state.view==='near'?.22:.30;
 arrange();updateText();state.frozen=false;effects.clear();requestFrame();
}
function setFleet(fleet){
 if(!['tide','ember'].includes(fleet))return;state.fleet=fleet;
 for(const v of vessels){v.fleet=v===selected?fleet:(v.order%2===0?fleet:(fleet==='tide'?'ember':'tide'));applyFleet(v);}
 updateText();requestFrame();
}
function applyFleet(v){
 const mat=v.fleet==='tide'?primaryMaterial:enemyMaterial;
 for(const level of v.levels)level.traverse(o=>{
  if(!o.isMesh)return;
  if(o.name==='flag'){
   if(!o.userData.cloth){
    const cloth=mat.clone();cloth.side=THREE.DoubleSide;
    const u={value:0};o.userData.wind=u;
    cloth.onBeforeCompile=s=>{s.uniforms.uClothTime=u;s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nuniform float uClothTime;').replace('#include <begin_vertex>',`#include <begin_vertex>
     float weight=clamp(position.x/2.4,0.,1.);transformed.z+=sin(position.x*3.-uClothTime*4.)*.22*weight;`);};
    cloth.customProgramCacheKey=()=> 'naval-flag-v1';o.userData.cloth=cloth;materials.push(cloth);
   }
   o.userData.cloth.map=mat.map;o.material=o.userData.cloth;
  }else o.material=mat;
 });
}
function arrange(){
 if(!selected)return;
 const others=vessels.filter(v=>v!==selected);selected.order=0;selected.root.position.set(0,0,0);selected.root.rotation.y=-.22;
 const spots=[[-61,-84,.12],[32,-166,.42],[77,-30,-.52]];
 others.forEach((v,i)=>{const[x,z,a]=spots[i];v.order=i+1;v.root.position.set(x,0,z);v.root.rotation.y=a;});
 setFleet(state.fleet);
}
function setView(view){if(!['near','far'].includes(view))return;state.view=view;state.zoom=1;state.theta=view==='near'?(camera.aspect<1?.48:.79):.58;state.elevation=view==='near'?.22:.30;state.frozen=false;updateText();requestFrame();}
function setWeather(weather){if(!['sunset','storm'].includes(weather))return;state.weather=weather;state.storm=weather==='storm'?1:0;updateText();requestFrame();}
function quality(mode){
 if(!['balanced','low','high'].includes(mode))return;state.quality=mode;$('#quality').value=mode;
 state.adaptiveScale=1;lastAdaptation=performance.now();frames.length=0;
 const cap=mode==='high'?1.7:mode==='low'?.78:1.25;renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,cap));
 effects.setBudget(mode==='high'?320:mode==='low'?96:160);
 renderer.shadowMap.enabled=mode!=='low';rain.lines.geometry.setDrawRange(0,mode==='low'?360:1120);
 resize();requestFrame();
}
function resize(){const r=canvas.getBoundingClientRect();camera.aspect=r.width/r.height;camera.updateProjectionMatrix();renderer.setSize(r.width,r.height,false);requestFrame();}
const target=new THREE.Vector3(),camPos=new THREE.Vector3(),firePos=new THREE.Vector3(),impactPos=new THREE.Vector3();
function placeCamera(){
 if(!selected)return;
 const aspect=camera.aspect;let distance;
 if(state.view==='near'){
  target.set(0,CONFIG[state.ship].deck+(camera.aspect>1?1.5:3),0);
  const c=CONFIG[state.ship],relative=state.theta-selected.root.rotation.y;
  const halfWidth=Math.abs(Math.sin(relative))*c.length*.5+Math.abs(Math.cos(relative))*c.beam*.5;
  const halfDepth=Math.abs(Math.cos(relative))*c.length*.5+Math.abs(Math.sin(relative))*c.beam*.5;
  const widthFit=halfDepth+halfWidth/(Math.tan(camera.fov*Math.PI/360)*aspect*.82);
  distance=Math.max(c.length*.98,widthFit)*state.zoom;
 }else{
  target.set(43,4,-83);distance=300*Math.max(1,1.12/aspect)*state.zoom;
 }
 const e=state.elevation;camPos.set(Math.sin(state.theta)*Math.cos(e),Math.sin(e),Math.cos(state.theta)*Math.cos(e)).multiplyScalar(distance).add(target);
 camera.position.copy(camPos);camera.lookAt(target);
 $('#bearing').textContent=((Math.round(state.theta*180/Math.PI)+360)%360).toString().padStart(3,'0')+'°';
}
function updateObjects(time){
 const storm=state.storm,amplitude=1+storm*.65;
 atmosphere.uniforms.uTime.value=time;atmosphere.uniforms.uStorm.value=storm;
 ocean.uniforms.uTime.value=time;ocean.uniforms.uStorm.value=storm;ocean.uniforms.uAmplitude.value=amplitude;
 sun.intensity=3.1-storm*2.15;fill.intensity=2.2-storm*.6;renderer.toneMappingExposure=1.1-storm*.05;
 scene.fog.color.set(storm?'#516875':'#69878b');scene.fog.density=.00045+storm*.0004;
 if(probes)scene.environment=storm?probes.storm:probes.sunset;
 rain.uniforms.uTime.value=time;rain.uniforms.uAmount.value=state.reduced?0:storm;rain.uniforms.uCenter.value.set(target.x,1,target.z);rain.lines.visible=storm>0&&!state.reduced;
 sun.position.set(-90,67,75);sun.target.position.set(0,0,0);
 for(const v of vessels){
  const root=v.root,x=root.position.x,z=root.position.z;
  root.position.y=waveHeight(x,z,time,amplitude)*.55;
  root.rotation.x=Math.sin(time*.7+v.order)*.012*amplitude;root.rotation.z=Math.sin(time*.55+v.order*2)*.016*amplitude;
  const dist=camera.position.distanceTo(root.position),ratio=dist/v.config.length;
  const nearThreshold=state.quality==='low'?1.6:2.7;
  // A small dead band prevents bobbing or a pinch gesture from flipping LODs.
  let lod=v.lod;
  if(lod===0&&ratio>nearThreshold+.18)lod=1;
  if(lod===1&&ratio<nearThreshold-.18)lod=0;
  if(lod===1&&ratio>5.9)lod=2;
  if(lod===2&&ratio<5.5)lod=ratio<nearThreshold-.18?0:1;
  if(v===selected&&state.view==='near'&&state.quality!=='low'&&state.zoom<1.4)lod=0;
  v.lod=lod;v.levels.forEach((l,i)=>{l.visible=i===lod;});
  for(const l of v.levels)if(l.visible)l.traverse(o=>{
   if(o.name==='radar')o.rotation.y=time*.7;
   if(o.name.startsWith('turret_'))o.rotation.y=Math.sin(time*.13+v.order)*.13;
   if(o.userData.wind)o.userData.wind.value=time;
   if(o.isMesh){o.castShadow=v===selected;o.receiveShadow=v===selected;}
  });
  v.wake.mesh.position.set(x,0,z);v.wake.mesh.rotation.y=root.rotation.y;
  v.wake.uniforms.uTime.value=time;v.wake.uniforms.uAmplitude.value=amplitude;v.wake.uniforms.uStrength.value=state.view==='near'?1:.9;
 }
 scene.updateMatrixWorld(true);
 if(crew){crew.mesh.visible=state.crew;crew.update(time);crew.place(state.crew?vessels:[]);}
 effects.update(time);flash.intensity=time<flashUntil?40*(flashUntil-time)/.22:0;
}

// Shell trajectory is presentation-only. It does not modify game logic or scoring.
const shellGeometry=new THREE.BufferGeometry();const shellArray=new Float32Array(10*3);shellGeometry.setAttribute('position',new THREE.BufferAttribute(shellArray,3));
const shellMat=new THREE.LineBasicMaterial({color:'#ffe7b3',transparent:true,opacity:.95});
const shell=new THREE.Line(shellGeometry,shellMat);shell.visible=false;scene.add(shell);let shot=null;
function shoot(){
 if(state.loading||state.time<fireCooldown)return;
 const c=selected.config;
 const muzzle=selected.levels[0].getObjectByName('muzzle_turret_0_0')||selected.levels[0].getObjectByName('muzzle_defence_0');
 if(muzzle)muzzle.getWorldPosition(firePos);else firePos.set(0,c.deck+2,c.length*.35).applyMatrix4(selected.root.matrixWorld);
 const enemy=vessels.find(v=>v!==selected&&v.fleet!==state.fleet)||vessels.find(v=>v!==selected);
 impactPos.copy(enemy.root.position);impactPos.x-=7;impactPos.z+=9;impactPos.y=.2;
 effects.update(state.time);effects.explosion(firePos,.25);flash.position.copy(firePos);flashUntil=state.time+.22;
 shot={start:state.time,from:firePos.clone(),to:impactPos.clone(),duration:1.25};fireCooldown=state.time+.7;
 state.paused=false;state.frozen=false;updateText();announce('מטח בדרך');requestFrame();
}
function updateShot(time){
 if(!shot)return;shell.visible=true;
 const u=(time-shot.start)/shot.duration;
 for(let i=0;i<10;i++){const t=THREE.MathUtils.clamp(u-i*.008,0,1);const p=firePos.lerpVectors(shot.from,shot.to,t);p.y+=Math.sin(t*Math.PI)*23;shellArray.set([p.x,p.y,p.z],i*3);}
 shellGeometry.attributes.position.needsUpdate=true;
 if(u>=1){effects.update(time);effects.splash(shot.to,1);shot=null;shell.visible=false;announce('פגיעה בים');}
}
function effect(kind,atTime=state.time){
 if(!selected)return;effects.update(atTime);
 if(kind==='splash'){impactPos.copy(selected.root.position).add(new THREE.Vector3(-selected.config.beam*1.6,0,selected.config.length*.12));impactPos.y=.2;effects.splash(impactPos,1);}
 else{const enemy=vessels.find(v=>v!==selected&&v.order===3)||selected;impactPos.copy(enemy.root.position);impactPos.y=enemy.config.deck+2;effects.explosion(impactPos,1);}
 requestFrame();
}
function metrics(){
 const sorted=frames.slice().sort((a,b)=>a-b),n=sorted.length,mean=frames.reduce((a,b)=>a+b,0)/Math.max(1,n);
 return{three:THREE.REVISION,state:{...state},viewport:{width:innerWidth,height:innerHeight,dpr:renderer.getPixelRatio(),bufferWidth:canvas.width,bufferHeight:canvas.height},
  triangles:renderer.info.render.triangles,drawCalls:renderer.info.render.calls,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,programs:renderer.info.programs?.length,
  cpuFrame:{samples:n,meanMs:mean,p95Ms:sorted[Math.floor(n*.95)]||0,fps:mean?1000/mean:0},
  lod:vessels.map(v=>({type:v.kind,fleet:v.fleet,lod:v.lod,triangles:v.levels[v.lod].userData.triangles})),crewInstances:crew?.mesh.count||0,effects:effects.stats(),dracoWorkers:draco.workerPool.length,
  renderer:renderer.getContext().getParameter(renderer.getContext().RENDERER),gpu:renderer.getContext().getExtension('WEBGL_debug_renderer_info')?renderer.getContext().getParameter(renderer.getContext().getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL):'unavailable',environmentProbes:probes?.info||[],contextLost,contextRestores,adaptationEvents:adaptationEvents.slice(-8),reducedMotion:state.reduced,offline:true};
}
function render(time=state.time){if(state.loading)return;placeCamera();updateObjects(time);updateShot(time);renderer.render(scene,camera);}
function requestFrame(){if(!disposed&&!contextLost&&!raf)raf=requestAnimationFrame(loop);}
function loop(stamp){
 raf=0;if(disposed||state.loading||contextLost)return;
 const rawDt=lastFrame?(stamp-lastFrame)/1000:0,dt=Math.min(.1,rawDt);lastFrame=stamp;
 if(!state.paused&&!state.frozen){state.time+=dt;elapsed+=dt;if(rawDt>0){frames.push(rawDt*1000);if(frames.length>600)frames.shift();}}
 render();
 if(!state.paused&&!state.frozen){
  // Persistent fire is restrained and off on reduced-motion displays.
  if(!state.reduced&&elapsed>.075){elapsed=0;const v=vessels.find(v=>v.order===3);if(v){impactPos.copy(v.root.position);impactPos.y=v.config.deck+2;effects.burning(impactPos,.75);}}
 }
 if(!state.paused&&!state.frozen&&state.quality==='balanced'&&frames.length>36&&stamp-lastAdaptation>2500){
  const recent=frames.slice(-36),average=recent.reduce((a,b)=>a+b,0)/recent.length;
  let next=state.adaptiveScale;
  if(average>35&&next>.64)next=Math.max(.64,next-.12);
  else if(average<21&&next<1&&stamp-lastAdaptation>12000)next=Math.min(1,next+.06);
  if(next!==state.adaptiveScale){
   state.adaptiveScale=next;lastAdaptation=stamp;renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.25)*next);
   renderer.shadowMap.enabled=next>.85;effects.setBudget(next>.85?160:96);
   adaptationEvents.push({simulationTime:state.time,averageMs:average,scale:next});if(adaptationEvents.length>48)adaptationEvents.shift();
   resize();
  }
 }
 if($('#options').open&&$('#options details').open&&stamp-lastStats>800){lastStats=stamp;const m=metrics();$('#stats').textContent=`Three r${m.three} · ${m.viewport.width}×${m.viewport.height}\n${m.triangles.toLocaleString()} triangles · ${m.drawCalls} draws\n${m.geometries} geometries · ${m.textures} GPU textures\n${m.cpuFrame.fps.toFixed(1)} fps · p95 ${m.cpuFrame.p95Ms.toFixed(1)} ms\nDPR ${m.viewport.dpr.toFixed(2)} · ${m.dracoWorkers} Draco workers\nLOD ${m.lod.map(v=>v.lod).join(' / ')} · crew ${m.crewInstances}\nParticles ${m.effects.active}/${m.effects.capacity}`;}
 if(!state.paused&&!state.frozen)requestFrame();
}
function reset(){state.ship='cruiser';state.fleet='tide';state.weather='sunset';state.storm=0;state.view='near';state.time=0;state.theta=.79;state.elevation=.28;state.zoom=1;state.paused=state.reduced;state.frozen=false;state.crew=true;$('#crew-toggle').checked=true;effects.clear();shot=null;shell.visible=false;selectShip('cruiser');quality('balanced');updateText();requestFrame();}

function handleContextLost(){
 if(disposed)return;contextLost=true;lastFrame=0;
 // These targets contain GPU-only data. Their old contents cannot survive
 // context restoration, unlike atlas images retained in CPU/browser memory.
 scene.environment=null;probes?.dispose();probes=null;
 sun.shadow.map?.dispose();sun.shadow.map=null;
 sun.shadow.mapPass?.dispose();sun.shadow.mapPass=null;
}
function handleContextRestored(){
 if(disposed)return;
 contextLost=false;contextRestores++;lastFrame=0;
 probes=createSkyProbes(renderer);scene.environment=state.weather==='storm'?probes.storm:probes.sunset;
 requestFrame();
}
canvas.addEventListener('webglcontextlost',handleContextLost);
canvas.addEventListener('webglcontextrestored',handleContextRestored);

const pointers=new Map();let gesture=null;
canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});gesture=null;});
canvas.addEventListener('pointermove',e=>{
 if(!pointers.has(e.pointerId))return;const prev=pointers.get(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(pointers.size===1){state.theta-=(e.clientX-prev.x)*.006;state.elevation=THREE.MathUtils.clamp(state.elevation+(e.clientY-prev.y)*.003,.12,1.12);}
 else{const[a,b]=[...pointers.values()],d=Math.hypot(a.x-b.x,a.y-b.y);if(gesture)state.zoom=THREE.MathUtils.clamp(state.zoom*gesture/d,.66,1.9);gesture=d;}
 state.frozen=false;$('#gesture-hint').style.opacity='.3';requestFrame();
});
for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,e=>{pointers.delete(e.pointerId);gesture=null;});
canvas.addEventListener('wheel',e=>{e.preventDefault();state.zoom=THREE.MathUtils.clamp(state.zoom*Math.exp(e.deltaY*.001),.66,1.9);requestFrame();},{passive:false});
canvas.addEventListener('keydown',e=>{
 const keys={ArrowLeft:()=>state.theta+=.08,ArrowRight:()=>state.theta-=.08,ArrowUp:()=>state.elevation=Math.min(1.12,state.elevation+.05),ArrowDown:()=>state.elevation=Math.max(.12,state.elevation-.05),'+':()=>state.zoom=Math.max(.66,state.zoom*.9),'-':()=>state.zoom=Math.min(1.9,state.zoom*1.1),' ':()=>{state.paused=!state.paused;updateText();},Home:reset};
 if(keys[e.key]){e.preventDefault();keys[e.key]();requestFrame();}
});
for(const b of $$('[data-ship]'))b.addEventListener('click',()=>selectShip(b.dataset.ship));
for(const b of $$('[data-fleet]'))b.addEventListener('click',()=>setFleet(b.dataset.fleet));
for(const b of $$('[data-view]'))b.addEventListener('click',()=>setView(b.dataset.view));
for(const b of $$('[data-weather]'))b.addEventListener('click',()=>setWeather(b.dataset.weather));
$('#pause').addEventListener('click',()=>{state.paused=!state.paused;state.frozen=false;lastFrame=0;updateText();requestFrame();});
$('#salvo').addEventListener('click',shoot);$('#home').addEventListener('click',e=>{e.preventDefault();reset();});
$('#quality').addEventListener('change',e=>quality(e.target.value));$('#crew-toggle').addEventListener('change',e=>{state.crew=e.target.checked;requestFrame();});
$('#settings').addEventListener('click',()=>{$('#options').showModal();$('#settings').setAttribute('aria-expanded','true');});
$('#close-options').addEventListener('click',()=>$('#options').close());$('#options').addEventListener('close',()=>$('#settings').setAttribute('aria-expanded','false'));
$('#water-impact').addEventListener('click',()=>{$('#options').close();state.paused=false;state.frozen=false;effect('splash');updateText();requestFrame();});
$('#ship-impact').addEventListener('click',()=>{$('#options').close();state.paused=false;state.frozen=false;effect('explosion');updateText();requestFrame();});
$('#reset').addEventListener('click',()=>{$('#options').close();reset();});
window.addEventListener('resize',resize);document.addEventListener('visibilitychange',()=>{lastFrame=0;if(!document.hidden)requestFrame();});

async function start(){
 const[tide,ember,normal,crewAtlas,noise]=await Promise.all(['fleet-tide-1024.png','fleet-ember-1024.png','ocean-normal-256.png','crew-256.png','noise-128.png'].map(n=>texture('assets/textures/'+n)));
 noise.colorSpace=THREE.NoColorSpace;noise.wrapS=noise.wrapT=THREE.RepeatWrapping;noise.minFilter=THREE.LinearFilter;noise.generateMipmaps=false;
 atmosphere.uniforms.uNoise.value=noise;
 normal.flipY=true;ocean=createOcean(scene,normal,noise);ocean.uniforms.uIsland.value.set(110,-130,38);
 if(contextLost)await new Promise(resolve=>canvas.addEventListener('webglcontextrestored',resolve,{once:true}));
 if(disposed)return;
 if(!probes)probes=createSkyProbes(renderer);scene.environment=probes.sunset;
 primaryMaterial=new THREE.MeshStandardMaterial({map:tide,roughness:.62,metalness:.28,envMapIntensity:.45});enemyMaterial=primaryMaterial.clone();enemyMaterial.map=ember;materials.push(primaryMaterial,enemyMaterial);
 let loaded=0;const total=15;
 const load=async key=>{const result=await gltf(key);loaded++;$('#loading-progress').textContent=`${loaded} / ${total} · מכינים את המים והסיפונים`;$('#loading-fill').style.width=(loaded/total*100)+'%';return result;};
 for(const kind of Object.keys(CONFIG)){
  const root=new THREE.Group();root.name=kind;const levels=[];
  for(let i=0;i<3;i++){
   const asset=await load(`assets/ships/${kind}-lod${i}.glb`);const level=asset.scene;
   let triangles=0;level.traverse(o=>{if(o.isMesh){triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;geometries.push(o.geometry);}});
   level.userData.triangles=triangles;levels.push(level);root.add(level);
  }
  scene.add(root);const wake=createWake(scene,CONFIG[kind].length,CONFIG[kind].beam,noise);
  vessels.push({kind,root,levels,wake,config:CONFIG[kind],order:vessels.length,lod:0,fleet:'tide'});
 }
 const island=(await load('assets/environment/island.glb')).scene;island.position.set(110,-.45,-130);island.rotation.y=-.5;island.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=false;geometries.push(o.geometry);materials.push(o.material);for(const v of Object.values(o.material))if(v?.isTexture)textures.push(v);}});scene.add(island);
 const rock=(await load('assets/environment/rock.glb')).scene;let rockGeo,rockMat;rock.traverse(o=>{if(o.isMesh){rockGeo=o.geometry;rockMat=o.material;for(const v of Object.values(o.material))if(v?.isTexture)textures.push(v);}});
 const rocks=new THREE.InstancedMesh(rockGeo,rockMat,16),dummy=new THREE.Object3D();
 for(let i=0;i<16;i++){const a=i/16*Math.PI*2;dummy.position.set(110+Math.cos(a)*(42+i%3*3),-1.2,-130+Math.sin(a)*(34+i%4*3));dummy.scale.set(.5+(i%3)*.3,.4+(i%4)*.22,.6+(i%2)*.4);dummy.rotation.y=i*1.7;dummy.updateMatrix();rocks.setMatrixAt(i,dummy.matrix);}scene.add(rocks);geometries.push(rockGeo);materials.push(rockMat);
 crew=createCrew(scene,await load('assets/crew/deck-crew.glb'),crewAtlas);
 state.loading=false;selected=vessels.find(v=>v.kind===state.ship);arrange();quality('balanced');resize();setView('near');updateText();
 render(0);$('#loading').classList.add('done');$('#loading').setAttribute('aria-hidden','true');window.naval.ready=true;requestFrame();
}

window.naval={ready:false,metrics,selectShip,setFleet,setWeather,setView,quality,shoot,effect,reset,
 setPaused(value){state.paused=!!value;state.frozen=false;lastFrame=0;updateText();requestFrame();},
 snapshot(options={}){
  if(options.ship)selectShip(options.ship);if(options.fleet)setFleet(options.fleet);if(options.view)setView(options.view);if(options.weather)setWeather(options.weather);if(options.quality)quality(options.quality);
  state.frozen=true;state.paused=true;state.time=options.time??12;
  if(options.angle!==undefined)state.theta=options.angle;if(options.elevation!==undefined)state.elevation=options.elevation;
  if(options.zoom!==undefined)state.zoom=options.zoom;
  effects.clear();shot=null;shell.visible=false;render(state.time);
  if(options.effect==='salvo'){
   state.time-=.08;shoot();state.time+=.08;state.paused=true;state.frozen=true;
  }else if(options.effect){effect(options.effect,state.time-.55);effects.update(state.time);}
  updateText();render(state.time);return metrics();
 },
 dispose(){disposed=true;cancelAnimationFrame(raf);canvas.removeEventListener('webglcontextlost',handleContextLost);canvas.removeEventListener('webglcontextrestored',handleContextRestored);draco.dispose();ocean?.dispose();probes?.dispose();atmosphere.dispose();effects.dispose();rain.dispose();crew?.dispose();for(const v of vessels)v.wake.dispose();for(const g of new Set(geometries))g.dispose();for(const m of new Set(materials))m.dispose();for(const t of new Set(textures))t.dispose();shellGeometry.dispose();shellMat.dispose();sun.shadow.map?.dispose();renderer.dispose();},
};
start().catch(error=>{console.error(error);$('#loading-progress').textContent='טעינת הצי נכשלה. פתחו מחדש את הקובץ המקומי.';window.naval.error=String(error);});
