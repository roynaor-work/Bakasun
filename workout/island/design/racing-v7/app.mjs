import * as T from 'three';
import {createCar,carSpecs,disposeTree,releaseDecoder} from './loader.mjs';
import {createWorld,sampleTrack,themes} from './world.mjs';
import {createEffects,createSpeedPass,createSpeedLines} from './effects.mjs';

const $=id=>document.getElementById(id);
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const params=new URLSearchParams(location.search);
const state={track:'coast',car:'apex',mode:'drive',far:false,paused:reduced,
  speed:184,boost:false,drift:false,effects:!reduced,quality:'auto',time:0,travel:0,
  phase:.036,steer:0,orbit:.7,orbitHeight:.28,orbitZoom:1,overviewYaw:.5,ready:false};
const scene=new T.Scene();
scene.matrixAutoUpdate=false;
const camera=new T.PerspectiveCamera(48,1,.15,1800);
let renderer;
try{
  renderer=new T.WebGLRenderer({antialias:true,powerPreference:'high-performance',alpha:false});
}catch(error){
  $('loading').innerHTML='<strong>תלת־ממד לא זמין כרגע</strong><small>פתחו בדפדפן עם WebGL פעיל.</small>';
  throw error;
}
renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
renderer.info.autoReset=false;
$('world').appendChild(renderer.domElement);
const speedPass=createSpeedPass(renderer),speedLines=createSpeedLines($('velocity'));
let world,hero,fx,traffic=[],changeGeneration=0,worldGeneration=0;
let pausedBeforeOverview=false;
const cars=new Map();
let width=1,height=1,ratio=1,adaptiveRatio=1.15;
let adaptiveLow=false;
const cameraTarget=new T.Vector3(),cameraGoal=new T.Vector3(),lookGoal=new T.Vector3(),temp=new T.Vector3(),up=new T.Vector3(0,1,0);
let previous=performance.now(),fpsStart=previous,frames=0,measuredFps=0,measuredFrameMs=0;
const frameTimes=[];let frameCount=0,raf=0,dirty=true,disposed=false,loadingWorld=false;
const metrics={frames:0,fps:0,drawCalls:0,triangles:0,renderMs:0,qualityChanges:0,errors:[],renderer:'',lod:0};
const gl=renderer.getContext(),debugRenderer=gl.getExtension('WEBGL_debug_renderer_info');
metrics.renderer=debugRenderer?gl.getParameter(debugRenderer.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);

function toast(text){$('toast').textContent=text;$('toast').classList.add('visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').classList.remove('visible'),1800);}
function resize(){
  width=innerWidth;height=innerHeight;
  ratio=state.quality==='low'?Math.min(devicePixelRatio,1):state.quality==='high'?Math.min(devicePixelRatio,1.5):Math.min(devicePixelRatio,adaptiveRatio);
  renderer.setPixelRatio(ratio);renderer.setSize(width,height,false);
  camera.aspect=width/height;camera.updateProjectionMatrix();
  speedPass.resize(width,height,ratio);speedLines.resize(width,height);dirty=true;
}
addEventListener('resize',resize);resize();

async function getCar(id){
  if(!cars.has(id))cars.set(id,createCar(id));
  return cars.get(id);
}
function setPressed(selector,value,key){document.querySelectorAll(selector).forEach(el=>{
  const selected=el.dataset[key]===value;el.classList.toggle('active',selected);el.setAttribute('aria-pressed',String(selected));
});}
function setPaint(color){
  if(!hero)return;hero.userData.setColor(color);setPressed('[data-color]',color,'color');dirty=true;
}
async function selectCar(id){
  if(!carSpecs.some(c=>c.id===id))return;
  const generation=++changeGeneration;
  const next=await getCar(id);
  if(generation!==changeGeneration)return;
  if(hero)scene.remove(hero);
  hero=next;scene.add(hero);state.car=id;
  setPaint(carSpecs.find(c=>c.id===id).color);
  setPressed('[data-car]',id,'car');
  $('selectedCar').textContent=`0${carSpecs.findIndex(c=>c.id===id)+1} / ${id.toUpperCase()}`;
  dirty=true;updateScene(0,true);
}
async function selectTrack(key){
  if(!themes[key])return;
  const generation=++worldGeneration;loadingWorld=true;
  const next=await createWorld(renderer,key);
  if(generation!==worldGeneration){next.dispose();return;}
  if(world){scene.remove(world.root);world.dispose();}
  world=next;scene.add(world.root);scene.environment=world.environment.texture;
  scene.fog=new T.Fog(world.theme.fog,key==='neon'?55:115,key==='neon'?295:460);
  renderer.toneMappingExposure=world.theme.exposure;
  state.track=key;state.travel=world.track.length*state.phase;
  fx?.clear();
  $('sceneName').textContent=world.theme.name;$('sceneEnglish').textContent=world.theme.english;$('sceneDescription').textContent=world.theme.description;
  setPressed('[data-track]',key,'track');
  document.documentElement.style.setProperty('--accent',key==='coast'?'#d6f34a':key==='ridge'?'#b6dbf1':'#d6f34a');
  setMode(state.mode);
  loadingWorld=false;dirty=true;updateScene(0,true);drawMap();
}
function setMode(mode){
  const previousMode=state.mode;
  if(mode==='overview'&&previousMode!=='overview'){pausedBeforeOverview=state.paused;setPause(true);}
  if(mode!=='overview'&&previousMode==='overview')setPause(pausedBeforeOverview);
  state.mode=mode;
  document.body.dataset.mode=mode;
  $('driveButton').classList.toggle('active',mode==='drive');$('driveButton').setAttribute('aria-pressed',String(mode==='drive'));
  $('garageButton').classList.toggle('active',mode==='garage');$('garageButton').setAttribute('aria-pressed',String(mode==='garage'));
  $('overviewButton').setAttribute('aria-pressed',String(mode==='overview'));$('overviewLabel').textContent=mode==='overview'?'לחזור לנסיעה':'המסלול המלא';
  if(world)scene.fog=new T.Fog(world.theme.fog,mode==='overview'?900:state.track==='neon'?55:115,mode==='overview'?2600:state.track==='neon'?295:460);
  renderer.shadowMap.enabled=!lowBudget()&&mode!=='overview';
  dirty=true;updateScene(0,true);
}
function setDistance(far){
  state.far=far;$('distanceButton').setAttribute('aria-pressed',String(far));$('distanceButton').classList.toggle('active',far);
  $('distanceLabel').textContent=far?'להתקרב':'להתרחק';dirty=true;updateScene(0,true);
}
function setPause(paused){
  state.paused=paused;$('pauseButton').setAttribute('aria-pressed',String(paused));$('pauseLabel').textContent=paused?'להמשיך':'השהיה';
  $('pauseIcon').innerHTML=paused?'<path d="m8 5 10 7-10 7z"/>':'<path d="M8 5v14M16 5v14"/>';
  previous=performance.now();dirty=true;
}
function setBoost(value){state.boost=value;$('boostButton').setAttribute('aria-pressed',String(value));dirty=true;}
function setDrift(value){state.drift=value;$('driftButton').setAttribute('aria-pressed',String(value));dirty=true;}
function setSpeed(value){state.speed=Math.max(0,Math.min(240,Number(value)));$('paceRange').value=state.speed;$('paceOutput').textContent=`${state.speed} קמ״ש`;dirty=true;}
function lowBudget(){return state.quality==='low'||(state.quality==='auto'&&adaptiveLow);}
function setQuality(value){
  state.quality=value;$('qualitySelect').value=value;renderer.shadowMap.enabled=!lowBudget()&&state.mode!=='overview';resize();dirty=true;
}
function drawMap(){
  if(!world)return;
  const c=$('minimap'),g=c.getContext('2d'),samples=world.track.samples;
  g.clearRect(0,0,c.width,c.height);
  const minX=Math.min(...samples.map(a=>a.p[0])),maxX=Math.max(...samples.map(a=>a.p[0])),minZ=Math.min(...samples.map(a=>a.p[2])),maxZ=Math.max(...samples.map(a=>a.p[2]));
  const scale=128/Math.max(maxX-minX,maxZ-minZ),cx=(minX+maxX)/2,cz=(minZ+maxZ)/2;
  g.lineWidth=3;g.strokeStyle='rgba(222,232,225,.50)';g.beginPath();
  samples.forEach((a,i)=>{const x=84+(a.p[0]-cx)*scale,y=84+(a.p[2]-cz)*scale;i?g.lineTo(x,y):g.moveTo(x,y);});g.stroke();
  const a=sampleTrack(world.track,state.travel),x=84+(a.p.x-cx)*scale,y=84+(a.p.z-cz)*scale;
  g.shadowColor='#d6f34a';g.shadowBlur=10;g.fillStyle='#d6f34a';g.beginPath();g.arc(x,y,5,0,Math.PI*2);g.fill();g.shadowBlur=0;
}

function updateScene(dt,snap=false){
  if(!world||!hero)return;
  const active=state.mode==='drive',speed=(state.boost?Math.max(225,state.speed):state.speed)/3.6;
  const visualDrift=state.drift?Math.sin(state.time*1.2)*.22+.25:0;
  const sample=sampleTrack(world.track,state.travel),ahead=sampleTrack(world.track,state.travel+9);
  const lane=Math.sin(state.time*.34)*.18+state.steer*1.75;
  hero.position.copy(sample.p).addScaledVector(sample.n,lane);hero.position.y+=.016;
  hero.rotation.set(0,sample.yaw+visualDrift,active?(state.drift?.018:0):0);
  const grade=Math.atan2(sample.t.y,Math.hypot(sample.t.x,sample.t.z));
  hero.rotateX(-grade);hero.userData.update(active?state.travel:0,active?-visualDrift*.5:0);
  for(let i=0;i<traffic.length;i++){
    const car=traffic[i],d=state.travel+24+i*24+Math.sin(state.time*.17+i)*5;
    const a=sampleTrack(world.track,d);car.position.copy(a.p).addScaledVector(a.n,(i%2?1:-1)*2.1);car.position.y+=.016;
    car.rotation.set(-Math.atan2(a.t.y,Math.hypot(a.t.x,a.t.z)),a.yaw,0);car.userData.update(d,0);car.updateMatrixWorld(true);car.userData.updateLOD(camera,lowBudget());
    car.visible=active;
  }
  hero.updateMatrixWorld(true);
  if(state.mode==='overview'){
    const positions=world.track.samples,center=new T.Vector3();
    for(const a of positions)center.add(temp.fromArray(a.p));center.divideScalar(positions.length);
    const r=width<height?795:380;
    cameraGoal.copy(center).add(new T.Vector3(Math.sin(state.overviewYaw)*r,r*.95,Math.cos(state.overviewYaw)*r));lookGoal.copy(center);camera.fov=49;
  }else if(state.mode==='garage'){
    const portrait=width<height;
    const clearance=state.car==='velour'&&!state.far?(portrait?1.05:1.12):1;
    const angle=state.orbit+(state.paused?0:state.time*.045),r=(state.far?(portrait?20:12.9):(portrait?15.3:6.4))*state.orbitZoom*clearance;
    const offset=new T.Vector3(Math.sin(angle)*r,1.3+r*(.10+state.orbitHeight*.24),Math.cos(angle)*r).applyAxisAngle(up,sample.yaw);
    cameraGoal.copy(hero.position).add(offset);lookGoal.copy(hero.position).add(new T.Vector3(0,portrait?.95:.53,0));
    camera.fov=43;
  }else{
    const portrait=width<height;
    const behind=state.far?(portrait?20:21):(portrait?(state.drift?11.8:9.7):7.1);
    const side=state.far?4.3:(portrait?.85:1.45);
    cameraGoal.copy(hero.position).addScaledVector(sample.t,-behind).addScaledVector(sample.n,side);
    cameraGoal.y+=state.far?8.7:2.65;
    lookGoal.copy(ahead.p).lerp(hero.position,state.far?.3:.66);lookGoal.y+=state.far?.2:.36;
    camera.fov=state.boost&&!reduced?53:48;
  }
  camera.near=state.mode==='overview'?5:.15;camera.far=state.mode==='overview'?4000:1800;
  // Keep the landscape car above the selection panel without changing orbit angle.
  if(state.mode==='garage'&&width>height)camera.setViewOffset(width,height,0,height*.195,width,height);
  else if(camera.view?.enabled)camera.clearViewOffset();
  camera.updateProjectionMatrix();
  if(snap){camera.position.copy(cameraGoal);cameraTarget.copy(lookGoal);}
  else{const smooth=1-Math.exp(-dt*6);camera.position.lerp(cameraGoal,smooth);cameraTarget.lerp(lookGoal,smooth);}
  camera.lookAt(cameraTarget);camera.updateMatrixWorld();hero.userData.updateLOD(camera,lowBudget());
  metrics.lod=hero.getCurrentLevel();
  world.update(state.time,hero.position,{overview:state.mode==='overview',inspection:state.mode==='garage'});
  if(fx)fx.update(dt,{car:hero,camera,drift:state.drift&&active,speed:speed*3.6,boost:state.boost,sample,ahead,night:state.track==='neon'&&active,visualTime:state.time});
  if(frameCount%4===0||snap){
    const kmh=active?Math.round(speed*3.6):0;$('speedValue').textContent=kmh;$('speedBar').style.width=`${Math.min(100,kmh/2.4)}%`;
    $('gearValue').textContent=active?`D ${Math.min(6,Math.max(1,Math.ceil(kmh/48)))}`:'P';
    $('driveStatus').textContent=state.mode==='garage'?'מבט רכב':state.boost?'בוסט פעיל':state.drift?'דריפט':'שיוט חופשי';drawMap();
  }
}

function render(dt){
  const start=performance.now();renderer.info.reset();
  const intensity=(state.effects&&state.mode==='drive'&&!lowBudget()&&state.boost)?.034:0;
  speedPass.render(scene,camera,intensity);
  speedLines.draw(state.time,state.effects&&state.mode==='drive'?(state.boost?1:(state.speed-110)/170):0);
  metrics.drawCalls=renderer.info.render.calls;metrics.triangles=renderer.info.render.triangles;
  metrics.renderMs=performance.now()-start;metrics.frames++;metrics.geometries=renderer.info.memory.geometries;metrics.textures=renderer.info.memory.textures;
  metrics.programs=renderer.info.programs.length;
  dirty=false;
}
function animate(now){
  if(disposed)return;raf=requestAnimationFrame(animate);
  if(document.hidden||!state.ready||loadingWorld){previous=now;return;}
  const elapsed=(now-previous)/1000;previous=now;const dt=Math.min(.05,Math.max(0,elapsed));
  if(!state.paused){
    state.time+=dt;if(state.mode==='drive')state.travel+=dt*(state.boost?Math.max(225,state.speed):state.speed)/3.6;
    updateScene(dt);dirty=true;
  }
  if(dirty)render(dt);
  if(!state.paused&&elapsed<.5){frameTimes.push(elapsed*1000);if(frameTimes.length>180)frameTimes.shift();frames++;}
  frameCount++;
  if(now-fpsStart>1200){
    measuredFps=frames*1000/(now-fpsStart);metrics.fps=measuredFps;
    measuredFrameMs=frameTimes.reduce((s,v)=>s+v,0)/Math.max(1,frameTimes.length);
    if(state.quality==='auto'&&frames>2&&measuredFps<28&&adaptiveRatio>.76){
      adaptiveRatio=Math.max(.75,adaptiveRatio-.15);metrics.qualityChanges++;
      if(adaptiveRatio<1)adaptiveLow=true;
      renderer.shadowMap.enabled=!lowBudget();resize();
    }
    frames=0;fpsStart=now;
  }
}

for(const el of document.querySelectorAll('[data-track]'))el.addEventListener('click',()=>selectTrack(el.dataset.track).catch(fail));
for(const el of document.querySelectorAll('[data-car]'))el.addEventListener('click',()=>selectCar(el.dataset.car).catch(fail));
for(const el of document.querySelectorAll('[data-color]'))el.addEventListener('click',()=>setPaint(el.dataset.color));
$('driveButton').addEventListener('click',()=>setMode('drive'));
$('garageButton').addEventListener('click',()=>{setMode('garage');toast('גררו לסיבוב סביב הרכב');});
$('distanceButton').addEventListener('click',()=>{if(state.mode==='overview'){setMode('drive');setDistance(false);}else setDistance(!state.far);});
$('overviewButton').addEventListener('click',()=>setMode(state.mode==='overview'?'drive':'overview'));
$('pauseButton').addEventListener('click',()=>setPause(!state.paused));
$('boostButton').addEventListener('click',()=>setBoost(!state.boost));
$('driftButton').addEventListener('click',()=>setDrift(!state.drift));
$('infoButton').addEventListener('click',()=>{
  $('diagnostics').textContent=JSON.stringify(getMetrics(),null,2);$('infoDialog').showModal();$('infoButton').setAttribute('aria-expanded','true');
});
$('infoDialog').addEventListener('close',()=>$('infoButton').setAttribute('aria-expanded','false'));
$('paceRange').addEventListener('input',e=>setSpeed(e.target.value));
$('qualitySelect').addEventListener('change',e=>setQuality(e.target.value));
$('motionToggle').checked=state.effects;
$('motionToggle').addEventListener('change',e=>{state.effects=e.target.checked;dirty=true;});
let dragging=false,lastX=0,lastY=0,pointers=new Map(),lastPinch=0;
renderer.domElement.addEventListener('pointerdown',e=>{
  renderer.domElement.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});dragging=true;lastX=e.clientX;lastY=e.clientY;
});
renderer.domElement.addEventListener('pointermove',e=>{
  if(!pointers.has(e.pointerId))return;
  pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pointers.size===2){
    const [a,b]=[...pointers.values()],d=Math.hypot(a.x-b.x,a.y-b.y);
    if(lastPinch)state.orbitZoom=T.MathUtils.clamp(state.orbitZoom*lastPinch/d,.65,1.6);lastPinch=d;
  }else if(dragging){
    if(state.mode==='garage'){state.orbit-=(e.clientX-lastX)*.008;state.orbitHeight=T.MathUtils.clamp(state.orbitHeight+(e.clientY-lastY)*.004,0,1);}
    else if(state.mode==='overview')state.overviewYaw-=(e.clientX-lastX)*.006;
    else state.steer=T.MathUtils.clamp((e.clientX-width/2)/(width*.45),-1,1);
  }
  lastX=e.clientX;lastY=e.clientY;updateScene(0,true);dirty=true;
});
function pointerEnd(e){pointers.delete(e.pointerId);dragging=pointers.size>0;lastPinch=0;if(!dragging)state.steer=0;dirty=true;}
renderer.domElement.addEventListener('pointerup',pointerEnd);renderer.domElement.addEventListener('pointercancel',pointerEnd);
renderer.domElement.addEventListener('wheel',e=>{if(state.mode!=='garage')return;e.preventDefault();state.orbitZoom=T.MathUtils.clamp(state.orbitZoom+e.deltaY*.001,.65,1.6);updateScene(0,true);dirty=true;},{passive:false});
addEventListener('keydown',e=>{
  if(e.target.matches('input,select')||$('infoDialog').open)return;
  const key=e.key.toLowerCase();if([' ','arrowleft','arrowright'].includes(key))e.preventDefault();
  if(e.repeat)return;
  if(key===' ')setPause(!state.paused);if(key==='v')setDistance(!state.far);if(key==='g')setMode('garage');if(key==='d')setMode('drive');
  if(key==='shift')setBoost(true);if(key==='arrowleft')state.steer=1;if(key==='arrowright')state.steer=-1;
});
addEventListener('keyup',e=>{if(e.key==='Shift')setBoost(false);if(e.key.startsWith('Arrow'))state.steer=0;});
addEventListener('blur',()=>{state.steer=0;});
document.addEventListener('visibilitychange',()=>{previous=performance.now();dirty=true;});
renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();state.ready=false;$('loading').classList.remove('hidden');$('loading').innerHTML='<strong>התצוגה נעצרה</strong><small>רעננו כדי לפתוח את הדרך מחדש.</small>';});
function fail(error){metrics.errors.push(String(error));console.error(error);$('loading').classList.remove('hidden');$('loading').innerHTML='<strong>הדרך עדיין לא מוכנה</strong><small>קובץ מקומי חסר או שלא ניתן לפענח אותו. ראו README.</small>';}
function getMetrics(){
  const sorted=[...frameTimes].sort((a,b)=>a-b);
  return{...metrics,frameMsMean:measuredFrameMs,frameMsP95:sorted[Math.floor(sorted.length*.95)]||0,
    width,height,pixelRatio:ratio,track:state.track,car:state.car,mode:state.mode,far:state.far,
    crowd:world?.crowdCount,instances:world?.instanceCount,three:T.REVISION,physicalPhone:false,lowBudget:lowBudget()};
}

// Deterministic inspection surface for screenshots, performance and integration review.
window.__racingV7={
  state,metrics:getMetrics,get hero(){return hero;},get camera(){return camera;},get scene(){return scene;},get world(){return world;},
  async inspect(options={}){
    setPause(true);
    if(options.track&&options.track!==state.track)await selectTrack(options.track);
    if(options.car&&options.car!==state.car)await selectCar(options.car);
    if(options.mode)setMode(options.mode);
    if(options.far!==undefined)setDistance(options.far);
    if(options.speed!==undefined)setSpeed(options.speed);
    if(options.color)setPaint(options.color);
    state.time=options.time??8;state.phase=options.phase??.036;state.travel=world.track.length*state.phase;
    setDrift(options.drift??false);setBoost(options.boost??false);
    if(options.orbit!==undefined)state.orbit=options.orbit;
    if(options.orbitZoom!==undefined)state.orbitZoom=options.orbitZoom;
    if(options.effects!==undefined)state.effects=options.effects;
    if(options.quality)setQuality(options.quality);
    fx.clear();
    updateScene(0,true);
    if(state.drift)for(let i=0;i<35;i++){state.time+=1/30;if(state.mode==='drive')state.travel+=(state.boost?Math.max(225,state.speed):state.speed)/3.6/30;updateScene(1/30,true);}
    if(options.contact){fx.burstSpark(hero.localToWorld(temp.set(1.25,.11,-2.23)),28,hero.getWorldDirection(new T.Vector3()).negate());updateScene(1/30,true);}
    if(options.forceLOD!==undefined){hero.levels.forEach((level,i)=>{level.object.visible=i===options.forceLOD;});hero._currentLevel=options.forceLOD;metrics.lod=options.forceLOD;}
    render(0);return getMetrics();
  },
  play(){setPause(false);},pause(){setPause(true);},
  async warmAll(){for(const spec of carSpecs)await getCar(spec.id);return true;},
  dispose(){
    disposed=true;cancelAnimationFrame(raf);world?.dispose();fx?.root.parent?.remove(fx.root);speedPass.dispose();releaseDecoder();renderer.dispose();
  },
};
window.addEventListener('pagehide',()=>{if(!disposed)window.__racingV7.dispose();},{once:true});

try{
  const initialTrack=themes[params.get('track')]?params.get('track'):'coast';
  const initialCar=carSpecs.some(c=>c.id===params.get('car'))?params.get('car'):'apex';
  await selectTrack(initialTrack);await selectCar(initialCar);fx=await createEffects(scene);
  for(const id of ['velour','prism','vector']){const car=await createCar(id,{traffic:true});traffic.push(car);scene.add(car);}
  if(params.get('mode')==='garage')setMode('garage');if(params.get('far')==='1')setDistance(true);
  if(params.get('pause')==='1')setPause(true);
  state.ready=true;updateScene(0,true);render(0);
  $('loading').classList.add('hidden');previous=performance.now();raf=requestAnimationFrame(animate);
  // Decode the remaining hero models while the browser is idle; no remote requests.
  if(!params.has('capture'))setTimeout(()=>window.__racingV7.warmAll().catch(error=>metrics.errors.push(String(error))),1400);
}catch(error){fail(error);}
