import * as THREE from '../../vendor/three.module.js';
import {GLTFLoader} from '../../vendor/GLTFLoader.js';
import {DRACOLoader} from '../viewer/draco/DRACOLoader.js';
import {applyToon} from './toon.js';

const $=id=>document.getElementById(id),stage=$('stage'),errors=[];
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(32,1,.02,500);
camera.layers.enable(1);
const canvas=$('canvas');
let renderer;
try{renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,preserveDrawingBuffer:true});}
catch(error){$('error').hidden=false;$('error').textContent='תצוגת התלת־ממד אינה זמינה בדפדפן הזה.';$('loading').hidden=true;throw error;}
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;
scene.fog=new THREE.Fog(0x294951,65,190);
const skyCanvas=document.createElement('canvas');skyCanvas.width=4;skyCanvas.height=256;
const skyContext=skyCanvas.getContext('2d'),skyGradient=skyContext.createLinearGradient(0,0,0,256);
for(const [stop,color] of [[0,'#102238'],[.45,'#263C57'],[.78,'#716A73'],[1,'#C19177']])skyGradient.addColorStop(stop,color);
skyContext.fillStyle=skyGradient;skyContext.fillRect(0,0,4,256);
const skyTexture=new THREE.CanvasTexture(skyCanvas);skyTexture.colorSpace=THREE.SRGBColorSpace;
const sky=new THREE.Mesh(new THREE.SphereGeometry(240,24,16),new THREE.MeshBasicMaterial({map:skyTexture,side:THREE.BackSide,depthWrite:false,fog:false,toneMapped:false}));scene.add(sky);
scene.add(new THREE.HemisphereLight(0x96B6DA,0x315341,.65));
const portraitFill=new THREE.HemisphereLight(0xc3e1f1,0x315341,1.15);portraitFill.layers.set(1);scene.add(portraitFill);
for(const [color,intensity,pos] of [[0xffe1ae,1.65,[4,9,7]],[0x85cbe3,.65,[-5,4,3]],[0x9ae6d7,1.45,[-4,6,-6]]]){
  const light=new THREE.DirectionalLight(color,intensity);light.layers.set(1);light.position.set(...pos);scene.add(light);
}
const decoder=new DRACOLoader().setDecoderPath(new URL('../viewer/draco/',import.meta.url).href).setDecoderConfig({type:'wasm'}).setWorkerLimit(2);
const loader=new GLTFLoader().setDRACOLoader(decoder);
const actors=[],environment=new THREE.Group(),decorations=[];scene.add(environment);
const assetMetadata=new Map();let manifest,ball,flagMixer;
let view='players',team='teal',look='quiff',expression='neutral',clip='run',playing=false,time=0,duration=.72;
let yaw=.10,pitch=.04,distance=1,selectedActor=null;
const looks=['quiff','curls','knot'],labels={quiff:'בלורית',curls:'תלתלים',knot:'שיער אסוף'};
const durations={run:.72,sprint:.5,kick:.68,pass:.86,slide:1.45};
const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=64;
const ctx=shadowCanvas.getContext('2d'),gradient=ctx.createRadialGradient(32,32,2,32,32,31);
gradient.addColorStop(0,'rgba(9,31,30,.55)');gradient.addColorStop(1,'rgba(9,31,30,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);
const shadowTexture=new THREE.CanvasTexture(shadowCanvas);

function fail(error){errors.push(String(error));$('error').hidden=false;$('error').textContent='לא הצלחנו לטעון את התצוגה. אפשר לרענן ולנסות שוב.';$('loading').hidden=true;console.error(error);}
function chooseButtons(attribute,value){for(const b of document.querySelectorAll(`[data-${attribute}]`))b.setAttribute('aria-pressed',String(b.dataset[attribute]===value));}
function resize(){
  const w=stage.clientWidth,h=stage.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
  if(actors.length)layout();else frame();
}
function frame(){
  const narrow=camera.aspect<.8;
  let target=new THREE.Vector3(0,1.04,0),baseDistance=narrow?8.4:6.9,height=-.16,baseYaw=0;
  if(view==='roster'){target.set(0,1.02,-.15);baseDistance=narrow?13.8:12.8;height=narrow?3.4:1.8;}
  if(view==='faces'){target.set(0,1.54,0);baseDistance=narrow?1.58:1.54;height=.025;}
  if(view==='stadium'){target.set(0,2.7,0);baseDistance=narrow?202:155;height=110;baseYaw=.53;}
  scene.fog.near=view==='stadium'?220:65;scene.fog.far=view==='stadium'?420:190;
  const r=baseDistance*distance,angle=yaw+baseYaw;
  camera.position.copy(target).add(new THREE.Vector3(Math.sin(angle)*r,height+pitch*r,Math.cos(angle)*r));camera.lookAt(target);
}
function layout(){
  const narrow=camera.aspect<.8;
  selectedActor=actors.find(a=>a.id===(team==='keeper'?'goalkeeper':`${team}-${look}`));
  const visible=actors.filter(a=>view==='roster'||view==='stadium'||a===selectedActor&&view==='faces'||view==='players'&&(team==='keeper'?a.id==='goalkeeper':a.meta.team===team));
  actors.forEach(a=>{a.group.visible=visible.includes(a);a.group.rotation.y=0;a.group.position.set(0,.082,0);});
  if(view==='players'){
    if(team!=='keeper')for(const a of visible){
      const index=looks.indexOf(a.meta.look),center=index===looks.indexOf(look);
      const others=looks.filter(l=>l!==look),side=others.indexOf(a.meta.look)===0?-1:1;
      a.group.position.set(center?0:side*(narrow?1.04:1.35),.082,center?.6:-.28);
      a.group.rotation.y=center?-.08:side*-.16;
    }
  }else if(view==='roster'||view==='stadium'){
    for(const [index,a] of actors.entries()){
      if(narrow&&view==='roster'){
        const row=index<3?0:index<6?1:2,col=index<6?index%3:1;
        a.group.position.set((col-1)*1.35,.082,-row*1.5+.9);
      }else a.group.position.set((index-3)*1.32,.082,Math.abs(index-3)*-.12);
      a.group.rotation.y=(index-3)*-.045;
    }
  }
  environment.visible=view!=='faces';
  if(ball)ball.visible=view!=='faces'&&view!=='stadium';
  $('appearance').textContent=view==='stadium'?'תאורת ערב · 224 אוהדים · דגלים ברוח':team==='keeper'?'שוער · כפפות ומדים בצבע ענבר':view==='faces'?`${labels[look]} · שלוש הבעות`:'בלורית · תלתלים · שיער אסוף';
  $('scene-caption').textContent=view==='stadium'?'יציעים חיים. מגרש שמחכה לשריקה.':view==='faces'?'פנים שונות. כל הבעה מספרת משהו.':view==='roster'?'שתי ערכות צבע. סגל אחד מלא אופי.':'שלושה מראות. אותה אהבה לכדור.';
  stage.classList.toggle('detail',view==='faces');frame();render();
}
function actionFor(actor,name){
  const source=actor.gltf.animations.find(a=>a.name===name);if(!source)throw Error(`Missing ${name} in ${actor.id}`);
  return actor.mixer.clipAction(source);
}
function pose(seconds=time){
  time=Math.max(0,Math.min(duration,seconds));
  for(const actor of actors){
    actor.mixer.stopAllAction();const action=actionFor(actor,clip);
    action.setLoop(['run','sprint'].includes(clip)?THREE.LoopRepeat:THREE.LoopOnce,Infinity);action.clampWhenFinished=true;
    action.play();action.paused=false;actor.mixer.setTime(time);action.paused=true;actor.toon.sync();actor.gltf.scene.updateMatrixWorld(true);
    for(const mesh of actor.meshes)mesh.skeleton.update();
  }
  $('timeline').value=String(Math.round(time/duration*1000));$('time').textContent=`${time.toFixed(2)} / ${duration.toFixed(2)}`;
  updateBall();render();
}
function updateBall(){
  if(!ball||!selectedActor)return;
  const pos=selectedActor.group.position;
  if(['kick','pass','slide'].includes(clip)){
    const marker=clip==='kick'?.45:clip==='pass'?.38:.43;
    const after=Math.max(0,time/duration-marker);
    ball.position.set(pos.x+.19,.082+(clip==='kick'?Math.sin(after*4)*.55:0),pos.z+.48+after*(clip==='kick'?4:2.6));
    ball.rotation.x=-after*12;
  }else{ball.position.set(pos.x+.39,.082,pos.z+.48);ball.rotation.set(0,0,0);}
}
function setClip(name){clip=name;$('clip').value=name;duration=durations[name];setPlaying(false);pose(0);return name;}
function setPlaying(value){playing=value;$('play').setAttribute('aria-pressed',String(value));$('play').setAttribute('aria-label',value?'השהיית תנועה':'ניגון תנועה');$('play-label').textContent=value?'השהיה':'ניגון';$('play-icon').textContent=value?'Ⅱ':'▶︎';}
function setView(value){view=value;yaw=.10;pitch=.04;distance=1;chooseButtons('view',value);layout();return value;}
function setTeam(value){team=value;chooseButtons('team',value);layout();return value;}
function setLook(value){look=value;chooseButtons('look',value);layout();return value;}
function setExpression(value){
  expression=value;chooseButtons('expression',value);
  for(const actor of actors)for(const mesh of actor.meshes){
    mesh.morphTargetInfluences.fill(0);if(value!=='neutral')mesh.morphTargetInfluences[mesh.morphTargetDictionary[value]]=1;
  }
  actors.forEach(a=>a.toon.sync());render();return value;
}
function render(){if(renderer)renderer.render(scene,camera);}

const ready=(async()=>{
  manifest=await (await fetch(new URL('./manifest.json',import.meta.url))).json();
  await Promise.all(manifest.assets.map(async meta=>{
    const gltf=await loader.loadAsync(new URL(meta.file,import.meta.url).href);assetMetadata.set(meta.id,meta);
    if(meta.category==='character'){
      const group=new THREE.Group();group.scale.setScalar(1.35);group.add(gltf.scene);scene.add(group);
      const meshes=[];gltf.scene.traverse(o=>{if(o.isSkinnedMesh)meshes.push(o);});
      const toon=applyToon(gltf.scene),mixer=new THREE.AnimationMixer(gltf.scene);
      gltf.scene.traverse(o=>{if(o.isMesh)o.layers.set(1);});
      const shadow=new THREE.Mesh(new THREE.PlaneGeometry(.95,.65),new THREE.MeshBasicMaterial({map:shadowTexture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}));
      shadow.rotation.x=-Math.PI/2;shadow.position.y=.001;group.add(shadow);
      actors.push({id:meta.id,meta,gltf,group,meshes,toon,mixer});
    }else{
      if(meta.id==='ball'){ball=gltf.scene;scene.add(ball);}
      else{environment.add(gltf.scene);decorations.push(gltf.scene);}
      if(meta.id==='flags'){flagMixer=new THREE.AnimationMixer(gltf.scene);flagMixer.clipAction(gltf.animations[0]).play();}
      if(meta.id==='crowd')applyToon(gltf.scene,{outline:false});
    }
  }));
  actors.sort((a,b)=>manifest.assets.findIndex(m=>m.id===a.id)-manifest.assets.findIndex(m=>m.id===b.id));
  resize();setClip('pass');pose(0);
  $('loading').hidden=true;layout();return true;
})();ready.catch(fail);

for(const b of document.querySelectorAll('[data-view]'))b.onclick=()=>setView(b.dataset.view);
for(const b of document.querySelectorAll('[data-team]'))b.onclick=()=>setTeam(b.dataset.team);
for(const b of document.querySelectorAll('[data-look]'))b.onclick=()=>setLook(b.dataset.look);
for(const b of document.querySelectorAll('[data-expression]'))b.onclick=()=>setExpression(b.dataset.expression);
$('clip').onchange=()=>setClip($('clip').value);
$('play').onclick=()=>{if(time>=duration)pose(0);setPlaying(!playing);};
$('timeline').oninput=()=>{setPlaying(false);pose(duration*Number($('timeline').value)/1000);};
$('reset').onclick=()=>{yaw=.10;pitch=.04;distance=1;frame();render();};
const pointers=new Map();let drag=null,pinch=null;
canvas.addEventListener('pointerdown',event=>{canvas.setPointerCapture(event.pointerId);pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});drag={x:event.clientX,y:event.clientY};if(pointers.size===2)pinch=pointerDistance();});
function pointerDistance(){const p=[...pointers.values()];return Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);}
canvas.addEventListener('pointermove',event=>{
  if(!pointers.has(event.pointerId))return;
  pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
  if(pointers.size===2){const d=pointerDistance();if(pinch)distance=THREE.MathUtils.clamp(distance*pinch/d,.65,1.8);pinch=d;}
  else if(drag){yaw+=(event.clientX-drag.x)*-.005;pitch=THREE.MathUtils.clamp(pitch+(event.clientY-drag.y)*.002,-.12,.6);}
  drag={x:event.clientX,y:event.clientY};frame();render();
});
for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,event=>{pointers.delete(event.pointerId);drag=null;pinch=null;});
canvas.addEventListener('wheel',event=>{event.preventDefault();distance=THREE.MathUtils.clamp(distance*Math.exp(event.deltaY*.001),.65,1.8);frame();render();},{passive:false});
canvas.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(event.key)){event.preventDefault();if(event.key==='Home'){yaw=.10;pitch=.04;distance=1;}else if(event.key==='ArrowLeft')yaw-=.12;else if(event.key==='ArrowRight')yaw+=.12;else distance=THREE.MathUtils.clamp(distance+(event.key==='ArrowUp'?-.1:.1),.65,1.8);frame();render();}});
canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();setPlaying(false);$('error').hidden=false;$('error').textContent='תצוגת התלת־ממד נעצרה. אפשר לרענן כדי להמשיך.';});
window.addEventListener('resize',resize);
let previous=performance.now(),flagTime=0;
function tick(now){
  const dt=Math.min((now-previous)/1000,.04);previous=now;
  if(playing&&actors.length){
    const next=time+dt;
    if(next>=duration&&!['run','sprint'].includes(clip)){pose(duration);setPlaying(false);}
    else pose(next%duration);
  }
  if(flagMixer&&!document.hidden&&!reducedMotion&&view==='stadium'){flagTime+=dt;flagMixer.setTime(flagTime);if(!playing)render();}
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
window.soccerV5={ready,errors,setView,setTeam,setLook,setExpression,setClip,seek:pose,setPlaying,render,
  get actors(){return actors;},get scene(){return scene;},get camera(){return camera;},get renderer(){return renderer;},
  state:()=>({view,team,look,expression,clip,time,duration,playing}),
  stats:()=>({calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures}),
  setAngle(value){yaw=value;frame();render();},get manifest(){return manifest;}};
