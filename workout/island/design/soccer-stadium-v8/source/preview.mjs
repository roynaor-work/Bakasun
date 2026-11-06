import {THREE,loadStadium} from '../runtime/stadium.mjs';
import {frameBroadcastCamera} from '../runtime/cameras.mjs';
import {createBroadcastHUD} from '../runtime/broadcast.mjs';

const params=new URLSearchParams(location.search),canvas=document.querySelector('canvas'),stage=document.querySelector('#stage');
if(params.has('capture'))document.body.classList.add('capture');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.25));renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.03;
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),hud=createBroadcastHUD(stage);
let stadium,view=params.get('view')||'main',azimuth=Number(params.get('angle')||0),manualLOD=params.has('lod')?Number(params.get('lod')):null;
let stopped=false,elapsed=0,raf=0,lastTime=0,frameTimes=[],errors=[];
const reducedMotion=matchMedia('(prefers-reduced-motion:reduce)').matches;
function resize(){renderer.setSize(stage.clientWidth,stage.clientHeight,false);frameBroadcastCamera(camera,{view,azimuth,aspect:stage.clientWidth/stage.clientHeight});}
function render(seconds=elapsed){
  stadium?.update(camera,seconds,{autoLOD:manualLOD===null,reducedMotion});
  if(stadium&&manualLOD!==null)stadium.setLOD(manualLOD);
  hud.update({homeScore:1,awayScore:0,seconds:42*60+18,phase:view==='opening'?'opening':'live',caption:view==='close'?'מבט קרוב · מאחורי השער':'כדורגל · מבט שידור'});
  renderer.render(scene,camera);
}
function tick(t){
  if(stopped)return;if(lastTime)frameTimes.push(t-lastTime);if(frameTimes.length>600)frameTimes.shift();lastTime=t;elapsed=t/1000;render();raf=requestAnimationFrame(tick);
}
resize();addEventListener('resize',resize);
document.querySelectorAll('[data-view]').forEach(button=>button.onclick=()=>{
  view=button.dataset.view;document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));resize();render();
});
document.querySelector('#rotate').onclick=()=>{azimuth+=Math.PI/4;resize();render();};
document.querySelector('#detail').onclick=event=>{manualLOD=manualLOD===null?0:manualLOD===2?null:manualLOD+1;event.currentTarget.textContent=manualLOD===null?'פירוט אוטומטי':['פירוט גבוה','פירוט בינוני','פירוט נמוך'][manualLOD];render();};
try{
  stadium=await loadStadium({scene});await hud.ready;document.querySelector('#status').remove();
  render();document.documentElement.dataset.ready='true';raf=requestAnimationFrame(tick);
  // Only this authoring page exposes a review harness. No debug globals are
  // added by the runtime package or needed by the eventual game.
  window.stadiumReview={renderer,scene,camera,stadium,hud,errors,
    setView(next,{angle=azimuth,lod=manualLOD}={}){view=next;azimuth=angle;manualLOD=lod;resize();render();},
    render(time=0){render(time);},
    resetFrameTimes(){frameTimes=[];lastTime=0;},
    stop(){stopped=true;cancelAnimationFrame(raf);},
    start(){if(!stopped)return;stopped=false;lastTime=0;raf=requestAnimationFrame(tick);},
    metrics(){return {runtime:stadium.metrics(),submitted:renderer.info.render.triangles,calls:renderer.info.render.calls,memory:{...renderer.info.memory},frames:frameTimes.slice(),drawingBuffer:[canvas.width,canvas.height]};},
    dispose(){stopped=true;cancelAnimationFrame(raf);removeEventListener('resize',resize);stadium.dispose();hud.dispose();renderer.dispose();},
  };
}catch(error){errors.push(String(error));document.querySelector('#status').textContent='טעינת האצטדיון נכשלה';console.error(error);document.documentElement.dataset.failed='true';}
