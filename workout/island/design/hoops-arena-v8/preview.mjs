import * as THREE from './runtime/vendor/three.module.js';
import {createArena} from './runtime/arena.mjs';
import {createBroadcastHUD} from './runtime/hud.mjs';
import {createReplayRecorder} from './runtime/replay.mjs';
import {createBroadcastRenderer} from './runtime/broadcast.mjs';
import {createBall} from './runtime/props.mjs';
const stage=document.querySelector('#stage'),loading=document.querySelector('#loading');
const query=new URLSearchParams(location.search);const fixed=query.has('capture');
let arena,renderer,broadcast,hud,ball,recorder,frame=0,disposed=false;
const scene=new THREE.Scene();const liveCamera=new THREE.PerspectiveCamera(52,1,.15,160),replayCamera=new THREE.PerspectiveCamera(51,1,.15,160);
let view=query.get('view')==='near'?'near':'far';let time=8,prior=0;const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
function cameras() {
  const portrait=stage.clientHeight>stage.clientWidth;
  if(view==='far') {
    liveCamera.position.set(...(portrait?[32,23,8]:[13,11.8,17.5]));liveCamera.fov=portrait?65:58;liveCamera.lookAt(0,2,0);
  } else {liveCamera.position.set(...(portrait?[8.9,4.8,6.6]:[9.5,4.5,5]));liveCamera.fov=portrait?54:48;liveCamera.lookAt(12.8,2.9,0);}
  replayCamera.position.set(...(portrait?[8.5,5.1,-7]:[9.5,4.4,-6.6]));replayCamera.fov=portrait?60:51;replayCamera.lookAt(...(portrait?[11.9,3.7,.5]:[12.7,2.9,0]));
  liveCamera.updateProjectionMatrix();replayCamera.updateProjectionMatrix();
}
function animateBall(t) {
  const a=(t%4)/4;const s=Math.min(1,a/.7);
  if(a<.7)ball.mesh.position.set(8.6+4.15*s,1.3+1.75*s+2.6*Math.sin(s*Math.PI),2.8*(1-s));
  else ball.mesh.position.set(12.75,Math.max(.121,3.05-15*(a-.7)),0);
  ball.mesh.rotation.set(t*2.3,0,t*1.1);
}
function resize() {
  if(!renderer)return;const w=stage.clientWidth,h=stage.clientHeight;renderer.setSize(w,h,false);cameras();broadcast?.resize(w,h);
}
function draw(dt=1/30) {
  animateBall(time);if(time>8)recorder.record(time);arena.update(liveCamera,reduced?0:time,dt);broadcast.render(dt);
}
function tick(now) {
  if(disposed||fixed)return;
  frame=requestAnimationFrame(tick);
  const elapsed=(now-prior)/1000;if(elapsed<1/30-.002)return;prior=now;
  if(document.hidden)return;const dt=Math.min(.15,elapsed||1/30);time+=dt;draw(dt);
}
function cleanup() {
  if(disposed)return;disposed=true;cancelAnimationFrame(frame);window.removeEventListener('resize',resize);hud?.destroy();broadcast?.dispose();arena?.dispose();ball?.dispose();renderer?.dispose();
}
try {
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.25));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;renderer.autoClear=false;
  renderer.domElement.setAttribute('aria-label','תצוגת האולם בתלת ממד');renderer.domElement.setAttribute('role','img');stage.prepend(renderer.domElement);
  arena=await createArena({lod:query.has('lod')?Number(query.get('lod')):'auto'});scene.add(arena.group);scene.background=arena.background;scene.fog=arena.fog;
  ball=createBall();scene.add(ball.mesh);recorder=createReplayRecorder([ball.mesh]);
  // Seed one complete shot so replay is usable immediately, without a loading wait.
  for(let i=0;i<=240;i++){animateBall(i/30);recorder.record(i/30);}
  hud=createBroadcastHUD(stage,{
    onView(v){view=v;cameras();draw(0);},
    onQuality(lod){arena.setLOD(lod);draw(0);},
    onReplay(active){hud.setReplay(broadcast.setReplay(active));draw(0);},
    onSeek(fraction){broadcast.seek(fraction);draw(0);}
  });
  broadcast=createBroadcastRenderer({renderer,scene,liveCamera,replayCamera,recorder,prepareView:arena.prepareView,onProgress:(t,d)=>hud.progress(t,d)});
  cameras();resize();hud.setView(view);
  if(query.get('mode')==='replay'){broadcast.setReplay(true);broadcast.seek(.7);hud.setReplay(true);}
  loading.remove();window.addEventListener('resize',resize);window.addEventListener('pagehide',cleanup,{once:true});
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();cancelAnimationFrame(frame);const p=document.createElement('p');p.id='loading';p.textContent='התצוגה הופסקה. טען מחדש כדי להמשיך.';const b=document.createElement('button');b.textContent='טעינה מחדש';b.onclick=()=>location.reload();p.append(b);stage.append(p);});
  draw(0);if(!fixed)frame=requestAnimationFrame(tick);
  window.arenaPreview={scene,renderer,arena,recorder,broadcast,hud,ball,liveCamera,replayCamera,
    setView(v){view=v;cameras();hud.setView(v);draw(0);},setReplay(value){hud.setReplay(broadcast.setReplay(value));draw(0);},
    step(dt=1/30){time+=dt;draw(dt);},resize,dispose:cleanup,
    metrics(){return {lod:arena.lod,crowd:arena.crowdCount,triangles:renderer.info.render.triangles,draws:renderer.info.render.calls,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,replayBytes:recorder.memoryBytes,renderer:renderer.getContext().getParameter(renderer.getContext().RENDERER)};}};
  window.arenaReady=true;
} catch(error) {
  cleanup();loading.replaceChildren();loading.textContent='האולם לא נטען. אפשר לנסות שוב.';const b=document.createElement('button');b.textContent='ניסיון נוסף';b.onclick=()=>location.reload();loading.append(b);console.error(error);window.arenaError=String(error);
}
